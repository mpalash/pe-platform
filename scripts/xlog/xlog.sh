#!/usr/bin/env bash
# One source video in "Experience Log/" → 720p HLS + poster in "x_logs/<slug>/".
#
#   xlog.sh "<source key>"            # EC2: download, encode, verify, upload
#   LOCAL=1 IN=file.mov xlog.sh "<key>" # local test: no S3 at all
#
# The source is READ, never written. The transcode role cannot write under
# "Experience Log/" at all (explicit Deny in iam-transcode-policy.json); this
# script also never names that prefix as a destination, so a bug here fails
# closed rather than overwriting a recording.
#
# Idempotent: a finished file leaves _xlog-run/done/<slug>.json, and a rerun
# skips anything with a marker. That is what makes a spot interruption cheap.
set -euo pipefail

KEY="$1"
BUCKET="${BUCKET:-aam-purgatory-archive}"
WORK="${WORK:-/mnt/work}"
LOCAL="${LOCAL:-}"

base="$(basename "$KEY")"; base="${base%.*}"
# URL-safe and stable: lowercase, anything not [a-z0-9] becomes one hyphen.
slug="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
dir="$WORK/$slug"
out="$dir/out"
log() { printf '[%s] %s: %s\n' "$(date -u +%H:%M:%S)" "$slug" "$*"; }

if [ -z "$LOCAL" ] && aws s3api head-object --bucket "$BUCKET" --key "_xlog-run/done/$slug.json" >/dev/null 2>&1; then
  log "already done — skipping"; exit 0
fi

rm -rf "$dir"; mkdir -p "$out"

if [ -n "$LOCAL" ]; then src="$IN"
else
  src="$dir/source.mov"
  log "download"
  aws s3 cp --only-show-errors "s3://$BUCKET/$KEY" "$src"
fi

dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")"
has_audio="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$src" | head -1)"
log "duration ${dur}s, audio: ${has_audio:-none}"

# Audio that outlives the video. The screen capture sometimes stopped before
# the audio did — Marianna's session has 2292s of video and 2427s of audio.
# Encoded as-is, the stream silently loses that tail. What to do depends on
# whether the tail HOLDS anything, and across these sources it varies: some
# carry real sound (peaks near 0dB), some a flat-silent track.
#
#   tail has sound  → hold the last frame to the end, so the sound is kept;
#                     verify against the full source duration
#   tail is silent  → end with the picture — minutes of a frozen frame over
#                     silence add nothing; verify against the video duration
#
# -60dB peak is the line: a silent track here measures -114dB to -inf, and
# anything anyone would hear is far above it.
#
# Stream ends are MEASURED — the last actual packet of each stream — never
# read from `stream=duration`. That header field is only a claim, and this
# branch trims or pads minutes of footage on the strength of it: a header
# that was wrong would cut half an hour of real video or add half an hour of
# frozen frame. Reading packets without decoding takes seconds on local disk.
#
# And a gap over a quarter of the recording is refused, not acted on. The two
# real cases are 6% and 2%; anything larger is more likely a damaged file
# than a capture that stopped early, and wants a person.
expect="$dur"; pad=""; trim=""
last_pts() {
  ffprobe -v error -select_streams "$1:0" -show_entries packet=pts_time -of csv=p=0 "$src" \
    | tr -d ',' | grep -E '^[0-9.]+$' | sort -n | tail -1
}
vdur="$(last_pts v)"
[ -n "$has_audio" ] && adur="$(last_pts a)" || adur=""
gap="$(awk -v a="$adur" -v v="$vdur" 'BEGIN { if (a != "" && v != "") { d = a - v; if (d > 1) printf "%.3f", d } }')"
if [ -n "$gap" ] && awk -v g="$gap" -v d="$dur" 'BEGIN { exit !(g > d * 0.25) }'; then
  log "VERIFY FAILED — audio outlasts video by ${gap}s of ${dur}s; too large to trust, needs a look"; exit 1
fi
if [ -n "$gap" ]; then
  peak="$(ffmpeg -nostdin -hide_banner -ss "$vdur" -i "$src" -vn -af astats=reset=0 -f null - 2>&1 \
    | grep -A20 'Overall' | grep -m1 'Peak level dB' | sed 's/.*: //')"
  if awk -v p="${peak:--inf}" 'BEGIN { exit !(p != "-inf" && p + 0 > -60) }'; then
    pad="$gap"; log "video ends ${gap}s before the audio, which is not silent (peak ${peak}dB) — holding the last frame"
  else
    trim="$vdur"; expect="$vdur"; log "video ends ${gap}s before the audio, which is silent (peak ${peak:--inf}dB) — ending with the picture"
  fi
fi

