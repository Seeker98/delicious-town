# 子项目 4A「特色菜与教室」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-29-rewrite-architecture-design.md`（架构文档，第 10 节子项目 4）、`2026-09-29-subproject2a-business-loop-design.md`（2A 设计，结算里的特色菜空位）、`2026-09-30-subproject3-friends-design.md`（子项目 3，品尝延后到这里）
- 游戏规则依据：`../analysis/spec/` 的 01 §1.7、04 全章、13 §13.6、16（每日 9 点冠军）、20 §20.4（下文简称"规格书 xx"），以及 `backend_src` 原版源码（`CookbooksTranServiceImpl`、`TempleTranServiceImpl.appraiseMysteriousCookbooks`、`TaskRestConfig.allocateCookedMysteriousCookbooks`）
- 分支：`feat/mysterious`，基于 `main`（e20b1a2）

## 0. 子项目 4 的拆分

子项目 4 按依赖拆成 5 块，各自走"设计 → 计划 → 实现"：

| 块 | 内容 | 依赖 |
|---|---|---|
| **4A 特色菜与教室**（本文） | 鉴定神秘食谱、残卷、学习、烹制开售、倒掉、好友品尝、教室、昨日冠军 | – |
| 4B 神殿与菜园 | 守护兽、探险、试炼、克拉肯与触手商店、配方鉴定；土地、作物、自然事件、配方合成、种子兑换 | 4A |
| 4C 酒吧与厨塔 | 划拳、猜酒杯、转数字、老虎机、蟹币；厨塔、赛厨榜、好友切磋、声望商店 | 4A（厨力"养"用特色菜价值） |
| 4D 外卖 | 开通、公共单 / 私人单、配送结算、骑手 | 4C（声望） |
| 4E 协会与小镇 | 雷神锤、NPC 对话、嘻哈男孩、星愿祝福、镇长兑换、广播、论坛、排行与排行奖励、摇蟹老板 | 前几块 |

## 1. 目标与范围

