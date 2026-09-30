# 子项目 4D「外卖」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-30-subproject4a-mysterious-design.md` §0（子项目 4 的拆分：4D 外卖——开通、公共单 / 私人单、配送结算、骑手）
- 游戏规则依据：`../analysis/spec/` 的 14 全章、16（整点任务）、20 §20.12；原版源码 `RestTranServiceImpl.openTakeaway / startTakeawayDelivery / getTakeawayOrder / getTakeawayOrderResult / employeeFriend / dismissRider`、`SocietyTranServiceImpl.refreshTakeaway`、`Tools.generateListTakeway / checkTakeawayRiderLevel / taGradeRate`
- 分支：`feat/takeaway`，基于 `main`

## 1. 目标与范围

**完成标志**：玩家能开通外卖、接全服公共单和自己刷的私人单、派骑手配送、到时领取（或用无人机立即完成）拿到银币、经验、声望和奖池道具；能雇好友当骑手，骑手会升级；主线第 34 步「开通外卖」、第 35 步「完成 3 次外卖配送」、支线「完成 100 次外卖配送」和活跃「配送外卖」开放。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 开通 | 条件、两种付费方式、自己成为 1 号骑手 |
| 外卖单 | 全服公共单（每个游戏整点补）、私人刷新（15 张，只有自己能接） |
| 接单 | 条件、扣食材和声望、加料、这一单数值的快照 |
| 结算 | 领取 / 无人机、成败判定、边牧、咕咕、神秘顾客、奖池、好友骑手回扣 |
| 骑手 | 雇佣好友、等级和属性、自己骑手升级加上限、解雇 |
| 任务 | 事件键 `takeaway.open`（状态）、`takeaway.deliver`（计数） |
| 展示 | `/takeaway` 页三个标签；"更多 → 玩法"入口 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 新闻的展示（外卖只写入新闻） | 4E |
| 私人单给别人接、单主抽成经验 | 不做（裁定 2） |
| 外卖记录的历史查询页 | 不做：只保留 7 天，用于"配送中"和结果 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 开通付费方式 | 页面上两个按钮，玩家自己选"外卖券"或"银币 + 钻石"（原版有券时自动用券） |
| 2 | 私人单谁能接 | 只有单主自己（用户确认）。原版的"别人接了抽成"不启用 |
| 3 | 骑手范围 | 雇好友、升级、解雇、回扣这次都做（用户确认） |
| 4 | 私人刷新门槛 | 照原版：持有有效的商店工作证（道具 108）；费用 100 万 × (今天已刷新次数 + 1)；每次送 160 声望（用户确认） |
| 5 | 配送时长的符号 | 修正原版 bug：骑手减时是减少时长（规格书 20.12） |
| 6 | 加料 | 只有持有"使命必达"（道具 370，效果 `taFoodsDoubleFlag`）才能选；加料时食材 ×2、经验 ×2 |
| 7 | 结算方式 | 照原版：到点后玩家领取才结算，不做定时自动结算；另加"全部领取" |
| 8 | 任务和活跃的计数时机 | 领取时计数，成功失败都算（原版活跃在接单时计）；一次领取计 1 |
| 9 | 好友骑手的幸运 | 用他缓存的加成汇总（`effect_agg.luckValue`），不锁他的店（和 4C-2 计划裁定 1 相同） |
| 10 | 回扣的锁 | 骑手是好友时，领取用双店操作按店号顺序锁住两家店，回扣和结算在同一个事务里 |
| 11 | 删好友后的骑手 | 照原版：雇佣关系保留，直到解雇 |
| 12 | 一家店能被几个人雇 | 同一时间最多一个雇主（自己给自己当骑手不算），用部分唯一索引保证 |
| 13 | "我的加成" | 用餐厅加成汇总（勋章、宠物、装扮等所有来源）里的 `taNeedtimeRate`、`taCoinRate`、`taExpRate`、`taRenownRate`、`taSuccessoddsRate`、`riderExpRate`、`taFailForceSuccessRate`、`taFoodsDoubleFlag`；天气的同名键另加 |
| 14 | 解雇的"当前经验" | 骑手在当前等级里攒的经验（不是累计经验） |
| 15 | 过期和清理 | 过期读时判断；每小时的补单任务删除过期超过 1 天的未接单、7 天前完成的配送和对应的单 |

