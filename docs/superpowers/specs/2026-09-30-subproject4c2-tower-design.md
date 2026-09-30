# 子项目 4C-2「厨塔」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-30-subproject4a-mysterious-design.md` §0（子项目 4 的拆分）；4C 拆成 4C-1 酒吧（已合并）和 4C-2 厨塔
- 游戏规则依据：`../analysis/spec/` 的 11 全章、20 §20.10 / §20.14 / §20.18；原版源码 `TowerTranServiceImpl.startChallenge / occupyRanking`、`Tools.getCookAttr / getAttrWithCreatives`；数据 `dataset/tower_floors.json`（10 层）、`designed/renown_shop.json`（12 件）
- 分支：`feat/tower`，基于 `main`

## 1. 目标与范围

**完成标志**：玩家能挑战守塔人、打赛厨榜、和好友切磋，胜负按五项评分；赛厨榜每周一结算发名次礼包；声望能在声望商店换东西；主线第 27 步「挑战一次厨塔」、支线「和好友切磋 10 次」开放；厨塔挑战券能用。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 厨力对决 | 三种挑战共用的五项评分和胜负（纯函数） |
| 厨塔 | 10 层守塔人、解锁、每日次数、夜间限制、试打、声望和随机奖励、挑战券 |
| 守塔人换菜 | 每天 05:58 给 4 层以上的守塔人抽一道特色菜 |
| 赛厨榜 | 每区服每周 15 格：占位、挑战、换位、每周一结算 |
| 好友切磋 | 条件、次数、声望三档和每日上限、随机奖励 |
| 声望商店 | 美味券常驻、雕像按周轮换、雕像限拥有 1 个 |
| 任务 | 事件键 `tower.challenge`、`tower.rank`、`tower.friendDuel` |
| 展示 | 厨塔页三个标签；好友店"切磋"按钮；"更多"页入口 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 新闻的展示（厨塔只写入新闻） | 4E |
| 挑战历史记录（原版每局一条） | 不做：只存当前状态（裁定 10） |
| 仙珍、天馔和相关商品 | 以后 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 守塔人多强 | 用规格书 20.14 的公式定属性比例（厨艺 = 刀工 = 火候 = 等级×1.2 + 8×层，调味 = 创意 = 等级×0.6 + 5×层，幸运 = 等级），整体缩放到厨力等于原版数据的 attrSum（用户确认）。守塔人没有套装，进攻和防守属性相同 |
| 2 | 守塔人是什么 | 虚拟对手：属性来自配置，不建餐厅行（用户确认）。每天 05:58 给"比拼特色菜"的层（4~10 层）各抽一道特色菜：等级在 [⌊(层−2)/2⌋, ⌊(层−2)/2⌋+3] 内且存在的特色菜里均匀抽；品级算普通，每份价值 = ⌊营养值 × (1 + 随机 0~0.3)⌋（普通品级的价值区间） |
| 3 | 守塔人每日次数 | 每人对每个守塔人单算，次数照数据（1~4 层 10 次 … 10 层 2 次） |
| 4 | 各层怎么解锁 | 餐厅等级 ≥ 该层最低等级，且打赢过下一层（1 层不要求）；每店记"打赢过的最高层"（用户确认） |
| 5 | 厨塔每日总次数 | 5 + 当天用掉的厨塔挑战券数；挑战券一次用 1 张。4 层以上 0~5 点不能挑战 |
| 6 | 试打 | 花 1 体力，不计次数，没有奖励和声望，不算挑战成功、不计任务和活跃 |
| 7 | "切磋总次数" | 好友切磋和赛厨榜挑战合计。决定奖励：当天第 1~10 次 2 次、奖励等级 4；第 11~20 次 2 次、等级 2；之后 1 次、等级 2；厨具档都是 3。好友切磋：第 21 次起胜利只给 +2 声望；第 51 次起没有奖励、不加声望（以弱胜强除外） |
| 8 | 好友切磋的声望 | 用双方当前厨力（我进攻、对方防守）比较，不做原版"当前最高厨力"的复核（原版 SQL 加密）：对方 > 我×1.15 算以弱胜强，胜 +6（不受第 7 条的上限影响）、负 −2；对方 < 我×0.7，胜 0、负 −3；其他胜 +5、负 −2 |
| 9 | 好友切磋 23:59~00:01 禁止 | 不做：每日计数按游戏日切换，没有跨天问题 |
| 10 | 存什么 | 只存当前状态：打赢过的最高层、守塔人当天的菜、本周名次；每日次数用每日计数表；对决五项只在接口返回里给 |
| 11 | 赛厨榜周结算 | 礼包 202~206 直接打开（前三名礼包里有厨神、厨圣、厨王勋章），发新闻；新一周的榜是空的 |
| 12 | 声望商店 | 只上架没有前置条件的：美味券（每周限 10）和本周轮到的雕像（ISO 周数 % 4 + 1）；雕像限拥有 1 个；仙珍、天馔的 4 件不上架（用户确认） |
| 13 | 厨塔声望 | 胜 = 层数 + 6（原版用守塔人记录 id，数据里 id 就是层数），负 = 6 |
| 14 | 赛厨榜空位 | 照原版：空位谁都能占（包括前 8 名），不花体力、不计次数；已在榜上的只能往前占，原位置让出 |

