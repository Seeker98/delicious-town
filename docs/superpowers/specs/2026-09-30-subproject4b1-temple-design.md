# 子项目 4B-1「神殿」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-30-subproject4a-mysterious-design.md`（4A，第 0 节是子项目 4 的拆分）
- 游戏规则依据：`../analysis/spec/` 的 09 全章、00 §0.5、01 §1.9（美味券）、20 §20.8（种子）、§20.18（守护兽血量、克拉肯时段），以及 `backend_src` 原版源码 `TempleTranServiceImpl`（`shootMissiles`、`explore`、`beforeTrial`、`refreshTrial`、`startTrial`、`feedKraken`、`refreshKrakenShop`、`exchangeMc`）
- 分支：`feat/temple`，基于 `main`

## 0. 拆分

4B「神殿与菜园」再拆成两块（用户确认）：

| 块 | 内容 |
|---|---|
| **4B-1 神殿**（本文） | 守护兽、探险、试炼、克拉肯与触手商店；种子库存 |
| 4B-2 菜园 | 土地、作物、浇水 / 除虫 / 除草 / 偷菜、自然事件、配方鉴定与合成、种子兑换 |

## 1. 目标与范围

**完成标志**：玩家能在神殿用飞弹打守护兽、用探险图探险、给特色菜做试炼、投喂克拉肯换种子和触手、在触手商店换残卷；主线第 25、26 步和试炼支线开放。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 守护兽 | 每人每天一只，飞弹命中 / 暴击 / 伤害，暴击掉落，击败奖励，美味券 |
| 探险 | 四种探险图，成功率修正，神秘食材，普通食材，煤油灯经验 |
| 试炼 | 注射 / 冥想准备，试炼对象（只从已学的菜里抽），换对象，试炼提升试炼价值和试炼经验 |
| 克拉肯 | 每日想吃的菜，投喂时段，好感度，种子 / 蟹币 / 触手奖励，负好感度惩罚 |
| 触手商店 | 每天 6 格，刷新，用触手换残卷 |
| 种子 | 种子表进配置包，种子库存表（4B-2 使用） |
| 展示 | 神殿页改为标签页：鉴定（4A）、守护兽、探险、试炼、克拉肯 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 配方鉴定、菜园、种子兑换、种植 | 4B-2 |
| 克拉肯好感度排行、周 / 月结算奖励 | 4E |
| 仙贝（探险图 value 里的 `shell`、`xz`）、海怪供奉 | 5 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 试炼对象：原版从全部 ≤5 级特色菜里抽，可能抽到没学的菜 | 只从**已学的** ≤5 级特色菜里按 odds 抽；一道都没学时不能准备（`REQUIREMENT_NOT_MET mc_count`）。触手指定也只能指定已学的 ≤5 级菜（用户确认） |
| 2 | 克拉肯今天想吃的菜：原版 SQL 每日生成 | 用 `seededRng(hashSeed(shardId, 'kraken', day))` 从 1~5 级可鉴定特色菜按 odds 抽，全区服一致，不建表、不加定时任务 |
| 3 | 守护兽血量 | `tuning.temple.guardianHpBase + guardianHpPerStar × 当前星级`（10000 + 5000×星级）；累计伤害记在每日计数 `guardian.damage`；击败写 `guardian.killed = 1` |
| 4 | 守护兽暴击掉礼券 / 探险图的概率 | 原版餐厅字段默认值：礼券 0.10、探险图 0.03，放进 tuning |
| 5 | 美味券 | 每次攻击请求结束时，按 `⌊本次总伤害/100⌋ × (捕梦网 ? 2 : 1)` 次抽，复用 `core/tickets.ts` |
| 6 | 规格书把 378 叫"指南针" | 道具表里 378 是"欲望之针"（value 有 `exploreSuccessRate`、`mysteriousRate`）；按道具 id 处理，界面用道具表名称 |
| 7 | 试炼准备的前提 | 勋章 326（创意药水）或 327（冥想）任一有效就是"准备好了"；有效期内不能再准备。试炼时两者都无效报 `no_trial` |
| 8 | 创意值 | 属性点 + 穿戴厨具（含宝石）× 套装百分比后的 `creatives`（与厨力同一口径），再加加成汇总里的 `creatives`（勋章 326/327 等） |
| 9 | 天气 / 荣誉的 `trialRate` | 原版只显示不参与判定；本次不参与也不显示 |
| 10 | 负好感度遗忘特色菜 | 照原版：扣试炼经验 → 扣试炼价值 → 都为 0 时 25% 遗忘。被遗忘的就是在售那道菜时，这一批照卖（批次与已学记录独立） |
| 11 | 投喂份数 | 需要 在售剩余 > 投喂份数（原版 `leftNum <= num` 报错）；扣份数复用 4A 的 `consumeSpecial`（剩余一定 ≥1，不会结束批次） |
| 12 | 触手商店的"每天" | 游戏日；首次打开当天生成；刷新次数存表；兑换过的格子标记 `bought` |
| 13 | 功能关闭（区服 `temple` = false） | 本文的神殿接口返回功能关闭；4A 的鉴定属于 `mysterious` 功能，不受影响；主线 25、26 步照已有规则跳过 |

