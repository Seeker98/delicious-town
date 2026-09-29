# 子项目 3「好友互动」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-29-rewrite-architecture-design.md`（架构文档）、`2026-09-29-subproject2a-business-loop-design.md`（2A 设计）
- 游戏规则依据：`../analysis/spec/` 的 01、02、05、13、15、16、20 章（下文简称"规格书 xx"），以及 `backend_src` 原版源码
- 分支：`feat/friends`，基于 `feat/admin-console`

## 1. 目标与范围

**完成标志**：同一区服的几个玩家能加好友、互访餐厅，并完成白食、放蟑螂 / 灭蟑螂、帮忙加油、翻橱、交换食材、点赞这些互动；每个区服有一家 NPC「蟹老板」保证人少时也有互动对象；主线第 8/9/14/19 步不再跳过。

### 1.1 包含

| 模块 | 内容 | 规格书 |
|---|---|---|
| 好友关系 | 申请、同意 / 拒绝、删除、搜索（按店名）、同街道餐厅、好友列表（分页、排序） | 13 §13.1 |
| 访问好友餐厅 | 公开信息、门、头像、公告栏、个性图标、勋章、牌匾、餐桌视图、橱柜位冷却 | 13 §13.2 |
| 白食 | 开始、自己结束、被店主请走；结算里的白食累计（2A 已实现） | 13 §13.3、01 §1.5B |
| 蟑螂 | 放蟑螂、灭蟑螂（自己店和好友店）、自然蟑螂重新开启 | 13 §13.4、01 §1.5A |
| 帮好友加油 | 银币换油、美味券 | 13 §13.5 |
| 翻橱 | 橱柜位冷却、老鼠夹、神之一手、神灯、翻到食材 / 礼券 | 05 §5.7 |
| 交换食材 | 同级 2 换 1、手续费、次数限制、飓风、红内裤 | 05 §5.6 |
| 点赞 | 点赞、一键回赞、IP 限制、奖励和超额惩罚 | 13 §13.7 |
| 好友动态 | 近 3 天别人对我做的操作；今日点赞 | 13 §13.8 |
| 餐厅装扮 | 换门、公告栏、个性图标（展示最多 5 个）、头像（预设） | 02 §2.8 |
| 蟹老板 NPC | 每区一家系统餐厅：自动加好友、每天补橱柜、只跑餐桌结算 | 13、05 |
| 周奖励 | 神之一手、被翻厨前 4、灭蟑能手 | 16 |
| 接入 | 改名费（上周被放蟑螂数）、主线和支线、活跃度、运营控制台发个性图标 | 02、15 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 品尝好友特色菜 | 4（依赖特色菜） |
| 摇蟹老板的钱袋（`krab.shake`） | 4（小镇玩法） |
| 偷菜、帮忙浇水除虫除草 | 4（菜园） |
| 好友切磋、雇佣外卖员 | 4 |
| 上传头像 | 以后（本次只有预设头像） |
| 厨具相关展示（当前装备） | 2B |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 交换食材时对方得到几个 A：规格书 05 写"对方得到 2 个 A"，原版代码是对方得到 1 个、另 1 个消耗 | 按原版代码：我出 2 个 A，对方得到 1 个 A，我得到 1 个 B |
| 2 | 交换接口的 num（一次换多份） | 只支持一次换一份；每次调用计一次交换 |
| 3 | 请走白食者时，没有激动的心的白食者经验归零（规格书标记存疑） | 按原版：没有激动的心时白食者不得经验；有时得累计经验 ×3 |
| 4 | 帮好友加油的美味券次数按"好友缺的油"计算（原版），加得少也按缺的算 | 按**实际加的油量**计算：好友油上限 ≥8000 时每 8000 油抽 2 次，否则每 4000 油抽 2 次 |
| 5 | 灭蟑螂的基础体力（原版来自 SQL，1~6） | 用规格书 20 §20.18：自己店 1、好友店 2、蟹老板店 0 |
| 6 | 神灯让翻橱失败时原版整体回滚（不扣体力） | 保持：神灯触发时返回失败码 `FLIP_BLESSED`，不扣体力、不占冷却、不计次数 |
| 7 | 删除好友时进行中的白食 | 不中断：白食者仍可结束，店主仍可请走；新的互动需要重新成为好友 |
| 8 | 被白食的店停业（没油） | 白食桌保留（规格书 01 §1.1）；停业不结算，所以不再累计；白食者仍可在 ≥30 分钟后结束 |
| 9 | 蟹老板的"是否好友"判定 | 蟹老板和玩家之间也用 `friend` 表；玩家同意蟹老板的申请后成为好友，计入 `friends.count`，但不占 199 上限 |
| 10 | 蟹老板那里被老鼠夹夹中的银币"星级×10" | 取**我的**星级 × 10（原版代码 `rest.getStarlevel()`，rest 是翻橱的人） |
| 11 | 蟹老板被白食时扣谁的银币 | 蟹老板银币不变；白食者照常累计经验和银币 |
| 12 | 支线 102「摇一次蟹老板的钱袋」 | `krab.shake` 的功能映射改为 `town`，继续跳过直到子项目 4 |
| 13 | 同一 IP 当天只能给同一人点一次赞 | IP 取会话记录的真实 IP（`CF-Connecting-IP`，开发环境取连接地址）；为空时只按餐厅限制 |
| 14 | 未验证邮箱不能互动 | 保留，做成 `tuning.friend.requireVerifiedEmail`（默认 true）；关闭后本地测试不用配邮件 |