## 3. 规则明细

记号：单品级 g（1 普通 … 7 佳肴），我的菜品级 k（这道菜我学到的品级，1~10），售价 p（食谱的 `coin`），rand(n) 是 [0, n) 的整数，rand[a, b] 是 [a, b] 的整数。

### 3.1 开通 `POST /takeaway/open {way}`

- 条件：星级 ≥ 2，声望 ≥ 888，还没开通
- 扣 888 声望；`way = 'ticket'` 扣 1 张外卖券（道具 263），`way = 'coin'` 扣 8,880,000 银币 + 300 钻石
- 建 `takeaway_state`（可雇上限 1），把自己加为骑手（1 级，经验 0）
- 发事件 `takeaway.open`（主线第 34 步是状态任务，读 `takeaway_state` 是否存在）

### 3.2 外卖单

**全服公共单**（定时任务 `takeaway-orders`，每个游戏整点）：
```
营业店数 = 本区服状态为营业的非 NPC 餐厅数（< 10 按 30 算）
目标数   = rand(18) + 5 + ⌊营业店数 / 15⌋
补的数量 = 目标数 − 本区服当前可接（未过期、没人接）的公共单数
```
**私人刷新** `POST /takeaway/refresh`：条件见裁定 4，给自己生成 15 张私人单。

每张单：
| 字段 | 规则 |
|---|---|
| 食谱 | 从全部食谱里均匀抽 |
| 品级 g | 普通 40%、中品 25%、上品 15%、极品 10%、金牌 5%、珍品 3.5%、佳肴 1.5% |
| 配送时长（分钟） | 20 + rand(10g) |
| 过期时间 | 生成时间 + 配送时长 + rand(10g) 分钟 |
| 所需声望 | 2g + rand[1, g] |

随机数顺序（每张单）：食谱 → 品级 → 时长 → 有效期 → 声望。

### 3.3 接单 `POST /takeaway/deliver {orderId, riderId, double}`

条件（按顺序检查）：
1. 已开通
2. 单存在、是公共单或我的私人单、可接、没过期
3. 骑手是我的，在送单数 < 同时配送数
4. 这道菜已学会（k ≥ 1）
5. `double` 为真时持有使命必达（裁定 6）
6. 声望 ≥ 所需声望
7. 食材够：这道菜品级 k 所需的每种食材 × g × (加料 ? 2 : 1)

扣除食材和所需声望；把单改成"配送中"（只有状态仍可接且没过期才能改，改不到报 `INVALID_STATE order_taken`）。

这一单的数值在接单时定下（之后天气、加成变化都不影响）：
```
系数c, 系数e = p > 1,000,000 ? (0.05, 0.22) : (0.24, 0.72)
基础银币 = c × p × g × (1 + k/10)
基础经验 = e × p × g × (1 + k/10) / 45
时长(分钟) = max(1, ⌊单的时长 × (1 − 骑手减时% + 天气.taNeedtimeRate + 加成.taNeedtimeRate)⌋)
银币 = ⌊基础银币 × (1 + 骑手银币% + 天气.taCoinRate + 加成.taCoinRate)⌋
经验 = ⌊基础经验 × 餐厅等级 × (1 + 骑手经验% + 天气.taExpRate + 加成.taExpRate)⌋
声望 = ⌊g × (1 + 骑手声望% + 天气.taRenownRate + 加成.taRenownRate)⌋
成功率(‰) = (100 − rand(200)) + 骑手成功率‰ + 天气.taSuccessoddsRate×1000 + 加成.taSuccessoddsRate×1000 + ⌊幸运率(骑手幸运) × 200⌋
```
骑手幸运 = 骑手店的基础幸运 + 加成里的幸运值（我自己当骑手时用我重算后的汇总，好友骑手按裁定 9）。
另记用到的 7 级（神秘）食材种数。随机数顺序：成功率浮动。