## 3. 规则明细

`luckSum` = 基础幸运 + 加成的 luckValue（和酒吧相同的 `opLuck`），`luckRate` = `opLuck(op).rate`。随机数一律走注入的 rng。

### 3.1 厨力对决（规格书 11.1）

**一方的属性**：`restGear` 的合计（加点 + 厨具 + 宝石，四项乘套装百分比），幸运换成 `luckSum`。挑战方的刀工 × (1 + 套装 attackCutting)、火候 × (1 + 套装 attackFire)；被挑战方用 defendCutting / defendFire。取整。守塔人用配置里的属性。

**厨力** = 厨艺 + 刀工 + 火候 + 调味 + 创意 + ⌊幸运/2⌋（刀工火候按进攻 / 防守算）。

**五项**：

```
色 = 厨艺×0.7 + 刀工×0.3 + 波动
香 = 厨艺×0.7 + 调味×0.5 + 波动
味 = 火候×0.5 + 调味×0.5 + 波动
形 = 火候×0.4 + 刀工×0.7 + 波动
养 = 火候×0.2 + 调味×0.1 + 刀工×0.1 + 特色菜每份价值×0.6 + 波动
波动 = (创意×0.4 + 1) × (正 ? 1.1 : −0.9) × rand
正 = rand < 0.5，否则再抽一个 rand < luckRate
每项 < 0 记 0，四舍五入保留 1 位小数
```

- 特色菜每份价值：玩家取在售特色菜（`mc_cook_id` 指向、剩余份数 > 0）的每份价值，没有为 0；守塔人取当天抽到的菜，1~3 层为 0
- 随机数顺序：挑战方色香味形养，再被挑战方；每项先抽"正"（1 或 2 个），再抽 rand
- **胜负**：五项里严格大于对方的项数 ≥ 4，或 = 3 且五项总和 ≥ 对方 → 胜

### 3.2 厨塔 `POST /tower/challenge {floor, test}`

- 检查（按顺序）：层号 1~10；解锁（裁定 4）；层 > `nightFloor`(3) 时游戏时间小时 ≥ `openHour`(6)；非试打时今日总次数有剩（裁定 5）、对该守塔人有剩（裁定 3）
- 体力：试打 1，否则 层 + 4
- 对决：我进攻，守塔人防守
- 胜：声望 +(层 + 6)；随机奖励（4C-1 的 `randomAward`）"层"次，奖励等级 层 + 2，厨具档 = 层；最高层 = max(原值, 层)
- 负：声望 +6
- 非试打：今日总次数、对该守塔人次数各 +1；事件 `tower.challenge`（主线第 27 步、活跃"厨塔挑战"）
- 试打：只扣体力，其余都不做

**挑战券**：仓库使用厨塔挑战券(136)，一次 1 张，今日挑战券数 +1。功能关闭时不能用（现有逻辑）。

**守塔人换菜**：每天 05:58（游戏时间）每个开了 `tower` 的区服跑一次；每层覆盖一行（裁定 2）。还没跑过的区服，概览和对决里 4 层以上的菜按"没有"算。

### 3.3 赛厨榜

榜按"区服 + 本周一的游戏日"区分，15 格（`rankSize`）。占位和挑战在同一事务里先锁住本区服本周的名次（对区服 + 周取事务级咨询锁），再读名次、判断、改写，两个人同时抢同一格时后到的按新名次重新判断。