**完成标志**：玩家能用神秘食谱鉴定出残卷，用残卷学会特色菜，烹制开售，结算按份数卖出特色菜并增加收益；好友能来品尝；能在教室开课、学习、偷学；每天 9 点发昨日特色菜冠军奖励。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 鉴定 | 神秘食谱(162) + 鉴定道具（value 含 `mysterious` 的道具：163 美味印章、164 厨神玉玺、165 蟹黄堡秘方、176 海霸堡秘方），星神之书(323) 重抽，批量 |
| 残卷 | 出售、分解为残卷碎片(181~186)、3 张学会 |
| 烹制 | 批数、幸运饼干、烹饪魔书(346)、品级、份数、每份价值、熟练度、试炼经验、海绵宝宝(304) |
| 在售 | 结算按顾客消耗份数（规格书 01 §1.7，结算纯函数已实现）；倒掉 |
| 品尝 | 好友 / 非好友品尝，体力收益，神秘食谱掉落，店主礼券 |
| 教室 | 开课（教师证）、学习、偷学（失败遗忘食谱）、强制结束 |
| 定时 | 每天 9:00 昨日特色菜冠军 → 蟹黄堡秘方(165) |
| 展示 | 特色菜页、神殿页（只有鉴定）、教室页、好友详情页品尝卡片 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 仙珍 / 天馔的品级上限扩展和价值加成 | 5 |
| 试炼（试炼价值 / 试炼经验的提升）、克拉肯投喂与触手商店 | 4B（本次 `rest_mc` 存这两列，烹制公式已经用上） |
| 守塔 NPC 每日烹制特色菜 | 4C |
| 特色菜排行榜 | 4E |
| 改名处工作证的 `DTSealRate` | 来源未做，本次按 0 计 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | `mysterious_cookbooks.json` 食材里的 `num`（如"[4]海参"）| 这是**食材等级**，不是数量（海参就是 4 级食材）。配置加载时丢弃，每批每种食材消耗 1 个（规格书 04 §4.1） |
| 2 | 批数：原版校验写错没限制 | 严格限制为 `tuning.mysterious.cookNums`（默认 [1,5,10,15,25,50]） |
| 3 | 残卷存在哪 | 独立表 `mc_remnant`，不占仓库格子；增减写流水，kind `'remnant'` |
| 4 | 当前在售特色菜怎么给结算 | `restaurant.mc_cook_id` 指向 `mc_cook` 的一行；为空不多查 |
| 5 | 鉴定一次最多几次 | `times` ≤ `tuning.store.maxBatch`（99），与批量使用道具一致 |
| 6 | 教师证开课是否消耗 | 消耗 1 张（和残卷 1 张一起） |
| 7 | 学费何时扣 | 尝试时就扣（原版先扣后判定），失败不退 |
| 8 | 偷学失败 | 原版：随机遗忘 `等级×3+1` 道已学普通食谱（品级清零）。2026-10-06 用户改定（问题记录 424）：随机 `等级×2+1` 道各降 1 品（`forgetPerLevel`、`forgetGrades`），降到 0 就是忘了；课程等级 ≥4 时另有 `等级×5%` 概率遗忘一道更低级的特色菜。**正在售卖的特色菜不会被选中**；可遗忘的不足时有几道忘几道 |
| 9 | 被遗忘的普通食谱 | 品级清零，食谱计数（`cookbook_counts`）按"从原品级降到 0"重算，和学习的反向一致。问题记录 424 起改成降品级：没降到 0 的只在各品级计数间挪一格（学会数、街道数不变），降到 0 的按遗忘算（`applyDowngrade`） |
| 10 | 课程过期 | 读时判断（`ends_at < now` 视为结束），不需要定时任务（规格书 16 注） |
| 11 | 品尝非好友 | 照原版允许，消耗 1 份、体力减半 |
| 12 | 冠军"昨日" | 按区服时区的自然日，以批次 `created_at` 归属日期；价值 = `total_num × price`；并列都给 |
| 13 | 0 星餐厅 | 不能鉴定、烹制、开课；结算里 0 星也照常卖（能烹制的一定 ≥1 星，降星不存在） |
| 14 | 功能关闭（区服 `mysterious` = false） | 所有特色菜接口返回功能关闭；正在售卖的照常在结算里卖完；冠军任务跳过该区服；`mc.`、`lesson.` 任务按已有规则跳过 |
| 15 | 神灯(389) 对学习 | 学习失败时 50% 概率改判成功（规格书 04 §4.7） |
| 16 | 规格书 04 写"lastRate ≥ 1 也直接判为佳肴" | 原版 `filter(...).toList().get(0)` 按列表顺序取第一个匹配，[1, 1.25) 会先匹配到极品 / 金牌 / 珍品，这条只在超出佳肴上限（≥3.0）时起作用。按区间判定即可，≥1.25 → 佳肴 |
| 17 | 幸运标记：原版比较的是未加成的 `rand` 与所得品级的上限，加成非负时永远不成立 | 改为"只用 rand 会落到更低品级"时标记幸运，前端显示"幸运"字样，不影响数值 |

## 3. 数据

### 3.1 迁移 0008

```
rest_mc
  rest_id        int  FK restaurant ON DELETE CASCADE
  mc_id          int
  curlevel       int  NOT NULL DEFAULT 1      -- 熟练度等级 1~10
  curexp         int  NOT NULL DEFAULT 0
  trial_worth    int  NOT NULL DEFAULT 0      -- 试炼价值加成 %，上限 50（4B）
  trial_exp      int  NOT NULL DEFAULT 0      -- 试炼经验加成 %，上限 150（4B）
  way            smallint NOT NULL            -- 1 残卷 / 2 课程 / 3 偷学
  master_rest_id int  NULL
  learned_at     timestamptz NOT NULL DEFAULT now()
  PK (rest_id, mc_id)

mc_remnant
  rest_id int FK restaurant ON DELETE CASCADE, mc_id int, num int NOT NULL CHECK (num >= 0)
  PK (rest_id, mc_id)

mc_cook
  id bigserial PK
  rest_id    int FK restaurant ON DELETE CASCADE
  shard_id   int NOT NULL
  mc_id      int NOT NULL
  level      smallint NOT NULL          -- 特色菜等级（结算经验用）
  grade      smallint NOT NULL          -- 品级 1~7
  cook_num   int NOT NULL
  total_num  int NOT NULL
  left_num   int NOT NULL CHECK (left_num >= 0)
  price      int NOT NULL               -- 每份价值（银币）
  luck       boolean NOT NULL DEFAULT false
  eat_count  int NOT NULL DEFAULT 0
  created_at timestamptz NOT NULL DEFAULT now()
  ended_at   timestamptz NULL
  end_reason text NULL                  -- sold / dumped / eaten
  INDEX (shard_id, created_at)

restaurant.mc_cook_id bigint NULL FK mc_cook ON DELETE SET NULL

mc_eat
  cook_id bigint FK mc_cook ON DELETE CASCADE, eater_rest_id int FK restaurant ON DELETE CASCADE
  eaten_at timestamptz NOT NULL DEFAULT now()
  PK (cook_id, eater_rest_id)
  INDEX (eater_rest_id, eaten_at)

mc_lesson
  id serial PK
  shard_id int NOT NULL, teacher_rest_id int FK restaurant ON DELETE CASCADE
  mc_id int, level smallint, max_num int, ends_at timestamptz
  learned int NOT NULL DEFAULT 0, stolen int NOT NULL DEFAULT 0
  closed_at timestamptz NULL
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (teacher_rest_id) WHERE closed_at IS NULL   -- 未关闭的课每位老师只有一门；过期的课在开新课前补写 closed_at
  INDEX (shard_id, ends_at)

mc_lesson_student
  lesson_id int FK mc_lesson ON DELETE CASCADE, rest_id int FK restaurant ON DELETE CASCADE
  type smallint NOT NULL, success boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  PK (lesson_id, rest_id)
```