### 3.4 结算 `POST /takeaway/claim {deliveryId, drone}`、`POST /takeaway/claim-all`

- 条件：配送是我的、还没结算；不用无人机时要已到达
- 无人机：随时可用，花 2g + 1 钻石
- 成败：私人单、无人机必定成功；否则 rand < 成功率/1000 成功；失败且 `加成.taFailForceSuccessRate > 0`（边牧）时再抽一次，小于它则改判成功
- 骑手经验 = ⌊√(10g) × 2 × (失败 ? 2 : 1) × (无人机 ? 2 : 1) × (神秘食材种数 + 1) × (1 + 加成.riderExpRate)⌋，加到骑手上并升级（§3.5）
- 经验 = 这一单的经验 × (加料 ? 2 : 1) × (骑手是好友 ? 0.9 : 1)；私人单再 × 1.5（向下取整）
- **成功**：银币（骑手是好友 × 0.9）、经验、声望；从奖池抽 1 件（§3.6）。骑手是好友时，他的店得到 ⌊银币/9⌋、⌊经验/9⌋
- **失败**：经验 × (持有咕咕（道具 388）? 1 : 0.5)；没有银币、声望、道具；随机一句失败原因（8 句，照原版）
- **神秘顾客**：rand < 0.015 + 幸运率(骑手幸运)/50 → 成功时得珊迪（265），失败时得派大星（266），各 1 个，写新闻 `takeaway.customer`
- 单和配送都改成完成；发事件 `takeaway.deliver`
- 随机数顺序：成败 →（边牧）→ 奖池 →（礼券数量）→ 神秘顾客 → 失败原因
- `claim-all`：依次领取所有已到达的配送（不用无人机），逐个结算；返回每一单的结果

### 3.5 骑手

**雇佣** `POST /takeaway/hire {restId}`（双店操作，好友必需）：已开通；对方 1 星以上、不是蟹老板；对方现在没被别人雇（裁定 12）；我的骑手数（含自己）< 可雇上限。

**等级和属性**（最高 50 级，由等级算出，不单独存）：
| 属性 | 公式 |
|---|---|
| 升到下一级所需经验 | 等级² × 800 + 500 |
| 减时 % | min(40, 等级 − 1) |
| 经验加成 % | 2 × (等级 − 1) |
| 银币加成 % | 等级 − 1 |
| 声望加成 % | ⌊(等级 − 1) / 2⌋ |
| 成功率 ‰ | min(950, 800 + 5 × (等级 − 1)) |
| 同时配送数 | 1 + ⌊等级 / 5⌋ |

升级：当前经验 ≥ 所需经验时扣掉所需、等级 +1，可连升；到 50 级后经验不再增加。自己这个骑手升到 2、5、8 级时，可雇上限 +1。

**解雇** `POST /takeaway/dismiss {riderId}`：不能解雇自己；配送中不能解雇；花 当前经验 × 50 银币，得到 当前经验 × 500 经验。

### 3.6 奖池（规格书 20.12）

| 道具 | id | 基础权重 | 品级系数 |
|---|---|---|---|
| 神秘礼券 | 1 | 56 | — |
| 探险图 | 170 | 30 | 0.2 |
| 蟹币 | 240 | 8 | 0.5 |
| 高级探险图 | 171 | 6 | 0.5 |
| 顶级探险图 | 172 | 2 | 0.8 |
| 美味券 | 310 | 1 | 1.0 |

品级 g 的权重 = 基础权重 × (1 + 系数 × (g − 1))。抽中神秘礼券给 rand[1, 2g] 张（无人机再 + g），其他道具 1 个。

## 4. 数据

### 4.1 迁移 0013

