# 子项目 4B-2「菜园」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-30-subproject4b1-temple-design.md`（4B-1，第 0 节是 4B 的拆分）
- 游戏规则依据：`../analysis/spec/` 的 08 全章、09 §9.3（配方鉴定）、20 §20.7（动作收益、土地经验）、§20.8（种子、配方、种子兑换），以及 `backend_src` 原版源码 `YardTranServiceImpl`、`TaskYardConfig.plantTask`、`TempleTranServiceImpl.appraiseMysteriousFormula`
- 分支：`feat/yard`，基于 `main`

## 1. 目标与范围

**完成标志**：玩家能开垦土地、买或换到种子、播种、浇水施肥除虫除草直到收获，收获进菜篮再存进橱柜；能去好友菜园帮忙和偷菜；作物按自然事件长虫、长草、干涸、枯萎，下雨自动浇水；能鉴定配方、学习配方、合成食材、分解碎片换种子。主线第 28、29 步和配方支线开放。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 土地 | 开垦（最多 9 块）、土地经验和等级、产量加成 |
| 作物 | 播种、浇水（含干涸时浇水）、施肥、除虫、除草、铲除、收获 |
| 好友 | 浇水、除虫、除草、偷菜（声望、70% 门槛、每人每株一次、边牧） |
| 自然事件 | 每 20 分钟：枯萎、减产、长草、干涸、长虫、下雨自动进阶 |
| 菜篮 | 收获进菜篮，存进橱柜 |
| 配方 | 鉴定（厨神玉玺 + 玄奥配方）、学习、分解碎片、合成 |
| 种子 | 种子商店（新增，用户确认）、配方精华兑换 |
| 展示 | 菜园页四个标签（菜园、菜篮、配方、种子），好友菜园视图 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 大胃哥每日赠送种子 | 4E |
| 鱼塘 | 5 |
| 菜园相关排行 | 4E |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 种子来源太少，菜园开放后几乎种不了 | 新增**种子商店**：银币买种子，单价 = 种子数据里的 `coin`（食材单价 × 产量 / 20）× `tuning.yard.seedPriceRate`（默认 1）；不卖 7 级神秘种子；`tuning.yard.seedShop` 可关闭（用户确认） |
| 2 | 原版土地升级误用餐厅经验曲线 | 用 `(等级−1)² × 2000 + 1000`，最高 `tuning.yard.landMaxLevel`（10），每级产量 +8%（规格书 20.7） |
| 3 | 规格书写"下雨提升 3 倍长草"，代码相反 | 照代码：不下雨时长草概率 ×3 |
| 4 | 偷菜 70% 门槛的基数 | 照原版：用**种子原产量**（`seed.harvestNum`，不含土地加成）× 0.7 比较剩余产量 |
| 5 | 种子兑换：原版持有 0 时能白换 | 持有不足一律不能换（规格书 20.8） |
| 6 | 作物收获 / 铲除后 | 删除作物行，土地空出；偷菜记录随作物级联删除 |
| 7 | 自然事件的锁 | 定时任务每株作物一个短事务，只锁作物行（`FOR UPDATE`）；玩家操作先锁店再锁作物行；两边按作物行串行，不会死锁 |
| 8 | 配方鉴定次数 | 原版一次一个；这里允许 1~99 次批量（与 4A 鉴定一致），同一碎片合并事件 |
| 9 | 配方鉴定道具 | 值里有 `formulaRate` 的道具（目前只有厨神玉玺 164）+ 玄奥配方 464 |
| 10 | 收获的额外数量 | 加成汇总里的 `reapAddNum`（集盆栽 6 件、集名画 10 件各 +1），自己收获和偷菜都加 |
| 11 | 夜间自然事件 | 22 点到次日 6 点（即小时 < 7 或 ≥ 22）只在 xx:27 运行；判定"下雨"用运行时刻的当前天气 |
| 12 | 功能关闭（区服 `yard` = false） | 菜园接口返回功能关闭；自然事件任务跳过该区服（作物停止变化）；主线第 28、29 步按已有规则跳过 |

## 3. 规则明细

`luckRate` 用 `opLuck(op).rate`；加成键从 `opAgg` 取；天气从 `world.ensure(...).weather` 取。随机数一律走注入的 rng。

### 3.1 土地（规格书 08 §8.1）

