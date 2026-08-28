#!/usr/bin/env bash
#
# scripts/media/hls.sh — package the archive's MP4s into HLS, in place, in S3.
#
# WHAT THIS DOES
#   For each object under the source prefix: download, package to HLS *without
#   re-encoding* (-c copy), upload to hls/<item-id>/, delete the local copy.
#   Falls back to a real transcode only for clips whose codecs cannot be copied.
#
#   Output uses `-hls_flags single_file`, so each clip becomes exactly TWO
#   objects — index.m3u8 + stream.ts — with the playlist addressing segments by
#   EXT-X-BYTERANGE. At 4,500 clips that is ~9,000 objects instead of the
#   ~270,000 that per-segment HLS would produce. It requires CloudFront to serve
#   range requests, which Phase 3 §3.6 already requires for progressive MP4.
#
#   Nothing under the source prefix is read-modified or deleted. Ever.
#
# IDEMPOTENCY
#   index.m3u8 is uploaded LAST, after stream.ts, so its presence means the item
#   finished. A re-run lists the destination prefix and skips those items. Kill
#   this script at any point and re-run it; it resumes.
#
# OUTPUT
#   <work>/manifest.csv   source_key,item_id,hls_key,poster_key,mode
#                         ^ this is what populates `hls_key` in Directus
#   <work>/failures.log   one line per clip that did not make it
#
# USAGE
#   ./scripts/media/hls.sh --selftest            # no AWS; proves the ffmpeg path
#   ./scripts/media/hls.sh --limit 5             # trial run on 5 real clips
#   ./scripts/media/hls.sh                       # the whole archive
#
# REQUIRES  bash, awscli v2, ffmpeg, ffprobe, jq
# Portable to macOS bash 3.2 — no associative arrays, no mapfile, no ${x,,}.

set -euo pipefail

BUCKET="${HLS_BUCKET:-aam-purgatory-archive}"
REGION="${HLS_REGION:-eu-north-1}"
SRC_PREFIX="${HLS_SRC_PREFIX:-Clips 480p/}"
DST_PREFIX="${HLS_DST_PREFIX:-hls/}"
WORK="${HLS_WORK:-.hls-work}"
HLS_TIME="${HLS_TIME:-6}"
JOBS=""
LIMIT=0
DRY_RUN=0
FORCE=0
POSTERS="${HLS_POSTERS:-1}"
SELFTEST=0

CACHE_CONTROL="public, max-age=31536000, immutable"

# ---------------------------------------------------------------- worker mode
# Re-entry point for xargs. Config arrives through the environment.
if [ "${1:-}" = "--worker" ]; then
  shift
  WORKER_MODE=1
else
  WORKER_MODE=0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --bucket)      BUCKET="$2"; shift 2 ;;
    --region)      REGION="$2"; shift 2 ;;
    --src-prefix)  SRC_PREFIX="$2"; shift 2 ;;
    --dst-prefix)  DST_PREFIX="$2"; shift 2 ;;
    --work)        WORK="$2"; shift 2 ;;
    --jobs)        JOBS="$2"; shift 2 ;;
    --hls-time)    HLS_TIME="$2"; shift 2 ;;
    --limit)       LIMIT="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --force)       FORCE=1; shift ;;
    --no-posters)  POSTERS=0; shift ;;
    --selftest)    SELFTEST=1; shift ;;
    -h|--help)     sed -n '2,40p' "$0"; exit 0 ;;
    *)             break ;;
  esac
done

case "$SRC_PREFIX" in */) ;; *) SRC_PREFIX="$SRC_PREFIX/" ;; esac
case "$DST_PREFIX" in */) ;; *) DST_PREFIX="$DST_PREFIX/" ;; esac

if [ "$SRC_PREFIX" = "$DST_PREFIX" ]; then
  echo "refusing to run: source and destination prefix are the same" >&2
  exit 2
fi

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

sha8() {
  if command -v sha1sum >/dev/null 2>&1; then printf '%s' "$1" | sha1sum | cut -c1-8
  else printf '%s' "$1" | shasum | cut -c1-8; fi
}

cpu_count() {
  if command -v nproc >/dev/null 2>&1; then nproc
  else sysctl -n hw.ncpu 2>/dev/null || echo 4; fi
}