| 表 | 列 | 说明 |
|---|---|---|
| `takeaway_state` | `rest_id` PK → restaurant 级联；`rider_cap` smallint 默认 1；`opened_at` | 有这一行 = 已开通 |
| `takeaway_rider` | `id` serial PK；`rest_id`（雇主）→ restaurant 级联；`rider_rest_id` → restaurant 级联；`level` smallint 1~50 默认 1；`exp` integer ≥ 0 默认 0；`hired_at` | 唯一 (rest_id, rider_rest_id)；部分唯一索引 (rider_rest_id) where rider_rest_id <> rest_id |
| `takeaway_order` | `id` bigserial PK；`shard_id` → shard 级联；`owner_rest_id` 可空 → restaurant 级联（空 = 公共单）；`cookbook_id`；`grade` 1~7；`need_minutes`；`need_renown`；`state`（1 可接、2 配送中、3 完成）；`created_at`；`expires_at` | 索引 (shard_id, state, expires_at) |
| `takeaway_delivery` | `id` bigserial PK；`order_id` 唯一 → takeaway_order 级联；`rest_id` → restaurant 级联；`rider_id` → takeaway_rider 级联；`grade`；`private` bool；`double` bool；`mystery_kinds`；`coin`、`exp`、`renown`、`success_odds`；`started_at`、`arrive_at`；`state`（1 配送中、2 成功、3 失败）；`drone` bool；`result` jsonb 可空；`settled_at` 可空 | 索引 (rest_id, state)、(rider_id, state) |

### 4.2 配置

- `tuning.takeaway`：开通（星级 2、声望 888、银币 8,880,000、钻石 300、外卖券 263）、公共单（基数 5、随机 18、每 15 家 +1、营业店不足 10 按 30）、品级概率、时长和声望公式参数、私人刷新（张数 15、费用 1,000,000、声望 160、工作证 108）、数值系数（售价界线 1,000,000，系数 0.05/0.24、0.22/0.72，除数 45）、成功率浮动 200、幸运率 × 200、无人机钻石 (2g+1)、私人单经验 ×1.5、好友骑手 ×0.9、回扣 1/9、失败经验 ×0.5、神秘顾客（基础 0.015、幸运率除数 50、成功 265、失败 266）、咕咕 388、骑手（最高 50 级、经验公式、属性公式参数、上限增加的等级 [2, 5, 8]、解雇 ×50 / ×500）、奖池（§3.6）、清理（未接单 1 天、完成 7 天）
- `GOODS`：`takeawayTicket: 263`、`sandy: 265`、`patrick: 266`、`gugu: 388`、`missionFlag: 370`、`shopJobHonor: 108`
- 构建校验：奖池、神秘顾客、外卖券、工作证引用的道具都存在
- 任务 34、35、122 的 `href` 改成 `/takeaway`
- `action_map` 已有 `takeaway.deliver → 配送外卖`，不改

## 5. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/takeaway` | 概览（下表） |
| POST | `/takeaway/open` | `{way: 'ticket' \| 'coin'}` |
| POST | `/takeaway/refresh` | 私人刷新，返回刷出的单数 |
| POST | `/takeaway/deliver` | `{orderId, riderId, double}`，返回这次配送 |
| POST | `/takeaway/claim` | `{deliveryId, drone}`，返回结果 |
| POST | `/takeaway/claim-all` | 返回结果列表 |
| GET | `/takeaway/candidates` | 可雇的好友（含不能雇的原因） |
| POST | `/takeaway/hire` | `{restId}` |
| POST | `/takeaway/dismiss` | `{riderId}` |

**概览** `TakeawayDto`：
- `opened`；没开通时给开通条件和费用（星级、声望、银币、钻石、持有外卖券数）
- `orders`：我能看到的可接单（公共 + 我的私人），每张附 食谱 id、品级、时长、所需声望、过期时间、是否私人、所需食材（每种要几个、我有几个）、`block`（不能接的原因：`not_learned` / `renown` / `foods`，可以接为 null）
- `deliveries`：我还没结算的配送（剩余时间、能否领取、无人机钻石数）
- `riders`：等级、当前经验、升级所需、各项属性、在送单数、是否是自己、骑手店名
- `riderCap`、`canDouble`（是否持有使命必达）、`refresh`（费用、有没有工作证）、`renown`、`coin`、`diamond`

## 6. 前端