- `POST /yard/land/expand`：已有 < 9 块；第 n 块（n = 已有 + 1）花 `landBaseCoin × 2ⁿ`（50,000 × 2ⁿ）银币；新土地 1 级、0 经验
- 土地经验：只有**在自己地里**的操作才加，数值取 `income_action` 的 `landExp`（播种 10、浇水 5、除草 5、除虫 5、收获 20、铲除 2、施肥 5）；升级所需 `(等级−1)² × 2000 + 1000`，逐级扣除，最高 10 级
- 产量加成：`(等级 − 1) × 8`（%）
- 任务状态键 `yard.lands` = 已开垦块数

### 3.2 作物（规格书 08 §8.3，一块地一株）

阶段：1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期。

- **播种** `POST /yard/plant {landNo, seedId}`：土地已开垦且空；有种子 → 扣 1 颗（`rest_seed`）；`harvest_num = harvest_max = ⌊种子产量 × (100 + 产量加成) / 100⌋`；stage 1，`stage_at = now`；时长列从种子复制
- **能否浇水**（现算）：stage ∈ 1..3 且 `stage_at + (本阶段时长 − feed_min) 分钟 ≤ now`
- **浇水** `POST /yard/water {plantId}`（自己或好友）：
  - `dry > 0`：清除干涸；本阶段时长 −5 分钟，但不低于种子原时长的 50%（到下限就不减）
  - 否则：必须能浇水、`worm == 0`、`grass == 0` → stage + 1，`stage_at = now`，`feed_min = 0`；stage 3 → 4 时进入收获期
- **施肥** `POST /yard/feed {plantId, goodsId}`（自己）：道具 devicetype 80，value.plantTime 分钟；stage ∈ 1..3；`本阶段时长 − feed_min − plantTime > 0`；扣 1 个肥料，`feed_min += plantTime`
- **除虫** `POST /yard/deworm {plantId}`、**除草** `POST /yard/weed {plantId}`（自己或好友）：worm > 0 时 −1；grass > 0 时清零
- **铲除** `POST /yard/remove {plantId}`（自己，任何阶段）：30% 概率返还 1 颗该种子；删除作物
- **收获** `POST /yard/reap {plantId}`（自己）：stage 4、无虫、无草；`harvest_num + reapAddNum` 个进菜篮；删除作物；活跃 `yard.harvest`
- **偷菜** 同一接口，对象是好友的作物（裁定 4）：
  - stage 4、无虫、无草；我的声望 ≥1；这株我没偷过；剩余产量 ≥ 种子原产量 × 0.7
  - 扣 1 声望；偷 `7 级 ? 1 : rand[1,2]` 个（不超过剩余），加 `reapAddNum` 进**我的菜篮**；对方 `harvest_num` 减去偷走的（不含 reapAddNum）
  - 对方有有效的边牧(339)：`rand < reapPunishRate(0.25)` → 从我的橱柜随机拿 1 个食材（数量 > 0、未锁定）给对方
  - 写 `yard_steal`；对方好友动态 `yard.stolen`；活跃 `yard.steal`
- **每次操作的收益**：扣 1 体力（不够报错）；`rate = 餐厅等级 × 2 × (自己的地 ? 2 : 1) + 1`；经验 = `⌊rate × income.exp⌋`（收获 / 偷菜再加食材等级），银币 = `⌊rate × income.coin⌋`；动作 id：50 播种、51 浇水、52 除草、53 除虫、54 收获 / 偷菜、55 铲除、56 施肥
- 好友操作（浇水、除虫、除草、偷菜）要求对方是好友；对方好友动态记 `yard.helped`（浇水、除虫、除草）或 `yard.stolen`
- 活跃计数：`yard.plant`、`yard.water`、`yard.weed`、`yard.deworm`、`yard.harvest`、`yard.steal`

### 3.3 自然事件（规格书 08 §8.4、源码 `plantTask`，裁定 3、7、11）

- `PeriodicJob { name: 'yard-events', feature: 'yard' }`；周期键为最近一个已到的 `HH:07 / HH:27 / HH:47`（形如 `2026-09-30@13:27`）；小时 < 7 或 ≥ 22 时只取 `:27`
- 对该区服 stage ∈ 1..4 的每株作物（短事务，`FOR UPDATE`），raining = 当前天气 type == 2：
  1. stage 4 且 `stage_at + harvest 分钟 < now` → stage 5（枯叶），dry = 0
  2. (worm > 0 且 rand < 0.2) 或 rand < 0.03 × grass → harvest_num −1；为 0 → stage 5
  3. 不下雨、stage < 5、dry ≥ 100 → stage 5，dry = 0
  4. stage ∈ 1..4 时：
     - rand < 0.008 × (raining ? 1 : 3) → grass + 1
     - dry > 0 且 rand < 0.1 → 下雨：dry = 0；否则 dry += 1 + (grass > 0 ? 1 : 0)
     - 不下雨、dry == 0、rand < 0.002 + (grass > 0 ? 0.008 : 0) → dry = 1
     - worm == 0 且 rand < 0.003 → worm = 1
  5. 下雨、stage < 4、无虫、无草、能浇水 → stage + 1，`stage_at = now`，`feed_min = 0`
