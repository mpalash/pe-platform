# HLS packaging run

One-off batch that packages the archive's MP4s into HLS, in place, in S3.

**Scale, measured 2026-08-28:** `Clips 480p/` holds **26,521 MP4s totalling 11.9 GB** — about
six times the count this document originally assumed, though small in bytes at ~450 KB a clip.
Expect ~53,000 output objects, not ~9,000.
Phase 3 §3.8 work — read that section before running this.

| File | What it is |
|---|---|
| `hls.sh` | The packager. Runs anywhere with bash + ffmpeg + awscli v2 + jq. |
| `ec2-bootstrap.sh` | EC2 user-data: installs deps, runs `hls.sh`, publishes results, self-terminates. |
| `iam-transcode-policy.json` | Least-privilege policy for the instance profile. |
| `iam-operator-policy.json` | Least-privilege policy for the *operator* — whoever runs the commands below. |

## Why on EC2 rather than a laptop

Pulling 4,500 clips out of S3 to a local machine costs **$0.09/GB egress** — on the order of
$12–32 for this archive — plus many hours of home bandwidth. EC2 in `eu-north-1` reads from
and writes to a bucket **in the same region at no transfer charge**, so the same job costs
under a dollar of instance time.

The output design is `-hls_flags single_file`: two objects per clip (`index.m3u8` +
`stream.ts`, byte-range addressed) rather than ~60. **CloudFront must serve range requests**
(§3.6) or none of this plays.

## Run it

Everything below is run from a machine with credentials that can create IAM roles and
launch instances — your laptop, not this repo's containers.

### 0. Operator permissions

The commands below need IAM, EC2, SSM and S3 write on the run prefixes. A user with S3 read
alone gets an `AccessDenied` on step 1 and again on step 2, which is how this was found.

**Use a dedicated user, not an existing one.** This grants EC2 launch and role-creation
rights; bolting them onto a user that exists for something else widens that user permanently,
and the teardown then has to be surgical rather than just deleting the principal.

```bash
aws iam create-user --user-name pe-hls-operator

aws iam put-user-policy \
  --user-name pe-hls-operator \
  --policy-name pe-hls-operator \
  --policy-document file://scripts/media/iam-operator-policy.json

aws iam create-access-key --user-name pe-hls-operator   # configure as a named CLI profile
```

Both of those `iam:` calls need an admin principal — a user cannot grant itself permissions,
so running them as `pe-hls-operator` fails with `AccessDenied` on `iam:PutUserPolicy`.

`iam-operator-policy.json` grants exactly what steps 1–6 use and nothing more: scoped to the
`pe-hls-transcode` role by ARN, to `eu-north-1`, and with **every write and delete under
`Clips 480p/*` explicitly denied**. Read on the source is allowed so a packaged clip can be
compared against its original; nothing else about it is reachable.

That deny is the second of two layers. The instance policy already protects the source from
the transcoder, but without this the person *running* the job would still hold credentials
that could overwrite the archive by accident.

Tear it down with the rest of §7:

```bash
aws iam delete-user-policy --user-name pe-hls-operator --policy-name pe-hls-operator
aws iam delete-access-key  --user-name pe-hls-operator --access-key-id <id>
aws iam delete-user        --user-name pe-hls-operator
```

### 1. Role and instance profile

```bash
cd scripts/media

aws iam create-role --role-name pe-hls-transcode \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam put-role-policy --role-name pe-hls-transcode \
  --policy-name pe-hls-s3 --policy-document file://iam-transcode-policy.json

aws iam create-instance-profile --instance-profile-name pe-hls-transcode
aws iam add-role-to-instance-profile \
  --instance-profile-name pe-hls-transcode --role-name pe-hls-transcode
```

The policy allows read on `Clips 480p/*`, write on `hls/*` and `_hls-run/runs/*`, and
**explicitly denies every delete**. The source clips cannot be touched even by a bug.

### 2. Stage the script

```bash
aws s3 cp hls.sh s3://aam-purgatory-archive/_hls-run/hls.sh
```

Re-upload after any edit — the instance fetches this copy, not your working tree.

### 3. Trial launch: 20 clips

Edit `EXTRA_ARGS="--limit 20"` in `ec2-bootstrap.sh`, then:

```bash
AMI='resolve:ssm:/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id'

aws ec2 run-instances \
  --region eu-north-1 \
  --image-id "$AMI" \
  --instance-type c7g.2xlarge \
  --iam-instance-profile Name=pe-hls-transcode \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":100,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --instance-initiated-shutdown-behavior terminate \
  --metadata-options 'HttpTokens=required' \
  --user-data file://ec2-bootstrap.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=pe-hls-transcode}]'
```

`instance-initiated-shutdown-behavior terminate` is what makes the script's `shutdown -h now`
end the billing rather than leave a stopped box and its volume behind. Don't drop it.

**Verify the AMI parameter resolves before you rely on it** — Canonical's SSM paths change
between LTS releases:

```bash
aws ssm get-parameter --region eu-north-1 \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text
```

