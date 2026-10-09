# 部署说明

## 一、准备
1. 一台海外 VPS（香港 / 日本 / 新加坡，2 核 4G 起），安装 Docker 和 Docker Compose 插件
2. 一个域名，托管到 Cloudflare（免费账户即可）
3. Cloudflare Turnstile：创建一个站点，记下 site key 和 secret key
4. 发信服务：Brevo 或 Resend，拿到 SMTP 地址和账号
5. Cloudflare R2：创建存储桶 `dt-backup`，生成 API 令牌；在存储桶的生命周期规则里设置"14 天后删除"（备份用的令牌只有读写对象的权限，读不到生命周期规则，要在 Cloudflare 后台看）

## 二、服务端（VPS）
1. 把仓库放到 `/opt/dt`
2. `cp infra/.env.example infra/.env`，按注释填写（`COOKIE_SECURE=true`、`TRUST_CF_HEADER=true` 必须开启；`RNG_SECRET` 一般留空：第一次启动时自动生成随机种子密钥并存进数据库的 `server_secret` 表，跟着每晚的数据库备份走，换机、重装、恢复备份后都不变。仓库是公开的，这个密钥让别人没法按源码算出未来的天气、菜场货架、蟹老板位置，所以数据库备份要妥善保管。想手动指定时填至少 16 位，例如 `openssl rand -hex 32`，填了就优先用它，上线后不要再改）
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
7. 备份：`crontab -e` 加入 `0 4 * * * bash /opt/dt/infra/backup.sh >> /var/log/dt-backup.log 2>&1`。用 `bash` 调用，不要 `chmod +x`：仓库里的文件一改（连权限也算），`deploy.sh` 就会因为“服务器上的仓库有未提交的改动”拒绝部署（2026-10-06 因此连续 8 次部署失败）
8. Docker 守护进程（2026-10-10 加，服务器只有 1 GB）：
   - `/etc/docker/daemon.json` 写成 `{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" }, "live-restore": true }`，先 `dockerd --validate --config-file <文件>` 检查，再 `systemctl reload docker`，`docker info --format '{{.LiveRestoreEnabled}}'` 要是 `true`。打开 live-restore 以后重启 Docker 不会连带重启容器。
   - 新建 `/etc/systemd/system/docker.service.d/gomemlimit.conf`，内容是 `[Service]` 和 `Environment=GOMEMLIMIT=120MiB` 两行，然后 `systemctl daemon-reload && systemctl restart docker`。
   - 为什么：dockerd 拉镜像、重建容器时内存会冲高（峰值 333 MB），用完不还给系统，6 天后常驻 185 MB、交换区 51 MB；加了以后重启完是 94 MB。以后又涨上去时，`systemctl restart docker` 就能放掉（容器不受影响）。

VPS 防火墙只需开放 SSH，80/443 都不用开（流量全部经 Tunnel 进来）。

## 二之二、备份恢复演练

隔一段时间（以及改了 backup.sh、换了 Postgres 版本以后）确认一次备份真的能恢复。2026-10-08 做过一次：最新的 `dt-20261007T200001Z.dump` 恢复成功，迁移停在 0055（0056 在备份后 32 分钟才执行），各表行数和线上同一量级。

dump 里是线上数据（密码哈希、邮箱、随机种子密钥 `server_secret`），核对完马上删掉。

1. 服务器上从 R2 取最新一份到 /tmp（取值和 backup.sh 一样：同一个键写了两次时取最后一行、去掉引号；密钥只放进环境变量，不写在命令行上）：
   ```bash
   cd /opt/dt/infra
   env_get() { sed -n "s/^$1=//p" .env | tail -n 1 | sed 's/^"\(.*\)"$/\1/'; }
   export AWS_ACCESS_KEY_ID="$(env_get AWS_ACCESS_KEY_ID)" AWS_SECRET_ACCESS_KEY="$(env_get AWS_SECRET_ACCESS_KEY)"
   EP="$(env_get R2_ENDPOINT)"; BK="$(env_get R2_BUCKET)"
   AWS="docker run --rm -v /tmp:/tmp -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=auto amazon/aws-cli"
   LATEST=$($AWS s3 ls "s3://$BK/db/" --endpoint-url "$EP" | awk '{print $4}' | grep '^dt-' | sort | tail -1)
   $AWS s3 cp "s3://$BK/db/$LATEST" /tmp/restore-check.dump --endpoint-url "$EP"
   ```
2. 拷回本机（`scp root@<服务器>:/tmp/restore-check.dump .`），删掉服务器上的这份：`rm /tmp/restore-check.dump`。
3. 本机开发库的容器里建一个临时库恢复（不动开发库本身）。在 Windows 的 Git Bash 里要先 `export MSYS_NO_PATHCONV=1`，不然 `/tmp/...` 会被改写成 Windows 路径；PowerShell 里直接运行：
   ```bash
   docker cp restore-check.dump dt-dev-postgres-1:/tmp/restore-check.dump
   docker exec dt-dev-postgres-1 psql -U dt -d postgres -c "create database dt_restore_check"
   docker exec dt-dev-postgres-1 pg_restore -U dt -d dt_restore_check --no-owner --exit-on-error /tmp/restore-check.dump
   ```