- 所有概率在 `tuning.yard.events`；每个区服结果写进任务统计（处理了几株、变了几株）

### 3.4 菜篮

- `yard_basket (rest_id, foods_id, num)`；收获和偷菜加，合成扣主料
- `POST /yard/basket/store {foodsId, num}`：菜篮 ≥ num；调用 `addFoods` 存进橱柜（格子满时进冰箱，冰箱满时丢弃的部分照现有规则记日志）；菜篮扣 num
- 流水 kind `'basket'`（id = 食材 id）；前端显示"菜篮·xx"

### 3.5 配方（规格书 08 §8.5、09 §9.3，裁定 8、9）

- 数据：`foods_formula` 56 条 `{id, name, mainFoodsId, subFoodsId, addFoodsId, resFoodsId, odds}` 进配置包正式字段
- `rest_formula (rest_id, formula_id, main_num, sub_num, learned)`
- **鉴定** `POST /yard/formula/appraise {toolId, times}`（1~99）：`toolId` 的 value 有 `formulaRate`；每次扣 toolId 1 + 玄奥配方 1
  - 成功率 = `formulaRate + luckRate/10 + 星月密卷.formulaRate`（持有有效的星月密卷才加，目前 0.1）
  - 成功：按 odds 抽一条配方；`rand < 0.25` → 主碎片，否则辅碎片；辅碎片且有星月密卷(465) 且（已有该配方辅碎片或已学会）→ `rand < secToMain(0.2)` 改为主碎片
  - 活跃 `formula.appraise`（按次数）
- **学习** `POST /yard/formula/learn {formulaId}`：未学；main_num ≥1 且 sub_num ≥1 → 各 −1，learned = true
- **分解** `POST /yard/formula/decompose {formulaId, part: 'main'|'sub', num}`：碎片 ≥ num → 扣；配方精华(470) +`num × (main ? 3 : 1)`
- **合成** `POST /yard/formula/compose {formulaId, num}`（1~99）：已学；体力 ≥ 3 × num；菜篮主料 ≥ num；橱柜辅料、添加料各 ≥ num
  - 扣体力、菜篮主料、橱柜辅料和添加料
  - 结果数 = num + Σ(每份：rand < 0.1 → +1；rand < luckRate/5 → +1；有星神之泪 且 rand < formulaFoodsRate(0.25) → +1)
  - 结果进橱柜（`addFoods`）；活跃 `formula.compose`

### 3.6 种子（裁定 1、5）

- `GET /yard/seeds`：库存（`rest_seed`）、商店（非 7 级种子、单价、开关）、兑换表（每项种子数、精华数）、配方精华持有数
- **买种子** `POST /yard/seed/buy {seedId, num}`（1~99）：商店开着；种子非 7 级；花 `单价 × num` 银币
- **兑换** `POST /yard/seed/exchange {seedId, times}`（1~99）：精华 ≥ `remnantnum × times` → 扣精华，种子 + `seednum × times`

## 4. 数据

### 4.1 迁移 0010

