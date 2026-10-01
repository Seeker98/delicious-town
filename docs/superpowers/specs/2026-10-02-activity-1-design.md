# 限时活动 148-1：框架 + 目标清单、九宫格、战令 设计

日期：2026-10-02
状态：待用户审阅

## 1. 范围

问题记录 148（限时活动）拆成四个子项目，用户 2026-10-02 定的顺序是 1 → 4 → 2 → 3：

| 子项目 | 内容 |
|---|---|
| **148-1（本文）** | 活动框架（后台按区服配置、玩家活动页、进度计数、领奖、结束补发）+ 三种类型：目标清单（含累计签到、行为累计）、九宫格、战令 |
| 148-4 | 限时全服加成（双倍经验、菜场打折等），并进节日倍率 |
| 148-2 | 掉落兑换类：活动代币、集字/集碎片，限时活动道具，兑换表 |
| 148-3 | 全服合力：全服目标池、贡献点、里程碑礼包、贡献榜发称号或纪念品 |

本文只做 148-1，一个 PR，分支 `feat/activity-1`。后面三个子项目复用这里的活动表、后台页、活动页、计数和领奖，各自加新类型。

## 2. 用户已确认的裁定

1. 活动内容（任务、档位、奖励）**全在后台表单里配**，不用改代码、不用发版；可以复制旧活动来改。
2. 活动结束时，**达成但没领的奖励自动发邮件**。
3. 架构用**统一模型**：一张活动表 + 按类型校验的定义 JSON；进度都是计数器；每种类型一个纯函数模块算"哪些奖励达成了"。
4. "累计签到"和"行为累计"合成一种类型**目标清单**；后台提供"签到模板"，玩家页标题照样叫签到活动。
5. 活动**开始后只能改**标题、说明、延长结束时间、提前结束；目标和奖励不能改。
6. 战令进阶轨道的解锁价格后台填（钻石、道具，可以都填）；中途解锁会补上之前已经达到的进阶档位。
7. 九宫格每条线（横、竖、对角）同一份线奖励，另有全部完成的终极奖励。
8. 进度只算活动期间的行为，不用报名；活动中途新开的店从开店起算。

## 3. 数据

### 3.1 表（迁移 0021）

```
activity
  id            serial pk
  shard_id      int null        -- 空 = 全服
  kind          text            -- 'goals' | 'grid' | 'pass'
  title         text            -- ≤ 40 字
  body          text            -- ≤ 1000 字
  starts_at     timestamptz
  ends_at       timestamptz     -- 必须晚于 starts_at
  min_level     int  default 1
  def           jsonb           -- 按 kind 校验，见 §3.2
  actor_account_id int null
  created_at, updated_at timestamptz default now()
  deleted_at    timestamptz null   -- 软删除；只有未开始的能删

activity_counter (activity_id, rest_id, key) pk, count bigint
  -- 活动期间的行为计数；战令积分的 key 是 'points'

activity_claim (activity_id, rest_id, reward_key) pk
  via text            -- 'page' | 'mail'
  claimed_at timestamptz

activity_pass (activity_id, rest_id) pk, unlocked_at timestamptz
  -- 战令进阶已解锁

activity_settle (activity_id, shard_id) pk, settled_at timestamptz
  -- 结束补发完成；全服活动每个区服各一行
```

索引：`activity (shard_id, ends_at) where deleted_at is null`；`activity_counter (activity_id)` 走主键前缀。

战令"每天上限"复用现有的 `daily_counter`，键 `act<活动id>:<行为键>`，日界用 `gameDay`。

### 3.2 定义 `def`（zod，放在 `packages/shared/src/schemas/activity.ts`）

奖励一律用现有的 `rewardItems`（邮件、兑换码同一个结构，支持命名帽子）。

