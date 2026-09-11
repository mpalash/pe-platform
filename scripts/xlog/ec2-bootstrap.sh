#!/bin/bash
# EC2 user-data for the Experience Log → x_logs run. See README.md.
#
# Installs ffmpeg, pulls xlog.sh from S3, runs it over every .mov under
# "Experience Log/" largest-first, publishes its log as it goes, and
# terminates itself. No credentials here — S3 access comes from the instance
# profile (iam-transcode-policy.json).
set -uo pipefail

# ============================== CONFIG =======================================
BUCKET="aam-purgatory-archive"
REGION="eu-north-1"
SRC_PREFIX="Experience Log/"
RUN_PREFIX="_xlog-run"
PARALLEL=5          # concurrent files; each ffmpeg threads itself
LIMIT=""            # e.g. 2 for a trial run; empty = everything
MAX_HOURS=6         # hard stop, whatever state the job is in
SHUTDOWN_WHEN_DONE=1
# =============================================================================

# Before anything else can hang: this box does not outlive MAX_HOURS.
shutdown -h +$((MAX_HOURS * 60)) "xlog hard stop" || true

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="s3://$BUCKET/$RUN_PREFIX/runs/$RUN_ID"
LOG=/var/log/xlog-run.log
WORK=/mnt/xlog-work
export AWS_DEFAULT_REGION="$REGION" BUCKET WORK

exec > >(tee -a "$LOG") 2>&1
echo "=== xlog run $RUN_ID on $(hostname) ==="

STATUS="failed-early"
finish() {
  echo "=== finishing: $STATUS ==="
  kill "${PUBLISHER:-0}" 2>/dev/null || true
  aws s3 cp --only-show-errors "$LOG" "$OUT/run.log" || true
  printf '%s\n' "$STATUS" | aws s3 cp --only-show-errors - "$OUT/STATUS" || true
  [ -s "$WORK/failures.log" ] && aws s3 cp --only-show-errors "$WORK/failures.log" "$OUT/failures.log" || true
  [ "$SHUTDOWN_WHEN_DONE" = "1" ] && shutdown -h now
}
trap finish EXIT

export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y ffmpeg jq unzip curl || { STATUS="apt-failed"; exit 1; }
if ! aws --version 2>&1 | grep -q 'aws-cli/2'; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip \
    && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install --update \
    || { STATUS="awscli-install-failed"; exit 1; }
fi
ffmpeg -version | head -1; aws --version

mkdir -p "$WORK"; : > "$WORK/failures.log"
STATUS="no-s3-access"
aws s3 cp --only-show-errors "s3://$BUCKET/$RUN_PREFIX/xlog.sh" /usr/local/bin/xlog.sh || exit 1
chmod +x /usr/local/bin/xlog.sh

# Largest first: a 5GB file started last would run alone for its whole
# duration while every other core sat idle.
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$SRC_PREFIX" \
  --query 'Contents[].[Size,Key]' --output text \
  | grep -iE '\.mov$' | sort -t$'\t' -k1,1nr | cut -f2- > "$WORK/keys.txt"
[ -n "$LIMIT" ] && { head -n "$LIMIT" "$WORK/keys.txt" > "$WORK/k"; mv "$WORK/k" "$WORK/keys.txt"; }
TOTAL="$(wc -l < "$WORK/keys.txt")"
[ "$TOTAL" -gt 0 ] || { STATUS="no-sources-listed"; exit 1; }
echo "--- $TOTAL sources, $PARALLEL at a time ---"

# Progress without SSH: the log lands in S3 every five minutes.
( while sleep 300; do aws s3 cp --only-show-errors "$LOG" "$OUT/run.log" || true; done ) &
PUBLISHER=$!
printf 'running\n' | aws s3 cp --only-show-errors - "$OUT/STATUS"

STATUS="running"
# Keys contain spaces, so NUL-delimited — never whitespace-split. (-0 rather
# than GNU's -d so the exact line can be tested on macOS too.)
tr '\n' '\0' < "$WORK/keys.txt" \
  | xargs -0 -P "$PARALLEL" -I{} bash -c '/usr/local/bin/xlog.sh "$1" || echo "$1" >> "$WORK/failures.log"' _ {}

FAILED="$(wc -l < "$WORK/failures.log")"
echo "--- $((TOTAL - FAILED)) of $TOTAL succeeded ---"
[ "$FAILED" -eq 0 ] && STATUS="ok" || STATUS="done-with-$FAILED-failures"