```
yard_land
  id int identity PK, rest_id int FK restaurant ON DELETE CASCADE
  no smallint NOT NULL, level smallint NOT NULL DEFAULT 1, exp int NOT NULL DEFAULT 0
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (rest_id, no)

yard_plant
  id int identity PK
  rest_id int FK restaurant ON DELETE CASCADE, shard_id int NOT NULL
  land_id int NOT NULL UNIQUE FK yard_land ON DELETE CASCADE
  seed_id int NOT NULL, foods_id int NOT NULL
  stage smallint NOT NULL, stage_at timestamptz NOT NULL, feed_min int NOT NULL DEFAULT 0
  infancy int NOT NULL, maturity int NOT NULL, autumn int NOT NULL, harvest int NOT NULL
  harvest_num int NOT NULL, harvest_max int NOT NULL
  worm smallint NOT NULL DEFAULT 0, grass smallint NOT NULL DEFAULT 0, dry smallint NOT NULL DEFAULT 0
  planted_at timestamptz NOT NULL DEFAULT now()
  INDEX (rest_id); INDEX (shard_id, stage)

yard_steal
  plant_id int FK yard_plant ON DELETE CASCADE, rest_id int FK restaurant ON DELETE CASCADE
  created_at timestamptz NOT NULL DEFAULT now()
  PK (plant_id, rest_id)

yard_basket
  rest_id int FK restaurant ON DELETE CASCADE, foods_id int, num int NOT NULL CHECK (num >= 0)
  PK (rest_id, foods_id)

rest_formula
  rest_id int FK restaurant ON DELETE CASCADE, formula_id int
  main_num int NOT NULL DEFAULT 0 CHECK (main_num >= 0), sub_num int NOT NULL DEFAULT 0 CHECK (sub_num >= 0)
  learned boolean NOT NULL DEFAULT false
  PK (rest_id, formula_id)
```

### 4.2 配置

- `Formula` 类型、`ConfigBundle.formulas`、`GameConfig.formulas`（Map）、`formulaPool`（按 odds）
- `SeedExchange { seedId, seedNum, essence }`、`ConfigBundle.seedExchange`
- `IncomeAction { id, name, coin, exp, landExp }`、`ConfigBundle.incomeActions`、`GameConfig.incomeAction(id)`
- `formulas`、`seedExchange` 从 `extra` 挪出
- 肥料：devicetype 80 的道具，value.plantTime；运行时 `GameConfig.fertilizers`（Map 道具 id → 分钟）
- `tuning.yard`：

```json
{
  "maxLands": 9, "landBaseCoin": 50000, "landMaxLevel": 10, "yieldPerLevel": 8,
  "dryWaterSub": 5, "dryWaterMinRate": 0.5, "removeSeedRate": 0.3,
  "stealKeepRate": 0.7, "stealMax": 2, "reapPunishRate": 0.25,
  "seedShop": true, "seedPriceRate": 1,
  "formulaMainRate": 0.25, "formulaAppraiseRatePerLuck": 0.1,
  "composeStrength": 3, "composeCritRate": 0.1,
  "essenceMain": 3, "essenceSub": 1,
  "events": {
    "minutes": [7, 27, 47], "nightMinute": 27, "dayFrom": 7, "dayTo": 22,
    "wormEatRate": 0.2, "grassEatRate": 0.03, "dryDeath": 100,
    "grassRate": 0.008, "grassDryFactor": 3, "dryAddRate": 0.1,
    "dryStartRate": 0.002, "dryStartGrassRate": 0.008, "wormRate": 0.003
  }
}
```

- `GOODS` 增加：`formulaScroll 464`（玄奥配方）、`moonScroll 465`（星月密卷）、`starTear 469`（星神之泪）、`formulaEssence 470`（配方精华；`essence` 已是厨具精华）、`borderCollie 339`
- 功能 `yard` 加入 `IMPLEMENTED_FEATURES`；`action_map` 已有 `yard.`、`formula.` → `yard`
- 流水 / 事件 kind 增加 `'basket'`

## 5. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/yard` | 我的菜园：土地（no、level、exp、下一级所需、产量加成）、每块地的作物（阶段、能否浇水、下一阶段 / 枯萎还要几分钟、虫草干涸、剩余 / 原产量）、下一块开垦价格、体力、声望 |
| GET | `/yard/friend/:restId` | 好友菜园（只读字段 + 每株我能做什么、我偷过没有） |
| POST | `/yard/land/expand` | 开垦 |
| POST | `/yard/plant`、`/water`、`/feed`、`/weed`、`/deworm`、`/remove`、`/reap` | 作物操作（water / weed / deworm / reap 可以对好友） |
| GET / POST | `/yard/basket`、`/yard/basket/store` | 菜篮 |
| GET | `/yard/formulas` | 配方：碎片、已学、每条配方三种原料的持有（菜篮 / 橱柜）、最多能合成几份；鉴定道具持有 |
| POST | `/yard/formula/appraise`、`/learn`、`/decompose`、`/compose` | 配方 |
| GET / POST | `/yard/seeds`、`/yard/seed/buy`、`/yard/seed/exchange` | 种子 |

DTO 放 `packages/shared/src/schemas/yard.ts`。

## 6. 前端