## 3. 规则明细

`luckRate` 用 `opLuck(op).rate`；加成键从 `opAgg` 取；天气从 `world.ensure(...).weather.effects` 取。随机数一律走注入的 rng。

### 3.1 守护兽（规格书 09 §9.1）

`POST /temple/missile {goodsId, num}`（`num` 1~99）

- 条件：≥1 星；`goodsId` 是飞弹（devicetype 97）；当天未击败
- 逐枚处理，直到 发完 / 击败 / 飞弹用完；第一枚之前就不能打时报错（`guardian_down` / `NOT_ENOUGH goods`）
- 每枚：扣飞弹 1
  - 命中：`rand < hitRate + luckRate/4 + 天气.hitRate`
  - 暴击：`rand < crit + agg.missileCritRate + 天气.missileCrit`
  - 伤害：`attack` 为 `[min, max]`，`min == max` 取 min，否则 `min + rand(max − min)`；暴击 × `critRate`，取整
  - 暴击时：
    - 礼券：`rand < 0.10 + luckRate/4` → 神秘礼券 `rand[1, ⌊伤害/100⌋]`
    - 探险图：`rand < 0.03 + luckRate/20` → 探险图(170) 1
    - 捕梦网(468) 有效：`rand < (极速 ? critSpeedGSRate : critGSRate)` → 厨神玉玺(164) 1
  - 伤害 ≥ 剩余血量 → 击败（伤害按实际值记，剩余血量记 0）
- 击败奖励：
  - `rand < 0.25 + luckRate/4` → 1 个 7 级食材（按 odds），发新闻 `temple.guardian.rare`
  - 3、2、1 级食材各 `⌊60/等级⌋ + rand(10) − 5` 个（按 odds 抽，逐个抽后合并）
- 请求结束：美味券 `⌊本次总伤害/100⌋ × (捕梦网 ? 2 : 1)` 次抽取；活跃 `temple.missile`（每次请求 1 次）
- 返回：`{shots: [{hit, crit, damage, killed}], hpLeft, hpMax, killed, drops}`；得失事件按物品合并

### 3.2 探险（规格书 09 §9.2）

`POST /temple/explore {goodsId, times}`（`times` 1~99）

- 条件：`goodsId` 是探险图（devicetype 96）；扣图 × times，扣体力 `needStrength × times`
- 成功率：
  ```
  rate = value.rate
  有欲望之针(378)：rate += (1 − rate) / 2
  rate −= 天气.mapLostRate / (欲望之针 ? 2 : 1)
  rate += max(0, 套装 exploreSuccessRate)
  判定：rand < rate + luckRate/12
  ```
- 成功时：
  - 神秘率 = `value.mysteriousRate` + 煤油灯(377).mysteriousRate + 欲望之针.mysteriousRate + 保安证(110，有效期内).mysteriousRate + 天气.mysteriousRate
  - `rand < 神秘率 + luckRate/20` → 7 级食材 1 个（星光之钥(408)：50% 为 2 个）
  - `awardNum = rand[1, max − min] + min + (星光之钥 ? 2 : 0)`；对 level 从 max 到 min：数量 = `round(awardNum × (level == 4 ? 0.75 : 0.25))`，按 odds 抽
  - 高级探险图(171) + 探险者秘籍(416)：额外 3 级食材 `mapL3FoodsNumAdd` 个
- 煤油灯：餐厅经验 `needStrength × 餐厅等级 × (成功×5 + 失败×2)`
- 获得神秘食材时发新闻 `temple.explore.rare`；活跃 `temple.explore` 每次探险 1 次（共 times 次）
- 返回：`{success, fail, rare: [{foodsId, num}], foods: [{foodsId, num}], exp}`

### 3.3 试炼（规格书 09 §9.4，裁定 1、7、8、9）