### 3.2 配置

- 特色菜：按裁定 1 整理成 `{id, name, level, road, nutritive, coin, odds, appraisable, foods: number[]}`；运行时索引按 id、按等级（可鉴定的）。
- `mc_proficiency`（`designed/mc_proficiency.json`）进 bundle：`curlevel → {name, expNext}`，`-1` 满级。
- 按道具 id 的索引：
  - 鉴定道具：value 含 `mysterious` → `{mysterious: [min,max], rate, num}`
  - 教师证：devicetype 177 → `{level: number[], needStrength, maxNum, lessonHour}`
  - 残卷碎片：`180 + 等级`
- `tuning.mysterious`（全部可在控制台调）：

```json
{
  "cookNums": [1, 5, 10, 15, 25, 50],
  "baseNum": 360,
  "highLevel": 5,
  "highLevelNumRange": [0.70, 0.95],
  "gradeBounds": [0.5, 0.8, 0.95, 1.05, 1.15, 1.25],
  "gradeRatio": [[0,0.30],[0.28,0.52],[0.50,0.64],[0.62,0.76],[0.74,0.88],[0.86,1.00],[0.98,1.12]],
  "levelBonusPerLevel": 0.04,
  "roadSame": 0.02, "roadSameMax": 0.30,
  "roadOther": 0.005, "roadOtherMax": 0.10,
  "cookNumPowerDiv": 400,
  "bobRatePerNutritive": 0.0002,
  "appraiseRetryBelow": 5,
  "tasteDaily": 2,
  "tasteAwardMax": 20,
  "tasteMcRate": 0.016,
  "tasteGradeFactor": 0.2,
  "lessonLearnRate": 0.9,
  "lessonStealRate": 0.4,
  "lessonStealPerLevel": 0.02,
  "thinkerStealBonus": 0.05,
  "learnStrength": 50,
  "stealStrength": 80,
  "tuitionTimes": 3,
  "teacherShare": 2,
  "learnFragments": 2,
  "teacherFragments": 1,
  "forceCloseCoinPerLevel": 50000,
  "championHour": 9,
  "championGoodsId": 165
}
```

- 功能：`mysterious` 加入 `IMPLEMENTED_FEATURES`；`action_map` 已有 `mc.` / `lesson.` → `mysterious`，活跃"烹制特色菜"（`mc.cook`）随之生效。
- 流水 kind 增加 `'remnant'`（`ledger.ts`、前端流水页和事件 Toast 的文案）。

## 4. 规则明细

`luckRate` 用现有 `opLuck`；加成键从 `opAgg` 取（`starMCBook`、`starMCBookRate`、`magicBook`、`mcGoldRate`、`mcNumRate`、`mcCoinAdd`、`mcCoinAddExStar`、`thinker`、`magicLamp`）；天气效果从世界快照取（`starMCBookRate`、`mcGoldRate`、`mcNumRate`）。随机数一律走注入的 rng。