4. 核对：最新迁移（`select name from kysely_migration order by name desc limit 1`，和线上同一时刻的对得上）、几张主要的表的行数（restaurant、account、store_item、cupboard_food、job_run）和线上同一量级。表数（`pg_tables`）会把按天建的分区也算进去，每天都不一样，只能和线上同一时刻的比。
5. 删掉临时库和文件：`drop database dt_restore_check`、容器里和本机的 `restore-check.dump`。

## 三、前端（Cloudflare Pages）
1. Pages → 连接 Git 仓库
2. 构建命令：`npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @dt/web build`
3. 输出目录：`apps/web/dist`
4. 环境变量：`VITE_API_BASE=https://api.<域名>`、`VITE_TURNSTILE_SITEKEY=<site key>`、`NODE_VERSION=22`
5. 自定义域名：`game.<域名>`；`infra/.env` 里的 `WEB_ORIGIN` 要与之一致

## 三之二、网页和 API 同一个域名（服务器转发 Pages，2026-10）

**为什么**：网页在 `game.`、API 在 `api.` 是跨域，每个新的接口地址先多一次预检（OPTIONS）。2026-10-09 线上 6 小时 286 个请求里 62 个是预检。中国大陆玩家经 Cloudflare 洛杉矶节点到法兰克福，一个来回 400~600 毫秒，每进一个新页面就多等一次。

**怎么做**：
- `game.<域名>` 不再直接用 Pages 的自定义域名，改由隧道接：`/api/*` 交给 API，其余转发到 Pages 自带的 `<项目名>.pages.dev`。
- 网页不设 `VITE_API_BASE`，就请求同域名的 `/api`，没有预检。
- 不用 Worker，没有每天请求数的额度。
- `/assets/*` 带一年的缓存头（`apps/web/public/_headers`），Cloudflare 节点会缓存。
- 代价：HTML 和节点上没缓存的静态文件，要多绕一趟“洛杉矶节点 ↔ 法兰克福”，大陆玩家多 150 毫秒以上；免费版小站的节点缓存也容易被挤掉。这比省下的预检少，仍然划算，但切换后要实测。可以在 Caching → Tiered Cache 打开免费的 Smart Tiered Cache。

**第一步：Cookie 改成整个域名（切换前几天做）**
- 现在登录 Cookie 只属于 `api.`，换到 `game.` 后带不过去，所有人会掉线一次。
- **先确认线上已经部署了带补发逻辑的版本**：`cd /opt/dt && git log --oneline -3` 里要有它的合并提交（#242）。旧版本配上 `COOKIE_DOMAIN` 后，登录时只设新的 Cookie、不删旧的，有旧 Cookie 的玩家会登录后马上又掉线。
- **先清理 DNS**：配了以后，登录 Cookie 会发给 `<域名>` 下的**每一个**子域名（只是网页脚本读不到）。DNS 里指向第三方的记录要先删掉，或者挪到别的域名：邮件服务的点击跟踪、退信域名、状态页、已经不用的 CNAME 等。只看能用网页访问的 CNAME、A、AAAA 记录（MX、TXT 不相关）；有通配符记录 `*.<域名>` 的话要特别小心。
- `infra/.env` 加 `COOKIE_DOMAIN=<域名>`（不带 `game.`、`api.`），然后 `docker compose -f compose.prod.yml up -d --force-recreate api`（worker 不用动）。
- **马上确认 API 起来了**：`COOKIE_DOMAIN` 填错（不是网页域名的上级域名）API 会拒绝启动，整站不可用。看 `docker compose -f compose.prod.yml ps` 里 api 是 healthy，再 `curl https://api.<域名>/readyz`。
- 浏览器里确认：刷新游戏 → 开发者工具 → Application → Cookies，`dt_sid` 的 Domain 是 `.<域名>`，还多了一个 `dt_cd`。
- 之后已登录的玩家下一次请求会补发一次整个域名的 Cookie，同时删掉只属于 `api.` 的旧 Cookie（代码见 `security/session.ts`）。
- 等 3~7 天，活跃玩家基本都补发过了再切换（服务器不记谁补过，没法精确统计）；没补到的只要重新登录一次。
- api 有 2 个副本，重启的那一小会儿，旧副本处理的登录还会发旧 Cookie，个别玩家可能要多登录一次。
- **加上以后不能直接删掉**：删了的话，服务器改发只属于子域名的 Cookie，但不会删整个域名的旧 Cookie，旧的排在前面，玩家会一直登录不进去（最长 30 天）。以后要改 Cookie 的范围，得像这次一样：发新的同时删旧的。

**第二步：在测试域名上演练（不影响玩家）**
1. 预览的环境变量：Pages 项目 → **Settings**，页面**最上方**有环境切换（Production / Preview），切到 Preview 后，在 Variables and Secrets 里删掉 `VITE_API_BASE`（只影响预览部署）；`VITE_TURNSTILE_SITEKEY`、`NODE_VERSION` 在 Preview 里也要有。
2. 推一个分支，或者直接用同域名那个 PR 的分支（2026-10 演练用的是 `feat/same-origin`）。预览的**固定地址**是 `<分支名>.<项目名>.pages.dev`，分支名里的 `/` 换成 `-`，如 `feat-same-origin.delicious-town.pages.dev`。
   - **要在删变量之后构建**：删变量之前构建的预览里写死了 `https://api.<域名>`，在 beta 上登录会报 CORS。往这个分支推一个空提交（`git commit --allow-empty`）就会重新构建。
   - 预览没构建的话，看 Settings → Builds 里的预览分支设置是不是包含这个分支。