- `POST /temple/trial/prepare {way: 1|2}`：≥1 星；勋章 326、327 都无效；已学 ≤5 级特色菜 ≥1
  - way 1 注射：花 250,000 银币，发勋章 326；way 2 冥想：发勋章 327
  - 从已学 ≤5 级特色菜按 odds 抽一道，`rest_trial` upsert
- `POST /temple/trial/refresh {mcId?}`：≥1 星；有 `rest_trial`
  - 无 `mcId`：花 20,000 银币，按 odds 重抽
  - 有 `mcId`：花 1 条触手(434)；`mcId` 必须是已学 ≤5 级特色菜，否则 `mc_not_learned`
- `POST /temple/trial/start {mainFoodsId, subFoodsId}`：≥1 星；勋章 326 或 327 有效，且有 `rest_trial`，否则 `no_trial`；对象已学
  - 花 10,000 银币；主料 1 + 辅料 1（相同时同一种扣 2）；这道菜的每种食材各 1
  - 成功率：
    ```
    c = 创意值（裁定 8）
    getTrial(c) = min(0.6, 0.05 + min(c,150)/750 + (c > 150 ? √(c−150)/100 : 0))
    getFoodsTrial = (主等级 − 菜等级)/80 + (辅等级 − 菜等级)/160 + (200 − 主odds − 辅odds)/1500
    判定：rand < getTrial + getFoodsTrial + luckRate/5；超出 getTrial + getFoodsTrial 的部分标记幸运
    ```
    （原版 Tools.getTrial：总和封顶 0.6；c ≤ 150 时最多 0.25，实际只在 c > 150 时触顶）
  - 成功：稀有 = odds < 100
    - 价值 n = 主稀有 ? (辅稀有 ? 2 : 1) : 0；n > 0 时 `trial_worth += rand[1,n]`，上限 50
    - 经验 m = 主稀有 ? (辅稀有 ? 4 : 3) : (辅稀有 ? 2 : 1)；`trial_exp += rand[1,m]`，上限 150
    - 熟练度 `+800 × curlevel`，按熟练度表升级（复用 4A `addProficiency`）
  - 个人日志 `temple.trial {mcId, success, worth, exp}`；活跃 `temple.trial`
- 试炼对象不会因为勋章过期而清除；再次准备时重抽

### 3.4 克拉肯（规格书 09 §9.5，裁定 2、10、11）

- 今天想吃的菜：见裁定 2
- `POST /temple/kraken/feed {num}`（num ≥1）：
  - 条件：≥1 星；当前小时在 `tuning.temple.krakenHours`（默认 `[[11,14],[17,21]]`，左闭右开）；今天没喂过；有在售批次且 `left_num > num`
  - `rate = 同一道菜 2.4 / 同道 1 / 其他 0.5`
  - `init = ⌊√(num × (菜等级 == 6 ? 0.5 : 1) × 每份价值 × rate) / 12⌋`
  - `gradeCoe = 品级 − 1`；`k = 同菜 ? −0.06×gradeCoe : 同道 ? 0.1 − 0.01×gradeCoe : 0.2`
  - `favor = rand(init) − ⌊k × init⌋`；`favor == 0 → 1`；`favor > init → init`
  - 同菜：`favor += rand(⌊init × luckRate/5⌋)`
  - 扣份数 `consumeSpecial(op, cook, num, 'sold')`
  - 种子 `seedNum = max(1, ⌊√max(0, favor)⌋ + 2)` 颗，按种子 odds 逐颗抽，合并后加进 `rest_seed`
  - `seedNum > 5` 且 `rand < 0.32 + luckRate/5` → 蟹币 `rand[1, ⌊seedNum/4⌋]`
  - `favor < 0` 惩罚（对这道菜的 `rest_mc`，已不在则跳过）：`sub = rand[1,3]`；trial_exp > 0 → 扣；否则 trial_worth > 0 → 扣；否则 25% 删除 `rest_mc`（个人日志 `kraken.forget`）
  - `favor > 35` 且 `rand < 0.3` → 触手 1
  - 写 `kraken_feed`；活跃 `kraken.feed`
- 暴雨加成（天气说明里有、源码没有）：不做

### 3.5 触手商店（规格书 09 §9.5，裁定 12）

- `GET /temple/tentacle`：今天没有记录时生成 6 格（除 id 249 外全部特色菜按 odds 抽，可重复），返回格子、刷新次数、下次刷新花费、持有触手数
- `POST /temple/tentacle/refresh`：refreshes == 0 免费，否则扣 1 条触手；重抽 6 格，refreshes + 1
- `POST /temple/tentacle/exchange {slot}`：slot 0~5；未兑换；扣 `菜等级` 条触手；残卷 +1（`addRemnant`）；标记 bought

