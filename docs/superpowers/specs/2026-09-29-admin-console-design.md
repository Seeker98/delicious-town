# 精简运营控制台设计

- 日期：2026-09-29
- 状态：待审阅
- 上位文档：`2026-09-29-rewrite-architecture-design.md`（下文简称"架构文档"）。本文是它第 10 节子项目 6「运营」的一部分，提前到 2A 之后做
- 基于：子项目 1「骨架」+ 子项目 2A「经营循环」

## 1. 目标与范围

**目的**：试玩阶段由运营者（和几个帮忙的朋友）根据真实数据调数值、处理玩家问题，不用改配置文件、不用重启服务。

**完成标志**：用命令行设一个管理员，登录网页后台，把某区服的经验倍率从 5 改成 10 并立即生效（下一轮结算按 10 倍计算），审计日志里看到这次修改；另一个 mod 账号能看不能改。

### 1.1 包含

| 功能 | 内容 |
|---|---|
| 角色与权限 | player / mod / admin 三种角色；命令行设第一个管理员；后台改角色 |
| 区服数值 | 查看默认值、覆盖值、实际生效值；修改覆盖（数值、功能开关、开店默认值）；校验；历史版本和回滚；所有进程立即生效 |
| 玩家 | 按用户名、邮箱、店名、账号 id 搜索；账号、餐厅、仓库、橱柜、冰箱、流水、个人日志、收益；封号 / 解封；强制改店名 |
| 发放补偿 | 单店或全区服；银币、钻石、经验、道具、食材；直接到账；全区服由 worker 分批处理，可恢复 |
| 统计 | 每日经济（按来源和去向）、等级 / 星级 / 食谱分布、每日活跃店数、结算健康 |
| 审计日志 | 所有后台写操作可查 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 兑换码、邀请统计、内容审核、公告和广播、全服邮件 | 子项目 6 |
| 扣减玩家资源、删除账号、回档 | 暂不做；补偿只加不减 |
| 以玩家身份登录（切换身份） | 架构文档明确不提供 |
| 改全局默认配置（`packages/config/data/game/tuning.json`） | 仍然走代码提交；后台只改区服覆盖 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 后台放在哪里 | 现有网页的 `/admin`（按路由分包懒加载），接口前缀 `/api/v1/admin`，共用登录会话 |
| 2 | 角色够不够 | 未登录 401；已登录但角色不够一律 404，不暴露后台存在 |
| 3 | 角色变化何时生效 | 每个后台请求都从数据库读角色，降级立即生效 |
| 4 | mod 能做什么 | 所有只读；封号 / 解封（不能封 admin）；强制改店名。其余写操作只有 admin |
| 5 | 改角色的限制 | 只有 admin；不能改自己的角色 |
| 6 | 两人同时改同一区服数值 | `shard_config.version` 乐观锁：保存时带上读取时的版本号，不一致就拒绝，要求刷新 |
| 7 | 补偿怎么到账 | 直接到账，不做"邮件领取"。走正常发放逻辑（橱柜满进冰箱、仓库满照发），写流水（来源 `admin.grant`）和个人日志 |
| 8 | 补偿防手滑 | 单项上限：银币、经验 ≤ 1 亿；钻石 ≤ 10 万；道具、食材每种 ≤ 9999；全区服发放前端二次确认并显示目标店数 |
| 9 | 结算收益只保留 3 天 | 每天凌晨汇总前一天的经济数据到 `stat_daily` 长期保存；当天数据实时查询 |
| 10 | "活跃店"怎么算 | 当天在流水里有玩家操作来源（排除 settlement、mouse、market.guess、market.guess.refund、admin.grant）的店数 |
| 11 | 数值修改的生效时机 | 保存后通过 Redis 发布"区服配置已变"，API 和 worker 各自清掉该区服的缓存；下一个请求或下一轮结算读到新值 |

## 3. 数据模型

迁移 `0003_admin_console`：

| 变更 | 说明 |
|---|---|
| `account.role` 检查约束 | 改为 `role in ('player', 'mod', 'admin')` |
| `account.ban_reason text` | 封号原因；解封时清空 |
| `shard_config.version integer not null default 0` | 乐观锁版本号，每次保存 +1 |
| `shard_config_history` | id、shard_id、version、override jsonb（保存后的整份覆盖）、actor_account_id、note、created_at；按 (shard_id, version) 唯一 |
| `admin_grant` | id、shard_id、target（`rest` / `shard`）、rest_id（单店时）、min_level（全区服时可选）、items jsonb、reason、status（`pending` / `running` / `done` / `failed`）、total、done_count、failed_count、actor_account_id、created_at、finished_at |
| `admin_grant_done` | (grant_id, rest_id) 主键、ok boolean、error text、created_at：每家店处理结果，保证重跑不重复 |
| `stat_daily` | (shard_id, day, kind, source) 主键、amount bigint：每天按资源和来源的汇总；kind 取 coin / exp / diamond / goods / foods / oil，外加 kind = `active`、source = `rest` 记活跃店数 |

`items` 的结构（shared 包里的 zod schema `grantItems`）：

