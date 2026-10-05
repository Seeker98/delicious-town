#!/usr/bin/env bash
# 服务端部署（问题记录 335）：GitHub Actions 在 main 的 CI 通过后用 SSH 调用，也可以在服务器上手动执行。
#   infra/deploy.sh [提交号]    不带提交号时部署 origin/main 的最新提交
# 只往前快进（--ff-only）：部署的提交比服务器上的旧时什么都不改，不会倒退。
# 迁移由 migrate 服务在 api、worker 启动前自动执行；最后等所有 api 容器的健康检查（/readyz）通过才算部署成功。
set -euo pipefail

cd "$(dirname "$0")/.."
REF="${1:-origin/main}"
# 在 infra 目录里执行 compose：.env（POSTGRES_PASSWORD、TUNNEL_TOKEN 等）从当前目录读取，和手动升级的命令一致
COMPOSE=(docker compose -f compose.prod.yml)

# 同一时间只跑一次部署（连续合并时后一次等前一次跑完）
exec 9>/tmp/dt-deploy.lock
flock 9

# 服务器上的仓库有手工改动时停下，免得被覆盖
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "服务器上的仓库有未提交的改动，先处理再部署：" >&2
  git status --short >&2
  exit 1
fi

git fetch --quiet origin main
git checkout --quiet main
before=$(git rev-parse --short HEAD)
git merge --quiet --ff-only "$REF"
after=$(git rev-parse --short HEAD)
echo "代码：$before → $after"

cd infra

# 镜像在 GitHub Actions 里构建好推到 GHCR（问题记录 382：服务器只有 1 GB 内存，在服务器上构建会把数据库挤进交换区），
# 这里按提交号拉下来、打成 compose 用的 dt-server:latest。拉不到时（CI 还没推、包还是私有的）退回在服务器上构建
IMAGE=ghcr.io/seeker98/delicious-town-server
sha=$(git rev-parse HEAD)
if pulled=$(docker pull --quiet "$IMAGE:$sha" 2>&1); then
  docker tag "$IMAGE:$sha" dt-server:latest
  echo "镜像：$IMAGE:${sha:0:7}"
else
  # 把拉不到的原因打出来（包还是私有的、架构不对等），免得每次悄悄退回在服务器上构建
  echo "拉不到 $IMAGE:${sha:0:7}，改在服务器上构建：$pulled" >&2
  "${COMPOSE[@]}" build migrate
fi
"${COMPOSE[@]}" up -d

# 等所有 api 容器变成 healthy：最多 3 分钟。读 compose 自己的健康检查结果（每 10 秒查一次 /readyz），两个副本都要通过
api_healthy() {
  local ids status
  ids=$("${COMPOSE[@]}" ps -q api)
  [ -n "$ids" ] || return 1
  # shellcheck disable=SC2086 # 每个容器 id 是一个参数
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $ids)
  ! grep -qv '^healthy$' <<<"$status"
}
echo "等 api 通过健康检查（最多 3 分钟）…"
for _ in $(seq 1 36); do
  if api_healthy; then
    # 拉下来的旧版本镜像（按提交号的标签）只留这一次的，其余删掉，免得磁盘越积越多
    docker images "$IMAGE" --format '{{.Tag}}' | grep -vx "$sha" | while read -r tag; do
      docker rmi "$IMAGE:$tag" >/dev/null 2>&1 || true
    done || true
    timeout 120 docker image prune -f >/dev/null 2>&1 || true
    echo "部署完成：$after"
    exit 0
  fi
  sleep 5
done

echo "api 3 分钟内没有通过健康检查，最近的日志：" >&2
"${COMPOSE[@]}" logs --tail 80 migrate api >&2 || true
exit 1