3. 隧道 → Public Hostname 依次添加：
   1. `beta.<域名>`，Path 填 `^/api/` → Service：`HTTP`，`api:3000`
   2. `beta.<域名>`，Path 留空 → Service：`HTTPS`，分支的固定地址 `<分支名>.<项目名>.pages.dev`（**不要用**带一串随机字符的某次部署地址，那个固定在那一次构建上）。在 Additional application settings 里：
      - HTTP Settings → **HTTP Host Header** 填同一个地址；
      - TLS → **Origin Server Name** 同样填它。
   3. 两条的顺序：带 Path 的要排在前面（按列表顺序匹配），后台加的顺序不对就拖过来。
4. Turnstile 站点的 Hostname 列表加上 `beta.<域名>`，不然注册、登录的人机验证会失败。
5. 打开 `https://beta.<域名>`：
   - 能登录、能玩；
   - 开发者工具的 Network 里，接口是 `beta.<域名>/api/...`，没有 OPTIONS；
   - `/assets/*` 第二次加载时响应头有 `cf-cache-status: HIT`；
   - `curl -s https://beta.<域名>/api/v1/public/announcements` 回的是 `{"ok":true,...}`，`/api/v1/nope` 回 API 自己的 `{"ok":false,"code":"NOT_FOUND"}`，都不是网页；
   - 直接打开 `https://beta.<域名>/town` 能显示（单页应用的兜底）；
   - `curl -I https://beta.<域名>/` 的 HTML 是 `cf-cache-status: DYNAMIC`，不能被节点缓存。区服规则里不能有匹配它的 Cache Everything、Browser Cache TTL。
6. 不要加“pages.dev 跳转到正式域名”的重定向（网上常推荐），经过隧道会绕成死循环。`*.pages.dev` 预览如果开了 Cloudflare Access 保护，演练会被拦住。
7. 演练完删掉 `beta.` 的两条路由、它的 DNS 记录和 Turnstile 里的这个域名：它也会收到登录 Cookie。

**第三步：正式切换（挑人少的时候，中间约 1~2 分钟打不开）**
1. Pages → Custom domains：删掉 `game.<域名>`。DNS 里如果还留着 `game` 的 CNAME 记录，也删掉。
2. 隧道 → Public Hostname 依次添加：
   1. `game.<域名>`，Path `^/api/` → `HTTP`，`api:3000`
   2. `game.<域名>`，Path 留空 → `HTTPS`，`<项目名>.pages.dev`，HTTP Host Header 和 Origin Server Name 都填 `<项目名>.pages.dev`
   3. 带 Path 的排在前面。
3. 这时页面是旧版，还在请求 `api.` 跨域，照样能用。
4. Pages → Settings（顶部切到 **Production**）→ Variables and Secrets：删掉 `VITE_API_BASE`，然后往 main 推一个空提交触发重新构建（Retry deployment 不一定读新的变量）。部署完以后，新打开的页面就改走同域名：开发者工具里接口是 `game.<域名>/api/...`。
5. 检查：
   - 第二步的几项照着看一遍；
   - 过一天看 API 日志里 OPTIONS 的数量，应该接近 0（命令见下）。
6. `api.<域名>` 至少保留两周：还开着旧页面的玩家要用。CORS 照常允许 `game.`。
7. 只对主机名 `api.` 配过的防火墙、限流等规则，要同样加到 `game.` 的 `/api/` 路径上。
8. 发版后如果白屏：清一下 Cloudflare 缓存（Caching → Purge Everything）。不存在的 `/assets` 地址会拿到首页内容，还带着一年的缓存头。
9. 如果 Pages 开了 Web Analytics（Pages 自定义域名自动注入的那种），切换后可能不再统计，要另外加统计代码。
10. 两周后：隧道里删掉 `api.` 那条和它的 DNS 记录。
11. 请之前说慢的大陆玩家同一时段再试，对比感受。

```bash
cd /opt/dt/infra && docker compose -f compose.prod.yml logs --since 24h --no-log-prefix api \
  | grep -o '"method":"[A-Z]*"' | sort | uniq -c
```

**回退**（顺序不能反：先换回跨域的网页，再换入口，不然中间 API 请求会拿到网页而全部失败）：
1. Production 环境变量加回 `VITE_API_BASE=https://api.<域名>`，推空提交重新构建，等它上线。经过隧道也能用：CORS 允许 `game.`。多数情况到这一步就够了，隧道的路由可以留着。
2. 真要换回 Pages 直接提供：隧道里删掉 `game.` 的两条，DNS 里删掉 `game` 那条 CNAME，再在 Pages 重新加自定义域名 `game.<域名>`（证书生效要几分钟）。

`COOKIE_DOMAIN` **不能删**（见第一步）。

## 四、升级
```bash
cd /opt/dt && git pull
cd infra && docker compose -f compose.prod.yml build migrate && docker compose -f compose.prod.yml up -d
```

不在服务器上构建的手动写法（镜像由 GitHub Actions 推好，见下面「自动部署」）：
```bash
cd /opt/dt && git pull && cd infra
IMAGE=ghcr.io/seeker98/delicious-town-server
docker pull "$IMAGE:$(git rev-parse HEAD)" && docker tag "$IMAGE:$(git rev-parse HEAD)" dt-server:latest
docker compose -f compose.prod.yml up -d
```
迁移由 `migrate` 服务在 api 和 worker 启动前自动执行。