## 3. 数据模型

新增迁移 `0004_friends`。

### 3.1 现有表的扩展

**account**：`is_system boolean not null default false`。系统账号不能登录（登录接口按"用户名或密码错误"处理），不出现在管理后台的玩家搜索里。

**restaurant**：

| 列 | 类型 | 说明 |
|---|---|---|
| npc | boolean not null default false | 蟹老板 |
| door | smallint not null default 0 | 当前门，0 为默认门 |
| avatar | smallint null | 头像，null 表示没设置（不能白食） |
| notice | text not null default '' | 公告栏，≤200 字 |

索引：`create unique index restaurant_npc_shard on restaurant (shard_id) where npc`（每区最多一家）。

### 3.2 新表

| 表 | 结构 | 说明 |
|---|---|---|
| `friend` | PK (rest_id, friend_id)；created_at；索引 (friend_id) | 成为好友时写两条，删除时删两条 |
| `friend_request` | PK (from_rest, to_rest)；created_at；索引 (to_rest) | 待处理申请。拒绝、同意、成为好友时删除 |
| `dine_dash` | PK diner_rest_id；host_rest_id、table_no、started_at；索引 (host_rest_id) | 进行中的白食。累计的银币经验在店主 `restaurant_tables.tables[].freeloader` |
| `cupboard_flip` | PK (host_rest_id, slot_no)；by_rest_id、cool_until | 橱柜位冷却，所有好友共享 |
| `thumb` | PK (day, from_rest, to_rest)；ip text null、returned boolean default false、created_at；索引 (day, to_rest) | 点赞；IP 限制用 (day, ip, to_rest) 部分唯一索引（ip 非空时） |
| `rest_icon` | id PK；rest_id、icon_key、shown boolean default false、granted_at、granted_by | 个性图标；标题和说明来自配置 |

所有新表的 rest_id 类外键 `on delete cascade`。

### 3.3 复用

- **每日计数** `daily_counter`，键：`dine.done`、`roach.lay`、`roach.laidOn`（被放）、`roach.kill`、`flip.times`、`flip.caught`、`flip.flipped`（被翻）、`exchange.with:<restId>`、`exchange.total`、`exchange.taken`（被换）、`exchange.krab`、`thumbs.given`。周奖励和改名费对上周一到周日的 7 天求和。
- **全历史计数** `event_counter`：`thumbs.received`（被点赞数，对应支线 `rest.thumbs`）。
- **好友动态** `rest_log`：互动在**目标餐厅**写一条日志，类型见 §4.10，params 带 `{by, byName}`；发起方也写自己的日志。
- **流水** `ledger`：两边的货币和物品变动都写，`ref_rest_id` 记对方。
- **蟹老板交换的 IP / 设备限制**：Redis 计数 `krabx:<shard>:<day>:ip:<ip>` 和 `krabx:<shard>:<day>:dev:<hash>`，当天过期。

