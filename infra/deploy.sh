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

"${COMPOSE[@]}" build migrate
"${COMPOSE[@]}" up -d

# 等所有 api 容器变成 healthy：最多 3 分钟。读 compose 自己的健康检查结果（每 10 秒查一次 /readyz），
# 不用 compose exec 进容器：exec 默认接管输入，经 SSH 执行时输入不结束会一直卡住
api_healthy() {
  local ids status
  ids=$("${COMPOSE[@]}" ps -q api)
  [ -n "$ids" ] || return 1
  # shellcheck disable=SC2086 # 每个容器 id 是一个参数
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $ids)
  ! grep -qv '^healthy$' <<<"$status"
}
for _ in $(seq 1 36); do
  if api_healthy; then
    timeout 120 docker image prune -f >/dev/null 2>&1 || true
    echo "部署完成：$after"
    exit 0
  fi
  sleep 5
done

echo "api 3 分钟内没有通过健康检查，最近的日志：" >&2
"${COMPOSE[@]}" logs --tail 80 migrate api >&2 || true
exit 1
