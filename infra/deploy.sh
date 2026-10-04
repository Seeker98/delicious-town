#!/usr/bin/env bash
# 服务端部署（问题记录 335）：GitHub Actions 在 main 的 CI 通过后用 SSH 调用，也可以在服务器上手动执行。
#   infra/deploy.sh [提交号]    不带提交号时部署 origin/main 的最新提交
# 只往前快进（--ff-only）：部署的提交比服务器上的旧时什么都不改，不会倒退。
# 迁移由 migrate 服务在 api、worker 启动前自动执行；最后等 api 的 /readyz 通过才算部署成功。
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

"${COMPOSE[@]}" build migrate
"${COMPOSE[@]}" up -d

# 等 api 健康：最多 3 分钟
for _ in $(seq 1 36); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://localhost:3000/readyz >/dev/null 2>&1; then
    docker image prune -f >/dev/null 2>&1 || true
    echo "部署完成：$after"
    exit 0
  fi
  sleep 5
done

echo "api 3 分钟内没有通过健康检查，最近的日志：" >&2
"${COMPOSE[@]}" logs --tail 80 migrate api >&2 || true
exit 1