**占位** `POST /tower/rank/occupy {rank}`：格子空着；我不在榜上，或我在榜上且目标名次更靠前（数字更小）；我原来的格子让出来。

**挑战** `POST /tower/rank/challenge {rank}`：
- 格子有人、不是我；我不在榜上或我的名次在它后面
- 目标名次 ≤ `rankTop`(8) 时：我必须在榜上，且 我的名次 − 目标名次 ≤ `rankGap`(3)
- 今日赛厨榜挑战 < `rankDaily`(10)；体力 `duelStrength`(5)
- 我进攻、对方防守
- 胜：我到目标名次，对方到我原来的名次（我原来不在榜上则对方下榜）；声望 +2；按裁定 7 发随机奖励
- 负：声望 +1
- 今日赛厨榜次数、今日切磋总次数各 +1；事件 `tower.rank`（活跃"与好友赛厨"）

**周结算**：每周一 00:01 结算上一周：第 1、2、3 名打开 202、203、204，第 4~8 名 205，第 9~15 名 206（每家店一个系统操作）；发新闻 `tower.rank.week`（前三名）。

### 3.4 好友切磋 `POST /tower/duel {restId}`

- `runPairOp`（要求好友，双方已验证邮箱由它检查）；对方不是 NPC 店；我的声望 ≥ 0；我 ≥ 1 星；今天对该好友 < `duelPerFriend`(10)
- 体力 5；我进攻、对方防守
- 声望：裁定 8 的三档；再按裁定 7 的上限：切磋总次数（本次之前）≥ 50 且不是以弱胜强 → 正声望为 0；≥ 20 且不是以弱胜强 → 正声望改为 2；负声望照扣
- 奖励：胜利且（切磋总次数 < 50）时按裁定 7 发随机奖励
- 对该好友次数、切磋总次数各 +1；事件 `tower.friendDuel`（支线 110、活跃"与好友赛厨"）
- 对方不受影响

### 3.5 声望商店

- `GET /tower/shop`：本周在售商品：`weekGroup = 0` 且没有 `require` 的，加上 `weekGroup = ISO 周数 % 4 + 1` 的雕像；每件带价格、每周限兑、本周已兑、是否已拥有（稀有品）
- `POST /tower/shop/buy {goodsId, num}`：本周在售；稀有品 num = 1 且没有拥有；本周已兑 + num ≤ 每周限兑；声望 ≥ 单价 × num → 扣声望、发物品；稀有品发新闻 `tower.shop.rare`
- 每周限兑记在每日计数表里，日期用本周一

## 4. 数据

### 4.1 迁移 0012

```
tower_state
  rest_id int PK FK restaurant ON DELETE CASCADE
  best_floor smallint NOT NULL DEFAULT 0 CHECK (best_floor BETWEEN 0 AND 10)

tower_watchman_mc
  shard_id int, floor smallint, mc_id int NOT NULL, price int NOT NULL CHECK (price >= 0),
  day date NOT NULL（抽菜的游戏日）
  PK (shard_id, floor)

tower_rank
  shard_id int, week date（本周一）, rank smallint CHECK (rank BETWEEN 1 AND 15),
  rest_id int NOT NULL FK restaurant ON DELETE CASCADE
  PK (shard_id, week, rank)，UNIQUE (shard_id, week, rest_id)
```

**每日计数键**（`daily_counter`）：`tower.done`（正式挑战）、`tower.ticket`（用掉的挑战券）、`tower.floor:<层>`、`tower.rank`（赛厨榜挑战）、`tower.spar`（切磋总次数）、`tower.duel:<好友店 id>`；声望商店 `renownShop:<goodsId>`（日期 = 本周一）。

### 4.2 配置

- `TowerFloor { floor, name, title, minLevel, maxTimes, mc: boolean, note, power, attrs: { cook, cutting, fire, season, creatives, luck } }`、`ConfigBundle.towerFloors`（来自 `dataset/tower_floors`，构建时按裁定 1 算 attrs）