### 4.1 鉴定（规格书 04 §4.3）

`POST /mc/appraise {toolId, times, noRetryBelow5?}`

- 条件：≥1 星；`toolId` 是鉴定道具；162 和 `toolId` 各 ≥ `times`；1 ≤ `times` ≤ 99
- 每次：扣 162 ×1、道具 ×1
  - 成功率 = `rate + 天气.starMCBookRate + agg.starMCBookRate + luckRate/8`
  - 成功：在 `level ∈ [min,max]` 且可鉴定的特色菜里按 odds 抽 1 道；`agg.starMCBook > 0`、抽中等级 < 5、且没勾 `noRetryBelow5` → 再抽一次，取等级高的（星神眷恋）；得残卷 `rand[1, num]` 张
  - 失败：从固定文案里随机一句
- 同一道菜的残卷合并成一个 gain 事件和一条流水；返回 `{results: [{ok, mcId?, num?, text?, blessed?}], remnants}`

### 4.2 残卷

- 出售 `POST /mc/remnant/sell {mcId, num}`：得 `coin × num` 银币
- 分解 `POST /mc/remnant/decompose {mcId, num}`：得道具 `180 + 等级` ×num
- 学习 `POST /mc/learn {mcId}`：未学、残卷 ≥3 → 扣 3，写 `rest_mc(curlevel 1, way 1)`，日志 `mc.learn`

### 4.3 烹制（规格书 04 §4.5）

`POST /mc/cook {mcId, cookNum, cookie}`

- 条件：≥1 星；已学；`mc_cook_id` 为空；`cookNum ∈ cookNums`；每种食材 ≥ cookNum；`cookie` 时幸运饼干 ≥ cookNum
- 烹饪魔书（`agg.magicBook > 0`）：随机指定一种非 7 级食材不消耗
- 扣食材每种 ×cookNum，饼干 ×cookNum
- 品级：`lastRate = rand + luckRate/8 + (curlevel-1)/25 + agg.mcGoldRate + 天气.mcGoldRate`；按 `gradeBounds` 落区间，≥1.25 → 7（裁定 16）
- 幸运标记：只用 `rand` 本身会落到更低的品级（加成把品级抬上去了）→ `luck = true`（裁定 17）
- 份数：
  - `baseNum = 360 × cookNum × (等级 > 5 ? rand[0.70,0.95] : 1)`
  - `ratio = 1 + rand(gradeRatio[品级]) + luckRate/8`
  - `roadRate = min(同道已学数 × 0.02, 0.30) + min(他道已学数 × 0.005, 0.10)`（不含本道菜）
  - `cookNumRate = sqrt(厨力 × 2) / 400 × rand`（厨力用 2B 的 `equip/rules` 计算）
  - `num = ⌊baseNum × ratio × (1 + roadRate + agg.mcNumRate + 天气.mcNumRate + cookNumRate)⌋`
- 每份价值：`price = ⌊营养值 × ratio × (1 + (curlevel-1)/25 + trial_worth/100)⌋ + 人子加成 + agg.mcCoinAdd + 饼干加成`
  - 人子（`agg.mcCoinAddExStar > 0`）：`rand[1, 4 - ⌊星/2⌋]`（下限 1）
  - 饼干：`rand[1, 5 - ⌊星/2⌋]`（下限 1）
- 熟练度：`curexp += 品级 × num / 200`（取整），按熟练度表连续升级，满级停
- 试炼经验：`trial_exp > 0` → 餐厅经验 `num × 餐厅等级 × trial_exp / 1200`
- 海绵宝宝：等级 > 5 必中，否则概率 `0.0002 × 营养值 × cookNum` → 道具 304 ×1
- 写 `mc_cook`、设置 `mc_cook_id`，计数 `mc.cook`，新闻 `mc.cook {name, grade, num}`

### 4.4 在售与结算（规格书 01 §1.7）

- `settleOne`：`op.rest.mc_cook_id` 不为空时读该行，`special = {price, level, leftNum: left_num}`
- 结算后 `left_num -= specialUsed`；为 0 时 `ended_at = now, end_reason = 'sold'`，`mc_cook_id = null`
- 倒掉 `POST /mc/dump`：有在售 → `ended_at, end_reason = 'dumped'`，清指针

### 4.5 品尝（规格书 13 §13.6）

`POST /mc/taste {restId}`