也可以直接执行 `bash /opt/dt/infra/deploy.sh`：它会拉取 main 的最新代码，拉取（或构建）镜像、启动，并等 api 通过健康检查。上面手动 `build` 的写法会在服务器上构建镜像，内存只有 1 GB 时很吃力，平时用 `deploy.sh`。

### 自动部署（问题记录 335）

合并进 main 以后，GitHub Actions 的 `ci`（test、docker）通过，接着 `deploy` 工作流就会 SSH 到服务器执行 `infra/deploy.sh <提交号>`。没有配密钥时，这一步只跳过、不报错。前端仍由 Cloudflare Pages 自己部署。

服务端镜像在 GitHub Actions 里构建（问题记录 382）：`ci` 的 docker 任务在 main 上把镜像推到 `ghcr.io/seeker98/delicious-town-server`，标签是提交号；`deploy.sh` 按提交号拉下来、打成 `dt-server:latest` 再启动，不在服务器上构建，部署时不再把数据库挤进交换区。拉不到时（CI 还没推完、镜像包还是私有的）自动退回在服务器上构建。部署成功后只保留这一次的镜像，旧版本删掉。

**第一次要做一次**：第一个合并进 main 的提交推完镜像后，到 GitHub 个人主页的 Packages → `delicious-town-server` → Package settings → Change visibility，改成 Public（仓库本来就公开，镜像里只有代码和配置，密钥都在服务器的 `infra/.env`）。不改的话服务器拉不到，每次部署都会退回在服务器上构建。

第一次配置：
1. 服务器上先手动升级一次（照上面的命令），让 `/opt/dt/infra/deploy.sh` 存在。
2. 用平时登录服务器的账号（一般就是 root）就行，不用另建：它要能读写 `/opt/dt`、能执行 docker。登录服务器后生成一对部署专用的密钥：
   ```bash
   ssh-keygen -t ed25519 -f ~/dt_deploy -N "" -C github-deploy
   echo "restrict $(cat ~/dt_deploy.pub)" >> ~/.ssh/authorized_keys   # restrict：这把钥匙只能执行命令，不能转发端口
   cat ~/dt_deploy                                                     # 全部复制下来（包括 BEGIN、END 两行），第 4 步要用
   rm ~/dt_deploy ~/dt_deploy.pub
   ```
3. 在服务器上执行下面这行，得到的一行就是服务器的指纹（`<服务器地址>` 换成 `DEPLOY_HOST` 要填的值）：
   ```bash
   echo "<服务器地址> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
   ```
   SSH 端口不是 22 时，开头写成 `[<服务器地址>]:<端口>`。也可以在自己电脑上执行 `ssh-keyscan -t ed25519 <服务器地址>`，但 Windows 自带的版本太旧，会报 `unsupported KEX method`，要用 Git Bash 里的。
4. 在 GitHub 仓库的 Settings → Secrets and variables → Actions 里添加：

   | 名称 | 内容 |
   | --- | --- |
   | `DEPLOY_HOST` | 服务器地址（IP 或域名） |
   | `DEPLOY_USER` | 第 2 步登录服务器用的账号 |
   | `DEPLOY_SSH_KEY` | 第 2 步 `cat ~/dt_deploy` 的全部输出 |
   | `DEPLOY_KNOWN_HOSTS` | 第 3 步得到的那一行 |
   | `DEPLOY_PORT` | 可选：SSH 端口不是 22 时才填 |
   | `DEPLOY_PATH` | 可选：仓库不在 `/opt/dt` 时才填 |

5. 到 Actions → deploy → Run workflow 手动跑一次。看到“部署完成”就配好了，之后每次合并都会自动部署。

注意：
- GitHub 的机器 IP 不固定，所以服务器的 SSH 不能只对白名单 IP 开放。
- 服务器上的仓库有未提交的改动时，部署会停下，不覆盖。`infra/.env` 不在仓库里，不受影响。
- 部署只往前快进：连续合并会排队，一个一个部署。旧提交的部署不会让代码倒退。
- api 3 分钟内没通过健康检查，这次部署就算失败（Actions 里显示红色，并打出 migrate、api 的日志）。这时到服务器上看 `docker compose -f compose.prod.yml ps`。
- 前端在推送后几分钟内就会更新，服务端要等 CI 跑完再部署（加起来约 5 分钟）。这段时间里，新前端连的是旧服务端，所以前端读新字段时要能接受字段不存在。

## 五、资源包
图片放在 `apps/web/public/pack/`（按 `goods/<道具名>.png` 这样的路径），不提交进仓库。
原版美术素材有版权风险，正式运营前应替换为自制或授权的素材；图片缺失时页面会显示图标兜底。

## 子项目 2A 之后的变化

- worker 现在承担所有周期任务（结算每 4 分钟、体力、老鼠、天气、菜场、商店特价），每 5 秒检查一次到期任务，执行记录在 `job_run` 表（保留 7 天）。**生产环境必须至少跑一个 worker**，现在只跑一个（2026-10-08 起，省内存；多个时也只有主节点执行）。
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

## 好友互动