For x86 instead, use `c7i.2xlarge` and swap `arm64` → `amd64` in that path.

### 4. Watch it

No SSH needed — the instance publishes as it goes, every two minutes:

```bash
aws s3 ls s3://aam-purgatory-archive/_hls-run/runs/ --recursive
aws s3 cp s3://aam-purgatory-archive/_hls-run/runs/<RUN_ID>/run.log -
aws s3 cp s3://aam-purgatory-archive/_hls-run/runs/<RUN_ID>/STATUS -
```

`STATUS` ends as `ok`, or names the stage that failed (`selftest-failed`, `no-s3-access`,
`hls-exit-N`). If the box vanished without writing `STATUS`, it died before the trap
installed — check the console output in the EC2 console.

### 5. Verify the trial before the full run

Through CloudFront, not S3:

```bash
curl -sI https://media.<domain>/hls/<item-id>/index.m3u8 | grep -i content-type
# must be: application/vnd.apple.mpegurl

curl -s -r 0-1023 -o /dev/null -w '%{http_code}\n' https://media.<domain>/hls/<item-id>/stream.ts
# must be 206, not 200 — single-file HLS is entirely dependent on this
```

Then play one in Safari and one in Chrome. **CORS matters now in a way it did not before**: a
progressive MP4 in `<video src>` needs no CORS headers, but hls.js fetches the playlist and
segments by XHR and does. If the trial plays in Safari (native HLS) but not Chrome, that is
the CORS headers, not the packaging.

### 6. Full run

Set `EXTRA_ARGS=""` in `ec2-bootstrap.sh` and launch again with the same command — user-data
is read from your local file at launch, so there is nothing to re-upload unless you edited
`hls.sh` itself. Spot is worth it here:

```bash
  --instance-market-options 'MarketType=spot,SpotOptions={SpotInstanceType=one-time}'
```

`hls.sh` uploads `index.m3u8` last, so an item is either absent or complete — a spot
interruption costs only the clips in flight. Re-launch and it resumes by listing what's
already done.

### 7. Afterwards

- Pull `manifest.csv` — `source_key,item_id,hls_key,poster_key,mode` — and use it to populate
  `hls_key` on the Directus archive items. That is the only thing standing between packaged
  files and the HLS branch in `usePlaybackSource`.
- Check the `mode` column. Mostly `copy` is expected. A lot of `transcode` means the source
  set isn't uniformly H.264/AAC and is worth understanding before trusting the output.
- Read `failures.log`.
- Tear down the IAM role and instance profile once the archive is packaged.

## Run history

**2026-08-28 — trial, 20 clips, `eu-north-1`.** Three launches; the first two found bugs that
this document's steps would not have caught, because both failed *silently* with `STATUS: ok`.

1. **Packaged nothing.** `found 26521 source clips … 0 already packaged, 0 to do`. The
   skip-what's-done filter used the `NR==FNR` two-file awk idiom, which is wrong when the
   first file is empty — with nothing packaged yet, awk consumed the entire todo list as
   done-ids. It only misfires on the *first* run, which is the one nobody gets to repeat.
2. **Half the posters missing.** `-ss 3` on clips shorter than three seconds yields no frame,
   and Ubuntu's ffmpeg 6.1.1 exits 0 having written nothing — so the `||` fallback never
   fired. Did not reproduce on macOS, where the same call exits non-zero. `poster()` now
   checks the clip's duration before seeking and judges success by the file rather than the
   exit status.
3. **Clean.** 20/20 items, all three objects each, `mode=copy` for every one, zero failures.

Verified on the output: playlist is `EXT-X-VERSION:6` VOD with four `EXT-X-BYTERANGE`
segments into a single `stream.ts`; segment durations sum to 20.604s against a 20.608s
source; `index.m3u8` serves as `application/vnd.apple.mpegurl` and a ranged GET on
`stream.ts` returns `206` with a correct `Content-Range`. Source prefix unchanged throughout
— 26,522 objects, 11,882,324,083 bytes, before and after.

**Still outstanding before §6:** there is no CloudFront distribution yet
(`NUXT_PUBLIC_MEDIA_BASE` is empty), so the range/content-type/CORS checks in §5 have only
been done against S3 directly. Single-file HLS depends on the CDN passing ranges through;
confirm that before packaging the remaining 26,501 clips.

## Notes

- **Same-region S3 traffic is free, but only if it doesn't cross a NAT gateway.** Launch into
  a public subnet with a public IP, or add an S3 gateway VPC endpoint. A private subnet
  behind NAT will bill you per GB for the very transfer this whole approach exists to avoid.
- The instance still needs general internet access for `apt` and the awscli installer.
- 100 GB root is generous; `hls.sh` deletes each clip after uploading it, so peak usage is
  roughly `jobs × clip size`. Raise it if the archive has unusually large sources.
- Nothing here writes credentials anywhere. If you find yourself adding an access key to
  `ec2-bootstrap.sh`, the instance profile isn't attached — fix that instead.
