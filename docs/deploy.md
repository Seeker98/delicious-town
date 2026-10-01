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
- 数值在 `tuning.bar`（划拳、猜酒杯、转数字的胜率和新闻门槛，蟹币兑换比例，老虎机保底，随机奖励的类型概率 `awardRates`）
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
- 新功能开关 `features.takeaway`（默认开）。关闭后外卖接口返回"这个区服暂未开放该功能"，主线第 34、35 步和配送支线跳过，定时任务跳过该区服
- worker 新任务：`takeaway-orders`（每个游戏整点补全服公共单，同时删过期超过 1 天的未接单和 7 天前完成的单）
- 数值在 `tuning.takeaway`（开通费用、公共单数量、品级概率、私人刷新、数值系数、骑手成长、奖池、神秘顾客、清理天数）
- 任务 34、35、122 的跳转地址改为 `/takeaway`