### 3.4 配置

`packages/config` 新增：

- `tuning.friend`：

```ts
friend: {
  requireVerifiedEmail: true,
  maxFriends: 199,
  dine: { minMinutes: 30, strengthPerHour: 20, strengthMax: 100, heartExpMul: 3, heartStrengthMul: 1.5, baseSeats: 1 },
  roach: { layBase: 3, layLevelRate: 0.2, killCoinLevelRate: 0.5, killSelfRate: 1.5,
           killStrength: { self: 1, friend: 2, npc: 0 }, killerNightMax: 2, killerDayMax: 3,
           ticketRate: 0.1, ticketMax: 3 },
  flip: { baseSlots: 5, slotsPerStar: 5, coolHours: 22, coolRandHours: 4, npcCoolHours: 10,
          cheapTimes: 100, godsHandTimes: 25, caughtCoinPerLevel: 100, npcCaughtCoinPerStar: 10,
          hitRate: 0.3, blessedRate: 0.8, handleFoodsRate: 0.9, handleFoodsRatePerStar: 0.01, luckDivisor: 3 },
  exchange: { maxLevel: 5, base: 14, feeRate: 0.5, lockedFeeMul: 2, perDayTotalMul: 10, takenBase: 10,
              npcBase: 8, stormCaughtRate: 0.5, bangleBase: 0.3, bangleFactor: 0.0006 },
  thumbs: { rewardTimes: 10, ticketMax: 2, overRenown: -1 },
  refuel: { bigTank: 8000, drawsPerChunk: 2 },
  npc: { name: '蟹老板', level: 60, star: 5, tables: 32, oil: 1000000000, avatar: 1, door: 0,
         roachRate: 0.02, restockKinds: 30, restockNum: 5 },
}
```

- `game/looks.json`：门（id、名称、价格；0 号免费）、头像（id、名称）、个性图标（key、标题、说明）列表。图片路径 `door/<id>`、`avatar/<id>`、`icon/<key>`，先用占位图。
- `income_action`：已有"打蟑螂"(10/5)、"放置蟑螂"(5/5)。
- `action_map.features`：`krab.shake` 改为 `town`。
- 物品常量（`packages/config/src/ids.ts`）：红内裤 100、午夜蟑螂杀手 156、鞭炮 157、灯笼 158、福 159、银手镯 228、痛心入骨 250、神之一手 251、点赞王 348、神灯 389、激动的心 406、巫毒娃娃 423、镇长的关心 459。效果数值从道具 value 汇总进 `effect_agg`（已有机制），规则只读汇总键：`trapRate`、`cockroachIncomeRate`、`killRoachNoStrengthRate`、`flipCBNoStrengthRate`、`flipNoLostCoinRate`、`getStrengthRate`、`changeFoodsFlag`（天气）。"持有有效的某勋章"用 `store_item` 未过期判断。

## 4. 服务端

新模块 `apps/server/src/modules/friend/`（关系、访问、动态、装扮）、`interact/`（白食、蟑螂、加油、翻橱、交换、点赞）、`npc/`（蟹老板）。

### 4.1 双店操作 `runPairOp`

```ts
runPairOp<T>(deps, ctx, targetRestId, opts: { feature: string; source: string; friend: 'required' | 'none' },
             fn: (p: { me: Op; them: Op }) => Promise<T>): Promise<OpResult<T>>
```

1. 检查功能开关；目标餐厅存在且同区服；不是自己
2. 一个事务里按 id 升序 `select ... for update` 锁两家 `restaurant`
3. 公共检查（锁后）：双方账号没被封；`requireVerifiedEmail` 时双方邮箱已验证（NPC 视为已验证）；`friend: 'required'` 时 `friend(them→me)` 存在
4. 为两家各建一个 Op 快照，执行 fn，然后 `flushOp(me)`、`flushOp(them)`；事件只返回 me 的
5. 任何异常整体回滚