| 层 | 守塔人 | 称号 | 最低等级 | 每日 | 特色菜 | 厨艺/刀工/火候 | 调味/创意 | 幸运 | 厨力 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 见习模范餐厅 | 见习守护者 | 1 | 10 | 否 | 7 | 4 | 1 | 29 |
| 2 | 初级模范餐厅 | 初级守护者 | 11 | 10 | 否 | 22 | 13 | 8 | 96 |
| 3 | 宋嫂饭店 | 中级守护者 | 21 | 10 | 否 | 49 | 27 | 21 | 211 |
| 4 | 灵魂之沙利叶 | 高级守护者 | 31 | 10 | 是 | 77 | 43 | 34 | 334 |
| 5 | 沉默的度玛 | 育才长老 | 41 | 5 | 是 | 117 | 65 | 54 | 508 |
| 6 | 裁决之巴贝雷特 | 裁决长老 | 51 | 3 | 是 | 163 | 90 | 76 | 707 |
| 7 | 意志之古尔图格 | 厨塔供奉 | 61 | 2 | 是 | 221 | 123 | 105 | 961 |
| 8 | 神谕之阿卡玛 | 厨塔塔主 | 71 | 1 | 是 | 282 | 156 | 134 | 1225 |
| 9 | 阿尼玛 | 上届食神 | 81 | 1 | 是 | 396 | 219 | 189 | 1720 |
| 10 | 彭祖 | 食神 | 91 | 2 | 是 | 599 | 331 | 288 | 2603 |

- `RenownShopItem { goodsId, renown, rare, weeklyLimit, weekGroup, require: string | null }`、`ConfigBundle.renownShop`（从 `extra` 挪成正式字段）
- `tuning.tower`：

```json
{
  "dailyBase": 5, "nightFloor": 3, "openHour": 6,
  "testStrength": 1, "strengthPerFloor": 1, "strengthBase": 4,
  "winRenownBase": 6, "loseRenown": 6,
  "rankSize": 15, "rankTop": 8, "rankGap": 3, "rankDaily": 10,
  "rankWinRenown": 2, "rankLoseRenown": 1,
  "rankGifts": [[1, 202], [2, 203], [3, 204], [8, 205], [15, 206]],
  "duelStrength": 5, "duelPerFriend": 10,
  "duelWeakRate": 0.7, "duelStrongRate": 1.15,
  "duelRenown": { "weak": [0, -3], "strong": [6, -2], "normal": [5, -2] },
  "sparFullAt": 20, "sparFullRenown": 2, "sparMaxAt": 50,
  "sparAwards": [[10, 2, 4], [20, 2, 2], [999999, 1, 2]], "sparEquipFlag": 3,
  "watchmanCook": { "hour": 5, "minute": 58, "priceSpread": 0.3 }
}
```

（`rankGifts`：名次 ≤ 第一个数时开第二个礼包；`sparAwards`：本次之前的切磋总次数 < 第一个数时，奖励次数、奖励等级取后两个）

- `action_map`：加 `tower.rank` → 活跃"与好友赛厨"（`tower.` → `tower` 已有）
- 道具 id：`GOODS.towerTicket`(136) 新增；礼包 202~206 写在 tuning
- 功能 `tower` 加入 `IMPLEMENTED_FEATURES`
- 校验：守塔人 10 层连续、attrSum > 0；声望商店物品存在；礼包存在

## 5. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/tower` | 10 层（守塔人名字、称号、台词、最低等级、厨力、当天特色菜和每份价值、是否解锁、对他今天还剩几次）、我的进攻厨力、今日剩余次数、挑战券持有、打赢过的最高层、体力、是否夜间 |
| POST | `/tower/challenge` | `{floor, test}` → `DuelResultDto` |
| GET | `/tower/rank` | 本周 15 格（店 id、店名、等级；空格为 null）、我的名次、今日赛厨榜剩余次数、今日切磋总次数、本周结束时间 |
| POST | `/tower/rank/occupy` | `{rank}` → `{ rank }` |
| POST | `/tower/rank/challenge` | `{rank}` → `DuelResultDto`（多带 `rank`：挑战后我的名次） |
| GET | `/tower/duel/:restId` | `{ left, spar }`：和他今天还能切磋几次、今日切磋总次数 |
| POST | `/tower/duel` | `{restId}` → `DuelResultDto` |
| GET | `/tower/shop` | 声望、本周商品 |
| POST | `/tower/shop/buy` | `{goodsId, num}` → `{ renown }` |