- 菜园页 `/yard`，标签（记住上次选的）：
  - **菜园**：3×3 格子；未开垦的格子显示开垦价格（只有下一块可点）；空地可选种子播种；有作物时显示名称、阶段、剩余时间、🐛/🌿/干涸标记、产量，以及浇水 / 施肥 / 除虫 / 除草 / 收获 / 铲除按钮（灰掉时写明原因）；土地等级和经验
  - **菜篮**：列表，数量输入（上限 = 持有），"存进橱柜"
  - **配方**：鉴定（道具、次数上限 = 两种道具持有与 99 取小）；配方列表（主 / 辅碎片数、学习、分解）；已学配方的合成（三种原料持有、份数上限、所需体力）
  - **种子**：库存；商店（单价、数量、购买）；兑换（精华持有、兑换）
- 好友页加"去它的菜园"按钮 → `/yard?friend=<restId>`，只显示好友视图：可浇水 / 除虫 / 除草 / 偷菜，偷过的显示"已偷"
- "更多"页加"菜园"入口

## 7. 错误处理

不新增错误码。所有检查在扣除前完成，失败整体回滚。

| 情况 | 错误码 |
|---|---|
| 土地满 9 块 | `LIMIT_REACHED lands` |
| 土地没开垦 / 已有作物 / 作物不存在或不是自己的 | `INVALID_STATE no_land / land_busy / no_plant` |
| 不需要浇水 / 先除虫 / 先除草 / 不在收获期 / 已枯萎 / 没虫 / 没草 / 肥料不能再用 | `INVALID_STATE no_water / has_worm / has_grass / not_ripe / withered / no_worm / no_grass / feed_useless` |
| 偷菜：剩得不多 / 已偷过 / 声望不够 | `INVALID_STATE steal_left`、`ALREADY_DONE steal`、`REQUIREMENT_NOT_MET renown` |
| 没学配方 / 已学 / 碎片不够 | `INVALID_STATE formula_unlearned / formula_learned`、`NOT_ENOUGH fragment` |
| 菜篮不够 | `NOT_ENOUGH basket` |
| 种子商店关闭 / 神秘种子不卖 | `INVALID_STATE seed_shop_closed / seed_not_sold` |
| 不是好友 | `NOT_FRIEND`（双店操作已有） |
| 不是肥料 / 不是配方鉴定道具 / 参数越界 | `VALIDATION_FAILED` |
| 体力 / 银币 / 道具 / 食材 / 种子 / 精华不够 | `NOT_ENOUGH`（现有函数；种子 kind `seed`） |
| 功能关闭 | `FEATURE_DISABLED` |

## 8. 测试

- **纯规则** `modules/yard/rules.test.ts`：土地升级（连升、满级）；产量加成；开地价格；能否浇水（各阶段、施肥抵扣）；干涸浇水减时长与 50% 下限；偷菜门槛和数量；动作收益 rate；自然事件每条规则（固定随机数，含下雨 / 不下雨分支和自动进阶）；周期键（白天三个时点、夜里只有 27 分）；合成额外产出；配方鉴定的主辅碎片和星月密卷转换
- **服务**（真实数据库）：
  - 开垦费用递增、满 9 块、任务状态 `yard.lands`
  - 播种 → 推进时钟 → 浇水三次 → 收获进菜篮 → 存进橱柜；土地经验和升级；产量加成
  - 干涸浇水；施肥；铲除返还种子（固定随机）
  - 好友浇水 / 除虫 / 除草：收益 rate 不 ×2、不加土地经验、对方动态
  - 偷菜：声望扣 1、70% 门槛、每人每株一次、7 级只偷 1、边牧惩罚、非好友报错
  - 配方：鉴定（成功 / 失败、星月密卷转换）、学习、分解、合成（额外产出、原料不够时不扣）
  - 种子商店（7 级不卖、关闭后报错）、种子兑换（精华不足不能换）
  - 自然事件任务：固定随机下的长草 / 长虫 / 干涸 / 枯萎 / 下雨自动进阶；同周期只跑一次；夜里非 27 分不跑；功能关闭的区服跳过
  - 主线第 28、29 步、配方支线开放；功能关闭报 `FEATURE_DISABLED`
- **迁移** 0010：约束、唯一键（每块地一株）、级联
- **前端**：菜园各标签、好友视图
- **E2E**：开地 → 买种子 → 播种 → 推进时间 → 浇水到收获期 → 收获 → 存进橱柜

## 9. 文档

- `docs/rules/收益与加成.md`：菜园动作收益、土地、自然事件、配方
- `docs/deploy.md`：迁移 0010、功能开关 `yard`、定时任务 `yard-events`