- 路由 `/takeaway`（需要餐厅）；"更多 → 玩法"加"外卖"（`bi-bicycle`）
- 没开通：条件列表，"用外卖券开通"和"用银币和钻石开通"两个按钮，不满足的灰掉并写明原因
- 开通后三个标签（记在 `localStorage` 的 `dt_takeaway_tab`）：
  - **外卖单**：品级标签、菜名、时长、所需声望、剩余有效时间、食材（够的绿、不够的红）；选骑手（只列有空位的）、勾"加料"（没有使命必达时灰掉并写原因）、接单；不能接的灰掉写原因；私人刷新按钮（写明费用，没有工作证时灰掉）
  - **配送中**：倒计时、领取、无人机（写明钻石数）、全部领取；结果卡片（成败、失败原因、银币、经验、声望、道具、骑手经验、神秘顾客）
  - **骑手**：每个骑手的等级、经验条、减时 / 银币 / 经验 / 声望加成、成功率、在送 / 上限；解雇（写明花费和所得，确认后执行）；可雇好友列表和"雇佣"按钮（不能雇的写原因）
- 错误提示走 `errorMessage`；新原因加进 `zh-CN.ts`

## 7. 错误处理

不新增错误码。所有检查在扣除前完成，失败整体回滚。

| 情况 | 错误码 |
|---|---|
| 没开通 / 已经开通 | `INVALID_STATE` reason `takeaway_closed` / `ALREADY_DONE` |
| 开通星级不够 | `REQUIREMENT_NOT_MET` reason `star`（params `need`） |
| 声望、银币、钻石、外卖券、食材不够 | `NOT_ENOUGH` renown / coin / diamond / goods / foods |
| 单不存在、不是我能看到的、已过期 | `INVALID_STATE` reason `order_gone` |
| 单被别人抢先接走 | `INVALID_STATE` reason `order_taken` |
| 骑手不是我的 / 满了 | `INVALID_STATE` reason `rider_gone` / `LIMIT_REACHED` what `rider_busy` |
| 没学会这道菜 | `REQUIREMENT_NOT_MET` reason `not_learned` |
| 没有使命必达却要加料 | `REQUIREMENT_NOT_MET` reason `double` |
| 没有工作证 | `REQUIREMENT_NOT_MET` reason `job_honor` |
| 配送不存在或已结算 / 还没到 | `INVALID_STATE` reason `delivery_gone` / `not_arrived` |
| 雇佣：对方是 NPC / 不到 1 星 / 已被雇 / 满员 | `INVALID_STATE` reason `npc` / `REQUIREMENT_NOT_MET` reason `star` / `INVALID_STATE` reason `rider_hired` / `LIMIT_REACHED` what `riders` |
| 解雇：是自己 / 在配送 | `INVALID_STATE` reason `rider_self` / `rider_delivering` |
| 参数越界 | `VALIDATION_FAILED` |
| 功能关闭 | `FEATURE_DISABLED` |

## 8. 测试

- 纯规则：品级概率、时长 / 有效期 / 声望公式、数值快照（售价两档、天气、加成、骑手）、成功率、骑手属性和升级（连升、50 级封顶、2/5/8 级加上限）、奖池权重、结算经验系数
- 服务：
  - 开通两种付费、条件不满足、重复开通
  - 补单数量（营业店不足 10 按 30）、已有单时少补、清理旧数据
  - 两个人同时接同一张公共单只有一个成功
  - 接单的每个失败原因，失败时什么都不扣
  - 结算：成功、失败、私人单、无人机、边牧、咕咕、神秘顾客、全部领取、未到时间
  - 骑手：雇佣的各个条件、一家店只能被一个人雇、升级、解雇、好友骑手的 0.9 和回扣
  - 主线第 34、35 步、支线 122、活跃"配送外卖"
  - 区服关闭 takeaway
- 前端：各面板的按钮、灰掉原因、结果卡片、标签记忆
- 端到端：开通（外卖券）→ 私人刷新 → 接单 → 无人机领取

## 9. 文档

- `docs/rules/收益与加成.md` 加第 11 节「外卖」
- `docs/deploy.md` 加一节：迁移 0013、功能开关 `features.takeaway`、定时任务 `takeaway-orders`、`tuning.takeaway`