- 每个区服有一家 NPC 餐厅「蟹老板」，由 worker 的 `npc-maintain` 任务每小时检查并创建（新区服、首次部署后一小时内出现），同时向邮箱已验证的玩家发好友申请（每家店只发一次）；`npc-restock` 每天 00:05 给它补橱柜
- 周奖励 `friend-weekly` 每周一 07:59 之后发放：上周翻橱被夹最多、被翻最多前 4、灭蟑螂最多前 2
- 互动默认要求双方邮箱已验证；本地没配邮件时可在控制台把区服数值 `tuning.friend.requireVerifiedEmail` 改成 `false`
- 区服关闭 `features.friend` 后所有互动接口返回"这个区服暂未开放该功能"，自然蟑螂也会停止
- 限流倍数 `RATE_LIMIT_SCALE`（默认 1）：开发环境 `.env.development` 设成 10，因为端到端测试的多个玩家都来自 localhost 同一个 IP；生产不要改

## 试玩问题修复（第一批）

- 迁移 0005 给 `restaurant` 加 `plankton_cooldown_until`：赶走痞老板的店在 `tuning.settlement.planktonHostCooldownHours`（默认 24）小时内不会再被选为驻留店
- 餐厅可以搬回新手街（街道 0）
- 收益和加成的计算方式见 `docs/rules/收益与加成.md`
- 本地开发：改了 `packages/config/data/` 之后要重跑 `pnpm --filter @dt/config build` 并重启 `pnpm dev`，否则 API 和 worker 还在用旧的配置包（新增的数值键会让区服配置校验失败，worker 每轮报错）

## 厨具（子项目 2B）

- 迁移 0006 新建 `equip`、`equip_gem`、`equip_stress_log`、`equip_preset`
- 厨具不再存在仓库表里：发放时每件生成一个实例（按道具 value 随机属性）。旧数据由 worker 的 `equip-convert` 任务每小时转换一次（幂等），部署后最多一小时老号的厨具出现在厨具页
- 未穿戴的厨具每件占一个仓库格；穿戴中的不占
- 区服关闭 `features.equip` 后所有厨具接口返回"这个区服暂未开放该功能"，已穿戴厨具的幸运和套装加成照常生效
- 数值在 `tuning.equip`（强化成功率、保底、宝石升阶、摘除费用、预设上限）

## 特色菜与教室（子项目 4A）

- 迁移 0008 新建 `rest_mc`、`mc_remnant`、`mc_cook`、`mc_eat`、`mc_lesson`、`mc_lesson_student`，餐厅表加 `mc_cook_id`（当前在售的批次）
- 新功能开关 `features.mysterious`（默认开）。关闭后特色菜、神殿鉴定、教室接口返回"这个区服暂未开放该功能"；正在售卖的特色菜照常在结算里卖完；昨日冠军任务跳过该区服
- worker 新任务 `mc-champion`：每天 `tuning.mysterious.championHour`（默认 9）点发昨日特色菜冠军奖励
- 数值在 `tuning.mysterious`（批数、份数、品级区间、道份数加成、品尝、教室学 / 偷成功率和遗忘数量、强制结束费用）
- 主线第 22~24 步（鉴定、学会、烹制特色菜）和教室支线不再跳过；第 25、26 步（守护兽、探险）继续跳过，等 4B

## 神殿（子项目 4B-1）

- 迁移 0009 新建 `rest_trial`、`kraken_feed`、`tentacle_shop`、`rest_seed`；守护兽的伤害和是否击败记在 `daily_counter`
- 新功能开关 `features.temple`（默认开）。关闭后守护兽、探险、试炼、克拉肯、触手商店的接口返回"这个区服暂未开放该功能"；4A 的鉴定属于 `mysterious`，不受影响
- 数值在 `tuning.temple`（守护兽血量和掉落、试炼花费和上限、克拉肯投喂时段和倍率、触手商店格数）
- 种子表从配置包的 `extra` 挪到正式字段 `seeds`
- 主线第 25、26 步（守护兽、探险）和试炼支线不再跳过

## 菜园（子项目 4B-2）

- 迁移 0010 新建 `yard_land`、`yard_plant`、`yard_steal`、`yard_basket`、`rest_formula`
- 新功能开关 `features.yard`（默认开）。关闭后菜园、配方、种子接口返回"这个区服暂未开放该功能"，自然事件任务跳过该区服（作物停止变化），主线第 28、29 步跳过
- worker 新任务 `yard-events`：白天每小时 07、27、47 分，夜里（22 点到次日 6 点）只在 27 分，处理该区服所有未枯萎的作物
- 数值在 `tuning.yard`（土地、偷菜、种子商店开关和调价 `seedShop` / `seedPriceRate`、配方、自然事件概率）
- 配方、种子兑换、动作收益从配置包的 `extra` 挪到正式字段 `formulas`、`seedExchange`、`incomeActions`
- 主线第 28、29 步（开垦、收获）和配方支线不再跳过；支线"鉴定一次食材配方"链接改到菜园

## 酒吧（子项目 4C-1）

- 迁移 0011 新建 `bar_state`（每店一行：三个游戏的上一局结果和连续次数、老虎机连续没出稀有的格数）、`bar_slot_stat`（老虎机按奖项累计格数）
- 新功能开关 `features.bar`（默认开）。关闭后酒吧接口返回"这个区服暂未开放该功能"，主线第 13 步和酒吧支线跳过
- 数值在 `tuning.bar`（划拳、转数字的胜率和新闻门槛，猜酒杯 `cup` 的每轮杯子数和四档奖励，蟹币兑换比例，老虎机保底，厨塔随机奖励的类型概率 `awardRates`，酒吧小游戏奖励的类型概率和食材档次 `prize`）
- 老虎机奖池来自配置包的 `dataset/bar_slot_machine_award`（22 项）
- 任务 13、108 的链接改为 `/bar`；新状态键 `honor.potCount`（支线"集齐 4 株盆栽"）