### 3.6 种子

- 配置：`designed/seeds.json` 整理为 `Seed { id, foodsId, level, coin, infancy, maturity, autumn, harvest, harvestNum, odds }`，`GameConfig.seeds`、`seedPool`（按 odds）
- 库存表 `rest_seed`；增加走 `addSeeds(op, seedId, num)`，写流水 kind `'seed'`（id = 种子 id），前端显示"xx种子"

## 4. 数据

### 4.1 迁移 0009

```
rest_trial
  rest_id int PK FK restaurant ON DELETE CASCADE
  mc_id int NOT NULL
  way smallint NOT NULL             -- 1 注射 / 2 冥想
  prepared_at timestamptz NOT NULL DEFAULT now()

kraken_feed
  id int identity PK
  rest_id int FK restaurant ON DELETE CASCADE, shard_id int NOT NULL
  day text NOT NULL                  -- 游戏日
  mc_id int NOT NULL, target_mc_id int NOT NULL
  num int NOT NULL, favor int NOT NULL
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (rest_id, day); INDEX (shard_id, day)

tentacle_shop
  rest_id int FK restaurant ON DELETE CASCADE, day text
  refreshes int NOT NULL DEFAULT 0
  slots jsonb NOT NULL               -- [{mcId, bought}] × 6
  PK (rest_id, day)

rest_seed
  rest_id int FK restaurant ON DELETE CASCADE, seed_id int, num int NOT NULL CHECK (num >= 0)
  PK (rest_id, seed_id)
```

守护兽不建表（裁定 3）。

### 4.2 配置

- `Seed` 类型、`GameConfig.seeds`（Map）、`seedPool`
- 飞弹、探险图的 value 在运行时解析：`MissileDef { hitRate, crit, critRate, attack: [min, max] }`、`MapDef { needStrength, rate, level: [min, max], num: [min, max], mysteriousRate }`；按道具 id 索引 `GameConfig.missiles`、`GameConfig.maps`
- `tuning.temple`：

```json
{
  "guardianHpBase": 10000, "guardianHpPerStar": 5000,
  "missileTicketRate": 0.10, "missileMapRate": 0.03,
  "guardianRareRate": 0.25, "guardianFoodsBase": 60, "guardianFoodsSpread": 10,
  "injectCoin": 250000, "refreshCoin": 20000, "trialCoin": 10000,
  "trialWorthMax": 50, "trialExpMax": 150, "trialProficiencyPerLevel": 800,
  "trialCap": 0.6, "rareOdds": 100,
  "krakenHours": [[11, 14], [17, 21]],
  "krakenRates": { "same": 2.4, "road": 1, "other": 0.5 },
  "krabCoinRate": 0.32, "tentacleFavor": 35, "tentacleRate": 0.3, "forgetRate": 0.25,
  "shopSlots": 6, "shopExclude": [249]
}
```

- `GOODS` 增加：`missileSpeed 17`、`missileNormal 18`、`missileBurst 19`、`mapNormal 170`、`mapHigh 171`、`tentacle 434`、`creativePotion 326`、`meditation 327`、`lamp 377`、`needle 378`、`securityCard 110`、`starKey 408`、`exploreBook 416`、`dreamNet 468`、`seal 164`
- 功能 `temple` 加入 `IMPLEMENTED_FEATURES`
- 流水 / 事件 kind 增加 `'seed'`

## 5. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/temple` | 守护兽（hpMax、hpLeft、killed）、飞弹和探险图持有、试炼（对象、勋章剩余分钟、way）、克拉肯（今天想吃的菜、今天是否已喂、此刻能否投喂、下个时段）、种子库存 |
| POST | `/temple/missile` | 守护兽 |
| POST | `/temple/explore` | 探险 |
| POST | `/temple/trial/prepare`、`/temple/trial/refresh`、`/temple/trial/start` | 试炼 |
| POST | `/temple/kraken/feed` | 投喂 |
| GET / POST | `/temple/tentacle`、`/temple/tentacle/refresh`、`/temple/tentacle/exchange` | 触手商店 |

DTO 放 `packages/shared/src/schemas/temple.ts`。

## 6. 前端

神殿页 `/temple` 改为标签页（记住上次选的标签，存浏览器）：