# ------------------------------------------------------------------ packaging
# probe_codecs <file> -> prints "<video>/<audio>", audio "none" if absent
probe_codecs() {
  _v="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
        -of default=nw=1:nk=1 "$1" 2>/dev/null | head -1)"
  _a="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name \
        -of default=nw=1:nk=1 "$1" 2>/dev/null | head -1)"
  [ -n "$_v" ] || _v="none"
  [ -n "$_a" ] || _a="none"
  printf '%s/%s' "$_v" "$_a"
}

_hls_args() {
  printf '%s' "-f hls -hls_time $HLS_TIME -hls_playlist_type vod \
    -hls_flags single_file+independent_segments -hls_segment_type mpegts"
}

# package <input-file> <output-dir>  ->  prints "copy" or "transcode"
#
# The copy path is gated on an explicit codec probe, NOT on ffmpeg returning an
# error. The mpegts muxer happily accepts e.g. ProRes and writes it as a private
# `bin_data` stream: ffmpeg exits 0, a playlist appears, and nothing on earth can
# play it. Probe first; verify the output after.
package() {
  _in="$1"; _out="$2"
  mkdir -p "$_out"
  _codecs="$(probe_codecs "$_in")"
  _mode=""

  case "$_codecs" in
    h264/aac|h264/none)
      if ffmpeg -nostdin -v error -y -i "$_in" -c copy \
           -f hls -hls_time "$HLS_TIME" -hls_playlist_type vod \
           -hls_flags single_file+independent_segments -hls_segment_type mpegts \
           -hls_segment_filename "$_out/stream.ts" "$_out/index.m3u8" 2>"$_out/.err"; then
        _mode="copy"
      fi
      ;;
  esac

  # Anything else — ProRes, VP9, HEVC, PCM/AC-3 audio, or a copy that failed —
  # gets a real encode. Logged as `transcode` in the manifest so you can see how
  # often it fires; if it is more than a handful, the source set is not what we think.
  if [ -z "$_mode" ]; then
    rm -f "$_out/stream.ts" "$_out/index.m3u8"
    ffmpeg -nostdin -v error -y -i "$_in" \
      -c:v libx264 -profile:v high -level 4.0 -crf 21 -preset veryfast \
      -pix_fmt yuv420p -g 48 -keyint_min 48 -sc_threshold 0 \
      -c:a aac -b:a 128k -ac 2 \
      -f hls -hls_time "$HLS_TIME" -hls_playlist_type vod \
      -hls_flags single_file+independent_segments -hls_segment_type mpegts \
      -hls_segment_filename "$_out/stream.ts" "$_out/index.m3u8" 2>>"$_out/.err" || return 1
    _mode="transcode"
  fi

  # Post-condition: whatever we just wrote must actually be H.264 in that playlist.
  _outv="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
           -of default=nw=1:nk=1 "$_out/index.m3u8" 2>/dev/null | head -1)"
  [ "$_outv" = "h264" ] || return 1

  printf '%s' "$_mode"
}

# Grab a representative still.
#
# Two things here are deliberate, and the first trial run got both wrong:
#
#   1. Seek 3s in ONLY if the clip is longer than that. Plenty of archive clips
#      are under three seconds — seeking past the end yields no frames at all.
#   2. Judge success by the FILE, not by the exit status. ffmpeg does not
#      reliably fail when it writes nothing: on Ubuntu's 6.1.1 the seek-past-end
#      case exits 0 having produced no output, so a `cmd || fallback` chain
#      never reaches the fallback and the clip silently ends up with no poster.
#      That is exactly how half the first trial's items lost theirs.
poster() {
  _in="$1"; _out="$2"
  rm -f "$_out"

  _dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$_in" 2>/dev/null)"
  _long=0
  case "$_dur" in
    ''|N/A|n/a) _long=0 ;;
    *) awk -v d="$_dur" 'BEGIN { exit !(d > 3.5) }' >/dev/null 2>&1 && _long=1 ;;
  esac

  if [ "$_long" = "1" ]; then
    ffmpeg -nostdin -v error -y -ss 3 -i "$_in" -frames:v 1 -q:v 3 "$_out" 2>/dev/null || true
    [ -s "$_out" ] && return 0
  fi

  # Short clip, or the seek produced nothing: take the first frame instead.
  ffmpeg -nostdin -v error -y -i "$_in" -frames:v 1 -q:v 3 "$_out" 2>/dev/null || true
  [ -s "$_out" ]
}