## 厨塔（子项目 4C-2）

- 迁移 0012 新建 `tower_state`（每店打赢过的最高层）、`tower_watchman_mc`（守塔人当天的菜）、`tower_rank`（每区服每周的赛厨榜）
- 新功能开关 `features.tower`（默认开）。关闭后厨塔、赛厨榜、好友切磋、声望商店的接口返回"这个区服暂未开放该功能"，厨塔挑战券不能用，主线第 27 步和切磋支线跳过，两个定时任务跳过该区服
- worker 新任务：`tower-watchman`（每天 05:58 给 4~10 层守塔人换菜）、`tower-rank-week`（每周一 00:01 结算上一周赛厨榜）
- 数值在 `tuning.tower`（次数、体力、声望、切磋奖励档位、名次礼包、换菜时间）
- 守塔人来自配置包的 `dataset/tower_floors`，属性在构建时按原版厨力校准；声望商店从 `extra` 挪到正式字段 `renownShop`
- 活跃映射新增 `tower.rank` → "与好友赛厨"

## 外卖（子项目 4D）

- 迁移 0013 新建 `takeaway_state`（开通状态和可雇骑手上限）、`takeaway_rider`（骑手；一家店同时只能被一个人雇，用部分唯一索引保证）、`takeaway_order`（外卖单）、`takeaway_delivery`（配送）
- 迁移 0014 给 `world_state` 加"上次换天气时间"，新建 `town_bless`（每区服每天的星愿）、`town_rest`（雷神锤、广播冷却和大胃哥首次礼物）、`town_shake`（摇钱包记录）、`town_exchange_use`（镇长兑换次数），并给 `news` 加两个按 id 倒序的索引
- 迁移 0015 新建 `bar_round`（酒吧魔鬼辣杯、记忆调酒、飞镖进行中的局；一局结束就删除）
- 迁移 0016 新建 `hiphop_day`（每区每天嘻哈男孩的地点、想要的食材、门槛）、`hiphop_tip`（打赏记录），并给 `market_item` 加 `owner_rest_id`（菜场工作证手动进货的进货人）
- 新功能开关 `features.hiphop`（默认开）；worker 新任务 `hiphop-daily`（每天 9 点定地点）、`hiphop-weekly`（周日 23 点打赏周榜）、`hiphop-wage`（周一 7:59 工作证工资）
- **上线前**把 tuning `hiphop.requireVerifiedEmail` 改为 true（开发期为方便测试关闭）
- 迁移 0017 新建论坛四张表：`forum_post`（帖子，阅读、赞踩、回复数冗余在行上）、`forum_reply`（回复，按帖子编楼层）、`forum_reaction`（赞踩）、`forum_read`（阅读记录）
- 新功能开关 `features.forum`（默认开）；论坛管理员就是账号角色 `mod` / `admin`（后台设置）
- 嘻哈男孩定时任务（清理 15）：周榜、工资里某一家店发放失败只记错误日志，其他店照发，不会自动重试，失败的那家请在后台"发放补偿"里手动补；worker 停机跨过周一 7:59 时，那一期的工资会跳过（证有效期 160 小时，下一次结算时已过期）
- 每日地点抽到某家餐厅、但给那家店发"嘻哈文化"失败时，自动改抽公共地点，当天照样有嘻哈男孩
- 新功能开关 `features.takeaway`（默认开）。关闭后外卖接口返回"这个区服暂未开放该功能"，主线第 34、35 步和配送支线跳过，定时任务跳过该区服
- worker 新任务：`takeaway-orders`（每个游戏整点补全服公共单，同时删过期超过 1 天的未接单和 7 天前完成的单）
- 数值在 `tuning.takeaway`（开通费用、公共单数量、品级概率、私人刷新、数值系数、骑手成长、奖池、神秘顾客、清理天数）
- 任务 34、35、122 的跳转地址改为 `/takeaway`

## 邮箱、公告、赞助帽子（子项目 6A-1）

- 迁移 0018 新建 `mail`（邮件，一封一行，全服邮件不按店复制）、`mail_state`（每家店的已读、已领、已删）、`announcement`（公告）、`announcement_seen`（重要公告按账号记已看），以及 6A-2 要用的 `redeem_code`、`redeem_use`（兑换码）、`invite_reward`（邀请奖励）；给 `equip` 加 `custom_name`（命名帽子的名字）、`xuan_sent_at`（这顶玉帽换铉的时间）
- 邮件的发送时间、过期时间用数据库时钟；全服邮件只给发送时已存在的店，30 天过期
- 新功能开关 `features.mail`（默认开）。关闭后邮箱接口返回"这个区服暂未开放该功能"，但邮件照样能发，打开后能看到
- worker 新任务 `ops-scan`（每分钟）：餐厅到六星时，把店里的命名玉帽换成同名铉帽，发进邮箱；每顶只换一次。6A-2 起这个任务还负责邀请奖励
- 公开接口 `GET /api/v1/public/announcements` 不用登录，登录页显示全部区服的有效公告（停服维护通知用）
- 新道具 641「玉•赞助之帽」、642「铉•赞助之帽」，只能在后台邮件附件里按件命名发放，不掉落、不出售
- 后台"补偿"页可以勾"改为发邮件"，玩家在邮箱里领取

