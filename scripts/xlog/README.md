# x_logs — Experience Log videos as 720p HLS

Turns every `.mov` under `Experience Log/` in `aam-purgatory-archive` into a
720p HLS stream with a poster, and pairs each with its two session CSVs, under
`x_logs/<slug>/`. Runs on a short-lived EC2 box in `eu-north-1`, next to the
bucket — 188GB of source never leaves AWS.

**The sources are never written.** Nothing in these scripts names
`Experience Log/` as a destination, and the instance role carries an explicit
Deny on writing or deleting there, since that box runs unattended.

## Output

```
x_logs/
  index.json                      every video: playlist, poster, both CSVs, sources, recorded
  <slug>/index.m3u8               VOD playlist, 6s segments
  <slug>/seg_00000.ts …           H.264 High@4.0, 1280×720, 30fps CFR, AAC 128k
  <slug>/poster.jpg               1280×720, the frame at 20s
  <slug>/met.csv                  headset metrics for that session
  <slug>/filenames.csv            the archive clips shown in that session
  _unpaired/…                     CSVs that belong to no video, original names
_xlog-run/
  xlog.sh                         the job, staged for the instance
  done/<slug>.json                one marker per finished video — reruns skip these
  runs/<id>/run.log, STATUS       per-run log, published every 5 minutes
```

`slug` is the source filename lowercased with every run of non-alphanumerics
collapsed to `-`. `recorded` in the index is the date and time **as written in
the filename** — venue-local, zone unrecorded, kept as text (Q1).

## Encode choices

- **30fps CFR.** The sources are headset screen captures — some 60fps, some
  variable (`r_frame_rate=600/1`). HLS wants a fixed keyframe grid, and 30
  halves the bitrate of the 60fps ones.
- **Keyframe every 2s, segments of 6s.** Seeking lands within 2s.
- **CRF 23, capped at 3 Mbps.** The footage is dark and soft; tested at SSIM
  0.994 against the source at ~525 kbps. The cap is for busy scenes.
- **Poster is the frame at 20s** — frame 0 is usually a headset boot screen.
  A source shorter than 20s falls back to its midpoint.
- **Audio that outlives the video.** Some captures stopped before their audio
  did. If that tail has sound, the last frame is held to the end so the sound
  is kept; if it is silent (peak under −60dB), the stream ends with the
  picture. Two sources are affected: Marianna (135s, silent → ends with the
  picture) and Eddie (20s). Where the *video* outlasts the audio (three
  sessions on 01-10/01-11, ~100s each), nothing is needed — the sound ends.
- **Verified before upload:** segments exist, playlist has `#EXT-X-ENDLIST`,
  poster is non-empty, and total duration is within **2s** of what it should
  be. A truncated encode otherwise looks like a valid, shorter video. It was
  "1s or 1%" until a 50-minute session showed that 1% is 30s — enough to wave
  through a dropped tail.

## Pairing

Each session wrote `…_subjectID_<name>_met.csv` and `…_filenames.csv`, and
every row is timestamped. `pair.py` matches them two independent ways — the
CSV whose time range contains the video's start, and date plus the name in
the video's filename — and they agree on every session where both apply.
Its docstring has the detail, including why "contains" rather than "starts
just after": the headset sometimes logged into one file for hours.

As of September 2026: **81 of 84 videos have both CSVs.** Bettina and Varia
(2025-01-10, 19:01 and 19:14) have `filenames.csv` only — no metrics file was
ever written. Jaromir (2025-01-11) has neither. Ten CSVs belong to no video —
test sessions, a one-minute blip, and the 2025-01-29 press day, which has
data but no recordings — and go to `_unpaired/`.

## Last run — 2026-09-11

All 84 videos, 25.4GB of output (19,055 objects) from 188GB of source, in two
runs on a `c7i.8xlarge`: 82 in ~1h40m, then Marianna and Eddie after the
audio-tail rule was added. `Experience Log/` was listed before and after and
is identical. All 174 CSV copies match their sources by size and ETag.

## Run it

1. Give the `pe-hls-operator` IAM user an inline policy covering this bucket,
   the `pe-xlog-transcode` role, EC2 in `eu-north-1`, and the Ubuntu AMI
   parameter.

   **`iam-operator-policy.json` here is NOT what is attached.** It is the
   original, tightly scoped draft — writes allowed only to `x_logs/` and
   `_xlog-run/`, explicit Denies on every existing folder — and it exceeds
   IAM's 2,048-character limit for inline user policies. What was actually
   attached (2026-09-11) is a simplified version granting object read/write
   across the whole bucket. The instance role (`iam-transcode-policy.json`,
   which has a 10,240 limit) still carries the Deny on writing to
   `Experience Log/`, so the unattended box cannot overwrite a recording.
2. `scripts/xlog/launch.sh` — stages the job, creates the `pe-xlog-transcode`
   role, launches a `c7i.8xlarge` (falls back to `c6i`). The instance
   terminates itself when done, and unconditionally after 6 hours.
3. Watch `s3://aam-purgatory-archive/_xlog-run/runs/<id>/run.log`.
4. `scripts/xlog/finalize.sh` — pairs and copies the CSVs (server-side),
   writes `index.json`, deletes the role.

A rerun skips anything with a done marker, so an interrupted run resumes.

## Test locally

```
LOCAL=1 IN=some.mov WORK=/tmp/x scripts/xlog/xlog.sh "Experience Log/some.mov"
```

Same code path, no S3.