- 条件：不是自己；双方验证邮箱、没被封；对方营业（state = 1）且有在售；我今天（区服时区）在 `mc_eat` 的记录 < 2；这批我没吃过
- 份数：好友 2 / 非好友 1；`left_num` 不够报 `NOT_ENOUGH`
- 我得体力 `⌊price / (好友 ? 1 : 2)⌋`
- `eat_count += 1`；`eat_count ≤ 20` 时：
  - 我以 `0.016 × (1 + 品级 × 0.2) + luckRate/100` 概率得神秘食谱(162) ×1
  - 店主得神秘礼券(1) `rand[1, ⌊体力 / (10 × (店主 0 星 ? 2 : 1))⌋ + 1]`
- 剩余为 0 → `end_reason = 'eaten'`，清店主指针
- 两家店按 id 顺序加锁（子项目 3 的双锁写法）；店主一方写日志 `mc.eaten`，好友动态可见
- 好友详情 DTO 加 `special: {mcId, name, grade, leftNum, price, eatenToday} | null`

### 4.6 教室（规格书 04 §4.7）

- 列表 `GET /mc/lessons`：本区服 `closed_at IS NULL AND ends_at > now` 的课，含老师、特色菜、等级、人数、偷学人数、剩余时间、我是否试过
- 开课 `POST /mc/lesson/open {mcId, certId}`
  - 条件：已学；残卷 ≥1；星级 ≥ `max(1, ⌊(等级-1)/2⌋)`；`certId` 是教师证且 `level` 含该特色菜等级；持有 ≥1；自己没有未关闭且未过期的课（已过期未关闭的先补 `closed_at`）
  - 扣残卷 1、教师证 1、体力 `needStrength`；`ends_at = now + lessonHour`，`max_num = maxNum`
- 学习 `POST /mc/lesson/:id/learn {type: 1|2}`
  - 条件：我验证邮箱、没被封；不是老师本人；课程进行中；这门课没试过；没学过这道菜；`learned + stolen < max_num`；等级 ≥4 → 已学特色菜数 ≥ 等级；已学普通食谱数 ≥ 等级×10；星级 ≥ `⌊(等级-1)/2⌋+1`；偷学时 `stolen ≤ 1`
  - 学（type 1）：扣体力 50、银币 `coin × 3`、碎片 `180+等级` ×2；老师得银币 `coin × 2`、碎片 ×1
    - 成功率 = `(agg.thinker > 0 ? 1 : 0.9) + luckRate/5`；失败且 `agg.magicLamp > 0` → 50% 改判成功
  - 偷（type 2）：扣体力 80；成功率 = `0.4 - 等级×0.02 + (thinker ? 0.05 : 0) + luckRate/5`
    - 失败：遗忘（裁定 8、9），返回被遗忘的食谱和特色菜名单
  - 成功：`rest_mc(curlevel 1, way 1+type, master_rest_id)`；学 `learned += 1`，偷 `stolen += 1`
  - 写 `mc_lesson_student`；老师的动态记一条
- 强制结束 `POST /mc/lesson/close`：我有进行中的课；持有道具 216；`learned + stolen ≥ max_num`；花 `等级 × 50000` 银币 → `closed_at = now`

### 4.7 昨日冠军（规格书 16）

- `PeriodicJob`（`name: 'mc-champion'`，`feature: 'mysterious'`，`period = latestSlot(now, [tuning.mysterious.championHour]).key`），和 world 模块的每日事件同一机制：按区服、按时段只跑一次，功能关闭的区服自动跳过
- 查 `mc_cook` 中 `created_at` 在昨天的批次，按店汇总最大一批的 `total_num × price`；取最大值，并列都给
- 每家发 165 ×1（source `mc.champion`），新闻 `mc.champion {names, value}`