```ts
// 行为键必须在 ACTIVITY_ACTIONS 里（§4.1）
goal = { key: ActionKey, target: int 1..100000, award: rewardItems }

goals = { goals: goal[1..20] }

grid = {
  size: 3 | 4,
  cells: goal[size*size],      // 行优先
  lineAward: rewardItems,
  fullAward: rewardItems,
}

pass = {
  rules: { key: ActionKey, points: int 1..1000, dailyCap: int 1..100000 }[1..20],  // 同一行为键只能出现一次
  levels: { points: int 1.., free: rewardItems | null, premium: rewardItems | null }[1..50],
                               // points 严格递增；free 和 premium 不能同时为空
  unlock: { diamond?: int 1..100000, goods?: idNum[0..5] },   // 至少填一项
}
```

### 3.3 奖励键

开始后定义不能改，所以用下标当键是稳定的：

| 类型 | 键 |
|---|---|
| goals | `g0`、`g1`… |
| grid | 格子 `c0`…`c15`；线 `r0`…（行）、`k0`…（列）、`d0`（左上到右下）、`d1`（右上到左下）；`full` |
| pass | 普通 `f0`…；进阶 `p0`… |

## 4. 进度

### 4.1 可选行为

`packages/shared/src/activity.ts` 导出 `ACTIVITY_ACTIONS: Record<string, string>`（行为键 → 中文名），只列服务端确实会发 `action` 事件的键，例如 `signin` 签到、`market.buy` 菜场买菜、`tower.challenge` 厨塔挑战、`takeaway.deliver` 配送外卖等。

有一个测试扫描服务端源码，保证列表里每个键都有地方发事件（防止选了一个永远不会计数的行为）。

### 4.2 计数处理器

在 `activity` 模块注册一个 `action` 事件处理器，和任务计数在同一个事务里：

1. 取这个区服进行中的活动（`shard_id = 本区服 或 空`、没删、`starts_at <= at < ends_at`），用 `at` = 事件时间判断窗口；
2. 跳过区服功能 `activity` 关掉的区服；跳过 `min_level` 高于事件时店等级的活动（事件载荷里补上 `level`）；
3. goals、grid：行为键在定义里出现过，就给 `activity_counter (活动, 店, 行为键)` 加 n；
4. pass：行为键有积分规则时，今天还能加的分 = `dailyCap − 今天已加`，实际加 `min(points × n, 还能加的)`；同时加 `daily_counter` 和 `activity_counter (…, 'points')`。

进行中的活动按区服在内存缓存 30 秒。后台改动会清掉本进程的缓存；其他进程（worker）最多晚 30 秒看到，可以接受。缓存的是活动行，窗口仍按事件时间精确判断。

### 4.3 达成规则（纯函数，`modules/activity/rules.ts`）

```ts
rewardsOf(kind, def, counters, premium): Array<{ key, award, reached: boolean }>
```

- goals：`counters[goal.key] >= target`。
- grid：格子完成 = 计数够；某条线的格子都完成，这条线就达成（不要求格子奖励已领）；全部格子完成 = `full`。
- pass：`points >= level.points` 时 `f<i>` 达成（有普通奖励才列出）；`p<i>` 还要求 `premium`（解锁）。

同一行为键可以出现在多个目标或格子里，它们共用一个计数。

## 5. 服务端接口

### 5.1 玩家（需要选店；功能 `activity`）

| 接口 | 说明 |
|---|---|
| `GET /activities` | 进行中和结束 7 天内的活动，每个带：类型、标题、说明、起止、状态（`running` / `settling` / `ended`）、定义、计数、今天各规则的积分（战令）、是否已解锁、奖励列表（键、奖励、达成、已领、领取方式）、最低等级 |
| `GET /activities/summary` | `{ running, claimable }`，首页横幅和红点用 |
| `POST /activities/:id/claim` `{ key }` | 锁店事务里重新算达成，写 `activity_claim`（`via='page'`），用 `grantRewardOp` 发奖；主键冲突 → `ALREADY_DONE` |
| `POST /activities/:id/claim-all` | 一个事务里领完全部可领的；没有可领的 → `invalidState('nothing')` |
| `POST /activities/:id/unlock` | 战令解锁进阶：扣钻石和道具，写 `activity_pass`；已解锁 → `ALREADY_DONE`；不够 → `requirement` |