# ------------------------------------------------------------------- selftest
if [ "$SELFTEST" = "1" ]; then
  _t="$(mktemp -d)"
  trap 'rm -rf "$_t"' EXIT
  log "selftest: generating a 12s H.264/AAC test clip"
  ffmpeg -nostdin -v error -y -f lavfi -i testsrc=size=854x480:rate=25:duration=12 \
    -f lavfi -i sine=frequency=440:duration=12 \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac "$_t/in.mp4"
  _mode="$(package "$_t/in.mp4" "$_t/out")" || { echo "SELFTEST FAIL: packaging"; exit 1; }
  log "selftest: packaged via $_mode"
  test -f "$_t/out/index.m3u8" || { echo "SELFTEST FAIL: no playlist"; exit 1; }
  test -f "$_t/out/stream.ts" || { echo "SELFTEST FAIL: no single-file segment"; exit 1; }
  grep -q 'EXT-X-BYTERANGE' "$_t/out/index.m3u8" || { echo "SELFTEST FAIL: not byte-range addressed"; exit 1; }
  ls "$_t/out"/*.ts | wc -l | grep -q '^ *1$' || { echo "SELFTEST FAIL: more than one segment file"; exit 1; }
  poster "$_t/in.mp4" "$_t/poster.jpg" || { echo "SELFTEST FAIL: poster"; exit 1; }
  ffprobe -v error -i "$_t/out/index.m3u8" -show_entries format=duration -of csv=p=0 >/dev/null \
    || { echo "SELFTEST FAIL: playlist unreadable"; exit 1; }
  _segs="$(grep -c EXTINF "$_t/out/index.m3u8")"

  # Regression guard: the mpegts muxer accepts ProRes under -c copy and writes an
  # unplayable bin_data stream without erroring. package() must catch that on the
  # probe and transcode instead. If this ever prints "copy", the gate is broken.
  log "selftest: generating a ProRes clip (must NOT take the copy path)"
  if ffmpeg -nostdin -v error -y -f lavfi -i testsrc=size=854x480:rate=25:duration=6 \
       -c:v prores_ks -profile:v 0 -pix_fmt yuv422p10le "$_t/pro.mov" 2>/dev/null; then
    _pmode="$(package "$_t/pro.mov" "$_t/pout")" || { echo "SELFTEST FAIL: prores packaging"; exit 1; }
    [ "$_pmode" = "transcode" ] || { echo "SELFTEST FAIL: prores took the '$_pmode' path"; exit 1; }
    _pv="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
           -of default=nw=1:nk=1 "$_t/pout/index.m3u8" 2>/dev/null | head -1)"
    [ "$_pv" = "h264" ] || { echo "SELFTEST FAIL: prores output is '$_pv', not h264"; exit 1; }
    log "selftest: prores correctly routed to transcode, output is h264"
  else
    log "selftest: no prores encoder here — skipping that guard"
  fi

  echo "SELFTEST OK  — $_segs segments, one .ts, byte-range playlist, codec gate holds"
  exit 0
fi

# --------------------------------------------------------------- worker entry
if [ "$WORKER_MODE" = "1" ]; then
  ID="$(printf '%s' "$1" | cut -f2)"
  KEY="$(printf '%s' "$1" | cut -f1)"
  DIR="$WORK/items/$ID"
  mkdir -p "$DIR"
  EXT="$(printf '%s' "$KEY" | sed 's#.*\.##' | tr 'A-Z' 'a-z')"
  LOCAL="$DIR/source.$EXT"

  fail() {
    printf '%s\t%s\t%s\n' "$ID" "$KEY" "$1" >> "$WORK/failures.log"
    rm -rf "$DIR"
    exit 0   # a bad clip must not take the batch down
  }

  aws s3 cp "s3://$BUCKET/$KEY" "$LOCAL" --region "$REGION" --only-show-errors \
    || fail "download"

  MODE="$(package "$LOCAL" "$DIR/out")" || fail "package"

  if [ "$POSTERS" = "1" ]; then
    poster "$LOCAL" "$DIR/out/poster.jpg" || log "no poster for $ID"
  fi

  # stream.ts first, index.m3u8 last — the playlist is the completion marker.
  aws s3 cp "$DIR/out/stream.ts" "s3://$BUCKET/${DST_PREFIX}${ID}/stream.ts" \
    --region "$REGION" --only-show-errors \
    --content-type video/mp2t --cache-control "$CACHE_CONTROL" || fail "upload-ts"

  if [ -f "$DIR/out/poster.jpg" ]; then
    aws s3 cp "$DIR/out/poster.jpg" "s3://$BUCKET/${DST_PREFIX}${ID}/poster.jpg" \
      --region "$REGION" --only-show-errors \
      --content-type image/jpeg --cache-control "$CACHE_CONTROL" || true
  fi

  aws s3 cp "$DIR/out/index.m3u8" "s3://$BUCKET/${DST_PREFIX}${ID}/index.m3u8" \
    --region "$REGION" --only-show-errors \
    --content-type application/vnd.apple.mpegurl --cache-control "$CACHE_CONTROL" \
    || fail "upload-m3u8"

  # One short line, O_APPEND — atomic enough across parallel workers.
  printf '%s,%s,%s,%s,%s\n' \
    "\"$KEY\"" "$ID" "${DST_PREFIX}${ID}/index.m3u8" "${DST_PREFIX}${ID}/poster.jpg" "$MODE" \
    >> "$WORK/manifest.csv"

  rm -rf "$DIR"
  exit 0
fi

# ------------------------------------------------------------------- preflight
for _bin in aws ffmpeg ffprobe jq; do
  command -v "$_bin" >/dev/null 2>&1 || { echo "missing required tool: $_bin" >&2; exit 2; }
done
[ -n "$JOBS" ] || JOBS="$(cpu_count)"

mkdir -p "$WORK/items"
touch "$WORK/failures.log"
[ -f "$WORK/manifest.csv" ] || echo 'source_key,item_id,hls_key,poster_key,mode' > "$WORK/manifest.csv"

log "bucket        s3://$BUCKET  ($REGION)"
log "source        ${SRC_PREFIX}"
log "destination   ${DST_PREFIX}"
log "parallelism   $JOBS"

# ---------------------------------------------------------------- list source
log "listing source objects..."
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$SRC_PREFIX" \
  --region "$REGION" --output json \
  | jq -r '.Contents[]? | select(.Size > 0) | .Key' \
  | grep -Ei '\.(mp4|m4v|mov|mkv|avi)$' \
  | sort > "$WORK/source-keys.txt" || true

SRC_COUNT="$(wc -l < "$WORK/source-keys.txt" | tr -d ' ')"
log "found $SRC_COUNT source clips"
[ "$SRC_COUNT" -gt 0 ] || { echo "nothing to do" >&2; exit 1; }

# ------------------------------------------------------- assign stable item ids
# slug from the filename; collisions get an 8-char hash of the full key so the
# mapping is deterministic and re-runnable.
log "assigning item ids..."
: > "$WORK/slugs.txt"
while IFS= read -r key; do
  base="$(printf '%s' "$key" | sed 's#.*/##; s#\.[^.]*$##')"
  base="$(printf '%s' "$base" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || printf '%s' "$base")"
  slug="$(printf '%s' "$base" | tr 'A-Z' 'a-z' | sed 's#[^a-z0-9]\{1,\}#-#g; s#^-##; s#-$##')"
  [ -n "$slug" ] || slug="clip"
  printf '%s\t%s\n' "$slug" "$key" >> "$WORK/slugs.txt"