## 5. 接口汇总

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/mc` | 已学（含熟练度名称和进度）、残卷、当前在售、可用鉴定道具和数量、幸运饼干数 |
| POST | `/mc/appraise` | 鉴定 |
| POST | `/mc/remnant/sell`、`/mc/remnant/decompose` | 残卷 |
| POST | `/mc/learn` | 用残卷学 |
| GET | `/mc/:id/preview` | 烹制前预览：所需食材和持有数、可选批数 |
| POST | `/mc/cook`、`/mc/dump` | 烹制、倒掉 |
| POST | `/mc/taste` | 品尝 |
| GET | `/mc/lessons` | 课程列表 |
| POST | `/mc/lesson/open`、`/mc/lesson/:id/learn`、`/mc/lesson/close` | 教室 |

DTO 放 `packages/shared/src/schemas/mysterious.ts`。写接口都走幂等键（和现有写接口一样）。

## 6. 前端

- **特色菜页** `/mc`：
  - 在售卡片：名称、品级、剩余 / 总份数、每份价值、倒掉（确认框）
  - 已学列表：熟练度名称和进度条、道、等级；点"烹制"弹出面板：食材持有情况、批数按钮（不够的禁用）、幸运饼干勾选
  - 残卷列表：数量、学习（≥3）、出售、分解（数量输入，上限为持有数）
- **神殿页** `/temple`：鉴定神秘食谱（选道具、次数、"低于 5 级不重抽"），结果列表
- **教室页** `/classroom`：进行中的课（学 / 偷学按钮；偷学弹确认框写明"失败会遗忘 N 道食谱"），我的课（人数、到期、强制结束），开课面板（选已学特色菜和教师证）
- **好友详情**：特色菜卡片（名称、品级、剩余份数），"品尝"按钮，今天吃过显示"已品尝"
- 导航加入"特色菜""神殿""教室"
- 错误文案补到 `zh-CN.ts`

## 7. 错误处理

不新增错误码。所有检查在扣除前完成，失败整个事务回滚。

| 情况 | 错误码 |
|---|---|
| 星级、已学特色菜数、普通食谱数不够 | `REQUIREMENT_NOT_MET {what, need}` |
| 残卷 / 食材 / 道具 / 碎片 / 体力 / 银币 / 份数不够 | `NOT_ENOUGH {what}` |
| 已有在售、没有在售、已学过、没学、课程已结束、偷学人数已满、对方打烊 | `INVALID_STATE {reason}` |
| 今天已品尝 2 次、课程人满、已有进行中的课 | `LIMIT_REACHED {what}` |
| 这批已品尝、这门课已试过 | `ALREADY_DONE` |
| 批数不在列表、不是鉴定道具 / 教师证、教师证等级不符、times 越界 | `VALIDATION_FAILED` |
| 功能关闭 | `FEATURE_DISABLED` |

## 8. 测试

- **纯函数** `rules.test.ts`（固定随机数）：品级区间边界（1.0、1.15、1.25 等）和 luck 标记；份数（6 级菜系数、道份数加成上限、厨力项）；每份价值（熟练度、试炼价值、人子、饼干）；熟练度连升和满级；鉴定成功率与星神重抽；学 / 偷成功率；遗忘数量
- **服务**（真实数据库，`sequenceRng`）：
  - 鉴定成功 / 失败、批量合并事件、times 越界
  - 残卷出售 / 分解 / 学习
  - 烹制：每个条件不满足时报错且不扣东西；魔书免扣；海绵宝宝；熟练度升级；新闻和活跃计数
  - 倒掉
  - 品尝：好友 / 非好友份数与体力；每天 2 次；同批一次；第 21 次起没有奖励；吃完结束并清指针
  - 教室：开课条件；学成功后老师得钱和碎片；偷学失败遗忘食谱且计数重算、正在售卖的不被遗忘；强制结束；过期后不能学；老师不能学自己的课
  - 冠军：只算昨天，并列都给，功能关闭跳过
- **结算**：有在售时收益增加、`left_num` 减少；卖完清指针、`end_reason = 'sold'`；没在售的店行为不变
- **迁移** 0008：约束、部分唯一索引、外键级联
- **前端组件**：特色菜页（烹制面板、倒掉确认）、神殿鉴定、教室（偷学确认框）、好友详情品尝卡片
- **E2E**：直接往数据库塞神秘食谱和蟹黄堡秘方(165，成功率 100%)、食材（厨具 E2E 的同款写法）→ 鉴定一次（页面显示得到残卷）→ 再塞 3 张指定特色菜的残卷 → 学会 → 烹制 → 页面显示在售、剩余份数；倒掉后在售卡片消失

## 9. 文档

- `docs/rules/收益与加成.md`：特色菜收益、品尝、教室
- `docs/deploy.md`：迁移 0008、功能开关 `mysterious`、冠军任务