## 兑换码、邀请（子项目 6A-2）

- 不加迁移，用 0018 已建好的 `redeem_code`、`redeem_use`、`invite_reward`
- 新功能开关 `features.redeem`、`features.invite`（默认开）。关掉 `invite` 时，worker 不给这个区服发邀请奖励，邀请好友页返回"这个区服暂未开放该功能"
- 新数值 `tuning.invite`：每月上限 `monthlyCap`（20 人）、两档等级 `levels`（10、30）、新手礼包 `newbie`、两档奖励 `rewards`；`tuning.redeem`：失败上限 `failLimit`（10 次）、窗口 `failWindowSec`（3600 秒）、每批上限 `batchMax`（1000 个）。奖励里的道具、食材 id 在构建配置时校验
- worker `ops-scan` 现在也发邀请奖励：新手礼包、被邀请人 10 级和 30 级时给邀请人的奖励、邀请人后来在该区开店时补发待发的奖励
- Redis 键 `redeem:fail:{账号 id}` 记一小时内输错兑换码（码不存在）的次数，到上限后这个账号一小时内不能兑换
- 后台新页"兑换码"：协管能看，只有管理员能建码、停用、导出一次性码；这些操作都记审计（`code.create`、`code.batch`、`code.disable`、`code.export`）

## 厨具数值重定（问题记录 120）

- 厨具强化改为固定增量：每件厨具 +0~+10 的属性总和写在 `packages/config/data/game/equip_lore.json` 的 `stressTables`（同时定穿戴等级）；构建时按 +0 值缩放基础属性，并改写说明里的数字
- 守塔人第 5、6 层互换写在 `packages/config/data/game/tower_fix.json`；各层长老的装备和加点在 `tower_elders.json`（问题记录 408），改了强化表要用 `pnpm -F @dt/server elders` 重新生成
- **部署后跑一次**重算已经生成的厨具（基础属性、强化加成、强化记录、穿戴等级）：生产环境 `docker compose -f compose.prod.yml run --rm api node dist/cli/equip-rescale.js`，开发环境 `pnpm --filter @dt/server equip:rescale`。每家店一个锁店的短事务，不用停服；穿着的厨具变了会同步缓存的幸运和套装加成。以后改了表也要再跑；重复跑结果不变
- 已穿着、但等级低于新穿戴等级的厨具不会被强制卸下

## 举报和封号期限（子项目 6B-1）

- 迁移 0019：新表 `report_case`（一个被举报的内容一个待处理的案子）、`report_entry`（举报人）；`account` 加 `banned_until`（封号到期时间，null 为永久）
- 新功能开关 `features.report`（默认开）；新数值 `tuning.report.dailyMax`（每账号每天最多举报次数，默认 10）
- 后台新页"举报"（协管能处理）；封号改为可选期限：协管只能封 1 天或 7 天，**永久封号和解封改成只有管理员能做**
- 规则见 `docs/rules/举报和处罚.md`

## 可疑数据、数值说明、上线检查（子项目 6B-2）

- 迁移 0020：新表 `login_trace`（每账号、IP、设备一行，记首次和最近时间），注册、登录时写入；worker 任务 `login-trace-clean` 每 6 小时删掉 30 天没再出现的行
- worker 任务 `daily-counter-clean`（backlog 374）：每 6 小时删掉 30 天以前的每日计数（`daily_counter`）；读得最远的是周奖励和上周排行（14 天内）；`streak-best-clean`（问题记录 517）：每 6 小时删掉三周以前的酒吧连胜榜
- 后台新页"可疑数据"（协管能看）：酒吧计数、资源暴涨、多号、兑换码被锁；门槛在 `tuning.ops.suspicious`。只作提醒，不能单凭这里处罚
- 区服数值说明在 `packages/config/data/game/setting_docs.json`：**以后新加 tuning 字段、功能开关时必须同时写说明**，漏写或写了已删除的字段都会让配置构建失败
- **上线前**：到后台概览页看"上线检查"，把每个区服都改成全部通过（管理员点"改成上线值"，会记一条修改历史）

## 游玩指引、新手码、我的账号（问题记录 150、176、178）

- 没有迁移。服务端每次启动会按 `packages/config/data/game/newbie_codes.json` 同步新手兑换码（目前 3 个：XINSHOU、XINSHOU10、XINSHOU20），所有区服通用、每家店领一次。
- 改奖励：改 `newbie_codes.json`，`pnpm --filter @dt/config build`，重启服务端。停用：后台兑换码页停用，重启不会恢复。
- 后台手动建过同名的码时不覆盖，日志里有 `newbie code taken by a manual code` 警告。

## 重新编号上线（一次性，2026-10）

道具、食材、菜谱换成新编号（设计 `docs/superpowers/specs/2026-10-05-id-renumber-design.md`）。迁移 0049 把数据库里所有旧编号（含流水、日志、新闻、邮件、活动、区服数值覆盖和学会的菜）改成新编号，一个事务；在用的表里有查不到对照的旧编号、或自检（持有总数、学会的菜数）不通过就整体回滚。**不提供回退，出问题从备份恢复。**