done < "$WORK/source-keys.txt"

cut -f1 "$WORK/slugs.txt" | sort | uniq -d > "$WORK/dupes.txt"
: > "$WORK/todo-all.txt"
while IFS="$(printf '\t')" read -r slug key; do
  id="$slug"
  if grep -qxF "$slug" "$WORK/dupes.txt"; then
    id="$slug-$(sha8 "$key")"
  fi
  printf '%s\t%s\n' "$key" "$id" >> "$WORK/todo-all.txt"
done < "$WORK/slugs.txt"

DUPE_COUNT="$(wc -l < "$WORK/dupes.txt" | tr -d ' ')"
[ "$DUPE_COUNT" = "0" ] || log "note: $DUPE_COUNT filename collisions — those ids carry a hash suffix"

# ------------------------------------------------------------- skip what's done
if [ "$FORCE" = "1" ]; then
  : > "$WORK/done-ids.txt"
  log "--force: ignoring already-packaged items"
else
  log "listing destination for completed items..."
  aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$DST_PREFIX" \
    --region "$REGION" --output json \
    | jq -r '.Contents[]?.Key | select(endswith("/index.m3u8"))' \
    | sed "s#^${DST_PREFIX}##; s#/index.m3u8\$##" \
    | sort > "$WORK/done-ids.txt" || : > "$WORK/done-ids.txt"