```ts
{ coin?: number; diamond?: number; exp?: number;
  goods?: Array<{ id: number; num: number }>;
  foods?: Array<{ id: number; num: number }> }
```

## 4. 服务端

### 4.1 权限

- `security/admin.ts`：`requireRole(req, 'mod' | 'admin')`：先 `requireAccount`（401），再从数据库读 `account.role` 和 `banned_at`；角色不够或已封禁 → 404（`NOT_FOUND`）
- 后台路由插件在 `modules/admin/` 下按功能分文件：`routes.ts`（注册全部路由）、`shards.ts`、`players.ts`、`grants.ts`、`stats.ts`、`audit.ts`
- `GET /api/v1/admin/me` 返回 `{ accountId, username, role }`，前端据此决定显示什么

### 4.2 审计

`audit(tx, { actor, action, target, detail, ip })` 写 `audit_log`，和业务写入在同一个事务里。动作名：`shard.override`、`shard.rollback`、`player.ban`、`player.unban`、`player.role`、`restaurant.rename`、`grant.create`。detail 记改动摘要（区服覆盖记改前改后的差异路径列表，不记整份）。

### 4.3 区服数值

- `GET /shards/:id/settings` → `{ version, defaults, override, effective, features }`
  - defaults：配置包里的默认 `{ features, restaurant, tuning }`
  - effective：`resolveShardSettings` 的结果
  - features：已实现功能列表（`IMPLEMENTED_FEATURES`）和各自是否开启
- `PUT /shards/:id/override` body `{ override, note, version }`（admin）：
  1. 用和运行时同一个函数深合并 + zod 校验；失败 → 400 `INVALID_CONFIG`，detail 带 zod 的出错路径和消息
  2. 事务内：`update shard_config set override, version = version + 1 where shard_id and version = :version`，没更新到行 → 409 `VERSION_CONFLICT`；没有这一行时插入（version 1）
  3. 写 `shard_config_history`、审计
  4. 提交后 `redis.publish('shard-settings', shardId)`
- `GET /shards/:id/history`（分页）、`POST /shards/:id/rollback` body `{ version, note }`（admin）：取该版本的 override，走和 PUT 相同的保存流程（历史里新增一版，不删旧版）
- 缓存失效：`ShardService` 增加 `invalidate(shardId)`。API 进程和 worker 启动时各开一个订阅连接（`infra/settingsBus.ts` 的 `subscribeSettings(redisUrl, shards)`），收到消息就 `invalidate`。本进程保存时也直接 `invalidate`，不等消息

### 4.4 玩家

- `GET /players?q=`：q 为纯数字时按账号 id 精确查；否则用户名、邮箱前缀匹配 + 店名模糊匹配（`restaurant_name_trgm`），最多 50 条，返回账号 + 各区服店名、等级、星级
- `GET /players/:accountId`：账号信息（role、邮箱、是否验证、banned_at、ban_reason、created_at）+ 各区服餐厅摘要
- `GET /restaurants/:id`：`toRestaurantDto` 概况 + 仓库 + 橱柜 + 冰箱
- `GET /restaurants/:id/ledger?kind=&source=&before=`、`GET /restaurants/:id/log?before=`、`GET /restaurants/:id/income?before=`：复用 2A 的分页（游标"时间~id"）
- `POST /players/:id/ban` body `{ reason }`（mod 可用，不能封 admin 和自己）：设 `banned_at`、`ban_reason`，`sessions.destroyAll(accountId)`
- `POST /players/:id/unban`：清空两列
- `POST /restaurants/:id/rename` body `{ name, reason }`：`checkRestaurantName` + 唯一约束（重名 409）；不收费用和改名卡；个人日志 `admin.rename`
- `POST /players/:id/role` body `{ role }`（admin，不能改自己）

### 4.5 发放补偿

- `POST /grants` body `{ shardId, target: 'rest' | 'shard', restId?, minLevel?, items, reason }`（admin）
  - 校验 items：至少一项；id 存在（道具、食材）；数量在上限内
  - 单店：事务内插 `admin_grant`（status done、total 1）+ `runSystemOp` 发放 + `admin_grant_done` + 审计，立即返回结果
  - 全区服：插 `admin_grant`（status pending，total = 目标店数）+ 审计，立即返回 grant id
- 发放函数 `grantItemsOp(op, items, reason)`：`gainCoin` / `gainDiamond` / `gainExp` / `grantGoodsOp` / `addFoods`，来源都是 `admin.grant`；个人日志 `admin.grant` { reason, items }
- worker 新增调度任务 `admin-grants`（每 5 秒，和 `periodic` 并列，只在主节点跑）：
  1. 取一条 pending / running 的全区服发放，置 running
  2. 取还没有 `admin_grant_done` 记录的目标店（按 id，最多 200 家），逐家在 `runSystemOp` 里发放并插入 done 记录（同一事务，主键冲突说明已发过，跳过）
  3. 单店出错：单独事务插 done（ok=false、error），计入 failed_count，继续下一家
  4. 没有剩余目标店时置 done（有失败则 failed）