锁顺序固定，结算每次只锁一家店，所以不会死锁。两家的橱柜、餐桌、冷却行都只在持有对应餐厅锁时修改（沿用 2A 约定）。自己店的灭蟑螂、结束白食、请走走普通 `runOp`（请走时再按 id 顺序锁白食者：`runPairOp` 以白食者为目标，`friend: 'none'`）。

### 4.2 好友关系

- **申请** `friend/apply {restId}`：目标不能是 NPC、不能已是好友；我的好友数（不含 NPC）< 199；若目标已向我申请 → 直接成为好友（写两条 `friend`、删两条申请）；否则写 `friend_request`（已存在则幂等成功）
- **处理** `friend/respond {restId, accept}`：申请必须存在；同意时检查我的好友数 < 199（对方是 NPC 不检查）
- **删除** `friend/remove {restId}`：删两条；NPC 也可以删
- **列表** `friend/list?sort=level|star|recent&cursor=`：每页 20；每项：id、名称、等级、星级、头像、是否 NPC、桌上蟑螂数、白食空位（有空桌且白食人数未满）、可翻橱位数
- **申请列表** `friend/requests`：收到的；**搜索** `friend/search?q=`（pg_trgm，排除自己和 NPC）；**同街** `friend/street`（同街道营业中的店，随机 20 家）
- 这些写操作只动 `friend` / `friend_request`，按 (min(id), max(id)) 的咨询锁 `pg_advisory_xact_lock` 串行，防止双方同时申请产生重复

### 4.3 访问 `friend/detail/:restId`

同区服任意餐厅都可以看（非好友时 `isFriend=false`，前端只显示"加好友"）。返回：名称、等级、星级、街道、声望、门、头像、公告栏、展示中的个性图标、有效勋章、牌匾、餐桌（`customer`、蟑螂和放置者是否是我、白食者名称和开始时间、痞老板）、我今天对它的计数（是否已点赞、剩余交换次数）。不返回银币、钻石、体力、橱柜数量。

### 4.4 白食

**开始** `dine/start {restId, tableNo}`（`runPairOp`，需好友）：
- 我设置过头像；`dine_dash` 里没有我；今天 `dine.done` = 0
- 对方营业中（state=1）；该桌 `customer === 0` 且没有蟑螂
- 对方当前白食人数 < `baseSeats + 对方星级`（NPC 不限）
- 写桌子 `customer=9, freeloader={restId, level, since, coin:0, exp:0}`；写 `dine_dash`；对方 `rest_log dine.start`

**结束** `dine/end`（`runPairOp` 以店主为目标，`friend: 'none'`，裁定 7）：
- 已开始 ≥30 分钟
- 我获得：累计经验 × (激动的心 ? 3 : 1)；累计银币（结算时已从店主扣）；体力 min(⌊小时⌋×20, 100) × (激动的心 ? 1.5 : 1)，取整
- 桌子清空（customer=0，去掉 freeloader）；删除 `dine_dash`；`dine.done` +1；活跃"白食"；事件键 `friend.dineAndDash` +1

**请走** `dine/expel {tableNo}`（店主操作，锁店主和白食者）：
- 该桌是白食桌且已 ≥30 分钟；白食者没有有效神灯
- 店主获得 2 × 累计银币；白食者扣累计银币（不够扣到 0，不为负）；白食者获得体力（同上）、有激动的心时获得累计经验 ×3
- 桌子清空；删除 `dine_dash`；白食者 `rest_log dine.expelled`；白食者当天 `dine.done` +1

结算（2A 已实现）按规格书 01 §1.5B 在白食桌上累计；NPC 餐厅见 §4.9。

### 4.5 蟑螂