错误：
- 活动不存在、已删除、不是本区服 → `NOT_FOUND`；
- 不是进行中（未开始、结算中、已结束）→ `invalidState('not_running')`；
- 奖励键不存在 → `invalidState('no_reward')`；
- 没达成 → `requirement('activity')`；
- 不是战令却调解锁 → `invalidState('not_pass')`。

个人日志：领奖 `activity.claim`（参数：活动标题、奖励），解锁 `activity.unlock`；两种都要加中文文案（前端 `logLabels`，有现成的"每种日志都有文案"测试）。流水来源 `activity`。

### 5.2 后台（`/admin/activities`；版主能看，管理员能写；写操作都记审计）

| 接口 | 说明 |
|---|---|
| `GET /admin/activities` | 列表：标题、区服、类型、起止、状态（未开始 / 进行中 / 结算中 / 已补发）、参与店数（有计数或解锁的店） |
| `GET /admin/activities/:id` | 详情（编辑表单用） |
| `POST /admin/activities` | 新建 |
| `POST /admin/activities/:id` | 修改。开始前全部能改；开始后只接受标题、说明、更晚的结束时间，其他字段变了 → `invalidState('locked_after_start')`；已有补发记录的不能再改结束时间 |
| `POST /admin/activities/:id/end` | 提前结束：结束时间设为现在（只对进行中的） |
| `POST /admin/activities/:id/delete` | 软删除，只有未开始的能删 |

请求体：`{ shardId: number | null, kind, title, body, startsAt, endsAt, minLevel, def }`，按 kind 用 §3.2 的 zod 校验，错误带字段路径（例如 `def.cells.4.target`），前端显示在对应输入框下。区服必须存在。

## 6. 结束补发

worker 加一个每分钟的任务 `activity-settle`（和 `ops-scan` 同一种间隔任务，只在 leader 上跑）：

1. 找出 `ends_at <= now − 2 分钟`、没删的活动；对它覆盖的每个区服（全服活动 = 所有区服），没有 `activity_settle` 行的就处理；
2. 找出这个区服里在这个活动有计数或解锁的店；每家店用 `runSystemOp` 锁店开一个事务：
   - 算出达成但没领的奖励；
   - `insert … on conflict do nothing` 写 `activity_claim (via='mail')`，只取真正写进去的键；
   - 有新写入的键时，把这些奖励合并成一封邮件：钻石、银币、经验相加，道具、食材按 id 合并数量，帽子拼接；标题 `《活动名》未领取奖励`，来源 `activity`；
3. 区服处理完写 `activity_settle`。

可以重复跑；中途失败的店下一分钟会重做，已经写进领奖记录的键不会再发。

合并后的系统邮件可能超过后台手发邮件的单项上限（例如帽子最多 5 个），系统邮件不走后台的输入校验，领取时也不重新校验上限（实现时确认邮件领取路径确实如此，否则要改成按上限拆成多封）。

结束到补发完成之间，玩家页显示"结算中，未领奖励会发到邮箱"，不能领、不能解锁。

## 7. 前端

### 7.1 后台 `/admin/activities`（AdminLayout 加菜单项"活动"）

- 列表 + 新建按钮；每行操作：编辑、复制（打开新建表单，带上原内容，时间清空）、提前结束、删除。
- 表单公共部分：区服（下拉，含"全服"）、标题、说明、开始和结束时间、最低等级、类型（开始后不能改）。
- 目标清单编辑器：每行 行为（下拉，`ACTIVITY_ACTIONS` 中文名）+ 次数 + 奖励（`RewardItemsEditor`）；增删行；"签到模板"按钮一键填入签到 1/3/5/7 天四行（奖励留空待填）。
- 九宫格编辑器：选 3×3 / 4×4；画出格子，每格显示行为和次数，点一格在下方编辑它；再下面编辑线奖励和终极奖励。
- 战令编辑器：积分规则表（行为、每次几分、每天上限）；档位表（积分、普通奖励、进阶奖励，奖励可以留空）；解锁价格（钻石、道具）。
- 开始后，锁定的字段变成只读，并提示"活动已开始，只能改标题、说明和延长结束时间"。
- 服务端返回的字段错误显示在对应输入框下。

