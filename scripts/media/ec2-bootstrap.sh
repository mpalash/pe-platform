#!/bin/bash
#
# scripts/media/ec2-bootstrap.sh — EC2 user-data for the HLS packaging run.
#
# Launched once, this instance installs ffmpeg, pulls hls.sh from S3, packages
# the whole archive, publishes its log and manifest back to S3, and terminates
# itself. Nothing has to babysit it.
#
# No credentials live here. The instance gets S3 access from its instance
# profile; see iam-transcode-policy.json. Do not add access keys to this file.
#
# Runbook, IAM setup, and the run-instances invocation: see README.md.

set -uo pipefail

# ============================== CONFIG =======================================
BUCKET="aam-purgatory-archive"
REGION="eu-north-1"
SRC_PREFIX="Clips 480p/"
DST_PREFIX="hls/"
RUN_PREFIX="_hls-run"        # where hls.sh lives and where logs/manifest land
JOBS=""                      # empty = one per vCPU
EXTRA_ARGS="--limit 20"          # trial default. Set to "" for the full archive (§6).
SHUTDOWN_WHEN_DONE=1         # 0 to leave the box up for debugging
# =============================================================================

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="s3://$BUCKET/$RUN_PREFIX/runs/$RUN_ID"
LOG=/var/log/hls-run.log
WORK=/mnt/hls-work

exec > >(tee -a "$LOG") 2>&1
echo "=== hls run $RUN_ID starting on $(hostname) ==="

# Best effort: get the log and a status marker to S3 no matter how we exit, so a
# failure is visible without SSHing into a box that may already be gone.
STATUS="failed-early"
finish() {
  echo "=== finishing with status: $STATUS ==="
  aws s3 cp "$LOG" "$OUT/run.log" --region "$REGION" --only-show-errors || true
  printf '%s\n' "$STATUS" > /tmp/status
  aws s3 cp /tmp/status "$OUT/STATUS" --region "$REGION" --only-show-errors || true
  [ -f "$WORK/manifest.csv" ] && aws s3 cp "$WORK/manifest.csv" "$OUT/manifest.csv" --region "$REGION" --only-show-errors || true
  [ -f "$WORK/failures.log" ] && aws s3 cp "$WORK/failures.log" "$OUT/failures.log" --region "$REGION" --only-show-errors || true
  if [ "$SHUTDOWN_WHEN_DONE" = "1" ]; then
    echo "shutting down (instance-initiated-shutdown-behavior should be 'terminate')"
    shutdown -h now
  fi
}
trap finish EXIT

# ------------------------------------------------------------------ packages
export DEBIAN_FRONTEND=noninteractive
echo "--- installing ffmpeg, jq ---"
apt-get update -y
apt-get install -y ffmpeg jq unzip curl || { STATUS="apt-failed"; exit 1; }

# Ubuntu ships awscli v1; hls.sh expects v2. Install v2 from the official source.
if ! aws --version 2>&1 | grep -q 'aws-cli/2'; then
  echo "--- installing awscli v2 ---"
  ARCH="$(uname -m)"   # aarch64 or x86_64, matching the installer's naming
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH}.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install --update \
    || { STATUS="awscli-install-failed"; exit 1; }
fi
aws --version
ffmpeg -version | head -1

# ------------------------------------------------------------ sanity: identity
STATUS="no-s3-access"
echo "--- verifying instance profile can reach the bucket ---"
aws sts get-caller-identity --region "$REGION" || exit 1
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$SRC_PREFIX" \
  --max-items 1 --region "$REGION" --output json | jq -e '.Contents|length > 0' >/dev/null \
  || { echo "cannot list source clips under $SRC_PREFIX"; exit 1; }

# ------------------------------------------------------------------ workspace
# Put the work dir on the root volume unless a bigger instance store exists.
mkdir -p "$WORK"
if [ -d /mnt/nvme ] || lsblk -no NAME,MOUNTPOINT | grep -q nvme1; then
  echo "note: instance store present but unused — root volume is simpler and the"
  echo "      script deletes each clip as it goes, so peak usage stays small."
fi
df -h "$WORK" | tail -1

# ------------------------------------------------------------------- the job
STATUS="script-fetch-failed"
echo "--- fetching hls.sh ---"
aws s3 cp "s3://$BUCKET/$RUN_PREFIX/hls.sh" /usr/local/bin/hls.sh --region "$REGION" || exit 1
chmod +x /usr/local/bin/hls.sh

echo "--- selftest ---"
STATUS="selftest-failed"
/usr/local/bin/hls.sh --selftest || exit 1

# Publish the manifest periodically so progress is visible from outside without SSH.
( while sleep 120; do
    [ -f "$WORK/manifest.csv" ] && aws s3 cp "$WORK/manifest.csv" "$OUT/manifest.csv" \
      --region "$REGION" --only-show-errors >/dev/null 2>&1
    aws s3 cp "$LOG" "$OUT/run.log" --region "$REGION" --only-show-errors >/dev/null 2>&1
  done ) &
PROGRESS_PID=$!

echo "--- packaging: s3://$BUCKET/$SRC_PREFIX -> s3://$BUCKET/$DST_PREFIX ---"
STATUS="running"
JOBS_ARG=""
[ -n "$JOBS" ] && JOBS_ARG="--jobs $JOBS"

# shellcheck disable=SC2086
/usr/local/bin/hls.sh \
  --bucket "$BUCKET" --region "$REGION" \
  --src-prefix "$SRC_PREFIX" --dst-prefix "$DST_PREFIX" \
  --work "$WORK" $JOBS_ARG $EXTRA_ARGS
RC=$?

kill "$PROGRESS_PID" 2>/dev/null || true

if [ "$RC" = "0" ]; then STATUS="ok"; else STATUS="hls-exit-$RC"; fi
echo "=== hls.sh exited $RC ==="