**放** `roach/lay {restId, tableNo}`（`runPairOp`，需好友）：
- 目标桌 `customer === 0`；今天 `roach.lay` < 3 × (我的星级 + 1)
- 桌子 `customer=3, roach={by: 我, at: now}`
- 我获得 放置蟑螂基础值 × (1 + 0.2 × 我的等级)（银币和经验，取整）；对方 `roach.laidOn` +1；对方 `rest_log roach.laid`；事件键 `roach.lay`；活跃"放置蟑螂"

**灭** `roach/kill {restId, tableNo}`（restId 为自己时用 `runOp`，否则 `runPairOp` 需好友）：
- 该桌 `customer === 3`；`roach.by !== 我`
- 体力：基础 自己店 1 / 好友店 2 / NPC 0；持有有效午夜蟑螂杀手时 23~7 点最多 2、其他时间最多 3；巫毒娃娃按 `killRoachNoStrengthRate` 免体力；体力不足报 `STRENGTH_NOT_ENOUGH`
- 桌子变空（customer=0，去掉 roach）
- 奖励：银币 = round(10 × (1+0.5×等级) × rate)，经验 = round(5 × (1+等级) × rate)，rate = 自己店 1.5，别人店 1 + (持有午夜蟑螂杀手 ? cockroachIncomeRate : 0)
- 以 0.1 + 幸运率/2 概率得神秘礼券 rand[1,3]；在好友店（含 NPC）抽 1 次美味券
- `roach.kill` +1；在别人店时对方 `rest_log roach.killed`；事件键 `roach.kill`；活跃"打蟑螂"

### 4.6 帮好友加油 `friend/refuel {restId, num}`

`num` 为 -1（加满）或正整数。好友油满报 `FRIEND_OIL_FULL`；我的银币 ≤0 报 `COIN_NOT_ENOUGH`；实际加油 = min(需要, num, 我的银币)；我扣银币、对方加油（油 >0 时自动恢复营业，沿用 2A）；美味券按裁定 4；对方 `rest_log friend.refuel`；活跃"帮好友添油"。

### 4.7 翻橱 `cupboard/flip {restId, slotNo}`

`runPairOp`，需好友；`1 ≤ slotNo ≤ 5 + 5 × 对方星级`；该位 `cool_until` 未到报 `FLIP_COOLING`。

1. 今天第 n 次（`flip.times` + 1）：n ≤ 100 体力 1，否则 2；巫毒娃娃按 `flipCBNoStrengthRate` 免体力；我的银币 ≤0 报 `COIN_NOT_ENOUGH`
2. luckRate = 幸运率(我的幸运总值 − 对方幸运总值) / 3
3. 神之一手有效且 n < 25：跳过老鼠夹，直接到第 5 步并必定翻中
4. 对方 `trapRate > 0` 且命中：以 luckRate 概率幸运躲过（结果"躲过"）；否则被夹：银币 = ⌊c/2⌋ + rand(⌊c/2⌋)，c = 100 × 我的等级（NPC 店为 我的星级 × 10），我低于 2 星时减半；巫毒娃娃按 `flipNoLostCoinRate` 免损失；银币从我转给对方（不超过我现有银币）；`flip.caught` +1
5. 没被夹：对方有有效神灯时 80% 报 `FLIP_BLESSED`（回滚，裁定 6）；r = rand：若神之一手或 r − luckRate < 0.3 → 从对方**未锁定、1~5 级、num>0** 的食材按 odds 加权抽 1 个转给我（对方没有可翻的食材则改为神秘礼券 1 张）；否则以 (0.9 + 0.01×我的星级)/2 + luckRate 概率得神秘礼券 1 张；否则"什么都没有"
6. 美味券：抽 (n ≤ 100 且 rand < luckRate ? 2 : 1) 次
7. 写冷却 `cool_until = now + 22h + rand[0, 4h)`（NPC 10h + rand）；`flip.times` +1；对方 `flip.flipped` +1、`rest_log friend.flip`；事件键 `cupboard.flip`；活跃"翻厨"

食材进我的橱柜走 `addFoods`（橱柜满进冰箱，都满丢弃并提示）。

### 4.8 交换食材 `foods/exchange {restId, giveFoodsId, takeFoodsId}`