- **鉴定**：4A 已有内容原样搬进来
- **守护兽**：血条、飞弹选择和数量（上限 = 持有与 99 取小）、逐枚结果列表、奖励汇总；击败后显示"明天再来"
- **探险**：探险图选择、次数（上限 = 持有、体力 / 每次体力、99 取小）、结果（成功 / 迷路次数、神秘食材、普通食材、经验）
- **试炼**：未准备时两个按钮（注射 250,000 银币 / 冥想）；准备后显示对象、勋章剩余时间、换对象（2 万银币 / 触手指定：已学 ≤5 级菜的下拉框）、主辅食材选择（橱柜里的食材，显示等级和是否稀有）、预计成功率（前端按同一公式显示，服务端为准）、开始试炼
- **克拉肯**：今天想吃的菜和道；当前在售特色菜和剩余份数；份数输入（上限 = 剩余 − 1）；投喂按钮；不在时段 / 已喂 / 没有在售时写明原因；投喂结果（好感度、种子、蟹币、触手、惩罚）；下方触手商店 6 格（兑换按钮写明花费）和刷新
- 种子库存：克拉肯标签底部列出"xx种子 ×N"，注明"菜园开放后可以种"

按钮灰掉一律写明原因（问题记录第 32 行的做法）。

## 7. 错误处理

不新增错误码。所有检查在扣除前完成，失败整体回滚。

| 情况 | 错误码 |
|---|---|
| 星级不够、没学特色菜 | `REQUIREMENT_NOT_MET {reason: 'star' / 'mc_count'}` |
| 今天已击败 | `INVALID_STATE guardian_down` |
| 准备勋章还有效 | `INVALID_STATE trial_ready` |
| 没准备 / 勋章过期 / 没有对象 | `INVALID_STATE no_trial` |
| 指定的菜没学或 >5 级 | `INVALID_STATE mc_not_learned` |
| 不在投喂时段 / 今天已喂 / 没有在售 / 份数不够 | `INVALID_STATE not_feed_time / fed_today / no_cooking / portions` |
| 触手商店格子已兑换 | `INVALID_STATE slot_bought` |
| 飞弹 / 探险图 / 食材 / 体力 / 银币 / 触手不够 | `NOT_ENOUGH`（现有函数） |
| 不是飞弹 / 不是探险图 / slot 越界 | `VALIDATION_FAILED` |
| 功能关闭 | `FEATURE_DISABLED` |

## 8. 测试

- **纯规则** `modules/temple/rules.test.ts`（固定随机数）：命中 / 暴击 / 伤害区间和暴击倍数；暴击掉落概率；击败奖励各级数量；探险成功率的欲望之针、天气、套装修正；普通食材按等级分配；`getTrial` 三段（c ≤150、>150、上限 0.6）；`getFoodsTrial`；n、m 与上限；克拉肯三种 rate、`init`、`favor` 的下限 1 和上限 init、同菜幸运加成；种子数；克拉肯想吃的菜对同区服同日稳定、换日变化
- **服务**（真实数据库，`sequenceRng`）：
  - 守护兽：连打到击败、多余飞弹不扣；击败后报 `guardian_down`；星级变化后血量变化；美味券次数；捕梦网掉玉玺；0 星报错
  - 探险：扣图和体力；成功 / 失败统计；煤油灯经验；神秘食材新闻；99 次合并事件
  - 试炼：只抽已学 ≤5 级；没学报错；勋章有效时不能再准备；注射扣 25 万并发勋章；refresh 两种方式；试炼成功加成有上限、熟练度增加、升级；主辅相同扣 2 个；勋章过期报 `no_trial`
  - 克拉肯：时段外报错；每天一次；扣份数不结束批次；种子进库存；蟹币；负好感度按"经验 → 价值 → 遗忘"顺序惩罚
  - 触手商店：当天固定；首刷免费、再刷扣触手；兑换扣等级数的触手并得残卷；同格不能换两次
  - 主线第 25、26 步和试炼支线不再跳过；功能关闭报 `FEATURE_DISABLED`
- **迁移** 0009：约束、唯一键、级联
- **前端**：神殿各标签（守护兽数量上限、探险次数上限、试炼准备和开始、克拉肯投喂的禁用原因、触手商店兑换）
- **E2E**：塞飞弹、探险图、食材、已学特色菜 → 打守护兽 → 探险 → 冥想准备试炼 → 试炼

## 9. 文档

- `docs/rules/收益与加成.md`：神殿各玩法的公式
- `docs/deploy.md`：迁移 0009、功能开关 `temple`