`DuelResultDto = { win, me: DuelSideDto, them: DuelSideDto, renown, awards: BarAwardDto[], rank? }`，`DuelSideDto = { name, power, scores: [色, 香, 味, 形, 养], sum }`。写操作走 `runOp`（好友切磋 `runPairOp`），功能名 `tower`。DTO 放 `packages/shared/src/schemas/tower.ts`。

## 6. 前端

厨塔页 `/tower`，标签（记住上次选的）：

- **厨塔**：10 层列表（守塔人、称号、最低等级、厨力、当天的菜、剩余次数）；每层"试打""挑战"按钮，不可用时写明原因（未解锁、夜间、次数用完、体力不够）；顶部是我的厨力、今日剩余次数、挑战券
- **赛厨榜**：15 格；空格有"占位"，别人的格子有"挑战"（不合规则时灰掉并写明原因）；我的名次、今日剩余次数、本周结束时间
- **声望商店**：我的声望；每件商品价格、本周已兑 / 限兑、数量输入、兑换；雕像已拥有时写明

对决结果用一个共用组件：双方名字、厨力，五项并排（赢的一项高亮），胜负，声望变化，奖励。

好友店页面加"切磋"按钮（写明今天还能切磋几次），结果用同一个组件。"更多"页加"厨塔"入口。

## 7. 错误处理

不新增错误码。所有检查在扣除前完成，失败整体回滚。

| 情况 | 错误码 |
|---|---|
| 层没解锁 | `INVALID_STATE` reason `floor_locked`（params `minLevel`、`needFloor`） |
| 夜间 | `INVALID_STATE` reason `tower_night`（params `openHour`） |
| 今日厨塔次数用完 | `LIMIT_REACHED` what `tower` |
| 守塔人今天累了 | `LIMIT_REACHED` what `watchman` |
| 赛厨榜：格子已被占 / 格子空着 / 不能往后占 / 名次规则不允许 | `INVALID_STATE` reason `rank_taken` / `rank_empty` / `rank_not_better` / `rank_gap`（params `need`） |
| 赛厨榜今日次数用完 | `LIMIT_REACHED` what `rank` |
| 好友切磋：对方是 NPC / 同一好友今天满了 | `INVALID_STATE` reason `npc` / `LIMIT_REACHED` what `duel` |
| 声望为负、不到 1 星 | `REQUIREMENT_NOT_MET` reason `renown` / `star` |
| 体力、声望不够 | `NOT_ENOUGH` strength / renown |
| 商品本周不卖 / 已拥有 / 超过每周限兑 | `INVALID_STATE` reason `not_on_sale` / `ALREADY_DONE` what `owned` / `LIMIT_REACHED` what `weekly` |
| 参数越界 | `VALIDATION_FAILED` |
| 功能关闭 | `FEATURE_DISABLED` |

## 8. 测试

- **纯规则**（固定随机数）：五项评分和波动（正负短路、幸运率、截 0、1 位小数）；胜负（4 项、3 项看总和）；守塔人属性校准；切磋奖励档位；好友声望三档和 20 / 50 次上限、以弱胜强例外；赛厨榜名次规则（前 8 名、名次差、往前占）；声望商店本周在售
- **服务**（真实数据库）：
  - 厨塔：解锁（等级、下一层）、夜间、每日总次数和挑战券、守塔人次数、试打、胜负声望、奖励次数和等级、最高层
  - 赛厨榜：占位、挑战、换位和下榜、前 8 名规则、每日次数、周结算发礼包（前三名得勋章）
  - 好友切磋：条件、同一好友次数、声望三档和上限
  - 声望商店：轮换、限兑、雕像只能 1 个、声望不够
  - 守塔人换菜：4 层以上有菜、等级范围、每份价值范围；"养"用到它
  - 主线第 27 步、支线 110、活跃"厨塔挑战""与好友赛厨"；功能关闭报 `FEATURE_DISABLED`
- **迁移** 0012：主键、唯一、CHECK、级联
- **前端**：三个标签；按钮灰掉的原因；对决结果组件；好友店"切磋"按钮
- **端到端**：厨塔试打 → 挑战 1 层 → 赛厨榜占位 → 声望商店兑换美味券

## 9. 文档

- `docs/rules/收益与加成.md`：厨力对决、厨塔、赛厨榜、好友切磋、声望商店
- `docs/deploy.md`：迁移 0012、功能开关 `tower`、`tuning.tower`、两个新定时任务