`runPairOp`，需好友。
- 两种食材同级且 ≤5；我有 ≥2 个 give；对方有 ≥1 个 take；我的橱柜没有 take 且格子已满时报 `CUPBOARD_FULL`
- 对方的 take 锁定：只有当前天气 `changeFoodsFlag = 1` 时可以换，手续费 ×2；否则报 `FOODS_LOCKED`
- 次数：
  - NPC：今天 `exchange.krab` < 8 − 我的星级，且同 IP、同设备当天次数 < 同值
  - 其他：对这个好友 `exchange.with:<id>` < 14 − ⌊我的星级/2⌋；`exchange.total` ≤ 该值 × 10；对方 `exchange.taken` ≤ 10 + 对方星级
- 飓风换锁定食材：对方获得镇长的关心(459) 1 小时（已有则延长 1 小时）；50% 被抓：我的 2 个 give 全给对方，以 0.3 + 等级×(105−odds)×0.0006 概率获得银手镯(228) 1 小时（已有则延长）；返回成功但结果为 `caught`（事务提交，计次数）
- 正常：我 −2 give、对方 +1 give、对方 −1 take、我 +1 take（裁定 1）；手续费 = ⌊对方 take 单价 × 0.5 × (100/odds) × (锁定 ? 2 : 1)⌋ 从我转给对方（NPC 免），银币不足报 `COIN_NOT_ENOUGH`
- 红内裤：我的星级 > 对方星级且对方持有有效红内裤 → 从我橱柜随机 1 种同级食材扣 1 个给对方
- 计数 +1；对方 `rest_log exchange`；事件键 `foods.exchange`；活跃"交换食材"

### 4.9 蟹老板 NPC

- **创建** `ensureNpc(db, shardId)`：系统账号 `krab`（迁移时创建，`is_system=true`，随机密码哈希）；每区一家 `npc=true` 的餐厅，数值取 `tuning.friend.npc`，餐桌 32 张；迁移为现有区服创建，新建区服的流程里调用（幂等）
- **排除**：普通结算、老鼠、排行、管理后台统计（经济、分布、结算）、玩家搜索、`friend/street`
- **餐桌结算**：结算轮次里对每区的 NPC 单独跑一次"只处理餐桌"：白食桌累计（不扣 NPC 银币，裁定 11）、以 `npc.roachRate` 在空桌自然产生蟑螂、蟑螂保持；不产生收益和 `income_round`
- **补货** 定时任务 `npc-restock`（每天 00:05）：清空 NPC 橱柜，从 1~5 级食材中随机选 `restockKinds` 种、各 `restockNum` 个
- **自动申请** `npc-befriend`（每天一次，另外在验证邮箱和开店时对单店调用）：对区服里邮箱已验证、不是 NPC 好友、也没有待处理申请的餐厅，写 NPC → 该店的申请（幂等）
- NPC 不主动互动、不请走白食者、不删好友

### 4.10 点赞、动态、装扮

**点赞** `thumbs/up {restId}`（`runPairOp`，需好友）：我的声望 ≥0；今天没给过该店；该 IP 今天没给该店点过；`thumbs.given` +1 后 ≤10：神秘礼券 rand[0,2]，持有点赞王时按 `getStrengthRate` 概率体力 +rand[1,3]；>10：声望 −1；如果对方今天已给我点赞，把那条的 `returned` 置 true；对方 `thumbs.received` +1、`rest_log thumb`；事件键 `thumbs.up`。

**一键回赞** `thumbs/returnAll`：今天给我点赞、我还没点赞过的每家店依次执行一次点赞（逐家 `runPairOp`，各自独立事务；某家失败跳过并在结果里列出）。

**今日点赞** `thumbs/today`：今天给我点赞的店和是否已回赞。

**动态** `friend/feed?cursor=`：近 3 天目标是我的日志，类型：`dine.start`、`dine.expelled`、`roach.laid`、`roach.killed`、`friend.refuel`、`friend.flip`、`exchange`、`thumb`、`friend.apply`、`friend.accept`；复用 2A 的 `(time~id)` 游标。

