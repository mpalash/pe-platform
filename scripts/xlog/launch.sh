#!/usr/bin/env bash
# Stage xlog.sh, create the instance role, launch the transcode box. See README.md.
set -euo pipefail
cd "$(dirname "$0")"
export AWS_PROFILE="${AWS_PROFILE:-pe-hls-operator}" AWS_DEFAULT_REGION=eu-north-1
B=aam-purgatory-archive; ROLE=pe-xlog-transcode

aws s3 cp --only-show-errors xlog.sh "s3://$B/_xlog-run/xlog.sh"

aws iam get-role --role-name "$ROLE" >/dev/null 2>&1 \
  || aws iam create-role --role-name "$ROLE" --assume-role-policy-document file://iam-transcode-trust.json >/dev/null
aws iam put-role-policy --role-name "$ROLE" --policy-name xlog-transcode --policy-document file://iam-transcode-policy.json
if ! aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
fi

AMI="$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)"
echo "AMI $AMI"

# A freshly created instance profile is rejected by RunInstances for a few
# seconds while IAM propagates — hence the retry. c6i is the fallback if c7i
# has no capacity.
for attempt in 1 2 3 4 5 6; do
  for TYPE in c7i.8xlarge c6i.8xlarge; do
    if ID="$(aws ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" \
        --iam-instance-profile "Name=$ROLE" --instance-initiated-shutdown-behavior terminate \
        --user-data file://ec2-bootstrap.sh \
        --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":120,"VolumeType":"gp3","Throughput":500,"Iops":6000,"DeleteOnTermination":true}}]' \
        --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=pe-xlog-transcode}]' \
        --query 'Instances[0].InstanceId' --output text 2>&1)"; then
      echo "launched $ID ($TYPE)"; exit 0
    fi
    echo "  $TYPE: $ID"
  done
  sleep 10
done
exit 1
