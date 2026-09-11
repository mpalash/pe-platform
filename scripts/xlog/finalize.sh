#!/usr/bin/env bash
# After the run: pair and copy the CSVs, write x_logs/index.json, remove the role.
set -euo pipefail
cd "$(dirname "$0")"
export AWS_PROFILE="${AWS_PROFILE:-pe-hls-operator}" AWS_DEFAULT_REGION=eu-north-1
B=aam-purgatory-archive; ROLE=pe-xlog-transcode
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# ── Inputs for pair.py ─────────────────────────────────────────────────────
echo "── reading Experience Log/"
aws s3api list-objects-v2 --bucket "$B" --prefix "Experience Log/" --query 'Contents[].Key' --output json \
  | jq -r '.[]' > "$tmp/keys.txt"
# The CSVs come down (3.7MB) only to read their timestamps — pairing is by
# time, and the time is inside the file.
aws s3 cp --only-show-errors --recursive "s3://$B/Experience Log/" "$tmp/src/" --exclude '*' --include '*.csv' --include '*.CSV'
: > "$tmp/spans.tsv"
grep -iE '\.csv$' "$tmp/keys.txt" | while IFS= read -r k; do
  ts="$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}' "$tmp/src/${k#Experience Log/}" || true)"
  [ -n "$ts" ] || { echo "no timestamp in $k — cannot pair it"; exit 1; }
  printf '%s\t%s\t%s\n' "$k" "$(head -1 <<< "$ts")" "$(tail -1 <<< "$ts")" >> "$tmp/spans.tsv"
done
mkdir -p "$tmp/done" "$tmp/out"
aws s3 cp --only-show-errors --recursive "s3://$B/_xlog-run/done/" "$tmp/done/"

echo "── pairing"
python3 pair.py "$tmp/keys.txt" "$tmp/spans.tsv" "$tmp/done" "$tmp/out"

# ── Copy ───────────────────────────────────────────────────────────────────
# Server-side: CopyObject within the bucket, nothing uploaded from here.
# Paired CSVs become x_logs/<slug>/met.csv and filenames.csv; the original
# keys are recorded in index.json. CSVs that belong to no video go to
# x_logs/_unpaired/ under their original names, so nothing is left behind.
echo "── copying CSVs"
n=0
while IFS=$'\t' read -r src dest; do
  aws s3 cp --only-show-errors "s3://$B/$src" "s3://$B/$dest" \
    --metadata-directive REPLACE --content-type 'text/csv; charset=utf-8'
  n=$((n + 1))
done < "$tmp/out/copies.tsv"
echo "   $n copied"

aws s3 cp --only-show-errors "$tmp/out/index.json" "s3://$B/x_logs/index.json" \
  --content-type application/json --cache-control 'public, max-age=300'
echo "   x_logs/index.json: $(jq .count "$tmp/out/index.json") videos"

# ── Teardown — the role only exists for the run ────────────────────────────
echo "── teardown"
aws iam remove-role-from-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE" 2>/dev/null || true
aws iam delete-instance-profile --instance-profile-name "$ROLE" 2>/dev/null || true
aws iam delete-role-policy --role-name "$ROLE" --policy-name xlog-transcode 2>/dev/null || true
aws iam delete-role --role-name "$ROLE" 2>/dev/null || true
echo "   role removed"