**装扮**（`runOp`，功能 `friend`）：
- `rest/door {door}`：门存在；不是当前门；非 0 号门扣 20,000 银币（`looks.json` 的价格），换回 0 免费
- `rest/avatar {avatar}`：头像存在
- `rest/notice {text}`：去掉首尾空白，≤200 字，过滤控制字符
- `rest/icon/show {iconId, shown}`：图标属于我；展示时已展示数 < 5

### 4.11 周奖励 `friend-weekly`

周期任务，每周一 07:59 之后执行，周期号为上周一日期。统计上周一到周日 `daily_counter`（排除 NPC）：
- `flip.caught` 最多的 1 家 → 神之一手(251)
- `flip.flipped` 前 4 → 痛心入骨(250) / 鞭炮(157) / 灯笼(158) / 福(159)
- `roach.kill` 前 2 → 午夜蟑螂杀手(156)

并列按餐厅 id 升序；计数为 0 不发；用 `grantGoodsOp` 发放，有效期按道具 `invalidhour`；每个获奖写一条新闻 `friend.weekly`。`job_run` 保证每周只执行一次。

### 4.12 接入已有功能

- `IMPLEMENTED_FEATURES` 加入 `friend`，自然蟑螂随之开启
- **改名费**：银币 = 上周 `roach.laidOn` 之和 × 100 × 等级 × (星级 + 1)，银币不足报错
- **任务状态**：`friends.count`（`friend` 表里我的好友数，含 NPC）、`rest.thumbs`（`event_counter thumbs.received`）
- **管理后台**：玩家详情页的个性图标列表、发放（从 `looks.json` 选）、收回，写审计；`AdminRestaurantDto` 加 `npc`
- **模拟器**：机器人有体力时灭自己店里的蟑螂

### 4.13 错误码

`NOT_FRIEND`、`TARGET_NOT_FOUND`、`TARGET_IS_SELF`、`TARGET_IS_NPC`、`TARGET_BANNED`、`EMAIL_NOT_VERIFIED`、`TARGET_EMAIL_NOT_VERIFIED`、`FRIEND_LIMIT`、`ALREADY_FRIEND`、`REQUEST_NOT_FOUND`、`AVATAR_REQUIRED`、`ALREADY_DINING`、`DINE_DONE_TODAY`、`TABLE_OCCUPIED`、`TARGET_CLOSED`、`SEATS_FULL`、`DINE_TOO_SHORT`、`NOT_DINING`、`DINER_PROTECTED`、`ROACH_LIMIT`、`NO_ROACH`、`OWN_ROACH`、`STRENGTH_NOT_ENOUGH`、`FRIEND_OIL_FULL`、`COIN_NOT_ENOUGH`、`FLIP_SLOT_INVALID`、`FLIP_COOLING`、`FLIP_BLESSED`、`FOODS_LEVEL_MISMATCH`、`FOODS_NOT_ENOUGH`、`FOODS_LOCKED`、`CUPBOARD_FULL`、`EXCHANGE_LIMIT`、`THUMB_DONE`、`RENOWN_NEGATIVE`、`DOOR_INVALID`、`AVATAR_INVALID`、`NOTICE_TOO_LONG`、`ICON_SHOW_LIMIT`。已有的码（`FEATURE_DISABLED` 等）照用。中文文案放 `i18n/zh-CN.ts`。

### 4.14 接口一览

| 方法 | 路径 |
|---|---|
| GET | `friend/list`、`friend/requests`、`friend/search`、`friend/street`、`friend/detail/:restId`、`friend/feed`、`friend/cupboard/:restId`、`friend/foods/:restId?level=`、`dine/current`、`thumbs/today`、`rest/looks` |
| POST | `friend/apply`、`friend/respond`、`friend/remove`、`dine/start`、`dine/end`、`dine/expel`、`roach/lay`、`roach/kill`、`friend/refuel`、`cupboard/flip`、`foods/exchange`、`thumbs/up`、`thumbs/returnAll`、`rest/door`、`rest/avatar`、`rest/notice`、`rest/icon/show` |
| 管理 | `GET admin/restaurants/:id/icons`、`POST admin/restaurants/:id/icons`、`POST admin/restaurants/:id/icons/:iconId/revoke` |