# ── Encode ─────────────────────────────────────────────────────────────────
# fps=30: the sources are screen captures, some VFR (r_frame_rate=600/1),
# some 60. HLS wants CFR with keyframes on a fixed grid, and 30 halves the
# bitrate of the 60fps ones for a web player.
# -g 60 + sc_threshold 0: a keyframe exactly every 2s, so every 6s segment
# starts on one and seeking lands within 2s.
# min(720,ih): never upscale a smaller source.
log "encode"
audio_args=(-an)
[ -n "$has_audio" ] && audio_args=(-map 0:a:0 -c:a aac -b:a 128k -ac 2 -ar 48000)
ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" \
  -map 0:v:0 "${audio_args[@]}" \
  -vf "fps=30,scale=-2:'min(720,ih)':flags=lanczos,format=yuv420p${pad:+,tpad=stop_mode=clone:stop_duration=$pad}" \
  -c:v libx264 -preset veryfast -profile:v high -level:v 4.0 \
  -crf 23 -maxrate 3000k -bufsize 6000k \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  ${trim:+-t "$trim"} \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$out/seg_%05d.ts" "$out/index.m3u8"

# ── Poster ─────────────────────────────────────────────────────────────────
# The frame at 20s — frame 0 is usually a headset boot screen or black. A
# source shorter than that (none today; the shortest is 64s) falls back to
# its midpoint, then to frame 0.
# Judged by the FILE, not the exit code: ffmpeg exits 0 having written
# nothing when -ss lands past the end — that bug shipped in the last pipeline.
log "poster"
mid="$(awk -v d="$dur" 'BEGIN { printf "%.2f", d / 2 }')"
for t in 20 "$mid" 0; do
  ffmpeg -nostdin -hide_banner -loglevel error -y -ss "$t" -i "$src" \
    -vf "scale=-2:'min(720,ih)':flags=lanczos" -frames:v 1 -q:v 3 \
    "$out/poster.jpg" || true
  [ -s "$out/poster.jpg" ] && break
done

# ── Verify before anything is uploaded ─────────────────────────────────────
segs="$(ls "$out"/seg_*.ts 2>/dev/null | wc -l | tr -d ' ')"
hls_dur="$(awk -F'[:,]' '/^#EXTINF/ { s += $2 } END { printf "%.2f", s }' "$out/index.m3u8")"
fail() { log "VERIFY FAILED — $*"; exit 1; }
[ "$segs" -gt 0 ]                          || fail "no segments"
grep -q '^#EXT-X-ENDLIST' "$out/index.m3u8" || fail "playlist not finalised"
[ -s "$out/poster.jpg" ]                   || fail "no poster"
# Within 2s, flat — catches a truncated encode, which otherwise looks like a
# perfectly valid, shorter video. It used to be "1s or 1%", and 1% of a
# 50-minute session is 30s: loose enough to wave through a dropped tail. The
# audio/video gap is handled explicitly above now, so nothing legitimate is
# further out than a few frames.
awk -v a="$expect" -v b="$hls_dur" 'BEGIN { d = a - b; if (d < 0) d = -d; exit !(d <= 2) }' \
  || fail "duration drift: expected ${expect}s (source ${dur}s), playlist ${hls_dur}s"
size="$(du -sk "$out" | cut -f1)"
log "verified: $segs segments, ${hls_dur}s, $((size / 1024)) MB"

manifest=$(printf '{"slug":"%s","source":"%s","duration":%s,"segments":%s,"bytes":%s,"playlist":"x_logs/%s/index.m3u8","poster":"x_logs/%s/poster.jpg"}' \
  "$slug" "$KEY" "$hls_dur" "$segs" "$((size * 1024))" "$slug" "$slug")

if [ -n "$LOCAL" ]; then printf '%s\n' "$manifest" > "$dir/done.json"; log "local run — not uploaded"; exit 0; fi

# ── Upload ─────────────────────────────────────────────────────────────────
# Segments and the poster never change for a given slug, so they cache for a
# year. The playlist gets five minutes in case a rerun ever has to replace it.
log "upload"
dest="s3://$BUCKET/x_logs/$slug"
aws s3 cp --only-show-errors --recursive "$out" "$dest" --exclude '*' --include '*.ts' \
  --content-type video/mp2t --cache-control 'public, max-age=31536000, immutable'
aws s3 cp --only-show-errors "$out/poster.jpg" "$dest/poster.jpg" \
  --content-type image/jpeg --cache-control 'public, max-age=31536000, immutable'
# Last, so a playlist never points at segments that are not there yet.
aws s3 cp --only-show-errors "$out/index.m3u8" "$dest/index.m3u8" \
  --content-type application/vnd.apple.mpegurl --cache-control 'public, max-age=300'

printf '%s\n' "$manifest" | aws s3 cp --only-show-errors - "s3://$BUCKET/_xlog-run/done/$slug.json" --content-type application/json
rm -rf "$dir"
log "done"
