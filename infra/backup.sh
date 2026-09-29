#!/bin/sh
# 每晚由宿主机 cron 调用：0 4 * * * /opt/dt/infra/backup.sh
# 保留期（14 天）用 R2 存储桶的生命周期规则控制，见 docs/deploy.md
set -eu
cd "$(dirname "$0")"

# 只从 .env 里取备份需要的变量，不 source 整个文件（其他值可能含 shell 特殊字符）
env_get() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed 's/^"\(.*\)"$/\1/'
}
R2_ENDPOINT=$(env_get R2_ENDPOINT)
R2_BUCKET=$(env_get R2_BUCKET)
AWS_ACCESS_KEY_ID=$(env_get AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$(env_get AWS_SECRET_ACCESS_KEY)
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/dt-$STAMP.dump"
docker compose -f compose.prod.yml exec -T postgres pg_dump -U dt -d dt -Fc > "$FILE"
docker run --rm -v /tmp:/tmp -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp "$FILE" "s3://$R2_BUCKET/db/dt-$STAMP.dump" --endpoint-url "$R2_ENDPOINT"
rm -f "$FILE"
echo "backup uploaded: dt-$STAMP.dump"