请求和响应的 zod schema 放 `packages/shared/src/schemas/friend.ts`。

## 5. 前端

- **底部导航**加"好友"（6 个标签），有待处理申请时显示红点（`friend/requests` 数量随 `restaurant` store 刷新时一起取）
- `/friends`：四个标签
  - 好友：列表项显示头像、名称、等级、星级，小图标"有蟑螂 / 可白食 / 可翻橱"；NPC 置顶
  - 申请：同意 / 拒绝
  - 找好友：搜索框 + 同街道餐厅，"加好友"按钮
  - 动态：近 3 天记录 + 今日点赞列表 + "一键回赞"
- `/friends/:restId`：好友餐厅
  - 顶部：门作背景、头像、名称、等级星级、公告栏、个性图标
  - 操作条：点赞 / 加油（弹窗：加满或输入数量）/ 翻橱 / 交换 / 删除好友（确认）
  - 楼层视图：复用 `RestFloorView` 的餐桌组件（抽成 `TableGrid.vue`）；点空桌弹出"白食 / 放蟑螂"，点蟑螂"消灭"，我的白食桌高亮
  - 非好友时只显示"加好友"
- `/friends/:restId/flip`：橱柜位网格，冷却中的灰显并显示剩余时间；结果用提示显示
- `/friends/:restId/exchange`：选等级 → 选对方的食材（显示锁定、手续费）→ 选我要给出的食材（显示持有数）→ 确认；显示今天剩余次数
- **自己餐厅**：楼层视图里的蟑螂可以点击消灭；白食桌显示白食者和时长，≥30 分钟后显示"请走"；首页显示"正在 XX 白食，已 x 分钟 [结束白食]"卡片（`dine/current`）
- `/rest/look`：装扮页（入口在"更多"），门（价格、当前）、头像、公告栏编辑、个性图标展示开关
- 管理后台玩家页：个性图标区块
- 数据刷新：操作成功后刷新当前页数据；好友餐厅页在窗口重新获得焦点时刷新

## 6. 测试

1. **规则单元测试**（纯函数 + 固定随机序列）：白食结束和请走的结算、灭蟑螂体力和奖励、翻橱各分支、交换手续费 / 飓风 / 红内裤、点赞奖励和超额、周奖励排名、美味券抽取
2. **集成测试**（真实 PostgreSQL 和 Redis）：每个接口的成功路径和主要失败码；两边的流水和 `rest_log`；一方失败时另一方没有半截写入（复用 `failRestLog`）；未验证邮箱、被封、非好友的拦截；`requireVerifiedEmail=false` 时放行
3. **并发**：A、B 同时互相翻橱 / 交换不死锁；两人同时白食同一张桌只有一人成功；两人同时申请对方只产生一对好友；互动和结算轮次同时进行不丢更新
4. **结算和任务**：白食桌累计；NPC 只跑餐桌；自然蟑螂开启；`npc-restock` / `npc-befriend` / `friend-weekly` 同周期重复执行不重复发放；改名费用上周被放蟑螂数
5. **任务**：主线第 8、9、14、19 步不再跳过；同意蟹老板的申请后第 9 步完成；支线 102 仍然跳过
6. **前端组件测试**：好友列表、好友餐厅页操作、交换页、装扮页、底部导航红点
7. **端到端**：两个账号注册 → 互加好友 → A 在 B 店放蟑螂 → B 消灭 → A 设置头像后在 B 店白食 → B 给 A 点赞、A 一键回赞

## 7. 验收

- 所有测试通过；`pnpm lint`、`pnpm typecheck` 通过
- 本地开发环境：两个账号能完成 §6.7 的流程；新老玩家都收到蟹老板的好友申请；蟹老板店里有蟑螂可打、有食材可翻和交换
- 管理后台能关闭 `friend` 功能，关闭后所有互动接口返回 `FEATURE_DISABLED`，自然蟑螂停止