fi

# The NR==FNR two-file idiom is WRONG when the first file is empty, which is
# exactly the first run: with nothing in done-ids.txt, awk never reads a record
# from it, so record 1 of todo-all.txt arrives with NR==FNR==1, matches the
# "collect the done list" branch, and every line is consumed as a done id. The
# result is an empty todo list, "0 to do", and exit 0 — a run that reports
# success having packaged nothing.
if [ -s "$WORK/done-ids.txt" ]; then
  awk -F'\t' 'NR==FNR { seen[$0]=1; next } !($2 in seen)' \
    "$WORK/done-ids.txt" "$WORK/todo-all.txt" > "$WORK/todo.txt"
else
  cp "$WORK/todo-all.txt" "$WORK/todo.txt"
fi

TODO_COUNT="$(wc -l < "$WORK/todo.txt" | tr -d ' ')"
DONE_COUNT="$(wc -l < "$WORK/done-ids.txt" | tr -d ' ')"
log "$DONE_COUNT already packaged, $TODO_COUNT to do"

if [ "$LIMIT" -gt 0 ]; then
  head -n "$LIMIT" "$WORK/todo.txt" > "$WORK/todo.trimmed" && mv "$WORK/todo.trimmed" "$WORK/todo.txt"
  TODO_COUNT="$(wc -l < "$WORK/todo.txt" | tr -d ' ')"
  log "--limit $LIMIT: processing $TODO_COUNT"
fi

if [ "$TODO_COUNT" = "0" ]; then log "nothing left to do"; exit 0; fi

if [ "$DRY_RUN" = "1" ]; then
  log "--dry-run: first 20 items that would be processed"
  head -20 "$WORK/todo.txt" | awk -F'\t' '{ printf "  %s\n    -> %s%s/index.m3u8\n", $1, "'"$DST_PREFIX"'", $2 }'
  exit 0
fi

# ------------------------------------------------------------------------- run
export HLS_BUCKET="$BUCKET" HLS_REGION="$REGION" HLS_WORK="$WORK" HLS_TIME="$HLS_TIME"
export HLS_SRC_PREFIX="$SRC_PREFIX" HLS_DST_PREFIX="$DST_PREFIX" HLS_POSTERS="$POSTERS"
BUCKET="$BUCKET" REGION="$REGION" WORK="$WORK" DST_PREFIX="$DST_PREFIX" POSTERS="$POSTERS"
export BUCKET REGION WORK DST_PREFIX POSTERS HLS_TIME CACHE_CONTROL

START="$(date +%s)"
tr '\n' '\0' < "$WORK/todo.txt" \
  | xargs -0 -P "$JOBS" -n 1 bash "$0" --worker

ELAPSED=$(( $(date +%s) - START ))
FAILED="$(wc -l < "$WORK/failures.log" | tr -d ' ')"
PACKAGED="$(( $(wc -l < "$WORK/manifest.csv" | tr -d ' ') - 1 ))"

log "done in ${ELAPSED}s — $PACKAGED packaged, $FAILED failed"
log "mapping for Directus hls_key:  $WORK/manifest.csv"
[ "$FAILED" = "0" ] || log "failures:  $WORK/failures.log"