合并进 main 会自动部署、迁移在 api 和 worker 启动前自动跑，所以**要先停服、备份，再合并**：

1. **先在线上数据的副本上演练**（在本机做；全程不碰开发库 `dt`）。
   - 服务器上导出一份（`backup.sh` 上传 R2 后会删掉本地文件，所以这里另导一份；`pg_dump` 不锁表，不用停服）：
     ```bash
     cd /opt/dt/infra
     docker compose -f compose.prod.yml exec -T postgres pg_dump -U dt -d dt -Fc > /tmp/dt-rehearsal.dump
     ls -lh /tmp/dt-rehearsal.dump
     ```
   - 拷到本机（在本机执行，用户名、主机换成自己的）：`scp <用户>@<服务器>:/tmp/dt-rehearsal.dump .`；拷完在服务器上删掉：`rm /tmp/dt-rehearsal.dump`（里面有玩家数据和随机种子密钥）。
   - 本机恢复到新库 `dt_prod_copy`（文件先拷进容器再恢复，PowerShell 和 bash 都能用；两边都是 Postgres 16）：
     ```bash
     docker cp dt-rehearsal.dump dt-dev-postgres-1:/tmp/dt-rehearsal.dump
     docker exec dt-dev-postgres-1 createdb -U dt dt_prod_copy
     docker exec dt-dev-postgres-1 pg_restore -U dt -d dt_prod_copy --no-owner /tmp/dt-rehearsal.dump
     ```
   - 只演练（在仓库的 `apps/server` 目录下；先切到本分支或合并后的 main）：
     - bash：`DATABASE_URL=postgres://dt:dt@localhost:5432/dt_prod_copy pnpm renumber:dry`
     - PowerShell：`$env:DATABASE_URL='postgres://dt:dt@localhost:5432/dt_prod_copy'; pnpm renumber:dry; Remove-Item Env:DATABASE_URL`（最后一句别漏：不然同一个窗口里再起开发服会连到副本）
     不要对副本起开发服（`pnpm dev` 会真的迁移副本）。
   `renumber:dry` 跑迁移 0049 的全部改写和自检、打印报告，然后**总是回滚**。看两样：
   - 报“在用的表里有查不到对照的旧编号”：库里有主表里没有的道具、食材、菜谱，先查清怎么处理再上线；
   - `renumber orphan …` 是历史记录里查不到对照的（例如已删的菜谱），照原样保留，正常。
   报告最后一行是耗时。开发库（约 1500 家店、流水 11 万、结算记录 15 万、日志 2.5 万）全表扫描约 4 秒，按线上行数估停服时长。
   另外在副本上看一眼各区服的覆盖：`docker exec dt-dev-postgres-1 psql -U dt -d dt_prod_copy -c "select shard_id, override from shard_config"`。迁移会改写区服数值里的编号、开店礼物（`restaurant.giftGoods` / `giftFoods`）和交易所参考价覆盖（`tuning.exchange.refOverrides`，按食材编号做键）；如果覆盖里还有别的地方写着道具、食材、菜谱编号，先在这里停下来查。演练完删掉副本和容器里的文件：`docker exec dt-dev-postgres-1 dropdb -U dt dt_prod_copy`、`docker exec dt-dev-postgres-1 rm /tmp/dt-rehearsal.dump`，本机的 `dt-rehearsal.dump` 也删掉。
2. 提前公告停服时间。
3. 停服：服务器上 `cd /opt/dt/infra && docker compose -f compose.prod.yml stop api worker`。旧版本的 worker 不能在迁移时或迁移后继续跑——它按旧配置写进来的会是旧编号。
4. 备份：`bash backup.sh`（上传 R2），另在服务器本机留一份：`docker compose -f compose.prod.yml exec -T postgres pg_dump -U dt -d dt -Fc > /opt/dt/renumber-before.dump`。
5. 合并 PR：main 的 CI 通过后自动部署（`deploy.sh` → 先跑 migrate，成功才启动 api、worker）。前端（Cloudflare Pages）同时发布。
6. 看迁移日志：`docker compose -f compose.prod.yml logs migrate`，应有各表改了多少行、`renumber learned …` 和 `migrations applied`。
7. **迁移失败**：事务整体回滚，数据库保持原样，api、worker 不会启动。在 GitHub 上 revert 这个 PR（自动部署旧版本），查清原因再来。
8. **迁移成功但游戏里发现问题**：**先恢复数据库，再让旧版本部署**（反过来的话，旧代码的迁移程序看到库里有 0049 的记录会报错，api 起不来）：
   ```bash
   cd /opt/dt/infra
   docker compose -f compose.prod.yml stop api worker
   docker compose -f compose.prod.yml exec -T postgres pg_restore -U dt --clean --if-exists -d dt < /opt/dt/renumber-before.dump
   ```
   恢复完在 GitHub 上 revert 这个 PR，自动部署旧版本。
9. 上线后抽查：仓库、橱柜、学会的菜、邮件、活动、个人日志、新闻；Wiki 旧链接 `/wiki/goods/1` 跳到神秘礼券（`/wiki/goods/10001`）。

开发环境：本分支上第一次启动开发服就会自动把开发库迁到 0049。**开发服（`pnpm dev`）的 worker 不是热重载**，启动迁移后要整个重启开发服，别让旧 worker 继续往新库里写旧编号。