- `GET /grants?shardId=`：列表（最近 50 条，带进度）

### 4.6 统计

- 每日汇总：周期任务 `stat-daily`（区服级，登记在 `game.jobs`）：period = 前一个游戏日；游戏时间 00:10 之前返回 null。执行时删除该区服该日的 `stat_daily` 再写入：
  - 流水：`ledger` 按 (kind, source) 求和，限该日（北京时间）
  - 结算：`income_round` 的 coin、exp 求和，source = `settlement`
  - 活跃：按裁定 10 计数
- `GET /stats/economy?shardId=&from=&to=`：`stat_daily` 的历史 + 今天实时算一份（同样的查询），按天返回 `{ day, kind, source, amount }[]`；范围最长 90 天
- `GET /stats/distribution?shardId=`：营业和停业店数；等级分段（1~9、10~19 …）；星级计数；已学食谱分段（`cookbook_counts.learned`）
- `GET /stats/settlement?shardId=&rounds=90`：`job_run` 里最近的 settlement 行（轮次、耗时、settled、closed、failed）

### 4.7 命令行

`pnpm --filter @dt/server account role <用户名> <player|mod|admin>`（`src/cli/account.ts`）：按用户名（不区分大小写）找账号并改角色，写审计（actor 为空，detail 注明来自命令行）。

## 5. 前端

- 路由 `/admin` 下的子路由用一个懒加载分包；进入时请求 `/api/v1/admin/me`，失败（404）显示"页面不存在"
- 布局：左侧导航（手机上折叠为顶部下拉），以电脑端为主；复用现有的得失提示和错误码中文对照
- 页面：

| 路由 | 页面 | 内容 |
|---|---|---|
| `/admin` | AdminHomeView | 区服选择；今日概况（活跃店数、结算银币和经验、最近一轮结算耗时和失败数） |
| `/admin/shards/:id` | AdminShardView | 常用项置顶；其余按分组折叠；每项显示默认 / 覆盖 / 生效值，可改、可"恢复默认"；功能开关；保存需填备注；mod 只读 |
| `/admin/shards/:id/history` | AdminShardHistoryView | 版本列表、改动路径、回滚按钮 |
| `/admin/players` | AdminPlayersView | 搜索框和结果 |
| `/admin/players/:id` | AdminPlayerView | 账号信息、封号 / 解封、改角色；各区服餐厅（点开看仓库、橱柜、冰箱、流水、日志、收益标签页）；强制改名 |
| `/admin/grants` | AdminGrantsView | 发放表单（道具和食材用名称搜索选择）；全区服发放二次确认；历史和进度（自动刷新） |
| `/admin/stats` | AdminStatsView | 经济折线图（按来源堆叠的每日流入流出）、分布柱状图、结算耗时折线图 |
| `/admin/audit` | AdminAuditView | 筛选和列表 |

- 图表：`components/admin/LineChart.vue`、`BarChart.vue`，自绘 SVG，不引入图表库
- 数值编辑：叶子是数字 / 布尔用对应输入框；数组和对象用 JSON 文本框（失焦时校验格式）
- 常用项清单写在前端常量里：`settlement.expMultiplier`、`market.dailyStock`、`market.dailyKinds`、`market.specialKinds`、`rest.atRateBase`、`restaurant.coin`、`restaurant.giftFoods`

## 6. 测试

1. **权限矩阵**：三种角色 × 每个后台接口 → 401 / 404 / 成功；被封禁的 admin 也是 404
2. **区服数值**：非法值 400 带路径；版本冲突 409；保存后同进程下一次 `settings()` 就是新值；另一个 `ShardService` 实例通过 Redis 订阅失效；回滚生成新版本；改经验倍率后跑一轮结算，经验按新倍率
3. **玩家**：搜索（id、用户名、邮箱、店名）；封号后旧会话失效、登录报"已封禁"；mod 不能封 admin；强制改名重名 409
4. **补偿**：单店到账（流水、个人日志、橱柜满进冰箱）；超上限 400；全区服：跑一批中途让某家店失败 → 记 failed、其他店照发；重跑不重复；min_level 过滤
5. **统计**：造一天的流水和收益，跑 `stat-daily` 后汇总正确；重复跑结果不变；活跃店数排除系统来源
6. **命令行**：改角色、用户名不存在时报错
7. **前端组件**：数值编辑（恢复默认、JSON 校验）、补偿表单二次确认、玩家搜索、无权限显示 404
8. **端到端**：注册 → 设为 admin（测试里直接改库，等同命令行）→ 后台把一服经验倍率改成 10 → 页面上生效值显示 10 → 审计日志里有这条修改（倍率对结算的实际影响由第 2 条的集成测试按固定随机序列断言）

## 7. 验收

1. 第 6 节第 8 条端到端通过
2. mod 账号在后台看不到修改按钮，直接调修改接口得到 404
3. 全部测试、类型检查、lint、格式、镜像构建通过
4. `docs/deploy.md` 补充：设置第一个管理员的命令；建议用反向代理限制 `/admin` 和 `/api/v1/admin` 的来源 IP（可选）
