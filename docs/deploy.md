# 部署说明

## 一、准备
1. 一台海外 VPS（香港 / 日本 / 新加坡，2 核 4G 起），安装 Docker 和 Docker Compose 插件
2. 一个域名，托管到 Cloudflare（免费账户即可）
3. Cloudflare Turnstile：创建一个站点，记下 site key 和 secret key
4. 发信服务：Brevo 或 Resend，拿到 SMTP 地址和账号
5. Cloudflare R2：创建存储桶 `dt-backup`，生成 API 令牌；在存储桶的生命周期规则里设置"14 天后删除"

## 二、服务端（VPS）
1. 把仓库放到 `/opt/dt`
2. `cp infra/.env.example infra/.env`，按注释填写（`COOKIE_SECURE=true`、`TRUST_CF_HEADER=true` 必须开启）
3. Cloudflare 控制台 → Zero Trust → Networks → Tunnels：创建隧道，把 token 填进 `TUNNEL_TOKEN`；
   在隧道的 Public Hostname 里添加 `api.<域名>` → `http://api:3000`
4. 构建并启动：
   ```bash
   cd /opt/dt/infra
   docker compose -f compose.prod.yml build migrate
   docker compose -f compose.prod.yml up -d
   ```
5. 建区服：`docker compose -f compose.prod.yml run --rm api node dist/cli/shard.js ensure --id 1 --name 一服`
6. 检查：`curl https://api.<域名>/readyz` 返回 `{"ok":true,...}`
7. 备份：`chmod +x backup.sh`，`crontab -e` 加入 `0 4 * * * /opt/dt/infra/backup.sh`

VPS 防火墙只需开放 SSH，80/443 都不用开（流量全部经 Tunnel 进来）。

## 三、前端（Cloudflare Pages）
1. Pages → 连接 Git 仓库
2. 构建命令：`npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @dt/web build`
3. 输出目录：`apps/web/dist`
4. 环境变量：`VITE_API_BASE=https://api.<域名>`、`VITE_TURNSTILE_SITEKEY=<site key>`、`NODE_VERSION=22`
5. 自定义域名：`game.<域名>`；`infra/.env` 里的 `WEB_ORIGIN` 要与之一致

## 四、升级
```bash
cd /opt/dt && git pull
cd infra && docker compose -f compose.prod.yml build migrate && docker compose -f compose.prod.yml up -d
```
迁移由 `migrate` 服务在 api 和 worker 启动前自动执行。

## 五、资源包
图片放在 `apps/web/public/pack/`（按 `goods/<道具名>.png` 这样的路径），不提交进仓库。
原版美术素材有版权风险，正式运营前应替换为自制或授权的素材；图片缺失时页面会显示图标兜底。

## 子项目 2A 之后的变化

- worker 现在承担所有周期任务（结算每 4 分钟、体力、老鼠、天气、菜场、商店特价），每 5 秒检查一次到期任务，执行记录在 `job_run` 表（保留 7 天）。**生产环境必须至少跑一个 worker**，两个 worker 时只有主节点执行。
- `ENABLE_TEST_API` 只能在开发环境开启；生产环境设成 true 会拒绝启动。
- 结算并发数和批大小在配置 `tuning.settlement.concurrency / batchSize`，数据库连接池 `DB_POOL_SIZE` 应不小于并发数 + 4。
- 区服数值可以通过 `shard_config.override.tuning` 覆盖（深合并，覆盖后重新校验；写错会导致该区服操作报错，修改前先用 `pnpm sim --tuning` 验证）。

## 运营控制台

- 后台在网页的 `/admin`，接口前缀 `/api/v1/admin`。没有权限的账号看到的是"页面不存在"。
- 设置第一个管理员（在服务器上执行）：
  `docker compose -f compose.prod.yml run --rm api node dist/cli/account.js role <用户名> admin`
  开发环境：`pnpm --filter @dt/server account role <用户名> admin`
  之后管理员可以在后台给别人设"协管"（只读 + 封号 + 强制改名）或"管理员"。
- 区服数值保存后，API 和 worker 通过 Redis 频道 `shard-settings` 立即清缓存，不需要重启。
- 全区服补偿和每日统计汇总都由 worker 执行：**生产环境必须跑 worker**。
- 可选：用反向代理限制 `/admin` 和 `/api/v1/admin` 的来源 IP。