### 7.2 玩家 `/activities`

- 入口：
  - 餐厅首页功能区加"活动"，有可领奖励时带红点数字；
  - 有进行中的活动时，首页顶部加一条细横幅"进行中的活动 N 个，可领 M 份"，点了进活动页。
  - 功能 `activity` 关掉时都不显示。
- 列表：每个活动一张卡片，进行中的显示剩余时间（"还剩 2 天 5 小时"）；结束 7 天内的标"已结束，未领奖励已发到邮箱"；店等级不够时标"需要 N 级，达到后才开始计数"。
- 目标清单：每行行为名、进度条（3/5）、奖励、领取按钮（未达成 / 领取 / 已领 / 已邮寄）。行为都是 `signin` 时标题前加"签到"徽标。
- 九宫格：CSS 网格，每格显示行为名、进度、状态；已达成的线高亮；下方列出线奖励和终极奖励及领取按钮。
- 战令：顶部总积分和下一档还差多少，今天各规则的积分（8/20）；档位表两列（普通 / 进阶），每格领取按钮；未解锁时进阶列显示锁和价格，点"解锁进阶"先确认。
- 每个活动卡片有"全部领取"按钮（有可领时才显示）。
- 领到的奖励用现有的奖励提示（EventToast）显示。

## 8. 区服功能开关

`IMPLEMENTED_FEATURES` 和 `setting_docs.json` 加 `activity`（默认开，说明"限时活动"）。关掉时：不计数、玩家接口返回功能关闭、不显示入口；补发照常（已经达成的奖励仍然发）。

## 9. 测试

- 纯规则（`rules.test.ts`）：
  - goals 达成；同一行为键多个目标共用计数；
  - grid 3×3、4×4 的每一行、每一列、两条对角线；只完成部分格子时不误判线；`full`；
  - pass 普通、进阶，未解锁时进阶不达成，解锁后之前的进阶档位全部达成；空奖励的档位不列出。
- 定义校验（shared）：格子数和尺寸不符、档位积分不递增、某档两边都空、行为键不在列表、战令规则行为键重复、解锁价格全空、结束早于开始，都要报错，并且带字段路径。
- 行为列表：`ACTIVITY_ACTIONS` 每个键在服务端源码里有 `emitAction(…, '<键>'` 或等价的发事件处。
- 数据库集成（`activity.test.ts`）：
  - 窗口前、窗口内、窗口后的行为，只有窗口内计数；
  - 别的区服的活动不计；全服活动计；等级不够不计；功能关掉不计；
  - 战令每天上限，跨游戏日重置；
  - 领奖：成功、重复领 → `ALREADY_DONE`、没达成、结束后、结算中；全部领取；
  - 解锁：扣钻石和道具、不够、重复、解锁后可以领之前的进阶档位；
  - 补发：只发没领的；跑两次只有一封邮件；全服活动在两个区服各补发一次；没有达成的店不发邮件；
  - 后台：开始前全改、开始后只能改允许的字段、已补发不能改结束时间、提前结束、只能删未开始的；版主不能写；审计有记录。
- 前端：后台三种编辑器（增删行、签到模板、选格子、锁定字段只读、错误显示）；玩家页三种布局、领取、全部领取、解锁确认、结束状态、首页横幅和红点。
- e2e：管理员在 E2E 自己的区服建一个签到活动（1 天 → 若干银币），玩家签到后在活动页领取，银币增加。

## 10. 不做的事

- 148-2/3/4 的类型（代币、集字、全服合力、全服加成）。
- 活动开始、结束的推送和公告（运营可以另发公告）。
- 按店单独调整进度的后台工具。
- 快速数值模拟不模拟活动（活动是运营投放，不属于基础数值）。

## 11. 部署注意

- 迁移 0021 新建五张表，不改旧表。
- `action` 事件载荷新增 `level` 字段（事件总线在发事件的事务里同步执行，没有积压的旧事件）。
- 区服功能 `activity` 默认开，部署后各区服即可在后台建活动。
