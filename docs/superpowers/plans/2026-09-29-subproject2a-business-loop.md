# 子项目 2A「经营循环」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在子项目 1 的骨架上实现完整的单人经营循环：每 4 分钟开店结算、成长、食谱、橱柜、菜场、商店、仓库道具、任务活跃签到、对应的前端页面，以及数值模拟器。

**Architecture:** 服务端新增一层"操作上下文"（`Op`）：每个玩家写操作在单店行锁的事务里拿到一个可变的餐厅快照，所有资源增减都通过 `core/resources` 等辅助函数改快照、记流水、记得失提示，最后一次性写回。结算的核心是不碰数据库的纯函数 `settleRestaurant`，由 worker 的批处理按区服、按轮次调用。定时任务改成"周期型任务"，靠 `job_run` 表按周期去重。模拟器用虚拟时钟直接驱动同一套 service 和周期任务。

**Tech Stack:** 沿用子项目 1：Node ≥22、pnpm 10、TypeScript 5（strict、ESM）、zod 3、Fastify 5、Kysely 0.27、PostgreSQL 16、Redis 7、Vue 3.5 + Pinia 3 + vue-router 4 + Bootstrap 5、Vitest 3.2、Playwright。不引入新的运行时依赖（`@dt/config` 新增对 `@dt/shared` 的工作区依赖）。

**Spec:** `docs/superpowers/specs/2026-09-29-subproject2a-business-loop-design.md`（下文"设计文档"）。游戏规则依据 `../analysis/spec/` 的 00、01、02、03、05、06、07、15、16、20 章（下文"规格书 xx"）。上位架构：`docs/superpowers/specs/2026-09-29-rewrite-architecture-design.md`。

## Global Constraints

- 子项目 1 的全部约束继续有效：ESM、`strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`；服务端不返回 HTML；成功 `{ok:true,data,events}`，失败 `{ok:false,code,params?}`；接口一律从会话取账号、区服、restId；写操作只接受 `POST` + JSON；数据库时间一律 `timestamptz`
- 游戏时间统一按北京时间（`Asia/Shanghai`，固定 +8 小时，无夏令时）
- 所有写餐厅数据的玩家操作都走 `runOp`（单店行锁 + 同一事务）；涉及随机的地方一律用注入的 `Rng`，玩家操作默认 `cryptoRng`，结算和定时任务用 `hashSeed` 种子
- 写入 `ledger`、`news`、`income_round`、`rest_log` 时显式传入 `created_at = op.now`（模拟器用虚拟时钟，不能依赖数据库的 `now()`）
- 数值常量放在配置 `tuning`（`packages/config/data/game/tuning.json`），区服可通过 `shard_config.override.tuning` 覆盖；道具、食材 id 常量放在 `packages/config/src/ids.ts`
- 2A 的食谱最高品级为 7（`tuning.rest.cookbookMaxGrade`）；装备（type 4）不进任何随机奖池（2B 再开放）
- 功能名固定为：`restaurant`、`settlement`、`world`、`growth`、`cookbook`、`cupboard`、`market`、`shop`、`store`、`task`
- 界面文字用中文；手机优先，最小宽度 360px，宽屏内容区最大 720px 居中
- 每个任务提交前先运行 `pnpm format`；服务端测试需要先执行一次 `pnpm infra:test`
- 测试命令：单个文件 `pnpm exec vitest run <路径>`；全部 `pnpm test`；类型检查 `pnpm typecheck`；`pnpm lint`
- 提交信息结尾加：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **同一份特价被两个请求同时抢**：特价货架每人每轮只能买 1 份、同 IP 间隔 10 分钟；两个并发请求（没带幂等键）最多成功一个，另一个得到 `LIMIT_REACHED` 或 `COOLDOWN`，库存不会超卖。→ Task 20 测试
2. **竞猜的时间边界**：在日常菜场刷新的那一刻（比如 10:00:00）报名竞猜，必须算进"下一轮"（12 点），不能算进正在开奖的这一轮。→ Task 20 测试
3. **白食把银币扣成负数**：结算里白食桌的负银币让本轮总银币为负时，餐厅银币最低扣到 0，不会变成负数，也不会因为 `max(1, …)` 变成 +1。→ Task 11、Task 12 测试
4. **跨日按北京时间**：签到、活跃、每日免费合成次数都按北京时间的日期计算；UTC 15:59 和 16:00 分属两天。→ Task 21 测试
5. **橱柜满了还在拿奖励**：橱柜格数用满时，礼包、结算、老鼠夹掉落的新食材要进冰箱、冰箱满了记丢弃日志，而不是报错让整个操作回滚。→ Task 6 测试

## 文件结构

```
packages/config/
  data/game/                      手写的配置（不会被 sync-data 覆盖）
    tuning.json                   数值常量
    holidays.json                 公历节日、清明、2026~2035 农历节日
    market_guess_award.json       竞猜奖励表
    action_map.json               行为 → 活跃项、事件键前缀 → 功能
  src/tuning.ts                   tuning 的 zod schema 和类型
  src/ids.ts                      道具、食材 id 常量
  src/goodsUse.ts                 道具用途推导
  src/raw.ts | types.ts | build.ts | source.ts | runtime.ts | shard.ts   扩展
packages/shared/src/
  time.ts                         北京时间拆分、时间槽、轮次
  errors.ts                       新错误码
  schemas/{restaurant,world,growth,cookbook,cupboard,store,shop,market,task}.ts   请求 schema 与 DTO
apps/server/src/
  game.ts                         createGame：装配服务、事件订阅、周期任务
  core/
    deps.ts                       GameDeps、RestCtx、restCtxOf
    op.ts                         Op、createOp、flushOp、runOp、setRest
    resources.ts                  银币、钻石、体力、声望、油、经验（含升级）的增减
    level.ts                      applyExp（纯函数）
    errors.ts                     notEnough / requirement / limitReached
    action.ts                     emitAction
    features.ts                   已实现的功能表
    jobs.ts                       PeriodicJob 接口
    luck.ts                       opLuck（幸运总值与幸运率）
  db/migrations/0002_business_loop.ts
  modules/
    store/{grant,goods,use,service,routes}.ts
    cupboard/{foods,rules,service,routes}.ts
    award/award.ts                grantAward、openGift
    effects/{collection,service}.ts
    world/{rules,service,routes,jobs}.ts
    settlement/{types,rates,tables,settle,runner,strength,mouse,jobs}.ts
    restaurant/{reads,service,routes}.ts
    growth/{rules,devices,service,routes}.ts
    cookbook/{rules,service,routes}.ts
    shop/{service,routes,jobs}.ts
    market/{rules,service,routes,jobs}.ts
    task/{rules,service,handler,routes}.ts
  worker/periodic.ts              周期任务执行器
  http/testApi.ts                 测试时钟接口（ENABLE_TEST_API）
  infra/clock.ts                  可推进的时钟
  sim/{cli,env,clock,world,bot,run,metrics,report,explain,bench}.ts
  test/game.ts                    服务层测试工具
apps/web/src/
  api/{client,endpoints}.ts       扩展：得失事件回调
  stores/{catalog,restaurant,toast}.ts
  components/{EventToast,BottomNav,ResourceBar,FoodName,GoodsName,Pager}.vue
  utils/{events,rates}.ts
  views/  RestaurantHome、RestFloor、RestIncome、RestInfo、RestTasks、Cookbooks、CookbookInfo、
          Cupboard、Market、Shop、Store、Society、SocietyStar、SocietyOil、SocietyRename、SocietyMove、Weather
```

---
### Task 1: 配置包——新数据表与 tuning

**Files:**
- Create: `packages/config/data/game/tuning.json`
- Create: `packages/config/data/game/holidays.json`
- Create: `packages/config/data/game/market_guess_award.json`
- Create: `packages/config/data/game/action_map.json`
- Create: `packages/config/src/tuning.ts`
- Create: `packages/config/src/ids.ts`
- Modify: `packages/config/src/source.ts`
- Modify: `packages/config/src/raw.ts`
- Modify: `packages/config/src/types.ts`
- Modify: `packages/config/src/build.ts`
- Modify: `packages/config/src/index.ts`
- Test: `packages/config/src/build.test.ts`

**Interfaces:**
- Consumes: 现有 `buildBundle(src)`、`readSourceDir(dir)`、`awardSchema`
- Produces:
  - `Tuning`（`tuning.ts` 导出 `tuningSchema`、`type Tuning`）
  - `ConfigBundle` 新字段：`cookbookGrades: CookbookGrade[]`、`shopSpecialTiers: ShopSpecialTier[]`、`shopPools: { special: number[]; black: number[] }`、`potTiers: CollectionTier[]`、`paintingTiers: CollectionTier[]`、`marketGuessFoods: number[]`、`guessAwards: GuessAward[]`、`guessBonus: GuessBonus[]`、`actionMap: ActionMap`、`holidays: Holidays`、`tuning: Tuning`
  - `Task.feature: string`
  - `featureOfKey(key: string, features: Record<string, string>): string | null`（`build.ts` 导出）
  - `GOODS`、`FOODS` 常量（`ids.ts`）

- [ ] **Step 1: 写手工配置文件**

`packages/config/data/game/tuning.json`：

```json
{
  "rest": {
    "atRateBase": 0.3,
    "atRatePerStar": 0.05,
    "spRateBase": 0.1,
    "spRatePerStar": 0.06,
    "localRateBase": 0.95,
    "localRatePerStar": 0.1,
    "oilBase": 2,
    "coinBase": 10,
    "expBase": 2,
    "handleRateBase": 0.9,
    "handleRatePerStar": 0.01,
    "tablesPerFloor": 16,
    "attrPerLevel": 3,
    "luckPerLevel": 1,
    "tablesPerLevel": 1,
    "cookbookMaxGrade": 7
  },
  "settlement": {
    "atFloatBase": 0.3,
    "atFloatPerStar": 0.1,
    "spFloatPerStar": 0.1,
    "spFloatCenter": 0.65,
    "atOverflowThreshold": 1.2,
    "atOverflowDivisor": 1.5,
    "adiaoOverflowRate": 0.5,
    "negativeRenownAtRate": -0.8,
    "starPotential": [0.6, 0.45, 0.3, 0.15],
    "cteRate": 1.5,
    "planktonRateBase": 0.0001,
    "planktonRatePerStar": 0.00001,
    "planktonMultiplier": 5,
    "roachRateBase": 0.0018,
    "roachRatePerStar": 0.0001,
    "squidwardRate": 0.0015,
    "squidwardMinStar": 3,
    "squidwardOtherStreetFactor": 3,
    "squidwardPortions": 4,
    "krabRate": 0.00005,
    "krabSameStreetFactor": 3,
    "krabLuckDivisor": 3000,
    "krabMaxGrade": 7,
    "krabExpPerGrade": 5,
    "krabCoinMultiplier": 5,
    "huskyRate": 0.3,
    "painting13Rate": 0.15,
    "painting13Hours": 5,
    "pickyMaxGrade": 7,
    "cookfoodsPerFlag": 50,
    "cookfoodsMaxFlag": 5,
    "cookfoodsMinGrade": 5,
    "cookfoodsNeedGradeCap": 4,
    "dtTicketBaseRate": 0.0025,
    "dtTicketLuckDivisor": 150,
    "dtTicketOddsDivisor": 35,
    "krabCoinBaseRate": 0.0021,
    "krabCoinOddThreshold": 25,
    "krabCoinOddStep": 0.03,
    "renownRate": 0.78,
    "renownOddThreshold": 0.2,
    "autoRefuelThreshold": 2000,
    "concurrency": 16,
    "batchSize": 200
  },
  "collection": {
    "plaquePer": 0.01,
    "an2023Multiplier": 2,
    "honorPer": 0.004,
    "mdcgMultiplier": 1.5,
    "an2025CoinBonus": 0.16
  },
  "strength": { "regen": 1, "luckyRegen": 2 },
  "mouse": { "rateBase": 0.16, "ratePerStar": 0.01, "newbieFactor": 0.5, "luckDivisor": 2, "trapCoinPerLevel": 20 },
  "growth": {
    "plaque2Star": 3,
    "plaque2Coin": 15000000,
    "plaque2Diamond": 188,
    "cookfoodsMinStar": 6,
    "driveKrabStrength": 50,
    "drivePlanktonStrength": 80,
    "drivePlanktonRenownPerSqrt": 10,
    "drivePlanktonExpPerRenown": 300,
    "drivePlanktonBookExpPerRenown": 1000,
    "renameCoinPerRoach": 100,
    "renameMaxLength": 9
  },
  "cupboard": {
    "handleMax": 100,
    "freeHandleBase": 20,
    "freeHandlePerStar": 25,
    "thawCoinRate": 0.25,
    "failCoinRate": 0.5,
    "exchangeMaxTimes": 50
  },
  "market": {
    "dailyHours": [8, 10, 12, 14, 16, 18, 20],
    "dailyKinds": 5,
    "dailyKindsLastHour": 20,
    "dailyKindsLast": 6,
    "dailyStock": 5999,
    "dailyRareStock": 2048,
    "dailyLevelWeights": [
      [1, 72],
      [2, 28]
    ],
    "specialHours": [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    "specialKinds": 2,
    "specialHotChance": 0.4,
    "specialStockBase": 40,
    "specialStockRand": 40,
    "specialPrice": 2999,
    "specialLevelWeights": [
      [3, 50],
      [4, 35],
      [5, 15]
    ],
    "premiumHours": [6, 12, 18],
    "premiumKinds": 3,
    "premiumStock": 500,
    "premiumRareFactor": 0.8,
    "premiumLevel": 4,
    "premiumPriceFactor": 2,
    "shelfLimits": [1000, 1, 9],
    "rareWindowMinutes": 55,
    "rareLimitOddsFactor": 2,
    "rareLimitBase": 10,
    "specialIpCooldownSec": 600,
    "hotMinNeedCount": 500,
    "guessCost": 2,
    "guessMaxPick": 6,
    "guessBonusHours": [12, 18]
  },
  "shop": { "sellRate": 0.7, "specialHour": 12, "specialFallbackGoods": 21, "discardable": [87], "maxBuy": 999 },
  "store": { "batchUsable": [28, 29, 85, 139], "maxBatch": 99 },
  "world": {
    "weatherHours": [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23],
    "nightFrom": 21,
    "nightTo": 5,
    "krabHour": 9,
    "krabStreetMin": 1,
    "krabStreetMax": 13,
    "nightWeatherOdds": [
      [28, 40],
      [29, 35],
      [30, 25]
    ],
    "dayWeightScale": 100
  }
}
```

`packages/config/data/game/holidays.json`（农历日期由 Node 自带的中国农历历法生成，已核对 2026 春节为 02-17）：

```json
{
  "solarMultiplier": 2,
  "lunarMultiplier": 3,
  "solar": {
    "01-01": "元旦",
    "02-14": "情人节",
    "03-08": "妇女节",
    "04-01": "愚人节",
    "05-01": "劳动节",
    "06-01": "儿童节",
    "09-10": "教师节",
    "10-01": "国庆",
    "10-31": "万圣夜",
    "11-27": "感恩节",
    "12-25": "圣诞"
  },
  "qingming": {
    "2026": "04-05",
    "2027": "04-05",
    "2028": "04-04",
    "2029": "04-04",
    "2030": "04-05",
    "2031": "04-05",
    "2032": "04-04",
    "2033": "04-04",
    "2034": "04-05",
    "2035": "04-05"
  },
  "lunar": {
    "2026-02-16": "除夕",
    "2026-02-17": "春节",
    "2026-03-03": "元宵",
    "2026-06-19": "端午",
    "2026-08-19": "七夕",
    "2026-09-25": "中秋",
    "2026-10-18": "重阳",
    "2027-02-06": "除夕",
    "2027-02-07": "春节",
    "2027-02-21": "元宵",
    "2027-06-09": "端午",
    "2027-08-08": "七夕",
    "2027-09-15": "中秋",
    "2027-10-08": "重阳",
    "2028-01-25": "除夕",
    "2028-01-26": "春节",
    "2028-02-09": "元宵",
    "2028-05-28": "端午",
    "2028-08-26": "七夕",
    "2028-10-03": "中秋",
    "2028-10-26": "重阳",
    "2029-02-12": "除夕",
    "2029-02-13": "春节",
    "2029-02-27": "元宵",
    "2029-06-16": "端午",
    "2029-08-16": "七夕",
    "2029-09-22": "中秋",
    "2029-10-16": "重阳",
    "2030-02-01": "除夕",
    "2030-02-02": "春节",
    "2030-02-16": "元宵",
    "2030-06-05": "端午",
    "2030-08-05": "七夕",
    "2030-09-12": "中秋",
    "2030-10-05": "重阳",
    "2031-01-22": "除夕",
    "2031-01-23": "春节",
    "2031-02-06": "元宵",
    "2031-06-24": "端午",
    "2031-08-24": "七夕",
    "2031-10-01": "中秋",
    "2031-10-24": "重阳",
    "2032-02-10": "除夕",
    "2032-02-11": "春节",
    "2032-02-25": "元宵",
    "2032-06-12": "端午",
    "2032-08-12": "七夕",
    "2032-09-19": "中秋",
    "2032-10-12": "重阳",
    "2033-01-30": "除夕",
    "2033-01-31": "春节",
    "2033-02-14": "元宵",
    "2033-06-01": "端午",
    "2033-08-01": "七夕",
    "2033-09-08": "中秋",
    "2033-10-01": "重阳",
    "2034-02-18": "除夕",
    "2034-02-19": "春节",
    "2034-03-05": "元宵",
    "2034-06-20": "端午",
    "2034-08-20": "七夕",
    "2034-09-27": "中秋",
    "2034-10-20": "重阳",
    "2035-02-07": "除夕",
    "2035-02-08": "春节",
    "2035-02-22": "元宵",
    "2035-06-10": "端午",
    "2035-08-10": "七夕",
    "2035-09-16": "中秋",
    "2035-10-09": "重阳"
  }
}
```

`packages/config/data/game/market_guess_award.json`（规格书 06 §6.3：猜中 n 种 → 幸运饼干 ×n + (n>5 ? 神秘食材兑换券 20 : n 级食材兑换券 240+n) ×n；12、18 点两轮额外奖励）：

```json
{
  "byHits": [
    { "hits": 1, "award": { "goods": [{ "id": 491, "num": 1 }, { "id": 241, "num": 1 }] } },
    { "hits": 2, "award": { "goods": [{ "id": 491, "num": 2 }, { "id": 242, "num": 2 }] } },
    { "hits": 3, "award": { "goods": [{ "id": 491, "num": 3 }, { "id": 243, "num": 3 }] } },
    { "hits": 4, "award": { "goods": [{ "id": 491, "num": 4 }, { "id": 244, "num": 4 }] } },
    { "hits": 5, "award": { "goods": [{ "id": 491, "num": 5 }, { "id": 245, "num": 5 }] } },
    { "hits": 6, "award": { "goods": [{ "id": 491, "num": 6 }, { "id": 20, "num": 6 }] } }
  ],
  "bonus": [
    { "minHits": 5, "award": { "goods": [{ "id": 240, "num": 15 }] } },
    { "minHits": 4, "award": { "goods": [{ "id": 240, "num": 5 }] } }
  ]
}
```

`packages/config/data/game/action_map.json`（`activation`：行为键 → 活跃项名称；`features`：事件键前缀 → 功能名，最长前缀优先）：

```json
{
  "activation": {
    "signin": "签到",
    "oil.fill": "给自己添油",
    "cookbook.learn": "学习或升级食谱",
    "market.buy": "菜场买菜",
    "shop.buy": "商店购买道具",
    "device.place": "摆放设施",
    "foods.handle": "合成或分解食材",
    "roach.kill": "打蟑螂",
    "friend.dineAndDash": "白食",
    "krab.shake": "摇蟹老板的钱袋",
    "cupboard.flip": "翻厨",
    "foods.exchange": "交换食材",
    "friend.refuel": "帮好友添油",
    "roach.lay": "放置蟑螂",
    "bar.play": "酒吧娱乐",
    "tower.challenge": "厨塔挑战",
    "temple.explore": "探险",
    "temple.missile": "挑战守护兽",
    "mc.cook": "烹制特色菜",
    "kraken.feed": "投喂克拉肯",
    "tower.friendDuel": "与好友赛厨",
    "takeaway.deliver": "配送外卖"
  },
  "features": {
    "rest.": "restaurant",
    "rest.thumbs": "friend",
    "cookbooks.": "cookbook",
    "cookbook.": "cookbook",
    "oil.": "growth",
    "attr.": "growth",
    "device.": "growth",
    "market.": "market",
    "shop.": "shop",
    "signin": "task",
    "foods.handle": "cupboard",
    "foods.exchange": "friend",
    "roach.": "friend",
    "friends.": "friend",
    "friend.": "friend",
    "thumbs.": "friend",
    "cupboard.flip": "friend",
    "krab.shake": "friend",
    "bar.": "bar",
    "honor.potCount": "bar",
    "mc.": "mysterious",
    "lesson.": "mysterious",
    "temple.": "temple",
    "kraken.": "temple",
    "tower.": "tower",
    "yard.": "yard",
    "formula.": "yard",
    "equip.": "equip",
    "takeaway.": "takeaway",
    "hiphop.": "town",
    "post.": "town",
    "broadcast": "town"
  }
}
```

- [ ] **Step 2: 写失败的测试**

在 `packages/config/src/build.test.ts` 末尾追加：

```ts
describe('2A 新增配置', () => {
  it('新表都已规范化', () => {
    const b = buildBundle(source()).bundle!;
    expect(b.cookbookGrades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(b.cookbookGrades[6]).toMatchObject({ name: '佳肴', atRatePerCookbook: 0.00011, spCoinAddRate: 1.3 });
    expect(b.shopSpecialTiers.map((t) => t.discount)).toEqual([0.9, 0.8, 0.7, 0.5, 0.1]);
    expect(b.shopSpecialTiers[0]).toMatchObject({ name: '九折', from: 0, to: 0.5, stock: 50 });
    expect(b.shopPools.special).toContain(21);
    expect(b.shopPools.black).toContain(86);
    expect(b.potTiers.map((t) => t.count)).toEqual([4, 6, 7]);
    expect(b.potTiers[0]!.effects).toEqual({ coinRate: 0.08 });
    expect(b.paintingTiers.map((t) => t.count)).toEqual([7, 10, 13]);
    expect(b.paintingTiers[0]!.effects).toEqual({ autoAddOil: 1, mcCoinAdd: 1 });
    expect(b.marketGuessFoods).toHaveLength(108);
    expect(b.guessAwards.map((a) => a.hits)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.guessBonus.map((a) => a.minHits)).toEqual([5, 4]);
    expect(b.tuning.settlement.autoRefuelThreshold).toBe(2000);
    expect(b.tuning.market.shelfLimits).toEqual([1000, 1, 9]);
    expect(b.holidays.lunar['2026-02-17']).toBe('春节');
    expect(b.actionMap.activation['oil.fill']).toBe('给自己添油');
  });

  it('任务按事件键归属到功能', () => {
    const b = buildBundle(source()).bundle!;
    const main = (step: number) => b.tasks.find((t) => t.main && t.step === step)!;
    expect(main(1).feature).toBe('growth'); // oil.fill
    expect(main(3).feature).toBe('cookbook'); // cookbooks.learned
    expect(main(7).feature).toBe('task'); // signin
    expect(main(8).feature).toBe('friend'); // roach.kill
    expect(main(10).feature).toBe('restaurant'); // rest.level
    expect(b.tasks.find((t) => t.cond.key === 'rest.thumbs')!.feature).toBe('friend');
  });

  it('featureOfKey 取最长前缀；找不到返回 null', () => {
    const f = { 'rest.': 'restaurant', 'rest.thumbs': 'friend', signin: 'task' };
    expect(featureOfKey('rest.level', f)).toBe('restaurant');
    expect(featureOfKey('rest.thumbs', f)).toBe('friend');
    expect(featureOfKey('signin', f)).toBe('task');
    expect(featureOfKey('unknown.key', f)).toBeNull();
  });

  it('活跃映射引用了不存在的活跃项', () => {
    const src = source();
    const map = structuredClone(src['game/action_map']) as { activation: Record<string, string> };
    map.activation['oil.fill'] = '不存在的活跃';
    const { errors } = buildBundle({ ...src, 'game/action_map': map });
    expect(errors).toContain('action_map activation oil.fill references unknown activation 不存在的活跃');
  });

  it('任务的事件键找不到功能', () => {
    const src = source();
    const map = structuredClone(src['game/action_map']) as { features: Record<string, string> };
    delete map.features['oil.'];
    const { errors } = buildBundle({ ...src, 'game/action_map': map });
    expect(errors).toContain('task 1 key oil.fill has no feature');
  });

  it('tuning 缺字段时报错', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { rest: Record<string, unknown> };
    delete tuning.rest.atRateBase;
    const { bundle, errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(bundle).toBeNull();
    expect(errors.some((e) => e.startsWith('game/tuning: rest.atRateBase'))).toBe(true);
  });

  it('竞猜奖励引用了不存在的道具', () => {
    const src = source();
    const award = structuredClone(src['game/market_guess_award']) as {
      byHits: Array<{ award: { goods: Array<{ id: number }> } }>;
    };
    award.byHits[0]!.award.goods[0]!.id = 999999;
    const { errors } = buildBundle({ ...src, 'game/market_guess_award': award });
    expect(errors).toContain('market_guess_award hits 1 references unknown goods 999999');
  });
});
```

并把文件顶部的导入改成：

```ts
import { buildBundle, featureOfKey } from './build';
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm exec vitest run packages/config/src/build.test.ts`
Expected: FAIL，`featureOfKey` 不存在 / `b.cookbookGrades` 为 undefined

- [ ] **Step 4: 写 `tuning.ts` 和 `ids.ts`**

`packages/config/src/tuning.ts`：

```ts
import { z } from 'zod';

const num = z.number();
const int = z.number().int();
const levelWeights = z.array(z.tuple([int, num])).min(1);

/** 数值常量（data/game/tuning.json）。区服可以通过 shard_config.override.tuning 覆盖任意字段 */
export const tuningSchema = z.object({
  rest: z.object({
    atRateBase: num,
    atRatePerStar: num,
    spRateBase: num,
    spRatePerStar: num,
    localRateBase: num,
    localRatePerStar: num,
    oilBase: num,
    coinBase: num,
    expBase: num,
    handleRateBase: num,
    handleRatePerStar: num,
    tablesPerFloor: int.min(1),
    attrPerLevel: int,
    luckPerLevel: int,
    tablesPerLevel: int,
    cookbookMaxGrade: int.min(1).max(10),
  }),
  settlement: z.object({
    atFloatBase: num,
    atFloatPerStar: num,
    spFloatPerStar: num,
    spFloatCenter: num,
    atOverflowThreshold: num,
    atOverflowDivisor: num,
    adiaoOverflowRate: num,
    negativeRenownAtRate: num,
    starPotential: z.array(num),
    cteRate: num,
    planktonRateBase: num,
    planktonRatePerStar: num,
    planktonMultiplier: num,
    roachRateBase: num,
    roachRatePerStar: num,
    squidwardRate: num,
    squidwardMinStar: int,
    squidwardOtherStreetFactor: num,
    squidwardPortions: int,
    krabRate: num,
    krabSameStreetFactor: num,
    krabLuckDivisor: num,
    krabMaxGrade: int,
    krabExpPerGrade: num,
    krabCoinMultiplier: num,
    huskyRate: num,
    painting13Rate: num,
    painting13Hours: num,
    pickyMaxGrade: int,
    cookfoodsPerFlag: int,
    cookfoodsMaxFlag: int,
    cookfoodsMinGrade: int,
    cookfoodsNeedGradeCap: int,
    dtTicketBaseRate: num,
    dtTicketLuckDivisor: num,
    dtTicketOddsDivisor: num,
    krabCoinBaseRate: num,
    krabCoinOddThreshold: num,
    krabCoinOddStep: num,
    renownRate: num,
    renownOddThreshold: num,
    autoRefuelThreshold: int,
    concurrency: int.min(1),
    batchSize: int.min(1),
  }),
  collection: z.object({
    plaquePer: num,
    an2023Multiplier: num,
    honorPer: num,
    mdcgMultiplier: num,
    an2025CoinBonus: num,
  }),
  strength: z.object({ regen: int, luckyRegen: int }),
  mouse: z.object({ rateBase: num, ratePerStar: num, newbieFactor: num, luckDivisor: num, trapCoinPerLevel: num }),
  growth: z.object({
    plaque2Star: int,
    plaque2Coin: int,
    plaque2Diamond: int,
    cookfoodsMinStar: int,
    driveKrabStrength: int,
    drivePlanktonStrength: int,
    drivePlanktonRenownPerSqrt: int,
    drivePlanktonExpPerRenown: int,
    drivePlanktonBookExpPerRenown: int,
    renameCoinPerRoach: int,
    renameMaxLength: int,
  }),
  cupboard: z.object({
    handleMax: int.min(1),
    freeHandleBase: int,
    freeHandlePerStar: int,
    thawCoinRate: num,
    failCoinRate: num,
    exchangeMaxTimes: int.min(1),
  }),
  market: z.object({
    dailyHours: z.array(int).min(1),
    dailyKinds: int,
    dailyKindsLastHour: int,
    dailyKindsLast: int,
    dailyStock: int,
    dailyRareStock: int,
    dailyLevelWeights: levelWeights,
    specialHours: z.array(int).min(1),
    specialKinds: int,
    specialHotChance: num,
    specialStockBase: int,
    specialStockRand: int,
    specialPrice: int,
    specialLevelWeights: levelWeights,
    premiumHours: z.array(int).min(1),
    premiumKinds: int,
    premiumStock: int,
    premiumRareFactor: num,
    premiumLevel: int,
    premiumPriceFactor: num,
    shelfLimits: z.tuple([int, int, int]),
    rareWindowMinutes: int,
    rareLimitOddsFactor: num,
    rareLimitBase: int,
    specialIpCooldownSec: int,
    hotMinNeedCount: int,
    guessCost: int,
    guessMaxPick: int.min(1),
    guessBonusHours: z.array(int),
  }),
  shop: z.object({
    sellRate: num,
    specialHour: int,
    specialFallbackGoods: int,
    discardable: z.array(int),
    maxBuy: int.min(1),
  }),
  store: z.object({ batchUsable: z.array(int), maxBatch: int.min(1) }),
  world: z.object({
    weatherHours: z.array(int).min(1),
    nightFrom: int,
    nightTo: int,
    krabHour: int,
    krabStreetMin: int,
    krabStreetMax: int,
    nightWeatherOdds: z.array(z.tuple([int, num])),
    dayWeightScale: num,
  }),
});

export type Tuning = z.infer<typeof tuningSchema>;
```

`packages/config/src/ids.ts`：

```ts
/** 代码里直接引用的道具 id（规格书 00~07、20）。改动时同步检查 data/dataset/goods.json */
export const GOODS = {
  mysteryTicket: 1, // 神秘礼券
  moveCard: 2, // 搬家卡
  mysteryFoodExchange: 20, // 神秘食材兑换券
  shortOilSaver: 21, // 短效节油器
  resetAttrCard: 55, // 洗点卡
  renameCard: 53, // 改名卡
  tableA: 82, // 餐桌A
  starCert: 86, // 升星凭证
  starPromoHonor: 87, // 升星促销勋章
  promoHonor: 106, // 八折促销
  moveJobHonor: 111, // 搬家处工作证
  signInGift: 115, // 每日签到礼包
  krabHappy: 133, // 蟹老板（回味无穷）
  krabAngry: 134, // 蟹老板-生气
  plankton: 363, // 痞老板
  starBlessing: 364, // 星神眷顾
  krabburgerBook: 165, // 蟹黄堡秘方
  loveNecklace: 167, // 爱心项链
  adventureMap: 170, // 探险图
  krabCoin: 240, // 蟹币
  dtTicket: 310, // 美味券
  apolloStatue: 438, // 阿波罗-雕像（银币转经验）
  armStatue: 439, // 非洲复兴纪念碑-雕像（赶走生气的蟹老板）
  an2023Plaque: 166, // 2023 纪念牌匾
  an2025Plaque: 526, // 2025 纪念牌匾
  mdcgPlaque: 619, // 马到成功
  purpleShell: 610, // 泛紫海螺
} as const;

/** 万能食材：id = 466 + 食材等级（1~5 级） */
export const FOODS = {
  masterBase: 466,
  masterLevel1: 467,
  masterLevel2: 468,
} as const;

/** 道具类型（goods.type） */
export const GOODS_TYPE = {
  consumable: 0,
  item: 1,
  gift: 2,
  device: 3,
  equip: 4,
  gem: 5,
  remnant: 8,
  honor: 9,
} as const;

/** 牌匾的 devicetype；盆栽、名画勋章的 devicetype */
export const DEVICE_TYPE = { plaque: 6, pot: 36, painting: 41 } as const;
```

- [ ] **Step 5: 扩展 `source.ts`**

把 `SOURCE_FILES` 改成：

```ts
export const SOURCE_FILES = [
  'dataset/foods',
  'dataset/goods',
  'dataset/cookbooks',
  'dataset/streets',
  'dataset/mysterious_cookbooks',
  'dataset/devices',
  'dataset/activation_tasks',
  'dataset/activation_rewards',
  'dataset/suit_pot',
  'dataset/suit_painting',
  'dataset/market_guess_foods',
  'designed/cookbooks_price',
  'designed/cookbook_grades',
  'designed/goods_awardflag',
  'designed/weather',
  'designed/star_need',
  'designed/star_award',
  'designed/oil_need',
  'designed/tasks',
  'designed/seeds',
  'designed/seed_exchange',
  'designed/foods_formula',
  'designed/goods_exchange',
  'designed/renown_shop',
  'designed/bless',
  'designed/shop_special_rate',
  'designed/shop_pools',
  'game/tuning',
  'game/holidays',
  'game/market_guess_award',
  'game/action_map',
  'restaurant_defaults',
] as const;
```

把 `readSourceDir` 的循环体改成：

```ts
  for (const name of SOURCE_FILES) {
    const json = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as { data?: unknown };
    // data/game/ 下的文件和 restaurant_defaults 是整个对象；数据集文件取 data 数组
    out[name] = name === 'restaurant_defaults' || name.startsWith('game/') ? json : json.data;
  }
```

- [ ] **Step 6: 扩展 `raw.ts`**

在 `raw.ts` 末尾追加：

```ts
export const rawCookbookGrade = z.object({
  grade: int,
  name: z.string(),
  atRatePerCookbook: z.number(),
  spCoinAddRate: z.number(),
  upgradeCoin: z.number(),
  shellPerFood: int,
});

export const rawSpecialTier = z.object({
  name: z.string(),
  foodsrate: z.number(),
  num: int,
  startrate: z.number(),
  endrate: z.number(),
});

export const rawShopPool = z.object({ pool: z.enum(['special', 'black']), goods: z.array(int) });

export const rawDictTier = z.object({ dictname: z.string(), dictval: int, note: z.string() });

export const rawGuessFood = z.object({ i: int, l: int, n: z.string(), o: z.number() });

export const guessAwardFile = z.object({
  byHits: z.array(z.object({ hits: int.min(1), award: awardSchema })),
  bonus: z.array(z.object({ minHits: int.min(1), award: awardSchema })),
});

export const actionMapFile = z.object({
  activation: z.record(z.string(), z.string()),
  features: z.record(z.string(), z.string()),
});

const mmdd = z.string().regex(/^\d{2}-\d{2}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const holidaysFile = z.object({
  solarMultiplier: int,
  lunarMultiplier: int,
  solar: z.record(mmdd, z.string()),
  qingming: z.record(z.string().regex(/^\d{4}$/), mmdd),
  lunar: z.record(ymd, z.string()),
});
```

- [ ] **Step 7: 扩展 `types.ts`**

在 `Task` 接口里加一行 `feature: string;`（放在 `href` 之后），并在文件末尾、`ConfigBundle` 之前加：

```ts
export interface CookbookGrade {
  grade: number;
  name: string;
  atRatePerCookbook: number;
  spCoinAddRate: number;
  upgradeCoin: number;
  shellPerFood: number;
}

export interface ShopSpecialTier {
  name: string;
  discount: number;
  stock: number;
  /** 随机数落在 [from, to) 时选中这一档 */
  from: number;
  to: number;
}

export interface CollectionTier {
  count: number;
  name: string;
  effects: Record<string, number>;
}

export interface GuessAward {
  hits: number;
  award: Award;
}

export interface GuessBonus {
  minHits: number;
  award: Award;
}

export interface ActionMap {
  /** 行为键 → 活跃项名称 */
  activation: Record<string, string>;
  /** 事件键前缀 → 功能名 */
  features: Record<string, string>;
}

export interface Holidays {
  solarMultiplier: number;
  lunarMultiplier: number;
  /** MM-DD → 名称 */
  solar: Record<string, string>;
  /** 年份 → 清明 MM-DD */
  qingming: Record<string, string>;
  /** YYYY-MM-DD → 名称 */
  lunar: Record<string, string>;
}
```

在 `ConfigBundle` 里 `restaurantDefaults` 之前加：

```ts
  cookbookGrades: CookbookGrade[];
  shopSpecialTiers: ShopSpecialTier[];
  shopPools: { special: number[]; black: number[] };
  potTiers: CollectionTier[];
  paintingTiers: CollectionTier[];
  marketGuessFoods: number[];
  guessAwards: GuessAward[];
  guessBonus: GuessBonus[];
  actionMap: ActionMap;
  holidays: Holidays;
  tuning: Tuning;
```

并在文件顶部加 `import type { Tuning } from './tuning';`。

- [ ] **Step 8: 扩展 `build.ts`**

1. 顶部导入改成：

```ts
import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as raw from './raw';
import type { SourceData } from './source';
import { tuningSchema } from './tuning';
import type {
  ActivationReward,
  Award,
  CollectionTier,
  ConfigBundle,
  Cookbook,
  Food,
  GiftItem,
  Goods,
  IdNum,
} from './types';
```

2. 在 `numericEntries` 之后加：

```ts
/** 事件键归属的功能：按前缀匹配，取最长的前缀；找不到返回 null */
export function featureOfKey(key: string, features: Record<string, string>): string | null {
  let best: string | null = null;
  for (const prefix of Object.keys(features)) {
    if (key.startsWith(prefix) && (best === null || prefix.length > best.length)) best = prefix;
  }
  return best === null ? null : features[best]!;
}

function tiersFrom(list: Array<{ dictname: string; dictval: number; note: string }>): CollectionTier[] {
  return list
    .map((t) => {
      let note: unknown = {};
      try {
        note = JSON.parse(t.note);
      } catch {
        note = {};
      }
      return { count: t.dictval, name: t.dictname, effects: numericEntries(note) };
    })
    .sort((a, b) => a.count - b.count);
}
```

3. 在现有的一串 `parse(...)` 后面（`const defaults = ...` 之前）加：

```ts
  const potRaw = parse('dataset/suit_pot', z.array(raw.rawDictTier));
  const paintingRaw = parse('dataset/suit_painting', z.array(raw.rawDictTier));
  const guessFoodsRaw = parse('dataset/market_guess_foods', z.array(raw.rawGuessFood));
  const gradesRaw = parse('designed/cookbook_grades', z.array(raw.rawCookbookGrade));
  const specialTiersRaw = parse('designed/shop_special_rate', z.array(raw.rawSpecialTier));
  const shopPoolsRaw = parse('designed/shop_pools', z.array(raw.rawShopPool));
  const tuning = parse('game/tuning', tuningSchema);
  const holidays = parse('game/holidays', raw.holidaysFile);
  const guessAwardRaw = parse('game/market_guess_award', raw.guessAwardFile);
  const actionMap = parse('game/action_map', raw.actionMapFile);
```

4. 在那一大串 `!xxx ||` 的判断里补上：`!potRaw || !paintingRaw || !guessFoodsRaw || !gradesRaw || !specialTiersRaw || !shopPoolsRaw || !tuning || !holidays || !guessAwardRaw || !actionMap ||`（加在 `!defaults` 前面）。

5. 把任务的规范化改成（替换原来的 `const tasks = tasksRaw.map(...)` 以及其后的 `unique('tasks', ...)` 保持不变）：

```ts
  const tasks = tasksRaw.map((t) => {
    const feature = featureOfKey(t.cond.key, actionMap.features);
    if (feature === null) errors.push(`task ${t.id} key ${t.cond.key} has no feature`);
    return {
      id: t.id,
      main: t.mainflag === 1,
      step: t.step,
      name: t.taskname,
      cond: t.cond,
      award: t.award,
      href: t.href,
      feature: feature ?? '',
    };
  });
```

6. 在 `activationRewards` 的循环之后加：

```ts
  const activationNames = new Set(activationTasks.map((a) => a.name));
  for (const [key, name] of Object.entries(actionMap.activation)) {
    if (!activationNames.has(name))
      errors.push(`action_map activation ${key} references unknown activation ${name}`);
  }

  // ---------- 2A 新表 ----------
  const cookbookGrades = gradesRaw.map((g) => ({ ...g })).sort((a, b) => a.grade - b.grade);
  contiguous(
    'cookbook_grades',
    cookbookGrades.map((g) => g.grade),
  );

  const shopSpecialTiers = specialTiersRaw
    .map((t) => ({ name: t.name, discount: t.foodsrate, stock: t.num, from: t.startrate, to: t.endrate }))
    .sort((a, b) => a.from - b.from);
  if (shopSpecialTiers[0]?.from !== 0 || shopSpecialTiers.at(-1)?.to !== 1)
    errors.push('shop_special_rate must cover [0, 1)');

  const shopPools = { special: [] as number[], black: [] as number[] };
  for (const p of shopPoolsRaw) {
    for (const id of p.goods) {
      if (!goodsIds.has(id)) errors.push(`shop_pools ${p.pool} references unknown goods ${id}`);
    }
    shopPools[p.pool] = p.goods;
  }
  if (!goodsIds.has(tuning.shop.specialFallbackGoods))
    errors.push(`tuning shop.specialFallbackGoods references unknown goods ${tuning.shop.specialFallbackGoods}`);

  const marketGuessFoods = guessFoodsRaw.map((f) => f.i);
  for (const id of marketGuessFoods)
    if (!foodIds.has(id)) errors.push(`market_guess_foods references unknown food ${id}`);

  const guessAwards = guessAwardRaw.byHits.sort((a, b) => a.hits - b.hits);
  for (const a of guessAwards) checkAward(`market_guess_award hits ${a.hits}`, a.award);
  const guessBonus = guessAwardRaw.bonus.sort((a, b) => b.minHits - a.minHits);
  for (const a of guessBonus) checkAward(`market_guess_award bonus ${a.minHits}`, a.award);
```

7. 把 `body` 对象改成（在 `activationRewards` 之后、`restaurantDefaults` 之前插入新字段）：

```ts
  const body: Omit<ConfigBundle, 'version'> = {
    foods,
    goods,
    cookbooks,
    streets,
    mysteriousCookbooks,
    weather,
    devices,
    starNeed,
    starAward,
    oilNeed,
    tasks,
    activationTasks,
    activationRewards,
    cookbookGrades,
    shopSpecialTiers,
    shopPools,
    potTiers: tiersFrom(potRaw),
    paintingTiers: tiersFrom(paintingRaw),
    marketGuessFoods,
    guessAwards,
    guessBonus,
    actionMap,
    holidays,
    tuning,
    restaurantDefaults: defaults,
    extra: {
      seeds: seedsRaw,
      seedExchange: seedExRaw,
      formulas: formulasRaw,
      goodsExchange: goodsExRaw,
      renownShop: renownRaw,
      bless: blessRaw,
    },
  };
```

- [ ] **Step 9: 导出**

`packages/config/src/index.ts` 追加：

```ts
export * from './tuning';
export * from './ids';
```

（`featureOfKey` 已随 `export * from './build'` 导出；如果 index 里没有导出 build，就加上 `export { featureOfKey } from './build';`。）

- [ ] **Step 10: 运行测试确认通过**

Run: `pnpm exec vitest run packages/config/src/build.test.ts`
Expected: PASS（原有用例和新增 7 个用例全部通过）

- [ ] **Step 11: 类型检查并提交**

Run: `pnpm --filter @dt/config typecheck && pnpm format`
Expected: 无错误

```bash
git add packages/config
git commit -m "feat(config): tuning, holidays, guess awards, action map, cookbook grades, shop pools, collection tiers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 配置包——运行时索引、道具用途、区服 tuning

**Files:**
- Create: `packages/config/src/goodsUse.ts`
- Test: `packages/config/src/goodsUse.test.ts`
- Modify: `packages/config/package.json`（依赖 `@dt/shared`）
- Modify: `packages/config/src/types.ts`（`Goods.use`）
- Modify: `packages/config/src/build.ts`（推导 `use`）
- Modify: `packages/config/src/runtime.ts`
- Test: `packages/config/src/runtime.test.ts`
- Modify: `packages/config/src/shard.ts`
- Test: `packages/config/src/shard.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ConfigBundle` 新字段、`GOODS`、`Tuning`；`@dt/shared` 的 `buildPool`、`WeightedPool`、`gameParts`（Task 3 才加 `gameParts`，本任务用 `gameDay`）
- Produces:
  - `GoodsUse` 类型与 `deriveGoodsUse(g: Goods): GoodsUse | null`
  - `Goods.use: GoodsUse | null`
  - `GameConfig` 新成员：
    - `tuning: Tuning`
    - `foodsByLevel: ReadonlyMap<number, readonly Food[]>`
    - `foodPools: ReadonlyMap<number, WeightedPool<Food>>`（该等级全部食材，按 odds）
    - `rareFoodPools: ReadonlyMap<number, WeightedPool<Food>>`（该等级 odds<100）
    - `hotFoodPool: WeightedPool<Food>`
    - `masterFoodPool: WeightedPool<Food>`（等级 9 万能食材）
    - `cookbookIndex: CookbookIndex`
    - `devices: ReadonlyMap<number, Device>`（key = 设施位 id 1~9）
    - `starNeed: ReadonlyMap<number, StarNeed>`、`starAward: ReadonlyMap<number, Award>`、`oilNeed: ReadonlyMap<number, OilNeed>`
    - `grade(g: number): CookbookGrade`（g=1..10）
    - `activationByName: ReadonlyMap<string, ActivationTask>`
    - `guessFoodIds: ReadonlySet<number>`
    - `randomGoodsIds(level: number): readonly number[]`
    - `streetMedalId(streetId: number): number`
    - `isStreetMedal(g: Goods): boolean`
    - `holidayMultiplier(date: Date): number`
    - `requireFood(id)`、`requireCookbook(id)`
  - `ShardSettings.tuning: Tuning`

- [ ] **Step 1: 加依赖**

`packages/config/package.json` 的 `dependencies` 改成：

```json
  "dependencies": {
    "@dt/shared": "workspace:*",
    "zod": "^3.25.76"
  },
```

Run: `pnpm install`
Expected: 成功，`packages/config/node_modules/@dt/shared` 链接到工作区

- [ ] **Step 2: 写道具用途的失败测试**

`packages/config/src/goodsUse.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const bundle = buildBundle(readSourceDir(defaultDataDir())).bundle!;
const use = (id: number) => bundle.goods.find((g) => g.id === id)!.use;

describe('道具用途（构建时推导）', () => {
  it('货币', () => {
    expect(use(85)).toEqual({ kind: 'currency', coin: 100000, diamond: 0 });
    expect(use(137)).toEqual({ kind: 'currency', coin: 0, diamond: 1 });
  });
  it('各种卡', () => {
    expect(use(3)).toEqual({ kind: 'cupboardNum', amount: 1 });
    expect(use(4)).toEqual({ kind: 'cupboardNum', amount: 5 });
    expect(use(8)).toEqual({ kind: 'storeNum', amount: 10 });
    expect(use(9)).toEqual({ kind: 'lockSlots', amount: 1 });
    expect(use(29)).toEqual({ kind: 'strength', amount: 100 });
    expect(use(303)).toEqual({ kind: 'foodsMax', amount: 20 });
    expect(use(55)).toEqual({ kind: 'resetAttr' });
  });
  it('餐桌、神秘食材、鞋带、厨塔挑战券', () => {
    expect(use(82)).toEqual({ kind: 'addTable' });
    expect(use(139)).toEqual({ kind: 'mysteryFood', level: 7 });
    expect(use(169)).toEqual({ kind: 'bundle', goods: 18, num: 36, targetGoods: 17, targetNum: 1 });
    expect(use(136)).toEqual({ kind: 'towerTicket' });
  });
  it('新格式礼包可以打开，QQ 旧格式礼包不能用', () => {
    expect(use(115)).toEqual({ kind: 'gift' });
    expect(use(117)).toEqual({ kind: 'gift' });
    expect(use(54)).toBeNull();
    expect(use(51)).toBeNull();
  });
  it('其他道具没有用途', () => {
    expect(use(86)).toBeNull();
    expect(use(1)).toBeNull();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run packages/config/src/goodsUse.test.ts`
Expected: FAIL，`use` 为 undefined

- [ ] **Step 4: 实现 `goodsUse.ts` 并接入构建**

`packages/config/src/goodsUse.ts`：

```ts
import type { Goods } from './types';

/** 道具的使用效果。按名称识别只在这里做一次，运行时只看 kind（设计文档 §5.1） */
export type GoodsUse =
  | { kind: 'currency'; coin: number; diamond: number }
  | { kind: 'addTable' }
  | { kind: 'strength'; amount: number }
  | { kind: 'mysteryFood'; level: number }
  | { kind: 'lockSlots'; amount: number }
  | { kind: 'resetAttr' }
  | { kind: 'bundle'; goods: number; num: number; targetGoods: number; targetNum: number }
  | { kind: 'foodsMax'; amount: number }
  | { kind: 'storeNum'; amount: number }
  | { kind: 'cupboardNum'; amount: number }
  | { kind: 'gift' }
  | { kind: 'towerTicket' };

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function n(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

export function deriveGoodsUse(g: Goods): GoodsUse | null {
  const amount = typeof g.value === 'number' ? g.value : 0;
  const o = obj(g.value);
  switch (g.name) {
    case '银币':
    case '金币':
    case '钻石':
      return { kind: 'currency', coin: n(o.coin), diamond: n(o.diamond) };
    case '餐桌A':
      return { kind: 'addTable' };
    case '小体力卡':
    case '体力卡':
      return amount > 0 ? { kind: 'strength', amount } : null;
    case '神秘食材随机劵':
      return { kind: 'mysteryFood', level: amount > 0 ? amount : 7 };
    case '保险卡':
      return amount > 0 ? { kind: 'lockSlots', amount } : null;
    case '洗点卡':
      return { kind: 'resetAttr' };
    case '鞋带':
      return {
        kind: 'bundle',
        goods: n(o.goods),
        num: n(o.num),
        targetGoods: n(o.targetGoods),
        targetNum: n(o.targetNum),
      };
    case '小食材叠加卡':
    case '食材叠加卡':
      return amount > 0 ? { kind: 'foodsMax', amount } : null;
    case '小扩建卡':
    case '中扩建卡':
    case '大扩建卡':
      return amount > 0 ? { kind: 'storeNum', amount } : null;
    case '小扩容卡':
    case '中扩容卡':
    case '大扩容卡':
      return amount > 0 ? { kind: 'cupboardNum', amount } : null;
    case '厨塔挑战券':
      return { kind: 'towerTicket' };
  }
  if (g.name.includes('礼包') && g.gift !== null) return { kind: 'gift' };
  return null;
}
```

`types.ts` 的 `Goods` 接口加一个字段（放在 `gift` 之后）：

```ts
  /** 使用效果；null = 不能使用 */
  use: GoodsUse | null;
```

并在 `types.ts` 顶部加 `import type { GoodsUse } from './goodsUse';`。

`build.ts`：顶部加 `import { deriveGoodsUse } from './goodsUse';`；道具规范化的 `return { ... gift, }` 改成先构造对象再补 `use`：

```ts
    const item: Goods = {
      id: g.id,
      name: g.name,
      type: g.type,
      deviceType: g.devicetype ?? null,
      invalidHours: g.invalidhour ?? null,
      maxNum: g.maxNum ?? 9999,
      stackable: g.subflag === 1,
      level: g.level ?? 1,
      coin: g.coin ?? 0,
      diamond: g.diamond ?? 0,
      onSale: g.saleflag === 1,
      awardFlag: awardFlags.get(g.id) ?? g.awardflag ?? null,
      desc: g.desc ?? '',
      value,
      effects: numericEntries(value),
      gift,
      use: null,
    };
    item.use = deriveGoodsUse(item);
    return item;
```

`index.ts` 追加 `export * from './goodsUse';`。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm exec vitest run packages/config/src/goodsUse.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 6: 写运行时索引的失败测试**

`packages/config/src/runtime.test.ts` 末尾追加（文件里已有 `createGameConfig` 的导入；如没有，补上 `import { createGameConfig } from './runtime';` 和 `buildBundle`、`readSourceDir`、`defaultDataDir` 的导入）：

```ts
describe('2A 运行时索引', () => {
  const cfg = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

  it('食材按等级分组，稀有池只含 odds<100', () => {
    expect(cfg.foodsByLevel.get(1)!.length).toBe(27);
    expect(cfg.foodPools.get(2)!.items.length).toBe(81);
    expect(cfg.rareFoodPools.get(2)!.items.every((f) => f.odds < 100)).toBe(true);
    expect(cfg.masterFoodPool.items.map((f) => f.id)).toEqual([467, 468, 469, 470, 471]);
    expect(cfg.hotFoodPool.items.length).toBe(18);
  });

  it('食谱索引', () => {
    const idx = cfg.cookbookIndex;
    expect(idx.street[1]).toBe(6);
    expect(idx.coin[1]).toBe(cfg.cookbooks.get(1)!.coin);
    expect(idx.idsByStreet.get(0)!.length).toBe(72);
    expect(idx.allIds.length).toBe(2363);
  });

  it('街道勋章：新手街 140，江西街 187', () => {
    expect(cfg.streetMedalId(0)).toBe(140);
    expect(cfg.streetMedalId(11)).toBe(187);
    expect(cfg.isStreetMedal(cfg.requireGoods(189))).toBe(true);
    expect(cfg.isStreetMedal(cfg.requireGoods(100))).toBe(false);
  });

  it('设施位、星级、油壶、品级、活跃项', () => {
    expect(cfg.devices.get(7)!.deviceType).toBe(6);
    expect(cfg.starNeed.get(1)!.needLevel).toBe(13);
    expect(cfg.starAward.get(1)!.goods).toEqual([{ id: 117, num: 1 }]);
    expect(cfg.oilNeed.get(1)!.oilMax).toBe(1500);
    expect(cfg.grade(7).spCoinAddRate).toBe(1.3);
    expect(cfg.activationByName.get('签到')!.points).toBe(10);
    expect(cfg.guessFoodIds.has(238)).toBe(true);
  });

  it('随机奖池不含装备，按 awardflag 过滤', () => {
    const pool = cfg.randomGoodsIds(7);
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) {
      const g = cfg.requireGoods(id);
      expect(g.type).not.toBe(4);
      expect(g.awardFlag).not.toBeNull();
      expect(g.awardFlag!).toBeLessThanOrEqual(7);
    }
  });

  it('节日倍数：公历 2、农历 3、同一天两者都有 5、平日 1（按北京时间）', () => {
    expect(cfg.holidayMultiplier(new Date('2026-05-01T04:00:00Z'))).toBe(2);
    expect(cfg.holidayMultiplier(new Date('2026-02-17T04:00:00Z'))).toBe(3);
    expect(cfg.holidayMultiplier(new Date('2031-10-01T04:00:00Z'))).toBe(5); // 国庆 + 中秋
    expect(cfg.holidayMultiplier(new Date('2026-04-05T04:00:00Z'))).toBe(2); // 清明
    expect(cfg.holidayMultiplier(new Date('2026-09-29T04:00:00Z'))).toBe(1);
    // UTC 2026-04-30 16:00 = 北京时间 05-01 00:00
    expect(cfg.holidayMultiplier(new Date('2026-04-30T16:00:00Z'))).toBe(2);
  });
});
```

- [ ] **Step 7: 运行确认失败**

Run: `pnpm exec vitest run packages/config/src/runtime.test.ts`
Expected: FAIL，`cfg.foodsByLevel` 为 undefined

- [ ] **Step 8: 实现运行时索引**

把 `packages/config/src/runtime.ts` 整个替换为：

```ts
import { readFileSync } from 'node:fs';
import { buildPool, gameDay, type WeightedPool } from '@dt/shared';
import { featureOfKey } from './build';
import { DEVICE_TYPE, GOODS_TYPE } from './ids';
import type { Tuning } from './tuning';
import type {
  ActivationTask,
  Award,
  ConfigBundle,
  Cookbook,
  CookbookGrade,
  Device,
  Food,
  Goods,
  OilNeed,
  StarNeed,
  Street,
  Weather,
} from './types';

export interface CookbookIndex {
  readonly maxId: number;
  /** 下标 = 食谱 id，值 = 街道；-1 = 没有这个 id */
  readonly street: Int16Array;
  /** 下标 = 食谱 id，值 = 售价 */
  readonly coin: Float64Array;
  readonly idsByStreet: ReadonlyMap<number, readonly number[]>;
  readonly allIds: readonly number[];
}

export interface GameConfig {
  readonly version: string;
  readonly bundle: ConfigBundle;
  readonly tuning: Tuning;
  readonly foods: ReadonlyMap<number, Food>;
  readonly goods: ReadonlyMap<number, Goods>;
  readonly cookbooks: ReadonlyMap<number, Cookbook>;
  readonly streets: ReadonlyMap<number, Street>;
  readonly weather: ReadonlyMap<number, Weather>;
  /** 最大食谱 id，用于确定每店已学食谱数组的长度 */
  readonly maxCookbookId: number;
  readonly foodsByLevel: ReadonlyMap<number, readonly Food[]>;
  readonly foodPools: ReadonlyMap<number, WeightedPool<Food>>;
  readonly rareFoodPools: ReadonlyMap<number, WeightedPool<Food>>;
  readonly hotFoodPool: WeightedPool<Food>;
  readonly masterFoodPool: WeightedPool<Food>;
  readonly cookbookIndex: CookbookIndex;
  readonly devices: ReadonlyMap<number, Device>;
  readonly starNeed: ReadonlyMap<number, StarNeed>;
  readonly starAward: ReadonlyMap<number, Award>;
  readonly oilNeed: ReadonlyMap<number, OilNeed>;
  readonly activationByName: ReadonlyMap<string, ActivationTask>;
  readonly guessFoodIds: ReadonlySet<number>;
  grade(g: number): CookbookGrade;
  randomGoodsIds(level: number): readonly number[];
  streetMedalId(streetId: number): number;
  isStreetMedal(g: Goods): boolean;
  holidayMultiplier(date: Date): number;
  featureOfKey(key: string): string | null;
  requireGoods(id: number): Goods;
  requireFood(id: number): Food;
  requireCookbook(id: number): Cookbook;
  requireStreet(id: number): Street;
}

function byId<T extends { id: number }>(list: T[]): Map<number, T> {
  return new Map(list.map((x) => [x.id, x]));
}

function groupBy<T, K>(list: readonly T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = out.get(k) ?? [];
    arr.push(x);
    out.set(k, arr);
  }
  return out;
}

function buildCookbookIndex(cookbooks: Cookbook[]): CookbookIndex {
  const maxId = Math.max(...cookbooks.map((c) => c.id));
  const street = new Int16Array(maxId + 1).fill(-1);
  const coin = new Float64Array(maxId + 1);
  const byStreet = new Map<number, number[]>();
  const sorted = [...cookbooks].sort((a, b) => a.id - b.id);
  for (const c of sorted) {
    street[c.id] = c.streetId;
    coin[c.id] = c.coin;
    const list = byStreet.get(c.streetId) ?? [];
    list.push(c.id);
    byStreet.set(c.streetId, list);
  }
  return { maxId, street, coin, idsByStreet: byStreet, allIds: sorted.map((c) => c.id) };
}

export function createGameConfig(bundle: ConfigBundle): GameConfig {
  const goods = byId(bundle.goods);
  const foods = byId(bundle.foods);
  const cookbooks = byId(bundle.cookbooks);
  const streets = byId(bundle.streets);
  const tuning = bundle.tuning;

  const foodsByLevel = groupBy(bundle.foods, (f) => f.level);
  const foodPools = new Map<number, WeightedPool<Food>>();
  const rareFoodPools = new Map<number, WeightedPool<Food>>();
  for (const [level, list] of foodsByLevel) {
    foodPools.set(
      level,
      buildPool(list, (f) => f.odds),
    );
    rareFoodPools.set(
      level,
      buildPool(
        list.filter((f) => f.odds < 100),
        (f) => f.odds,
      ),
    );
  }

  // "热门稀缺食材"：2~5 级、稀有、在食谱需求表里出现次数超过门槛（规格书 06 §6.1）
  const needCount = new Map<number, number>();
  for (const c of bundle.cookbooks) {
    for (const list of Object.values(c.needFoods)) {
      for (const f of list) needCount.set(f.foodsId, (needCount.get(f.foodsId) ?? 0) + 1);
    }
  }
  const hot = bundle.foods.filter(
    (f) =>
      f.level >= 2 && f.level <= 5 && f.odds < 100 && (needCount.get(f.id) ?? 0) > tuning.market.hotMinNeedCount,
  );

  const streetMedals = new Map<number, number>();
  const isStreetMedal = (g: Goods) =>
    g.type === GOODS_TYPE.honor && g.deviceType !== null && streets.has(g.deviceType) && g.deviceType <= 13;
  for (const g of bundle.goods) if (isStreetMedal(g)) streetMedals.set(g.deviceType!, g.id);

  const randomPools = new Map<number, number[]>();
  const grades = new Map(bundle.cookbookGrades.map((g) => [g.grade, g]));

  return {
    version: bundle.version,
    bundle,
    tuning,
    foods,
    goods,
    cookbooks,
    streets,
    weather: byId(bundle.weather),
    maxCookbookId: Math.max(...bundle.cookbooks.map((c) => c.id)),
    foodsByLevel,
    foodPools,
    rareFoodPools,
    hotFoodPool: buildPool(hot, (f) => f.odds),
    masterFoodPool: buildPool(foodsByLevel.get(9) ?? [], (f) => f.odds),
    cookbookIndex: buildCookbookIndex(bundle.cookbooks),
    devices: byId(bundle.devices),
    starNeed: new Map(bundle.starNeed.map((s) => [s.star, s])),
    starAward: new Map(bundle.starAward.map((s) => [s.star, s.award])),
    oilNeed: new Map(bundle.oilNeed.map((o) => [o.level, o])),
    activationByName: new Map(bundle.activationTasks.map((a) => [a.name, a])),
    guessFoodIds: new Set(bundle.marketGuessFoods),
    grade(g) {
      const x = grades.get(g);
      if (!x) throw new Error(`unknown cookbook grade ${g}`);
      return x;
    },
    randomGoodsIds(level) {
      let pool = randomPools.get(level);
      if (!pool) {
        pool = bundle.goods
          .filter((g) => g.type !== GOODS_TYPE.equip && g.awardFlag !== null && g.awardFlag <= level)
          .map((g) => g.id);
        randomPools.set(level, pool);
      }
      return pool;
    },
    streetMedalId(streetId) {
      const id = streetMedals.get(streetId);
      if (id === undefined) throw new Error(`no street medal for street ${streetId}`);
      return id;
    },
    isStreetMedal,
    holidayMultiplier(date) {
      const day = gameDay(date);
      const mmdd = day.slice(5);
      const h = bundle.holidays;
      let m = 0;
      if (h.solar[mmdd] !== undefined || h.qingming[day.slice(0, 4)] === mmdd) m += h.solarMultiplier;
      if (h.lunar[day] !== undefined) m += h.lunarMultiplier;
      return m === 0 ? 1 : m;
    },
    featureOfKey(key) {
      return featureOfKey(key, bundle.actionMap.features);
    },
    requireGoods(id) {
      const g = goods.get(id);
      if (!g) throw new Error(`unknown goods ${id}`);
      return g;
    },
    requireFood(id) {
      const f = foods.get(id);
      if (!f) throw new Error(`unknown food ${id}`);
      return f;
    },
    requireCookbook(id) {
      const c = cookbooks.get(id);
      if (!c) throw new Error(`unknown cookbook ${id}`);
      return c;
    },
    requireStreet(id) {
      const s = streets.get(id);
      if (!s) throw new Error(`unknown street ${id}`);
      return s;
    },
  };
}

export function loadGameConfig(path: string): GameConfig {
  return createGameConfig(JSON.parse(readFileSync(path, 'utf8')) as ConfigBundle);
}

/** 道具效果持续小时数：invalidhour 优先，其次 value.time；都没有 = 永久 */
export function goodsEffectHours(g: Goods): number | null {
  if (g.invalidHours !== null) return g.invalidHours;
  const time =
    typeof g.value === 'object' && g.value !== null ? (g.value as { time?: unknown }).time : undefined;
  return typeof time === 'number' ? time : null;
}

/** 设施摆放的基础时长（小时）：value.time 优先，其次 invalidhour；牌匾返回 null（永久） */
export function deviceHours(g: Goods): number | null {
  if (g.deviceType === DEVICE_TYPE.plaque) return null;
  const time =
    typeof g.value === 'object' && g.value !== null ? (g.value as { time?: unknown }).time : undefined;
  if (typeof time === 'number') return time;
  return g.invalidHours;
}
```

- [ ] **Step 9: 运行确认通过**

Run: `pnpm exec vitest run packages/config/src/runtime.test.ts`
Expected: PASS

- [ ] **Step 10: 区服 tuning 覆盖——失败测试**

`packages/config/src/shard.test.ts` 末尾追加（沿用文件里已有的 `config` 变量；如果名字不同，按文件里现有的 GameConfig 变量名改）：

```ts
describe('区服 tuning 覆盖', () => {
  it('没有覆盖时等于基础 tuning', () => {
    expect(resolveShardSettings(config, {}).tuning).toEqual(config.tuning);
  });
  it('部分覆盖只改指定字段', () => {
    const s = resolveShardSettings(config, { tuning: { market: { specialPrice: 1999 } } });
    expect(s.tuning.market.specialPrice).toBe(1999);
    expect(s.tuning.market.dailyStock).toBe(config.tuning.market.dailyStock);
    expect(s.tuning.rest).toEqual(config.tuning.rest);
  });
  it('覆盖成非法值时报错', () => {
    expect(() => resolveShardSettings(config, { tuning: { rest: { tablesPerFloor: 0 } } })).toThrow();
  });
});
```

Run: `pnpm exec vitest run packages/config/src/shard.test.ts`
Expected: FAIL，`tuning` 为 undefined

- [ ] **Step 11: 实现区服 tuning**

`packages/config/src/shard.ts` 改成：

```ts
import { z } from 'zod';
import { restaurantDefaultsSchema } from './raw';
import type { GameConfig } from './runtime';
import { tuningSchema, type Tuning } from './tuning';
import type { RestaurantDefaults } from './types';

export interface ShardSettings {
  /** 功能开关：未列出的功能默认开启 */
  features: Record<string, boolean>;
  restaurant: RestaurantDefaults;
  tuning: Tuning;
}

const shardSettingsSchema = z.object({
  features: z.record(z.string(), z.boolean()),
  restaurant: restaurantDefaultsSchema,
  tuning: tuningSchema,
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

/** 基础配置 + 区服覆盖（深合并，数组整体替换），结果再校验一遍 */
export function resolveShardSettings(config: GameConfig, override: unknown): ShardSettings {
  const base: ShardSettings = {
    features: {},
    restaurant: config.bundle.restaurantDefaults,
    tuning: config.tuning,
  };
  return shardSettingsSchema.parse(deepMerge(base, isPlainObject(override) ? override : {}));
}

export function isFeatureEnabled(settings: ShardSettings, name: string): boolean {
  return settings.features[name] !== false;
}
```

- [ ] **Step 12: 运行 config 包全部测试**

Run: `pnpm exec vitest run packages/config`
Expected: 全部 PASS

- [ ] **Step 13: 全仓类型检查、提交**

Run: `pnpm --filter @dt/config build && pnpm typecheck && pnpm format`
Expected: 无错误（服务端引用的 `goodsEffectHours`、`GameConfig` 仍兼容）

```bash
git add packages/config pnpm-lock.yaml
git commit -m "feat(config): runtime indexes, goods use kinds, shard tuning overrides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: 公共包——北京时间时间槽、轮次、新错误码

**Files:**
- Modify: `packages/shared/src/time.ts`
- Modify: `packages/shared/src/errors.ts`
- Test: `packages/shared/src/time.test.ts`
- Modify: `apps/web/src/i18n/zh-CN.ts`（新错误码的中文，保证前端类型检查通过）

**Interfaces:**
- Produces（`@dt/shared`）：
  - `ROUND_MS = 240_000`、`roundOf(date: Date): number`
  - `gameParts(date: Date): { day: string; hour: number; minute: number }`
  - `addDays(day: string, n: number): string`
  - `gameTime(day: string, hour: number, minute?: number): Date`
  - `slotKey(day: string, hour: number): string`（`YYYY-MM-DD@HH`）
  - `interface Slot { key: string; day: string; hour: number; start: Date }`
  - `latestSlot(now: Date, hours: readonly number[]): Slot`、`nextSlot(now: Date, hours: readonly number[]): Slot`、`parseSlotKey(key: string): Slot`
  - `ErrorCode` 新增：`NOT_ENOUGH`、`REQUIREMENT_NOT_MET`、`LIMIT_REACHED`、`ALREADY_DONE`、`NOT_USABLE`、`STORE_FULL`、`CUPBOARD_FULL`、`COOKBOOK_MAX_GRADE`、`SOLD_OUT`、`COOLDOWN`、`INVALID_STATE`

- [ ] **Step 1: 写失败的测试**

`packages/shared/src/time.test.ts`（新文件）：

```ts
import { describe, expect, it } from 'vitest';
import { addDays, gameDay, gameParts, gameTime, latestSlot, nextSlot, parseSlotKey, roundOf, slotKey } from './time';

describe('北京时间', () => {
  it('gameParts 与 gameDay 一致，UTC 16:00 是北京时间次日 0 点', () => {
    expect(gameParts(new Date('2026-09-29T15:59:59Z'))).toEqual({ day: '2026-09-29', hour: 23, minute: 59 });
    expect(gameParts(new Date('2026-09-29T16:00:00Z'))).toEqual({ day: '2026-09-30', hour: 0, minute: 0 });
    expect(gameDay(new Date('2026-09-29T16:00:00Z'))).toBe('2026-09-30');
  });
  it('addDays 与 gameTime', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(gameTime('2026-09-30', 8).toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(slotKey('2026-09-30', 8)).toBe('2026-09-30@08');
  });
});

describe('时间槽', () => {
  const hours = [8, 10, 12, 14, 16, 18, 20];
  it('latestSlot：取最近一个已到达的时点；清晨取前一天最后一个', () => {
    expect(latestSlot(gameTime('2026-09-30', 10), hours).key).toBe('2026-09-30@10');
    expect(latestSlot(gameTime('2026-09-30', 11, 59), hours).key).toBe('2026-09-30@10');
    expect(latestSlot(gameTime('2026-09-30', 7, 59), hours).key).toBe('2026-09-29@20');
    expect(latestSlot(gameTime('2026-09-30', 10), hours).start).toEqual(gameTime('2026-09-30', 10));
  });
  it('nextSlot：严格晚于当前小时；刚好整点时取下一个', () => {
    expect(nextSlot(gameTime('2026-09-30', 10), hours).key).toBe('2026-09-30@12');
    expect(nextSlot(gameTime('2026-09-30', 9, 59), hours).key).toBe('2026-09-30@10');
    expect(nextSlot(gameTime('2026-09-30', 20, 30), hours).key).toBe('2026-10-01@08');
  });
  it('parseSlotKey 是 slotKey 的逆运算', () => {
    expect(parseSlotKey('2026-09-30@08')).toEqual(latestSlot(gameTime('2026-09-30', 8), hours));
    expect(() => parseSlotKey('bad')).toThrow();
  });
  it('roundOf：每 4 分钟一轮', () => {
    expect(roundOf(new Date(240_000 * 10))).toBe(10);
    expect(roundOf(new Date(240_000 * 10 + 239_999))).toBe(10);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run packages/shared/src/time.test.ts`
Expected: FAIL，`gameParts` 不存在

- [ ] **Step 3: 实现**

`packages/shared/src/time.ts` 整个替换为：

```ts
export const GAME_TIME_ZONE = 'Asia/Shanghai';
/** 北京时间固定 +8 小时，没有夏令时 */
const OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;
/** 结算每轮 4 分钟 */
export const ROUND_MS = 240_000;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: GAME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 游戏日（北京时间），格式 YYYY-MM-DD */
export function gameDay(date: Date = new Date()): string {
  return dayFormat.format(date);
}

export interface GameParts {
  day: string;
  hour: number;
  minute: number;
}

export function gameParts(date: Date): GameParts {
  const d = new Date(date.getTime() + OFFSET_MS);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 北京时间 day 的 hour:minute 对应的时刻 */
export function gameTime(day: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + hour * 3600_000 + minute * 60_000 - OFFSET_MS);
}

export function slotKey(day: string, hour: number): string {
  return `${day}@${String(hour).padStart(2, '0')}`;
}

export interface Slot {
  key: string;
  day: string;
  hour: number;
  start: Date;
}

function slot(day: string, hour: number): Slot {
  return { key: slotKey(day, hour), day, hour, start: gameTime(day, hour) };
}

/** hours（0~23 的整点）中最近一个已经到达的时点；今天还没到任何一个时取前一天的最后一个 */
export function latestSlot(now: Date, hours: readonly number[]): Slot {
  const { day, hour } = gameParts(now);
  const reached = hours.filter((h) => h <= hour);
  if (reached.length > 0) return slot(day, Math.max(...reached));
  return slot(addDays(day, -1), Math.max(...hours));
}

/** hours 中下一个时点（严格晚于当前小时） */
export function nextSlot(now: Date, hours: readonly number[]): Slot {
  const { day, hour } = gameParts(now);
  const later = hours.filter((h) => h > hour);
  if (later.length > 0) return slot(day, Math.min(...later));
  return slot(addDays(day, 1), Math.min(...hours));
}

export function roundOf(date: Date): number {
  return Math.floor(date.getTime() / ROUND_MS);
}

/** slotKey 的逆运算 */
export function parseSlotKey(key: string): Slot {
  const m = /^(\d{4}-\d{2}-\d{2})@(\d{2})$/.exec(key);
  if (!m) throw new Error(`bad slot key ${key}`);
  return slot(m[1]!, Number(m[2]));
}
```

`packages/shared/src/errors.ts` 的 `ErrorCode` 对象里，在 `FEATURE_DISABLED` 之后插入：

```ts
  NOT_ENOUGH: 'NOT_ENOUGH',
  REQUIREMENT_NOT_MET: 'REQUIREMENT_NOT_MET',
  LIMIT_REACHED: 'LIMIT_REACHED',
  ALREADY_DONE: 'ALREADY_DONE',
  NOT_USABLE: 'NOT_USABLE',
  STORE_FULL: 'STORE_FULL',
  CUPBOARD_FULL: 'CUPBOARD_FULL',
  COOKBOOK_MAX_GRADE: 'COOKBOOK_MAX_GRADE',
  SOLD_OUT: 'SOLD_OUT',
  COOLDOWN: 'COOLDOWN',
  INVALID_STATE: 'INVALID_STATE',
```

`apps/web/src/i18n/zh-CN.ts` 的 `TEXT` 里，在 `FEATURE_DISABLED` 之后插入（Task 23 会按 params 细化）：

```ts
  NOT_ENOUGH: '数量不够',
  REQUIREMENT_NOT_MET: '还没有达到条件',
  LIMIT_REACHED: '已经达到上限了',
  ALREADY_DONE: '已经做过了',
  NOT_USABLE: '这个物品暂时无法使用',
  STORE_FULL: '仓库满了，先整理一下吧',
  CUPBOARD_FULL: '橱柜满了，先整理一下吧',
  COOKBOOK_MAX_GRADE: '这道菜已经是最高品级了',
  SOLD_OUT: '已经卖完了',
  COOLDOWN: '操作太快了，请稍后再试',
  INVALID_STATE: '当前状态下不能这样做',
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run packages/shared`
Expected: 全部 PASS

- [ ] **Step 5: 类型检查、提交**

Run: `pnpm typecheck && pnpm format`

```bash
git add packages/shared apps/web/src/i18n/zh-CN.ts
git commit -m "feat(shared): Beijing-time slots, settlement rounds, 2A error codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 数据库迁移 0002、表类型、分区、测试夹具

**Files:**
- Create: `apps/server/src/db/migrations/0002_business_loop.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/db/partitions.ts`
- Modify: `apps/server/src/worker/jobs.ts`
- Modify: `apps/server/src/modules/ledger/ledger.ts`（`at` 参数）
- Modify: `apps/server/src/modules/news/news.ts`（`at` 参数）
- Modify: `apps/server/test/globalSetup.ts`
- Create: `apps/server/test/config.ts`
- Modify: `apps/server/test/helpers.ts`
- Modify: `apps/server/test/fixtures.ts`
- Test: `apps/server/src/db/migrations/0002.test.ts`
- Modify: `apps/server/src/worker/jobs.test.ts`

**Interfaces:**
- Consumes: 现有 `migrations`、`ensureDailyPartitions`、`recordLedger`、`postNews`
- Produces:
  - 表：`cupboard_food`、`restaurant_device`、`world_state`、`market_item`、`market_buy`、`market_guess`、`shop_special`、`event_counter`、`task_done`、`income_round`（分区）、`rest_log`（分区）、`job_run`；`restaurant` 新列
  - 类型：`CookbookCounts`、扩展后的 `TableState`、`DB` 新表
  - `PartitionedTable = 'ledger' | 'news' | 'income_round' | 'rest_log'`，`RETENTION_DAYS` 含四张表
  - `recordLedger(db, entries, at?: Date)`、`postNews(db, news, at?: Date)`
  - 测试夹具 `createRestaurantFull(db, shardId, opts?)`、`emptyCounts()`，`test/config.ts` 的 `testConfig()`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/db/migrations/0002.test.ts`：

```ts
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shardId: number;
let restId: number;
beforeAll(async () => {
  shardId = await createShard(db);
  restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
});

describe('迁移 0002', () => {
  it('餐厅新列有默认值，cookbook_counts 是完整结构', async () => {
    const r = await db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow();
    expect(r).toMatchObject({
      promo_on: false,
      cte_on: false,
      cookfoods_flag: 0,
      plaque2_open: false,
      main_task_step: 1,
      state_reason: null,
    });
    expect(r.cookbook_counts).toEqual({ learned: 0, grade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: {} });
  });

  it('橱柜数量不能为负', async () => {
    await expect(
      db.insertInto('cupboard_food').values({ rest_id: restId, foods_id: 101, num: -1 }).execute(),
    ).rejects.toThrow();
  });

  it('菜场售出数不能超过库存', async () => {
    const now = new Date();
    const item = await db
      .insertInto('market_item')
      .values({ shard_id: shardId, shelf: 0, period: 'p', foods_id: 101, stock: 1, opened_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(
      db.updateTable('market_item').set({ sold: 2 }).where('id', '=', item.id).execute(),
    ).rejects.toThrow();
  });

  it('income_round、rest_log 按 created_at 分区写入', async () => {
    const at = new Date();
    await db
      .insertInto('income_round')
      .values({
        rest_id: restId,
        round_no: 1,
        coin: 10,
        exp: 5,
        oil: 2,
        customers: JSON.stringify({ '1': 1 }),
        rates: JSON.stringify({}),
        drops: JSON.stringify([]),
        created_at: at,
      })
      .execute();
    await db
      .insertInto('rest_log')
      .values({ rest_id: restId, type: 'level.up', params: JSON.stringify({ to: 2 }), created_at: at })
      .execute();
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from income_round where rest_id = ${restId}`.execute(db);
    expect(rows[0]!.n).toBe(1);
  });

  it('market_guess 的 foods_ids 读出为数字数组', async () => {
    await db
      .insertInto('market_guess')
      .values({ shard_id: shardId, period: '2026-09-30@10', rest_id: restId, foods_ids: [238, 240], created_at: new Date() })
      .execute();
    const g = await db.selectFrom('market_guess').selectAll().where('rest_id', '=', restId).executeTakeFirstOrThrow();
    expect(g.foods_ids).toEqual([238, 240]);
  });
});
```

在 `apps/server/src/worker/jobs.test.ts` 的现有用例里追加两行断言（放在 `expect(created).toContain(partitionName('news', in3Days));` 后面）：

```ts
    expect(created).toContain(partitionName('income_round', in3Days));
    expect(created).toContain(partitionName('rest_log', in3Days));
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm infra:test && pnpm exec vitest run apps/server/src/db/migrations/0002.test.ts`
Expected: FAIL，`createRestaurantFull` 不存在

- [ ] **Step 3: 写迁移**

`apps/server/src/db/migrations/0002_business_loop.ts`：

```ts
import { sql, type Kysely } from 'kysely';

const EMPTY_COUNTS = '{"learned":0,"grade":[0,0,0,0,0,0,0,0,0,0,0],"street":{}}';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table restaurant
      add column promo_on boolean not null default false,
      add column cte_on boolean not null default false,
      add column cookfoods_flag smallint not null default 0,
      add column plaque2_open boolean not null default false,
      add column main_task_step integer not null default 1,
      add column state_reason text`,
    sql`update restaurant set cookbook_counts = ${EMPTY_COUNTS}::jsonb where cookbook_counts = '{}'::jsonb`,
    sql`alter table restaurant alter column cookbook_counts set default ${sql.lit(EMPTY_COUNTS)}::jsonb`,
    sql`create index restaurant_shard_state on restaurant (shard_id, state, id)`,
    sql`create table cupboard_food (
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      num integer not null default 0 check (num >= 0),
      fridge_num integer not null default 0 check (fridge_num >= 0),
      locked boolean not null default false,
      fridge_unread boolean not null default false,
      primary key (rest_id, foods_id)
    )`,
    sql`create table restaurant_device (
      rest_id integer not null references restaurant(id) on delete cascade,
      slot smallint not null,
      goods_id integer not null,
      placed_at timestamptz not null,
      expires_at timestamptz,
      primary key (rest_id, slot)
    )`,
    sql`create table world_state (
      shard_id integer primary key references shard(id),
      weather_id integer not null,
      weather_until timestamptz not null,
      krab_street integer not null,
      plankton_rest_id integer,
      updated_at timestamptz not null default now()
    )`,
    sql`create table market_item (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id),
      shelf smallint not null check (shelf in (0, 1, 2)),
      period text not null,
      foods_id integer not null,
      stock integer not null,
      sold integer not null default 0,
      hot boolean not null default false,
      opened_at timestamptz not null,
      check (sold >= 0 and sold <= stock)
    )`,
    sql`create index market_item_shard_shelf on market_item (shard_id, shelf)`,
    sql`create table market_buy (
      market_item_id bigint not null references market_item(id) on delete cascade,
      subject text not null,
      num integer not null,
      primary key (market_item_id, subject)
    )`,
    sql`create table market_guess (
      shard_id integer not null references shard(id),
      period text not null,
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_ids integer[] not null,
      hits integer,
      settled_at timestamptz,
      created_at timestamptz not null,
      primary key (shard_id, period, rest_id)
    )`,
    sql`create table shop_special (
      shard_id integer not null references shard(id),
      day date not null,
      goods_id integer not null,
      discount double precision not null,
      tier_name text not null,
      stock integer not null,
      sold integer not null default 0,
      check (sold >= 0 and sold <= stock),
      primary key (shard_id, day)
    )`,
    sql`create table event_counter (
      rest_id integer not null references restaurant(id) on delete cascade,
      key text not null,
      count bigint not null default 0,
      primary key (rest_id, key)
    )`,
    sql`create table task_done (
      rest_id integer not null references restaurant(id) on delete cascade,
      task_id integer not null,
      done_at timestamptz not null,
      primary key (rest_id, task_id)
    )`,
    sql`create table income_round (
      id bigint generated always as identity,
      rest_id integer not null,
      round_no bigint not null,
      coin bigint not null,
      exp bigint not null,
      oil integer not null,
      customers jsonb not null,
      rates jsonb not null,
      drops jsonb not null,
      created_at timestamptz not null,
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index income_round_rest_time on income_round (rest_id, created_at desc)`,
    sql`create table income_round_default partition of income_round default`,
    sql`create table rest_log (
      id bigint generated always as identity,
      rest_id integer not null,
      type text not null,
      params jsonb not null default '{}',
      created_at timestamptz not null,
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index rest_log_rest_time on rest_log (rest_id, created_at desc)`,
    sql`create table rest_log_default partition of rest_log default`,
    sql`create table job_run (
      shard_id integer not null,
      job text not null,
      period text not null,
      started_at timestamptz not null,
      finished_at timestamptz,
      stats jsonb not null default '{}',
      primary key (shard_id, job, period)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'job_run',
    'rest_log',
    'income_round',
    'task_done',
    'event_counter',
    'shop_special',
    'market_guess',
    'market_buy',
    'market_item',
    'world_state',
    'restaurant_device',
    'cupboard_food',
  ]) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`drop index if exists restaurant_shard_state`.execute(db);
  await sql`alter table restaurant
    drop column promo_on, drop column cte_on, drop column cookfoods_flag,
    drop column plaque2_open, drop column main_task_step, drop column state_reason`.execute(db);
}
```

`apps/server/src/db/migrations/index.ts`：

```ts
import type { Migration } from 'kysely';
import * as m0001 from './0001_init';
import * as m0002 from './0002_business_loop';

/** 迁移列表写在代码里（而不是按文件扫描），打包后也能用 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_business_loop': m0002,
};
```

- [ ] **Step 4: 扩展表类型**

`apps/server/src/db/schema.ts`：

1. 把 `TableState` 替换为：

```ts
/** 每张桌子当前的状态（规格书 01 §1.4）；customer 为顾客类型，-3 = 被蟑螂药消灭 */
export interface TableState {
  no: number;
  floor: number;
  customer: number;
  /** 蟑螂：放蟑螂的人（自然产生为 null）和时间 */
  roach?: { by: number | null; at: string };
  /** 白食者（子项目 3 写入）；coin/exp 是他在这桌累计得到的 */
  freeloader?: { restId: number; level: number; since: string; coin: number; exp: number };
  /** 上一轮这桌的结果 */
  last?: TableResult;
}

export interface TableResult {
  type: number;
  coin: number;
  exp: number;
  oil: number;
  /** 挑剔顾客要求的品级、实际品级、食谱 */
  req?: number;
  grade?: number;
  cookbookId?: number;
  satisfied?: boolean;
}

/** 已学食谱的派生计数：grade[L] = 当前品级恰好为 L 的食谱数；street[s] = 该街道已学数 */
export interface CookbookCounts {
  learned: number;
  grade: number[];
  street: Record<string, number>;
}
```

2. `RestaurantTable` 里把 `cookbook_counts` 改成 `cookbook_counts: JsonDefault<CookbookCounts>;`，并在 `effect_dirty` 前加：

```ts
  promo_on: Default<boolean>;
  cte_on: Default<boolean>;
  cookfoods_flag: Default<number>;
  plaque2_open: Default<boolean>;
  main_task_step: Default<number>;
  state_reason: Nullable<string>;
```

3. 在 `AuditLogTable` 之后加新表：

```ts
export interface CupboardFoodTable {
  rest_id: number;
  foods_id: number;
  num: Default<number>;
  fridge_num: Default<number>;
  locked: Default<boolean>;
  fridge_unread: Default<boolean>;
}

export interface RestaurantDeviceTable {
  rest_id: number;
  slot: number;
  goods_id: number;
  placed_at: Ts;
  expires_at: TsNullable;
}

export interface WorldStateTable {
  shard_id: number;
  weather_id: number;
  weather_until: Ts;
  krab_street: number;
  plankton_rest_id: Nullable<number>;
  updated_at: TsDefault;
}

export interface MarketItemTable {
  id: Generated<number>;
  shard_id: number;
  shelf: number;
  period: string;
  foods_id: number;
  stock: number;
  sold: Default<number>;
  hot: Default<boolean>;
  opened_at: Ts;
}

export interface MarketBuyTable {
  market_item_id: number;
  subject: string;
  num: number;
}

export interface MarketGuessTable {
  shard_id: number;
  period: string;
  rest_id: number;
  foods_ids: number[];
  hits: Nullable<number>;
  settled_at: TsNullable;
  created_at: Ts;
}

export interface ShopSpecialTable {
  shard_id: number;
  day: string;
  goods_id: number;
  discount: number;
  tier_name: string;
  stock: number;
  sold: Default<number>;
}

export interface EventCounterTable {
  rest_id: number;
  key: string;
  count: Default<number>;
}

export interface TaskDoneTable {
  rest_id: number;
  task_id: number;
  done_at: Ts;
}

export interface IncomeRoundTable {
  id: Generated<number>;
  rest_id: number;
  round_no: number;
  coin: number;
  exp: number;
  oil: number;
  customers: Json<Record<string, number>>;
  rates: Json<Record<string, unknown>>;
  drops: Json<Array<{ goodsId: number; num: number }>>;
  created_at: Ts;
}

export interface RestLogTable {
  id: Generated<number>;
  rest_id: number;
  type: string;
  params: JsonDefault<Record<string, unknown>>;
  created_at: Ts;
}

export interface JobRunTable {
  shard_id: number;
  job: string;
  period: string;
  started_at: Ts;
  finished_at: TsNullable;
  stats: JsonDefault<Record<string, unknown>>;
}
```

4. `DB` 接口末尾加：

```ts
  cupboard_food: CupboardFoodTable;
  restaurant_device: RestaurantDeviceTable;
  world_state: WorldStateTable;
  market_item: MarketItemTable;
  market_buy: MarketBuyTable;
  market_guess: MarketGuessTable;
  shop_special: ShopSpecialTable;
  event_counter: EventCounterTable;
  task_done: TaskDoneTable;
  income_round: IncomeRoundTable;
  rest_log: RestLogTable;
  job_run: JobRunTable;
```

`LedgerTable`、`NewsTable` 的 `created_at` 类型保持 `TsDefault` 不变（可以显式传值）。

- [ ] **Step 5: 分区、流水、新闻**

`apps/server/src/db/partitions.ts`：把第一行类型改成

```ts
export type PartitionedTable = 'ledger' | 'news' | 'income_round' | 'rest_log';
```

`apps/server/src/worker/jobs.ts`：

```ts
export const RETENTION_DAYS = { ledger: 30, news: 30, income_round: 3, rest_log: 30 } as const;
```

并把 `maintainPartitions` 里的 `for (const table of ['ledger', 'news'] as const)` 改成：

```ts
  for (const table of Object.keys(RETENTION_DAYS) as Array<keyof typeof RETENTION_DAYS>) {
```

另外在 `maintainPartitions` 的循环之后加一行清理：`await db.deleteFrom('job_run').where('started_at', '<', new Date(now.getTime() - 7 * DAY_MS)).execute();`

`apps/server/src/modules/ledger/ledger.ts` 的 `recordLedger` 改成：

```ts
export async function recordLedger(db: Kysely<DB>, entries: LedgerEntry[], at?: Date): Promise<void> {
  if (entries.length === 0) return;
  await db
    .insertInto('ledger')
    .values(
      entries.map((e) => ({
        rest_id: e.restId,
        kind: e.kind,
        item_id: e.itemId ?? null,
        delta: e.delta,
        source: e.source,
        ref_rest_id: e.refRestId ?? null,
        ...(at ? { created_at: at } : {}),
      })),
    )
    .execute();
}
```

`apps/server/src/modules/news/news.ts` 的 `postNews` 改成：

```ts
export async function postNews(db: Kysely<DB>, news: NewsInput, at?: Date): Promise<void> {
  await db
    .insertInto('news')
    .values({
      shard_id: news.shardId,
      type: news.type,
      rest_id: news.restId ?? null,
      params: JSON.stringify(news.params ?? {}),
      ...(at ? { created_at: at } : {}),
    })
    .execute();
}
```

`apps/server/test/globalSetup.ts` 里 `ensureDailyPartitions` 那两行改成：

```ts
  for (const table of ['ledger', 'news', 'income_round', 'rest_log'] as const) {
    await ensureDailyPartitions(db, table, yesterday, 5);
  }
```

- [ ] **Step 6: 测试夹具**

`apps/server/test/config.ts`（新文件，把 `testConfig` 从 helpers 挪出来，避免 fixtures ↔ helpers 循环引用）：

```ts
import { loadGameConfig, type GameConfig } from '@dt/config';

let config: GameConfig | null = null;
export function testConfig(): GameConfig {
  config ??= loadGameConfig(process.env.CONFIG_BUNDLE_PATH!);
  return config;
}
```

`apps/server/test/helpers.ts`：删掉原来的 `let config ...` 和 `export function testConfig()` 定义，改为在文件顶部 `import { testConfig } from './config';` 并加一行 `export { testConfig };`（其他测试仍从 helpers 导入）。

`apps/server/test/fixtures.ts` 末尾追加：

```ts
import type { CookbookCounts, TableState } from '../src/db/schema';
import { testConfig } from './config';

export function emptyCounts(): CookbookCounts {
  return { learned: 0, grade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: {} };
}

export interface FullRestaurantOptions {
  patch?: Partial<Insertable<RestaurantTable>>;
  /** 食谱 id → 品级 */
  cookbooks?: Record<number, number>;
  tables?: TableState[];
}

/** 餐厅 + 餐桌 + 已学食谱三行一起建；cookbook_counts 按 cookbooks 算好 */
export async function createRestaurantFull(
  db: Kysely<DB>,
  shardId: number,
  accountId: number,
  opts: FullRestaurantOptions = {},
): Promise<number> {
  const config = testConfig();
  const counts = emptyCounts();
  const levels = Buffer.alloc(config.maxCookbookId + 1);
  for (const [id, grade] of Object.entries(opts.cookbooks ?? {})) {
    const cb = config.requireCookbook(Number(id));
    levels[cb.id] = grade;
    if (grade > 0) {
      counts.learned += 1;
      counts.grade[grade]! += 1;
      counts.street[String(cb.streetId)] = (counts.street[String(cb.streetId)] ?? 0) + 1;
    }
  }
  const tableNum = opts.patch?.table_num ?? 4;
  const restId = await createRestaurantRow(db, shardId, accountId, {
    ...opts.patch,
    table_num: tableNum,
    cookbook_counts: JSON.stringify(counts),
  });
  const tables =
    opts.tables ??
    Array.from({ length: tableNum }, (_, i) => ({ no: i + 1, floor: Math.floor(i / 16) + 1, customer: 0 }));
  await db.insertInto('restaurant_tables').values({ rest_id: restId, tables: JSON.stringify(tables) }).execute();
  await db.insertInto('restaurant_cookbooks').values({ rest_id: restId, levels }).execute();
  return restId;
}
```

（`fixtures.ts` 顶部已有 `import type { Insertable, Kysely } from 'kysely';`、`DB`、`RestaurantTable` 的导入；把新增的两个 import 挪到文件顶部的导入区。）

- [ ] **Step 7: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/db apps/server/src/worker/jobs.test.ts`
Expected: PASS

- [ ] **Step 8: 全部服务端测试、类型检查**

Run: `pnpm exec vitest run apps/server && pnpm typecheck`
Expected: 全部 PASS。若原有测试因 `cookbook_counts` 默认值变化失败，按新默认值 `{learned:0, grade:[0×11], street:{}}` 更新断言。

- [ ] **Step 9: 提交**

```bash
pnpm format
git add apps/server
git commit -m "feat(server): migration 0002 for the business loop, partitions, fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: 操作上下文 Op、资源增减、升级、createGame

**Files:**
- Create: `apps/server/src/core/deps.ts`
- Create: `apps/server/src/core/op.ts`
- Create: `apps/server/src/core/resources.ts`
- Create: `apps/server/src/core/level.ts`
- Create: `apps/server/src/core/errors.ts`
- Create: `apps/server/src/core/action.ts`
- Create: `apps/server/src/core/features.ts`
- Create: `apps/server/src/core/jobs.ts`
- Create: `apps/server/src/game.ts`
- Modify: `apps/server/src/app.ts`（`AppDeps.rng`，改用 `createGame`）
- Modify: `apps/server/src/modules/index.ts`
- Create: `apps/server/test/game.ts`
- Test: `apps/server/src/core/op.test.ts`
- Test: `apps/server/src/core/level.test.ts`

**Interfaces:**
- Consumes: `withRestaurant`（`db/tx.ts`）、`recordLedger(db, entries, at?)`、`postNews(db, news, at?)`、`ShardService.ensureFeature/settings`、`levelUpExp`、`isFeatureEnabled`
- Produces:
  - `GameDeps { db; redis; config; bus; now: () => Date; rng: () => Rng; shards: ShardService }`
  - `RestCtx { accountId; shardId; restaurantId; ip: string; deviceId: string | null }`、`restCtxOf(req): RestCtx`
  - `Op`（字段见代码）、`createOp(deps, tx, rest, settings, opts)`、`flushOp(op)`、`runOp(deps, ctx, {feature, source}, fn)`、`runSystemOp(deps, shardId, restId, {source, now?, rng?}, fn)`、`setRest(op, col, value)`、`restLog(op, type, params?)`、`opNews(op, type, params?)`、`type OpResult<T> = { data: T; events: GameEvent[] }`
  - `gainCoin / spendCoin / gainDiamond / spendDiamond / gainStrength / spendStrength / gainRenown / gainOil / gainExp(op, n, opts?)`；`GainOptions { source?; ledger?; event?; lucky? }`；`pushEvent`、`pushLedger`
  - `applyExp(level, exp, gain): { level; exp; gained }`
  - `notEnough(kind, need, have, id?)`、`requirement(reason, params?)`、`limitReached(what, params?)`、`invalidState(reason, params?)`
  - `emitAction(op, key, n?)`（事件名 `action`，payload `{ key, n, star }`）
  - `IMPLEMENTED_FEATURES`、`featureAvailable(settings, feature)`
  - `PeriodicJob { name; feature; period(now, settings): string | null; run(ctx: JobContext): Promise<Record<string, unknown>> }`、`JobContext { shardId; period; now; settings }`
  - `Game { app; deps; shards; account; restaurant; jobs: PeriodicJob[] }`、`createGame(app: AppDeps): Game`；`registerModules(app, game)`
  - 测试工具：`createTestGame(overrides?)`、`newRestaurant(t, opts?)`、`restRow(t, id)`、`goodsNum(t, restId, goodsId)`、`foodNum(t, restId, foodsId)`

- [ ] **Step 1: 写 applyExp 的失败测试**

`apps/server/src/core/level.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { applyExp } from './level';

describe('applyExp（规格书 02 §2.2）', () => {
  it('不够升级时只累加经验', () => {
    expect(applyExp(1, 0, 499)).toEqual({ level: 1, exp: 499, gained: 0 });
  });
  it('刚好升一级，经验清零', () => {
    expect(applyExp(1, 0, 500)).toEqual({ level: 2, exp: 0, gained: 1 });
  });
  it('可以连升多级：1→2 要 500，2→3 要 2000', () => {
    expect(applyExp(1, 0, 2600)).toEqual({ level: 3, exp: 100, gained: 2 });
  });
  it('已有经验一起算', () => {
    expect(applyExp(2, 1900, 150)).toEqual({ level: 3, exp: 50, gained: 1 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/core/level.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 level.ts**

`apps/server/src/core/level.ts`：

```ts
import { levelUpExp } from '@dt/shared';

export interface ExpResult {
  level: number;
  exp: number;
  gained: number;
}

/** 经验入账，可以连升多级（规格书 02 §2.2）。exp 是当前等级内的经验 */
export function applyExp(level: number, exp: number, gain: number): ExpResult {
  let l = level;
  let e = exp + gain;
  let gained = 0;
  while (gained < 1000 && e >= levelUpExp(l)) {
    e -= levelUpExp(l);
    l += 1;
    gained += 1;
  }
  return { level: l, exp: e, gained };
}
```

Run: `pnpm exec vitest run apps/server/src/core/level.test.ts`
Expected: PASS

- [ ] **Step 4: 写 core 的其余文件**

`apps/server/src/core/deps.ts`：

```ts
import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { DB } from '../db/schema';
import type { EventBus } from '../events/bus';
import type { ShardService } from '../modules/shard/service';
import { requireRestaurant } from '../security/session';

/** 游戏服务需要的依赖（HTTP 与模拟器共用） */
export interface GameDeps {
  db: Kysely<DB>;
  redis: Redis;
  config: GameConfig;
  bus: EventBus;
  now: () => Date;
  /** 每个操作取一个新的随机源 */
  rng: () => Rng;
  shards: ShardService;
}

/** 当前操作的玩家与餐厅，一律来自会话 */
export interface RestCtx {
  accountId: number;
  shardId: number;
  restaurantId: number;
  ip: string;
  deviceId: string | null;
}

const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;

export function restCtxOf(req: FastifyRequest): RestCtx {
  const r = requireRestaurant(req);
  const dev = req.headers['x-device-id'];
  return {
    accountId: r.accountId,
    shardId: r.shardId,
    restaurantId: r.restaurantId,
    ip: req.clientIp,
    deviceId: typeof dev === 'string' && DEVICE_RE.test(dev) ? dev : null,
  };
}
```

`apps/server/src/core/errors.ts`：

```ts
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';

/** 资源不够：kind = coin / diamond / strength / goods / foods / …；goods、foods 带 id */
export function notEnough(kind: string, need: number, have: number, id?: number): AppError {
  return new AppError(
    ErrorCode.NOT_ENOUGH,
    400,
    id === undefined ? { kind, need, have } : { kind, id, need, have },
  );
}

export function requirement(reason: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(ErrorCode.REQUIREMENT_NOT_MET, 400, { reason, ...params });
}

export function limitReached(what: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(ErrorCode.LIMIT_REACHED, 400, { what, ...params });
}

export function invalidState(reason: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(ErrorCode.INVALID_STATE, 400, { reason, ...params });
}
```

`apps/server/src/core/op.ts`：

```ts
import type { Transaction } from 'kysely';
import type { GameConfig, ShardSettings, Tuning } from '@dt/config';
import type { GameEvent, Rng } from '@dt/shared';
import type { DB, RestaurantRow } from '../db/schema';
import { withRestaurant } from '../db/tx';
import { recordLedger, type LedgerEntry } from '../modules/ledger/ledger';
import { postNews } from '../modules/news/news';
import type { GameDeps, RestCtx } from './deps';

/** 可以通过 setRest 修改的餐厅列（加成缓存由 effects 模块自己维护） */
export type RestColumn = Exclude<
  keyof RestaurantRow,
  'id' | 'shard_id' | 'account_id' | 'created_at' | 'effect_agg' | 'effect_next_expire_at' | 'effect_dirty'
>;

const JSON_COLUMNS: ReadonlySet<string> = new Set(['cookbook_counts']);

export interface Op {
  readonly deps: GameDeps;
  readonly tx: Transaction<DB>;
  /** 餐厅快照：通过 setRest 修改，flushOp 时一次写回 */
  readonly rest: RestaurantRow;
  /** 玩家操作时为会话上下文；定时任务为 null */
  readonly ctx: RestCtx | null;
  readonly shardId: number;
  readonly now: Date;
  readonly rng: Rng;
  readonly config: GameConfig;
  readonly settings: ShardSettings;
  readonly tuning: Tuning;
  /** 流水的默认来源 */
  readonly source: string;
  readonly events: GameEvent[];
  readonly ledger: LedgerEntry[];
  readonly logs: Array<{ type: string; params: Record<string, unknown> }>;
  readonly news: Array<{ type: string; params: Record<string, unknown> }>;
  readonly touched: Set<RestColumn>;
  /** 同一个操作内的缓存（加成汇总、幸运等） */
  readonly cache: Map<string, unknown>;
}

export interface OpResult<T> {
  data: T;
  events: GameEvent[];
}

export function createOp(
  deps: GameDeps,
  tx: Transaction<DB>,
  rest: RestaurantRow,
  settings: ShardSettings,
  opts: { source: string; ctx?: RestCtx | null; now?: Date; rng?: Rng },
): Op {
  return {
    deps,
    tx,
    rest: { ...rest },
    ctx: opts.ctx ?? null,
    shardId: rest.shard_id,
    now: opts.now ?? deps.now(),
    rng: opts.rng ?? deps.rng(),
    config: deps.config,
    settings,
    tuning: settings.tuning,
    source: opts.source,
    events: [],
    ledger: [],
    logs: [],
    news: [],
    touched: new Set(),
    cache: new Map(),
  };
}

export function setRest<K extends RestColumn>(op: Op, col: K, value: RestaurantRow[K]): void {
  (op.rest as Record<string, unknown>)[col] = value;
  op.touched.add(col);
}

/** 个人日志（rest_log），flushOp 时写入 */
export function restLog(op: Op, type: string, params: Record<string, unknown> = {}): void {
  op.logs.push({ type, params });
}

/** 区服新闻，flushOp 时写入，restId 取当前餐厅 */
export function opNews(op: Op, type: string, params: Record<string, unknown> = {}): void {
  op.news.push({ type, params });
}

/** 把快照的改动、流水、日志、新闻写进数据库（仍在同一事务里） */
export async function flushOp(op: Op): Promise<void> {
  if (op.touched.size > 0) {
    const patch: Record<string, unknown> = {};
    for (const col of op.touched) {
      const v = op.rest[col];
      patch[col] = JSON_COLUMNS.has(col) ? JSON.stringify(v) : v;
    }
    await op.tx.updateTable('restaurant').set(patch).where('id', '=', op.rest.id).execute();
    op.touched.clear();
  }
  if (op.ledger.length > 0) await recordLedger(op.tx, op.ledger.splice(0), op.now);
  if (op.logs.length > 0) {
    const logs = op.logs.splice(0);
    await op.tx
      .insertInto('rest_log')
      .values(
        logs.map((l) => ({
          rest_id: op.rest.id,
          type: l.type,
          params: JSON.stringify(l.params),
          created_at: op.now,
        })),
      )
      .execute();
  }
  for (const n of op.news.splice(0)) {
    await postNews(op.tx, { shardId: op.shardId, type: n.type, restId: op.rest.id, params: n.params }, op.now);
  }
}

/** 玩家写操作：检查功能开关 → 锁店 → 执行 → 写回；任何异常整体回滚 */
export async function runOp<T>(
  deps: GameDeps,
  ctx: RestCtx,
  opts: { feature: string; source: string },
  fn: (op: Op) => Promise<T>,
): Promise<OpResult<T>> {
  const settings = await deps.shards.ensureFeature(ctx.shardId, opts.feature);
  return withRestaurant(deps.db, ctx.restaurantId, async (tx, rest) => {
    const op = createOp(deps, tx, rest, settings, { source: opts.source, ctx });
    const data = await fn(op);
    await flushOp(op);
    return { data, events: op.events };
  });
}

/** 定时任务对某家店的操作：不检查功能开关（由调度器检查），可指定时间和随机源 */
export async function runSystemOp<T>(
  deps: GameDeps,
  shardId: number,
  restId: number,
  opts: { source: string; now?: Date; rng?: Rng },
  fn: (op: Op) => Promise<T>,
): Promise<T> {
  const settings = await deps.shards.settings(shardId);
  return withRestaurant(deps.db, restId, async (tx, rest) => {
    const op = createOp(deps, tx, rest, settings, opts);
    const data = await fn(op);
    await flushOp(op);
    return data;
  });
}
```

`apps/server/src/core/resources.ts`：

```ts
import type { GameEvent } from '@dt/shared';
import type { LedgerEntry } from '../modules/ledger/ledger';
import { notEnough } from './errors';
import { applyExp } from './level';
import { restLog, setRest, type Op } from './op';

type Kind = LedgerEntry['kind'];

export interface GainOptions {
  /** 流水来源，默认 op.source */
  source?: string;
  /** 是否写流水，默认 true（结算的银币经验由 income_round 记录，不写流水） */
  ledger?: boolean;
  /** 是否给前端得失提示，默认 true */
  event?: boolean;
  lucky?: boolean;
}

export function pushEvent(op: Op, e: GameEvent): void {
  op.events.push(e);
}

export function pushLedger(op: Op, kind: Kind, delta: number, source: string, itemId?: number): void {
  op.ledger.push({ restId: op.rest.id, kind, delta, source, ...(itemId !== undefined ? { itemId } : {}) });
}

/** 记一笔变化：流水 + 得失提示 */
export function recordChange(op: Op, kind: Kind, delta: number, opts: GainOptions = {}, id?: number): void {
  if (delta === 0) return;
  if (opts.ledger !== false) pushLedger(op, kind, delta, opts.source ?? op.source, id);
  if (opts.event !== false) {
    pushEvent(op, {
      type: delta > 0 ? 'gain' : 'loss',
      kind,
      num: Math.abs(delta),
      ...(id !== undefined ? { id } : {}),
      ...(opts.lucky ? { lucky: true } : {}),
    });
  }
}

export function gainCoin(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'coin', Math.max(0, op.rest.coin + n));
  recordChange(op, 'coin', n, opts);
}

export function spendCoin(op: Op, n: number, opts: GainOptions = {}): void {
  if (n <= 0) return;
  if (op.rest.coin < n) throw notEnough('coin', n, op.rest.coin);
  setRest(op, 'coin', op.rest.coin - n);
  recordChange(op, 'coin', -n, opts);
}

export function gainDiamond(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'diamond', op.rest.diamond + n);
  recordChange(op, 'diamond', n, opts);
}

export function spendDiamond(op: Op, n: number, opts: GainOptions = {}): void {
  if (n <= 0) return;
  if (op.rest.diamond < n) throw notEnough('diamond', n, op.rest.diamond);
  setRest(op, 'diamond', op.rest.diamond - n);
  recordChange(op, 'diamond', -n, opts);
}

/** 体力可以超过上限（体力卡），恢复任务自己控制上限 */
export function gainStrength(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'strength', op.rest.strength + n);
  recordChange(op, 'strength', n, opts);
}

export function spendStrength(op: Op, n: number, opts: GainOptions = {}): void {
  if (n <= 0) return;
  if (op.rest.strength < n) throw notEnough('strength', n, op.rest.strength);
  setRest(op, 'strength', op.rest.strength - n);
  recordChange(op, 'strength', -n, opts);
}

/** 声望可以为负 */
export function gainRenown(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'renown', op.rest.renown + n);
  recordChange(op, 'renown', n, opts);
}

/** 加油，不超过油上限；返回实际加了多少 */
export function gainOil(op: Op, n: number, opts: GainOptions = {}): number {
  const add = Math.max(0, Math.min(n, op.rest.oil_max - op.rest.oil));
  if (add === 0) return 0;
  setRest(op, 'oil', op.rest.oil + add);
  recordChange(op, 'oil', add, opts);
  return add;
}

/** 经验入账并处理升级：每级属性点 +3、幸运 +1、餐桌上限 +1（规格书 02 §2.2）；返回升了几级 */
export function gainExp(op: Op, n: number, opts: GainOptions = {}): number {
  if (n <= 0) return 0;
  const from = op.rest.level;
  const r = applyExp(from, op.rest.exp, n);
  setRest(op, 'exp', r.exp);
  recordChange(op, 'exp', n, opts);
  if (r.gained > 0) {
    const t = op.tuning.rest;
    setRest(op, 'level', r.level);
    setRest(op, 'attr_left', op.rest.attr_left + t.attrPerLevel * r.gained);
    setRest(op, 'luck', op.rest.luck + t.luckPerLevel * r.gained);
    setRest(op, 'table_num', op.rest.table_num + t.tablesPerLevel * r.gained);
    restLog(op, 'level.up', { from, to: r.level });
  }
  return r.gained;
}
```

`apps/server/src/core/action.ts`：

```ts
import type { Op } from './op';

/** 玩家行为成功后发出，task 模块据此累计任务计数和活跃度（设计文档 §5.1） */
export async function emitAction(op: Op, key: string, n = 1): Promise<void> {
  await op.deps.bus.emit(op.tx, {
    name: 'action',
    shardId: op.shardId,
    restId: op.rest.id,
    payload: { key, n, star: op.rest.star_level, at: op.now.toISOString() },
  });
}
```

`apps/server/src/core/features.ts`：

```ts
import { isFeatureEnabled, type ShardSettings } from '@dt/config';

/** 代码里已经实现的功能。任务依赖的功能不在这里时自动跳过（设计文档 裁定 7） */
export const IMPLEMENTED_FEATURES: ReadonlySet<string> = new Set([
  'restaurant',
  'settlement',
  'world',
  'growth',
  'cookbook',
  'cupboard',
  'market',
  'shop',
  'store',
  'task',
]);

export function featureAvailable(settings: ShardSettings, feature: string): boolean {
  return IMPLEMENTED_FEATURES.has(feature) && isFeatureEnabled(settings, feature);
}
```

`apps/server/src/core/jobs.ts`：

```ts
import type { ShardSettings } from '@dt/config';

export interface JobContext {
  shardId: number;
  /** 当前周期键，例如结算轮次号、`2026-09-30@08` */
  period: string;
  now: Date;
  settings: ShardSettings;
}

/** 周期型任务（设计文档 §6）：period 返回 null 表示此刻不该跑；时点可以随区服 tuning 变化 */
export interface PeriodicJob {
  name: string;
  feature: string;
  period(now: Date, settings: ShardSettings): string | null;
  run(ctx: JobContext): Promise<Record<string, unknown>>;
}
```

`apps/server/src/game.ts`：

```ts
import { cryptoRng } from '@dt/shared';
import type { AppDeps } from './app';
import type { GameDeps } from './core/deps';
import type { PeriodicJob } from './core/jobs';
import { createAccountService, type AccountService } from './modules/account/service';
import { createRestaurantService, type RestaurantService } from './modules/restaurant/service';
import { createShardService, type ShardService } from './modules/shard/service';

/** 所有游戏服务的装配：HTTP 路由、worker、模拟器共用 */
export interface Game {
  app: AppDeps;
  deps: GameDeps;
  shards: ShardService;
  account: AccountService;
  restaurant: RestaurantService;
  jobs: PeriodicJob[];
}

export function createGame(app: AppDeps): Game {
  const shards = createShardService(app);
  const deps: GameDeps = {
    db: app.db,
    redis: app.redis,
    config: app.config,
    bus: app.bus,
    now: app.now,
    rng: app.rng ?? cryptoRng,
    shards,
  };
  const jobs: PeriodicJob[] = [];
  return {
    app,
    deps,
    shards,
    account: createAccountService(app),
    restaurant: createRestaurantService(app, shards),
    jobs,
  };
}
```

`apps/server/src/modules/index.ts` 整个替换为：

```ts
import type { FastifyInstance } from 'fastify';
import type { Game } from '../game';
import { accountRoutes } from './account/routes';
import { restaurantRoutes } from './restaurant/routes';
import { shardRoutes } from './shard/routes';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, game: Game): void {
  app.register(accountRoutes(game.account, game.app), { prefix: '/api/v1/account' });
  app.register(shardRoutes(game.shards), { prefix: '/api/v1/shard' });
  app.register(restaurantRoutes(game.restaurant), { prefix: '/api/v1/restaurant' });
}
```

`apps/server/src/app.ts`：
1. `AppDeps` 里加 `rng?: () => Rng;`（并 `import type { Rng } from '@dt/shared';`）
2. 加 `import { createGame } from './game';`
3. `registerModules(app, deps);` 改成 `registerModules(app, createGame(deps));`

- [ ] **Step 5: 测试工具**

`apps/server/test/game.ts`：

```ts
import type { Kysely } from 'kysely';
import type { AppDeps } from '../src/app';
import type { RestCtx } from '../src/core/deps';
import { createDb } from '../src/db';
import type { DB, RestaurantRow } from '../src/db/schema';
import { EventBus } from '../src/events/bus';
import { createGame, type Game } from '../src/game';
import { fixedCaptcha } from '../src/infra/captcha';
import { memoryMailer } from '../src/infra/mailer';
import { createRedis } from '../src/infra/redis';
import { createSessionStore } from '../src/security/sessionStore';
import { testConfig } from './config';
import { createAccountRow, createRestaurantFull, createShard, type FullRestaurantOptions } from './fixtures';
import { GENEROUS_RULES, testEnvWith } from './helpers';

export interface TestClock {
  now: Date;
  set(d: Date): void;
  advance(ms: number): void;
}

export interface TestGame {
  game: Game;
  deps: AppDeps;
  db: Kysely<DB>;
  clock: TestClock;
  close(): Promise<void>;
}

/** 不启动 HTTP，直接调用服务；时间由 clock 控制 */
export async function createTestGame(overrides: Partial<AppDeps> = {}): Promise<TestGame> {
  const env = testEnvWith();
  const db = createDb(env.DATABASE_URL, 5);
  const redis = createRedis(env.REDIS_URL);
  const clock: TestClock = {
    now: new Date(),
    set(d) {
      this.now = d;
    },
    advance(ms) {
      this.now = new Date(this.now.getTime() + ms);
    },
  };
  const deps: AppDeps = {
    env,
    db,
    redis,
    config: testConfig(),
    mailer: memoryMailer(),
    captcha: fixedCaptcha(true),
    bus: new EventBus(),
    sessions: createSessionStore(redis, 3600),
    now: () => clock.now,
    rateRules: GENEROUS_RULES,
    ...overrides,
  };
  const game = createGame(deps);
  return {
    game,
    deps,
    db,
    clock,
    close: async () => {
      await db.destroy();
      redis.disconnect();
    },
  };
}

export interface NewRestaurantOptions extends FullRestaurantOptions {
  shardId?: number;
  /** 食材 id → 橱柜数量 */
  foods?: Record<number, number>;
  /** 道具 id → 数量（直接写仓库，不写加成来源；勋章请用 grantGoods） */
  goods?: Record<number, number>;
  verified?: boolean;
}

export async function newRestaurant(t: TestGame, opts: NewRestaurantOptions = {}): Promise<RestCtx> {
  const shardId = opts.shardId ?? (await createShard(t.db));
  const accountId = await createAccountRow(t.db);
  if (opts.verified) {
    await t.db.updateTable('account').set({ email_verified_at: new Date() }).where('id', '=', accountId).execute();
  }
  const restaurantId = await createRestaurantFull(t.db, shardId, accountId, opts);
  for (const [id, num] of Object.entries(opts.foods ?? {})) {
    await t.db.insertInto('cupboard_food').values({ rest_id: restaurantId, foods_id: Number(id), num }).execute();
  }
  for (const [id, num] of Object.entries(opts.goods ?? {})) {
    await t.db.insertInto('store_item').values({ rest_id: restaurantId, goods_id: Number(id), num }).execute();
  }
  return { accountId, shardId, restaurantId, ip: '127.0.0.1', deviceId: null };
}

export async function restRow(t: TestGame, restId: number): Promise<RestaurantRow> {
  return t.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow();
}

export async function goodsNum(t: TestGame, restId: number, goodsId: number): Promise<number> {
  const r = await t.db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

export async function foodNum(t: TestGame, restId: number, foodsId: number): Promise<{ num: number; fridge: number }> {
  const r = await t.db
    .selectFrom('cupboard_food')
    .select(['num', 'fridge_num'])
    .where('rest_id', '=', restId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return { num: r?.num ?? 0, fridge: r?.fridge_num ?? 0 };
}
```

- [ ] **Step 6: 写 runOp 的失败测试**

`apps/server/src/core/op.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../test/game';
import { runOp } from './op';
import { gainCoin, gainExp, spendCoin } from './resources';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'restaurant', source: 'test' }, fn);

describe('runOp', () => {
  it('资源变化一次写回；流水带上操作时间；返回得失提示', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000 } });
    t.clock.set(new Date('2026-09-30T02:00:00Z'));
    const r = await run(ctx, async (op) => {
      gainCoin(op, 500);
      spendCoin(op, 200);
      return op.rest.coin;
    });
    expect(r.data).toBe(1300);
    expect(r.events).toEqual([
      { type: 'gain', kind: 'coin', num: 500 },
      { type: 'loss', kind: 'coin', num: 200 },
    ]);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1300);
    const ledger = await t.db
      .selectFrom('ledger')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .orderBy('id')
      .execute();
    expect(ledger.map((l) => [l.kind, l.delta, l.source])).toEqual([
      ['coin', 500, 'test'],
      ['coin', -200, 'test'],
    ]);
    expect(ledger[0]!.created_at).toEqual(new Date('2026-09-30T02:00:00Z'));
  });

  it('资源不够时抛 NOT_ENOUGH，整个操作回滚', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100 } });
    await expect(
      run(ctx, async (op) => {
        gainCoin(op, 50);
        spendCoin(op, 500);
      }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'coin', need: 500, have: 150 } });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(100);
    const n = await t.db.selectFrom('ledger').select('id').where('rest_id', '=', ctx.restaurantId).execute();
    expect(n).toHaveLength(0);
  });

  it('经验可以连升多级：属性点、幸运、餐桌上限随之增加，并写个人日志', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1, exp: 0, attr_left: 3, luck: 0, table_num: 4 } });
    await run(ctx, async (op) => {
      gainExp(op, 2600);
    });
    const r = await restRow(t, ctx.restaurantId);
    expect(r).toMatchObject({ level: 3, exp: 100, attr_left: 9, luck: 2, table_num: 6 });
    const logs = await t.db.selectFrom('rest_log').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(logs.map((l) => [l.type, l.params])).toEqual([['level.up', { from: 1, to: 3 }]]);
  });

  it('功能在区服关闭时拒绝，不锁店', async () => {
    const ctx = await newRestaurant(t);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { restaurant: false } }) })
      .execute();
    await expect(run(ctx, async () => 1)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

- [ ] **Step 7: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/core`
Expected: PASS（level 4 个、op 4 个）

- [ ] **Step 8: 全部服务端测试**

Run: `pnpm exec vitest run apps/server && pnpm typecheck`
Expected: 全部 PASS（`registerModules` 改签名后，路由行为不变）

- [ ] **Step 9: 提交**

```bash
pnpm format
git add apps/server
git commit -m "feat(server): operation context, resource helpers, level-ups, game assembly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 加成汇总——收集类加成、幸运

**Files:**
- Create: `apps/server/src/modules/effects/collection.ts`
- Test: `apps/server/src/modules/effects/collection.test.ts`
- Modify: `apps/server/src/modules/effects/service.ts`（`getEffectAgg` 新签名、`markEffectsDirty` 导出）
- Modify: `apps/server/src/modules/effects/effects.test.ts`
- Create: `apps/server/src/core/luck.ts`

**Interfaces:**
- Consumes: `aggregateEffects`、`listActiveEffects`、`GOODS`、`DEVICE_TYPE`、`GOODS_TYPE`、`luckRate`
- Produces:
  - `CollectionCounts`、`collectionEffects(counts, t: Tuning['collection'], potTiers, paintingTiers): Record<string, number>` —— 派生键：`plaqueSum`、`honorAddCoin`、`honorAddExp`、`potCoinRate`、`potExpRate`、`paintingCoinRate`、`paintingExpRate`、`paintingTop`（名画达到最高档时为 1），以及档位里的其他键原样（`autoAddOil`、`mcCoinAdd`、`reapAddNum`）
  - `getEffectAgg(db, restId, now, config, tuning): Promise<Record<string, number>>`
  - `markEffectsDirty(db, restId)`
  - `opAgg(op): Promise<Record<string, number>>`、`opLuck(op): Promise<{ sum: number; rate: number }>`、`invalidateAgg(op)`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/effects/collection.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { collectionEffects, type CollectionCounts } from './collection';

const config = testConfig();
const t = config.tuning.collection;
const none: CollectionCounts = { plaques: 0, honors: 0, pots: 0, paintings: 0, an2023: false, an2025: false, mdcg: false };
const calc = (c: Partial<CollectionCounts>) =>
  collectionEffects({ ...none, ...c }, t, config.bundle.potTiers, config.bundle.paintingTiers);

describe('收集类加成（规格书 20 §20.18）', () => {
  it('什么都没有时为空', () => {
    expect(calc({})).toEqual({});
  });
  it('集牌匾：每种 1%，有 2023 纪念牌匾翻倍', () => {
    expect(calc({ plaques: 3 }).plaqueSum).toBeCloseTo(0.03);
    expect(calc({ plaques: 3, an2023: true }).plaqueSum).toBeCloseTo(0.06);
  });
  it('集荣誉：每个 0.4%，马到成功 ×1.5，2025 纪念牌匾银币部分 +16%', () => {
    expect(calc({ honors: 10 })).toMatchObject({ honorAddCoin: 0.04, honorAddExp: 0.04 });
    const x = calc({ honors: 10, mdcg: true, an2025: true });
    expect(x.honorAddExp).toBeCloseTo(0.06);
    expect(x.honorAddCoin).toBeCloseTo(0.0696);
  });
  it('集盆栽：4 株银币 +8%，7 株再经验 +64%，档位累加', () => {
    expect(calc({ pots: 3 })).toEqual({});
    expect(calc({ pots: 4 })).toEqual({ potCoinRate: 0.08 });
    expect(calc({ pots: 7 })).toEqual({ potCoinRate: 0.08, reapAddNum: 1, potExpRate: 0.64 });
  });
  it('集名画：7 幅自动加油，13 幅经验 +80% 且标记最高档', () => {
    expect(calc({ paintings: 7 })).toEqual({ autoAddOil: 1, mcCoinAdd: 1 });
    expect(calc({ paintings: 13 })).toEqual({
      autoAddOil: 1,
      mcCoinAdd: 1,
      reapAddNum: 1,
      paintingExpRate: 0.8,
      paintingTop: 1,
    });
  });
});
```

把 `apps/server/src/modules/effects/effects.test.ts` 改成新签名并更新期望（勋章来源现在会带来"集荣誉"派生键）：

1. 顶部加 `import { testConfig } from '../../../test/config';`，并在 `const db = testDb();` 后加：

```ts
const config = testConfig();
const agg = (restId: number, at: Date) => getEffectAgg(db, restId, at, config, config.tuning);
```

2. 把文件里所有 `getEffectAgg(db, restId, now)` 改成 `agg(restId, now)`，`getEffectAgg(db, restId, twoHoursLater)` 改成 `agg(restId, twoHoursLater)`。
3. 期望值改为：
   - 第一个用例前两处：`{ atRate: 0.45, luckValue: 36, honorAddCoin: 0.004, honorAddExp: 0.004 }`
   - 第一个用例删除勋章后：`{ atRate: 0.35, luckValue: 36 }`
   - 第二个用例到期前：`{ expRate: 1, honorAddCoin: 0.004, honorAddExp: 0.004 }`；到期后仍为 `{}`

再在 `effects.test.ts` 末尾追加：

```ts
describe('收集类加成进入汇总', () => {
  it('仓库里的不同牌匾、有效勋章、盆栽勋章都计入', async () => {
    const restId = await newRest();
    const now = new Date();
    // 两种牌匾（88 一星牌匾、89 二星牌匾）放在仓库里
    await db
      .insertInto('store_item')
      .values([
        { rest_id: restId, goods_id: 88, num: 1 },
        { rest_id: restId, goods_id: 89, num: 1 },
      ])
      .execute();
    // 四个盆栽勋章（devicetype 36）
    for (const id of [248, 249, 254, 338]) {
      await upsertEffectSource(db, restId, { sourceType: 'honor', sourceId: id, effects: {}, expiresAt: null });
    }
    const a = await agg(restId, now);
    expect(a.plaqueSum).toBeCloseTo(0.02);
    expect(a.honorAddCoin).toBeCloseTo(0.016);
    expect(a.potCoinRate).toBeCloseTo(0.08);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/effects`
Expected: FAIL，`./collection` 不存在

- [ ] **Step 3: 实现**

`apps/server/src/modules/effects/collection.ts`：

```ts
import type { CollectionTier, Tuning } from '@dt/config';

export interface CollectionCounts {
  /** 仓库里拥有的不同牌匾数 */
  plaques: number;
  /** 有效勋章数（不含街道勋章） */
  honors: number;
  pots: number;
  paintings: number;
  an2023: boolean;
  an2025: boolean;
  mdcg: boolean;
}

const RENAMED: ReadonlySet<string> = new Set(['coinRate', 'expRate']);

/** 达到的每一档都生效；coinRate/expRate 加前缀区分来源，其他键原样 */
function addTiers(out: Record<string, number>, count: number, tiers: CollectionTier[], prefix: string): void {
  for (const tier of tiers) {
    if (count < tier.count) continue;
    for (const [k, v] of Object.entries(tier.effects)) {
      const key = RENAMED.has(k) ? `${prefix}${k[0]!.toUpperCase()}${k.slice(1)}` : k;
      out[key] = (out[key] ?? 0) + v;
    }
  }
}

/** 收集类加成（规格书 20 §20.18、17）：集牌匾、集荣誉、集盆栽、集名画 */
export function collectionEffects(
  c: CollectionCounts,
  t: Tuning['collection'],
  potTiers: CollectionTier[],
  paintingTiers: CollectionTier[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const plaqueSum = c.plaques * t.plaquePer * (c.an2023 ? t.an2023Multiplier : 1);
  if (plaqueSum > 0) out.plaqueSum = plaqueSum;
  const honorAdd = c.honors * t.honorPer * (c.mdcg ? t.mdcgMultiplier : 1);
  if (honorAdd > 0) {
    out.honorAddCoin = honorAdd * (c.an2025 ? 1 + t.an2025CoinBonus : 1);
    out.honorAddExp = honorAdd;
  }
  addTiers(out, c.pots, potTiers, 'pot');
  addTiers(out, c.paintings, paintingTiers, 'painting');
  const top = paintingTiers.at(-1);
  if (top && c.paintings >= top.count) out.paintingTop = 1;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]! * 1e9) / 1e9;
  return out;
}
```

`apps/server/src/modules/effects/service.ts`：

1. 顶部导入改为：

```ts
import type { Kysely } from 'kysely';
import { DEVICE_TYPE, GOODS, GOODS_TYPE, type GameConfig, type Tuning } from '@dt/config';
import type { DB } from '../../db/schema';
import { aggregateEffects } from './aggregate';
import { collectionEffects } from './collection';
```

2. 把私有的 `markDirty` 改名导出：

```ts
export async function markEffectsDirty(db: Kysely<DB>, restId: number): Promise<void> {
  await db.updateTable('restaurant').set({ effect_dirty: true }).where('id', '=', restId).execute();
}
```

并把文件里两处 `markDirty(` 改成 `markEffectsDirty(`。

3. 把 `getEffectAgg` 替换为：

```ts
/**
 * 取加成汇总：缓存有效直接返回；来源有变动或有来源到期时重算并写回。
 * 汇总里包含收集类派生键（设计文档 §3.1）。调用方应已持有该店的行锁。
 */
export async function getEffectAgg(
  db: Kysely<DB>,
  restId: number,
  now: Date,
  config: GameConfig,
  tuning: Tuning,
): Promise<Record<string, number>> {
  const r = await db
    .selectFrom('restaurant')
    .select(['effect_agg', 'effect_dirty', 'effect_next_expire_at'])
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  const stale = r.effect_dirty || (r.effect_next_expire_at !== null && r.effect_next_expire_at <= now);
  if (!stale) return r.effect_agg;

  const sources = await listActiveEffects(db, restId, now);
  const { agg, nextExpireAt } = aggregateEffects(sources, now);

  const owned = await db
    .selectFrom('store_item')
    .select('goods_id')
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .execute();
  const ownedIds = new Set(owned.map((o) => o.goods_id));
  let plaques = 0;
  for (const id of ownedIds) {
    const g = config.goods.get(id);
    if (g && g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque) plaques += 1;
  }
  let honors = 0;
  let pots = 0;
  let paintings = 0;
  for (const s of sources) {
    if (s.sourceType !== 'honor') continue;
    honors += 1;
    const dt = config.goods.get(s.sourceId)?.deviceType;
    if (dt === DEVICE_TYPE.pot) pots += 1;
    if (dt === DEVICE_TYPE.painting) paintings += 1;
  }
  const derived = collectionEffects(
    {
      plaques,
      honors,
      pots,
      paintings,
      an2023: ownedIds.has(GOODS.an2023Plaque),
      an2025: ownedIds.has(GOODS.an2025Plaque),
      mdcg: ownedIds.has(GOODS.mdcgPlaque),
    },
    tuning.collection,
    config.bundle.potTiers,
    config.bundle.paintingTiers,
  );
  for (const [k, v] of Object.entries(derived)) agg[k] = (agg[k] ?? 0) + v;

  await db
    .updateTable('restaurant')
    .set({ effect_agg: JSON.stringify(agg), effect_next_expire_at: nextExpireAt, effect_dirty: false })
    .where('id', '=', restId)
    .execute();
  return agg;
}
```

`apps/server/src/core/luck.ts`：

```ts
import { luckRate } from '@dt/shared';
import { getEffectAgg } from '../modules/effects/service';
import type { Op } from './op';

/** 本操作内的加成汇总（缓存在 op 上；发放勋章或牌匾后调用 invalidateAgg） */
export async function opAgg(op: Op): Promise<Record<string, number>> {
  const hit = op.cache.get('agg') as Record<string, number> | undefined;
  if (hit) return hit;
  const agg = await getEffectAgg(op.tx, op.rest.id, op.now, op.config, op.tuning);
  op.cache.set('agg', agg);
  return agg;
}

export function invalidateAgg(op: Op): void {
  op.cache.delete('agg');
}

/** 幸运总值 = 基础幸运 + 加成里的 luckValue；幸运率见规格书 00 §0.5 */
export async function opLuck(op: Op): Promise<{ sum: number; rate: number }> {
  const agg = await opAgg(op);
  const sum = op.rest.luck + (agg.luckValue ?? 0);
  return { sum, rate: luckRate(sum) };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/effects`
Expected: PASS

- [ ] **Step 5: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`
Expected: 全部 PASS

```bash
git add apps/server
git commit -m "feat(server): collection bonuses in effect aggregation, op-level luck

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: 道具、食材、奖励的发放与扣除，打开礼包

**Files:**
- Modify: `apps/server/src/modules/store/grant.ts`
- Modify: `apps/server/src/modules/store/grant.test.ts`
- Create: `apps/server/src/modules/store/goods.ts`
- Test: `apps/server/src/modules/store/goods.test.ts`
- Create: `apps/server/src/modules/cupboard/foods.ts`
- Test: `apps/server/src/modules/cupboard/foods.test.ts`
- Create: `apps/server/src/modules/award/award.ts`
- Test: `apps/server/src/modules/award/award.test.ts`

**Interfaces:**
- Consumes: `Op`、`recordChange`、`restLog`、`gainCoin/gainExp/gainDiamond/gainRenown`、`notEnough`、`opLuck`、`invalidateAgg`、`markEffectsDirty`、`upsertEffectSource`、`removeEffectSource`、`GameConfig.isStreetMedal/randomGoodsIds/masterFoodPool/foodPools`
- Produces:
  - `grantGoods(db, config, restId, goodsId, num, now, opts?: { hours?: number | null }): Promise<GrantResult>`，`GrantResult { granted; dropped; expiresAt }`；只有勋章在仓库里带有效期
  - `sourceTypeForGoods(g, config): 'street' | 'honor'`
  - `grantGoodsOp(op, goodsId, num, opts?: GoodsGrantOptions): Promise<number>`，`GoodsGrantOptions { source?; hours?; lucky?; event? }`
  - `countGoods(op, goodsId)`、`hasValidHonor(op, goodsId)`、`consumeGoods(op, goodsId, num, opts?)`、`removeHonor(op, goodsId)`、`storeKinds(op)`、`assertStoreRoom(op, goodsId)`
  - `planAddFoods(state, num): AddPlan`、`addFoods(op, foodsId, num, opts?)`、`subFoods(op, foodsId, num, opts?)`、`cupboardSlotsUsed(db, restId)`、`foodsMap(db, restId): Promise<Map<number, FoodRow>>`，`FoodRow { num; fridge; locked }`
  - `grantAward(op, award, opts?: { source?; lucky?; multiplier? })`、`openGift(op, goods, times, opts?)`

- [ ] **Step 1: 写食材加减的失败测试**

`apps/server/src/modules/cupboard/foods.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, foodNum, newRestaurant, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { addFoods, planAddFoods, subFoods } from './foods';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'cupboard', source: 'test' }, fn);

describe('planAddFoods（规格书 00 §0.10）', () => {
  const base = { have: 0, fridge: 0, slotsUsed: 0, slots: 10, max: 999 };
  it('有空格子：全部进橱柜', () => {
    expect(planAddFoods(base, 5)).toEqual({ toCupboard: 5, toFridge: 0, dropped: 0 });
  });
  it('已有该食材：加到上限，溢出进冰箱', () => {
    expect(planAddFoods({ ...base, have: 995, slotsUsed: 1 }, 10)).toEqual({ toCupboard: 4, toFridge: 6, dropped: 0 });
  });
  it('没有该食材且格子满了：全部进冰箱', () => {
    expect(planAddFoods({ ...base, slotsUsed: 10 }, 7)).toEqual({ toCupboard: 0, toFridge: 7, dropped: 0 });
  });
  it('冰箱也满了：丢弃', () => {
    expect(planAddFoods({ ...base, slotsUsed: 10, fridge: 997 }, 7)).toEqual({ toCupboard: 0, toFridge: 2, dropped: 5 });
  });
});

describe('addFoods / subFoods', () => {
  it('橱柜满了：新食材进冰箱并标记未读；冰箱满了写丢弃日志，不报错', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 1, foods_max_num: 10 }, foods: { 101: 3 } });
    await run(ctx, async (op) => {
      await addFoods(op, 102, 15);
    });
    expect(await foodNum(t, ctx.restaurantId, 102)).toEqual({ num: 0, fridge: 10 });
    const row = await t.db
      .selectFrom('cupboard_food')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', 102)
      .executeTakeFirstOrThrow();
    expect(row.fridge_unread).toBe(true);
    const logs = await t.db.selectFrom('rest_log').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(logs.map((l) => [l.type, l.params])).toEqual([['fridge.drop', { foodsId: 102, num: 5 }]]);
  });

  it('得失提示和流水', async () => {
    const ctx = await newRestaurant(t);
    const r = await run(ctx, async (op) => {
      await addFoods(op, 101, 4);
    });
    expect(r.events).toEqual([{ type: 'gain', kind: 'foods', id: 101, num: 4 }]);
    const l = await t.db.selectFrom('ledger').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(l.map((x) => [x.kind, x.item_id, x.delta])).toEqual([['foods', 101, 4]]);
  });

  it('扣到 0 删除这一行；锁定的保留（记住锁定）', async () => {
    const ctx = await newRestaurant(t, { foods: { 101: 2, 102: 2 } });
    await t.db
      .updateTable('cupboard_food')
      .set({ locked: true })
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', 102)
      .execute();
    await run(ctx, async (op) => {
      await subFoods(op, 101, 2);
      await subFoods(op, 102, 2);
    });
    const rows = await t.db.selectFrom('cupboard_food').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(rows.map((r) => [r.foods_id, r.num, r.locked])).toEqual([[102, 0, true]]);
  });

  it('不够时抛 NOT_ENOUGH（带食材 id）', async () => {
    const ctx = await newRestaurant(t, { foods: { 101: 1 } });
    await expect(
      run(ctx, async (op) => {
        await subFoods(op, 101, 3);
      }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'foods', id: 101, need: 3, have: 1 } });
  });
});
```

- [ ] **Step 2: 写道具的失败测试**

`apps/server/src/modules/store/goods.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { opAgg } from '../../core/luck';
import { runOp } from '../../core/op';
import { assertStoreRoom, consumeGoods, grantGoodsOp, hasValidHonor, removeHonor } from './goods';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, fn);

describe('道具发放与扣除', () => {
  it('设施道具在仓库里不带有效期（摆放时才计时）', async () => {
    const ctx = await newRestaurant(t);
    await run(ctx, async (op) => {
      await grantGoodsOp(op, 13, 2);
    });
    const row = await t.db
      .selectFrom('store_item')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .where('goods_id', '=', 13)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ num: 2, expires_at: null });
  });

  it('勋章可以指定有效期；到期后不再算持有', async () => {
    const ctx = await newRestaurant(t);
    t.clock.set(new Date('2026-09-30T00:00:00Z'));
    await run(ctx, async (op) => {
      await grantGoodsOp(op, 133, 1, { hours: 5 });
    });
    t.clock.set(new Date('2026-09-30T04:59:00Z'));
    expect((await run(ctx, (op) => hasValidHonor(op, 133))).data).toBe(true);
    t.clock.set(new Date('2026-09-30T05:00:00Z'));
    expect((await run(ctx, (op) => hasValidHonor(op, 133))).data).toBe(false);
    t.clock.set(new Date());
  });

  it('得到新牌匾后加成汇总重新计算（集牌匾）', async () => {
    const ctx = await newRestaurant(t);
    const r = await run(ctx, async (op) => {
      await opAgg(op);
      await grantGoodsOp(op, 88, 1);
      return opAgg(op);
    });
    expect(r.data.plaqueSum).toBeCloseTo(0.01);
  });

  it('扣除：不够时报错；扣到 0 删除', async () => {
    const ctx = await newRestaurant(t, { goods: { 86: 2 } });
    await expect(run(ctx, (op) => consumeGoods(op, 86, 3))).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 86, need: 3, have: 2 },
    });
    const r = await run(ctx, (op) => consumeGoods(op, 86, 2));
    expect(r.events).toEqual([{ type: 'loss', kind: 'goods', id: 86, num: 2 }]);
    expect(await goodsNum(t, ctx.restaurantId, 86)).toBe(0);
  });

  it('移除勋章同时移除加成来源', async () => {
    const ctx = await newRestaurant(t);
    await run(ctx, (op) => grantGoodsOp(op, 106, 1));
    const r = await run(ctx, async (op) => {
      await removeHonor(op, 106);
      return opAgg(op);
    });
    expect(r.data.atRate ?? 0).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 106)).toBe(0);
  });

  it('仓库容量：种数满了不能放新种类；已有的、勋章不受限', async () => {
    const ctx = await newRestaurant(t, { patch: { store_num: 1 }, goods: { 86: 1 } });
    await expect(run(ctx, (op) => assertStoreRoom(op, 24))).rejects.toMatchObject({ code: 'STORE_FULL' });
    await run(ctx, (op) => assertStoreRoom(op, 86));
    await run(ctx, (op) => assertStoreRoom(op, 167));
  });
});
```

在 `apps/server/src/modules/store/grant.test.ts` 里把 `sourceTypeForGoods(config.requireGoods(140))` 这类调用改成两个参数，并追加江西街：

```ts
    expect(sourceTypeForGoods(config.requireGoods(140), config)).toBe('street');
    expect(sourceTypeForGoods(config.requireGoods(187), config)).toBe('street');
    expect(sourceTypeForGoods(config.requireGoods(100), config)).toBe('honor');
```

- [ ] **Step 3: 写奖励和礼包的失败测试**

`apps/server/src/modules/award/award.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { grantAward, openGift } from './award';

const config = testConfig();
let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());
const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, fn);

describe('grantAward（规格书 00 §0.7）', () => {
  it('银币、经验（会升级）、钻石、声望、道具、食材', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, renown: 10 } });
    await run(ctx, (op) =>
      grantAward(op, {
        coin: 2000,
        exp: 600,
        diamond: 2,
        renown: 5,
        goods: [{ id: 1, num: 3 }],
        foods: [{ id: 101, num: 2 }],
      }),
    );
    const r = await restRow(t, ctx.restaurantId);
    expect(r).toMatchObject({ coin: 2000, level: 2, exp: 100, diamond: 2, renown: 15 });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(2);
  });

  it('multiplier 放大所有数量', async () => {
    const ctx = await newRestaurant(t, { patch: { diamond: 0 } });
    await run(ctx, (op) => grantAward(op, { diamond: 2, goods: [{ id: 1, num: 1 }] }, { multiplier: 2 }));
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(4);
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(2);
  });
});

describe('openGift（规格书 07 §7.5）', () => {
  it('每日签到礼包：按固定随机序列逐项判定', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, diamond: 0 } });
    const pool = config.randomGoodsIds(7);
    // 顺序：礼券(判定) → 随机道具(判定、抽取) → 万能食材(判定) → 银币(判定、数额) → 经验(判定) → 钻石(判定、数额)
    rngValues = [0.5, 0.1, 0, 0.5, 0.1, 0.5, 0.9, 0.2, 0.99];
    await run(ctx, (op) => openGift(op, config.requireGoods(115), 1));
    // 随机道具池的第一个如果恰好也是神秘礼券，礼券会多 1
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(20 + (pool[0] === 1 ? 1 : 0));
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBeGreaterThanOrEqual(1);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(1000 + Math.floor(0.5 * 19000));
    expect(r.diamond).toBe(1 + Math.floor(0.99 * 3));
    expect(r.exp).toBe(0);
  });

  it('幸运：随机数超过 rate 但低于 rate + 幸运率时仍然得到，并标记幸运', async () => {
    // 幸运 300 → 幸运率 0.3
    const ctx = await newRestaurant(t, { patch: { luck: 300 } });
    rngValues = [0.5, 0.35, 0, 0.99, 0.99, 0.99, 0.99];
    const r = await run(ctx, (op) => openGift(op, config.requireGoods(115), 1));
    const lucky = r.events.filter((e) => e.lucky);
    expect(lucky).toHaveLength(1);
    expect(lucky[0]).toMatchObject({ type: 'gain', kind: 'goods', id: config.randomGoodsIds(7)[0] });
  });

  it('随机万能食材礼包：万能食材按权重、1 级食材按权重', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.5, 0, 0.5, 0];
    await run(ctx, (op) => openGift(op, config.requireGoods(131), 1));
    expect((await foodNum(t, ctx.restaurantId, 467)).num).toBe(1);
    const firstLevel1 = config.foodPools.get(1)!.items[0]!.id;
    expect((await foodNum(t, ctx.restaurantId, firstLevel1)).num).toBe(2);
    rngValues = [0.5];
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/cupboard apps/server/src/modules/store apps/server/src/modules/award`
Expected: FAIL，模块不存在

- [ ] **Step 5: 实现 grant.ts**

`apps/server/src/modules/store/grant.ts` 整个替换为：

```ts
import type { Kysely } from 'kysely';
import { DEVICE_TYPE, goodsEffectHours, GOODS_TYPE, type GameConfig, type Goods } from '@dt/config';
import type { DB } from '../../db/schema';
import { markEffectsDirty, upsertEffectSource } from '../effects/service';

/** 街道勋章：type 9 且 devicetype 是街道号（江西街起 id 不连续，不能按 140 + 街道号判断） */
export function sourceTypeForGoods(g: Goods, config: GameConfig): 'street' | 'honor' {
  return config.isStreetMedal(g) ? 'street' : 'honor';
}

export interface GrantResult {
  granted: number;
  dropped: number;
  expiresAt: Date | null;
}

/**
 * 给餐厅发道具（规格书 00 §0.9）：勋章数量恒为 1、再次获得刷新有效期并写入加成来源；
 * 其他道具累加到持有上限，超出部分丢弃。只有勋章在仓库里带有效期，设施的时长在摆放时才开始算。
 */
export async function grantGoods(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  num: number,
  now: Date,
  opts: { hours?: number | null } = {},
): Promise<GrantResult> {
  const g = config.requireGoods(goodsId);
  const isHonor = g.type === GOODS_TYPE.honor;
  const hours = isHonor ? (opts.hours !== undefined ? opts.hours : goodsEffectHours(g)) : null;
  const expiresAt = hours !== null ? new Date(now.getTime() + hours * 3600_000) : null;
  const before = await db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  const have = before?.num ?? 0;
  const target = isHonor ? 1 : Math.min(have + num, g.maxNum);
  const granted = isHonor ? 1 : target - have;
  const dropped = isHonor ? 0 : num - granted;
  await db
    .insertInto('store_item')
    .values({ rest_id: restId, goods_id: goodsId, num: target, acquired_at: now, expires_at: expiresAt })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'goods_id']).doUpdateSet({ num: target, acquired_at: now, expires_at: expiresAt }),
    )
    .execute();
  if (isHonor) {
    await upsertEffectSource(db, restId, {
      sourceType: sourceTypeForGoods(g, config),
      sourceId: g.id,
      effects: g.effects,
      expiresAt,
    });
  } else if (g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque && have === 0) {
    await markEffectsDirty(db, restId);
  }
  return { granted, dropped, expiresAt };
}
```

- [ ] **Step 6: 实现 goods.ts**

`apps/server/src/modules/store/goods.ts`：

```ts
import { sql } from 'kysely';
import { DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import { ErrorCode } from '@dt/shared';
import { notEnough } from '../../core/errors';
import { invalidateAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { recordChange } from '../../core/resources';
import { AppError } from '../../http/errors';
import { markEffectsDirty, removeEffectSource } from '../effects/service';
import { grantGoods, sourceTypeForGoods } from './grant';

export interface GoodsGrantOptions {
  source?: string;
  /** 勋章有效期（小时）；不传用道具自己的时长 */
  hours?: number | null;
  lucky?: boolean;
  event?: boolean;
}

function affectsAgg(op: Op, goodsId: number): boolean {
  const g = op.config.requireGoods(goodsId);
  return g.type === GOODS_TYPE.honor || (g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque);
}

export async function grantGoodsOp(
  op: Op,
  goodsId: number,
  num: number,
  opts: GoodsGrantOptions = {},
): Promise<number> {
  if (num <= 0) return 0;
  const r = await grantGoods(op.tx, op.config, op.rest.id, goodsId, num, op.now, { hours: opts.hours });
  if (affectsAgg(op, goodsId)) invalidateAgg(op);
  recordChange(op, 'goods', r.granted, { source: opts.source, lucky: opts.lucky, event: opts.event }, goodsId);
  if (r.dropped > 0) restLog(op, 'goods.drop', { goodsId, num: r.dropped });
  return r.granted;
}

/** 持有数量；已过期的勋章算 0 */
export async function countGoods(op: Op, goodsId: number): Promise<number> {
  const r = await op.tx
    .selectFrom('store_item')
    .select(['num', 'expires_at'])
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  if (!r) return 0;
  if (r.expires_at !== null && r.expires_at <= op.now) return 0;
  return r.num;
}

export async function hasValidHonor(op: Op, goodsId: number): Promise<boolean> {
  return (await countGoods(op, goodsId)) > 0;
}

export async function consumeGoods(op: Op, goodsId: number, num: number, opts: { source?: string } = {}): Promise<void> {
  if (num <= 0) return;
  const row = await op.tx
    .updateTable('store_item')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) throw notEnough('goods', num, await countGoods(op, goodsId), goodsId);
  if (row.num === 0) {
    await op.tx.deleteFrom('store_item').where('rest_id', '=', op.rest.id).where('goods_id', '=', goodsId).execute();
    if (affectsAgg(op, goodsId)) {
      await markEffectsDirty(op.tx, op.rest.id);
      invalidateAgg(op);
    }
  }
  recordChange(op, 'goods', -num, { source: opts.source }, goodsId);
}

/** 移除勋章：删仓库记录和加成来源；返回原来是否持有 */
export async function removeHonor(op: Op, goodsId: number): Promise<boolean> {
  const g = op.config.requireGoods(goodsId);
  const del = await op.tx
    .deleteFrom('store_item')
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  await removeEffectSource(op.tx, op.rest.id, sourceTypeForGoods(g, op.config), goodsId);
  invalidateAgg(op);
  return Number(del.numDeletedRows) > 0;
}

/** 仓库占用 = 持有的不同非勋章道具种数（设计文档 裁定 6） */
export async function storeKinds(op: Op): Promise<number> {
  const rows = await op.tx
    .selectFrom('store_item')
    .select('goods_id')
    .where('rest_id', '=', op.rest.id)
    .where('num', '>', 0)
    .execute();
  return rows.filter((r) => op.config.goods.get(r.goods_id)?.type !== GOODS_TYPE.honor).length;
}

/** 购买新种类的道具前检查仓库容量；奖励类发放不调用它 */
export async function assertStoreRoom(op: Op, goodsId: number): Promise<void> {
  const g = op.config.requireGoods(goodsId);
  if (g.type === GOODS_TYPE.honor) return;
  if ((await countGoods(op, goodsId)) > 0) return;
  if ((await storeKinds(op)) >= op.rest.store_num)
    throw new AppError(ErrorCode.STORE_FULL, 400, { storeNum: op.rest.store_num });
}
```

- [ ] **Step 7: 实现 foods.ts**

`apps/server/src/modules/cupboard/foods.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { notEnough } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { recordChange } from '../../core/resources';
import type { DB } from '../../db/schema';

export interface CupboardState {
  have: number;
  fridge: number;
  slotsUsed: number;
  slots: number;
  max: number;
}

export interface AddPlan {
  toCupboard: number;
  toFridge: number;
  dropped: number;
}

/** 加食材（规格书 00 §0.10）：已有的加到上限，溢出进冰箱；没有且格子满了全部进冰箱；冰箱也满就丢弃 */
export function planAddFoods(s: CupboardState, num: number): AddPlan {
  let toCupboard = 0;
  if (s.have > 0) toCupboard = Math.min(num, Math.max(0, s.max - s.have));
  else if (s.slotsUsed < s.slots) toCupboard = Math.min(num, s.max);
  const left = num - toCupboard;
  const toFridge = Math.min(left, Math.max(0, s.max - s.fridge));
  return { toCupboard, toFridge, dropped: left - toFridge };
}

export interface FoodRow {
  num: number;
  fridge: number;
  locked: boolean;
}

export async function cupboardSlotsUsed(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('cupboard_food')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export async function foodsMap(db: Kysely<DB>, restId: number): Promise<Map<number, FoodRow>> {
  const rows = await db
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num', 'locked'])
    .where('rest_id', '=', restId)
    .execute();
  return new Map(rows.map((r) => [r.foods_id, { num: r.num, fridge: r.fridge_num, locked: r.locked }]));
}

export async function addFoods(
  op: Op,
  foodsId: number,
  num: number,
  opts: { source?: string; lucky?: boolean; event?: boolean } = {},
): Promise<AddPlan> {
  if (num <= 0) return { toCupboard: 0, toFridge: 0, dropped: 0 };
  op.config.requireFood(foodsId);
  const row = await op.tx
    .selectFrom('cupboard_food')
    .select(['num', 'fridge_num'])
    .where('rest_id', '=', op.rest.id)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  const plan = planAddFoods(
    {
      have: row?.num ?? 0,
      fridge: row?.fridge_num ?? 0,
      slotsUsed: await cupboardSlotsUsed(op.tx, op.rest.id),
      slots: op.rest.cupboard_num,
      max: op.rest.foods_max_num,
    },
    num,
  );
  if (plan.toCupboard + plan.toFridge > 0) {
    const unread = plan.toFridge > 0;
    await op.tx
      .insertInto('cupboard_food')
      .values({
        rest_id: op.rest.id,
        foods_id: foodsId,
        num: plan.toCupboard,
        fridge_num: plan.toFridge,
        fridge_unread: unread,
      })
      .onConflict((oc) =>
        oc.columns(['rest_id', 'foods_id']).doUpdateSet({
          num: sql<number>`cupboard_food.num + ${plan.toCupboard}`,
          fridge_num: sql<number>`cupboard_food.fridge_num + ${plan.toFridge}`,
          fridge_unread: sql<boolean>`cupboard_food.fridge_unread or ${unread}`,
        }),
      )
      .execute();
    recordChange(op, 'foods', plan.toCupboard + plan.toFridge, opts, foodsId);
  }
  if (plan.dropped > 0) restLog(op, 'fridge.drop', { foodsId, num: plan.dropped });
  return plan;
}

/** 从橱柜扣食材（不动冰箱）；扣到 0 且冰箱也空、没锁定时删除这一行 */
export async function subFoods(
  op: Op,
  foodsId: number,
  num: number,
  opts: { source?: string; event?: boolean } = {},
): Promise<void> {
  if (num <= 0) return;
  const row = await op.tx
    .updateTable('cupboard_food')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', op.rest.id)
    .where('foods_id', '=', foodsId)
    .where('num', '>=', num)
    .returning(['num', 'fridge_num', 'locked'])
    .executeTakeFirst();
  if (!row) {
    const have = await op.tx
      .selectFrom('cupboard_food')
      .select('num')
      .where('rest_id', '=', op.rest.id)
      .where('foods_id', '=', foodsId)
      .executeTakeFirst();
    throw notEnough('foods', num, have?.num ?? 0, foodsId);
  }
  if (row.num === 0 && row.fridge_num === 0 && !row.locked) {
    await op.tx
      .deleteFrom('cupboard_food')
      .where('rest_id', '=', op.rest.id)
      .where('foods_id', '=', foodsId)
      .execute();
  }
  recordChange(op, 'foods', -num, opts, foodsId);
}
```

- [ ] **Step 8: 实现 award.ts**

`apps/server/src/modules/award/award.ts`：

```ts
import type { Award, GiftItem, Goods } from '@dt/config';
import { pickWeighted } from '@dt/shared';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp, gainRenown } from '../../core/resources';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';

export interface AwardOptions {
  source?: string;
  lucky?: boolean;
  /** 所有数量乘以这个倍数（活跃奖励翻倍等） */
  multiplier?: number;
}

/** 发放奖励（规格书 00 §0.7）；经验走 gainExp，会触发升级 */
export async function grantAward(op: Op, award: Award, opts: AwardOptions = {}): Promise<void> {
  const m = opts.multiplier ?? 1;
  const o = { source: opts.source, lucky: opts.lucky };
  if (award.coin) gainCoin(op, Math.floor(award.coin * m), o);
  if (award.exp) gainExp(op, Math.floor(award.exp * m), o);
  if (award.diamond) gainDiamond(op, Math.floor(award.diamond * m), o);
  if (award.renown) gainRenown(op, Math.floor(award.renown * m), o);
  for (const g of award.goods ?? []) await grantGoodsOp(op, g.id, g.num * m, o);
  for (const f of award.foods ?? []) await addFoods(op, f.id, f.num * m, o);
}

/** [min, max) 的整数 */
function randRange(op: Op, min: number, max: number): number {
  return max > min ? min + op.rng.int(max - min) : min;
}

function pickRandomGoods(op: Op, level: number): number | null {
  const pool = op.config.randomGoodsIds(level);
  return pool.length === 0 ? null : pool[op.rng.int(pool.length)]!;
}

/** 礼包里的食材项：指定 id；flag=master 为万能食材；flag 为数字时是该等级的普通食材 */
function pickGiftFood(op: Op, item: Extract<GiftItem, { type: 'foods' }>): number | null {
  if (item.id !== undefined && item.id > 0) return item.id;
  if (item.flag === 'master') {
    return op.config.masterFoodPool.total > 0 ? pickWeighted(op.config.masterFoodPool, op.rng).id : null;
  }
  const pool = op.config.foodPools.get(Number(item.flag));
  return pool && pool.total > 0 ? pickWeighted(pool, op.rng).id : null;
}

/** 打开礼包 times 次（规格书 07 §7.5）：每项独立按 rate + 幸运率判定，超出 rate 的部分算"幸运" */
export async function openGift(op: Op, goods: Goods, times: number, opts: { source?: string } = {}): Promise<void> {
  const items = goods.gift ?? [];
  const { rate: lr } = await opLuck(op);
  const source = opts.source ?? `gift.${goods.id}`;
  for (let i = 0; i < times; i++) {
    for (const item of items) {
      const roll = op.rng.next();
      if (roll >= item.rate + lr) continue;
      const o = { source, lucky: roll >= item.rate };
      switch (item.type) {
        case 'goods': {
          const id = item.id > 0 ? item.id : pickRandomGoods(op, item.level ?? 1);
          if (id !== null) await grantGoodsOp(op, id, item.num, o);
          break;
        }
        case 'foods': {
          const id = pickGiftFood(op, item);
          if (id !== null) await addFoods(op, id, item.num, o);
          break;
        }
        case 'coin':
          gainCoin(op, randRange(op, item.min, item.max), o);
          break;
        case 'exp':
          gainExp(op, randRange(op, item.min, item.max), o);
          break;
        case 'diamond':
          gainDiamond(op, randRange(op, item.min, item.max), o);
          break;
        case 'renown':
          gainRenown(op, item.num, o);
          break;
      }
    }
  }
}
```

- [ ] **Step 9: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/cupboard apps/server/src/modules/store apps/server/src/modules/award`
Expected: PASS

- [ ] **Step 10: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`
Expected: 全部 PASS（开店赠送道具的测试仍通过：`grantGoods` 签名向后兼容）

```bash
git add apps/server
git commit -m "feat(server): goods, foods and award granting; gift packs; store capacity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 周期任务调度器与 worker 接线

**Files:**
- Create: `apps/server/src/worker/periodic.ts`
- Test: `apps/server/src/worker/periodic.test.ts`
- Modify: `apps/server/src/worker/jobs.ts`
- Modify: `apps/server/src/worker.ts`

**Interfaces:**
- Consumes: `PeriodicJob`、`JobContext`、`featureAvailable`、`ShardService.settings`、`Game.jobs`
- Produces:
  - `runDueJobs(d: PeriodicDeps, jobs: PeriodicJob[], opts?: { shardIds?: number[] }): Promise<JobRunResult[]>`
  - `PeriodicDeps { db; shards; now: () => Date; log: { error(obj: object, msg: string): void } }`、`JobRunResult { shardId; job; period; ok: boolean }`
  - `workerJobs(game: Game, log): Job[]`（新增 `periodic`，每 5 秒一次）

- [ ] **Step 1: 写失败的测试**

`apps/server/src/worker/periodic.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createShard } from '../../test/fixtures';
import { createTestGame, type TestGame } from '../../test/game';
import type { PeriodicJob } from '../core/jobs';
import { runDueJobs } from './periodic';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = { error: vi.fn() };
const deps = () => ({ db: t.db, shards: t.game.shards, now: () => t.clock.now, log });

function job(name: string, feature: string, period: string | null, run = vi.fn(async () => ({ n: 1 }))): PeriodicJob {
  return { name, feature, period: () => period, run };
}

describe('runDueJobs', () => {
  it('同一周期只执行一次，执行结果写进 job_run', async () => {
    const shardId = await createShard(t.db);
    const a = job('a', 'settlement', 'p1');
    await runDueJobs(deps(), [a], { shardIds: [shardId] });
    await runDueJobs(deps(), [a], { shardIds: [shardId] });
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(a.run).toHaveBeenCalledWith(expect.objectContaining({ shardId, period: 'p1' }));
    const row = await t.db
      .selectFrom('job_run')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('job', '=', 'a')
      .executeTakeFirstOrThrow();
    expect(row.stats).toEqual({ n: 1 });
    expect(row.finished_at).not.toBeNull();
  });

  it('周期键变化后再执行；返回 null 时不执行', async () => {
    const shardId = await createShard(t.db);
    let p: string | null = 'x1';
    const run = vi.fn(async () => ({}));
    const j: PeriodicJob = { name: 'b', feature: 'world', period: () => p, run };
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    p = null;
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    p = 'x2';
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('区服关闭了该功能、功能未实现、区服已关闭时都不执行', async () => {
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: off, override: JSON.stringify({ features: { market: false } }) })
      .execute();
    const closed = await createShard(t.db, { status: 'closed' });
    const m = job('m', 'market', 'k');
    const f = job('f', 'friend', 'k');
    await runDueJobs(deps(), [m, f], { shardIds: [off, closed] });
    expect(m.run).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });

  it('任务出错只记日志，不重试，也不影响其他任务', async () => {
    const shardId = await createShard(t.db);
    const bad = job('bad', 'shop', 'k', vi.fn(async () => {
      throw new Error('boom');
    }));
    const good = job('good', 'shop', 'k');
    const results = await runDueJobs(deps(), [bad, good], { shardIds: [shardId] });
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ['bad', false],
      ['good', true],
    ]);
    expect(log.error).toHaveBeenCalled();
    await runDueJobs(deps(), [bad, good], { shardIds: [shardId] });
    expect(bad.run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/worker/periodic.test.ts`
Expected: FAIL，`./periodic` 不存在

- [ ] **Step 3: 实现**

`apps/server/src/worker/periodic.ts`：

```ts
import type { Kysely } from 'kysely';
import { featureAvailable } from '../core/features';
import type { PeriodicJob } from '../core/jobs';
import type { DB } from '../db/schema';
import type { ShardService } from '../modules/shard/service';

export interface PeriodicDeps {
  db: Kysely<DB>;
  shards: ShardService;
  now: () => Date;
  log: { error(obj: object, msg: string): void };
}

export interface JobRunResult {
  shardId: number;
  job: string;
  period: string;
  ok: boolean;
}

/**
 * 对每个开放的区服，执行周期键还没登记过的任务（设计文档 §6）。
 * 先插入 job_run 抢占周期，主键冲突就说明已经执行过；失败只记日志、不重试。
 */
export async function runDueJobs(
  d: PeriodicDeps,
  jobs: PeriodicJob[],
  opts: { shardIds?: number[] } = {},
): Promise<JobRunResult[]> {
  let q = d.db.selectFrom('shard').select('id').where('status', '=', 'open');
  if (opts.shardIds) {
    if (opts.shardIds.length === 0) return [];
    q = q.where('id', 'in', opts.shardIds);
  }
  const shards = await q.orderBy('id').execute();
  const results: JobRunResult[] = [];
  for (const { id: shardId } of shards) {
    const settings = await d.shards.settings(shardId);
    for (const job of jobs) {
      if (!featureAvailable(settings, job.feature)) continue;
      const now = d.now();
      const period = job.period(now, settings);
      if (period === null) continue;
      const claimed = await d.db
        .insertInto('job_run')
        .values({ shard_id: shardId, job: job.name, period, started_at: now })
        .onConflict((oc) => oc.doNothing())
        .returning('period')
        .executeTakeFirst();
      if (!claimed) continue;
      try {
        const stats = await job.run({ shardId, period, now, settings });
        await d.db
          .updateTable('job_run')
          .set({ finished_at: d.now(), stats: JSON.stringify(stats) })
          .where('shard_id', '=', shardId)
          .where('job', '=', job.name)
          .where('period', '=', period)
          .execute();
        results.push({ shardId, job: job.name, period, ok: true });
      } catch (err) {
        d.log.error({ err, shardId, job: job.name, period }, 'periodic job failed');
        await d.db
          .updateTable('job_run')
          .set({ stats: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) })
          .where('shard_id', '=', shardId)
          .where('job', '=', job.name)
          .where('period', '=', period)
          .execute();
        results.push({ shardId, job: job.name, period, ok: false });
      }
    }
  }
  return results;
}
```

`apps/server/src/worker/jobs.ts`：把 `workerJobs` 改成接收 `Game`：

```ts
import type { Game } from '../game';
import { runDueJobs } from './periodic';
import type { Job, JobLogger } from './scheduler';

export function workerJobs(game: Game, log: JobLogger): Job[] {
  const { db, redis } = game.app;
  const now = () => game.deps.now();
  return [
    {
      name: 'partitions',
      intervalMs: 3_600_000,
      run: async () => {
        await maintainPartitions(db, now());
      },
    },
    {
      name: 'heartbeat',
      intervalMs: 60_000,
      run: async () => {
        await redis.set('worker:heartbeat', now().toISOString(), 'EX', 180);
      },
    },
    {
      name: 'periodic',
      intervalMs: 5_000,
      run: async () => {
        await runDueJobs({ db, shards: game.shards, now, log }, game.jobs);
      },
    },
  ];
}
```

（删掉原来 `workerJobs` 的参数 `deps: { db; redis }, now`；文件顶部原有的 `Redis`、`Kysely`、`DB` 类型导入如果不再使用就删掉，`maintainPartitions` 仍需要 `Kysely<DB>`。`JobLogger` 需要从 `scheduler.ts` 导出——它本来就是 `export interface`。）

`apps/server/src/worker.ts`：

```ts
import pino from 'pino';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { createGame } from './game';
import { waitForLeadership } from './worker/leader';
import { startScheduler } from './worker/scheduler';
import { workerJobs } from './worker/jobs';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const deps = createDeps(env);
const game = createGame(deps);
const ac = new AbortController();
process.once('SIGTERM', () => ac.abort());
process.once('SIGINT', () => ac.abort());

const leader = await waitForLeadership(env.DATABASE_URL, {
  signal: ac.signal,
  onWait: () => log.info('standby: another worker is the leader'),
});
if (leader) {
  leader.on('error', (err) => {
    log.error({ err }, 'leader connection lost, exiting so the container restarts');
    process.exit(1);
  });
  log.info('became leader, starting jobs');
  const scheduler = startScheduler(workerJobs(game, log), log);
  await new Promise<void>((resolve) => ac.signal.addEventListener('abort', () => resolve()));
  scheduler.stop();
  await leader.end();
}
await deps.db.destroy();
deps.redis.disconnect();
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/worker`
Expected: PASS

- [ ] **Step 5: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add apps/server
git commit -m "feat(server): periodic jobs deduplicated by period, worker runs them every 5s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: 小镇状态——天气、蟹老板街道、痞老板、目录接口

**Files:**
- Create: `packages/shared/src/schemas/world.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/world/rules.ts`
- Create: `apps/server/src/modules/world/service.ts`
- Create: `apps/server/src/modules/world/jobs.ts`
- Create: `apps/server/src/modules/world/routes.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`
- Test: `apps/server/src/modules/world/world.test.ts`

**Interfaces:**
- Consumes: `GameDeps`、`PeriodicJob`、`latestSlot`、`parseSlotKey`、`gameParts`、`seededRng`、`hashSeed`、`buildPool`、`pickWeighted`、`postNews`、`GameConfig.holidayMultiplier`
- Produces:
  - `isNight(hour, w)`、`weatherPool(config, night, w)`、`rollWeather(config, hour, w, rng)`、`rollKrabStreet(w, rng)`
  - `WorldService`：`ensure(shardId, now?) → WorldSnapshot`、`changeWeather(shardId, slot, now)`、`changeKrabStreet(shardId, slot, now)`、`setPlankton(db, shardId, restId | null, onlyIf?) → boolean`、`view(shardId) → WorldDto`、`catalog() → CatalogDto`
  - `WorldSnapshot { weather: Weather; weatherUntil: Date; krabStreet: number; planktonRestId: number | null }`
  - `worldJobs(world): PeriodicJob[]`（`weather`、`daily-event`）
  - `Game.world`；路由 `GET /api/v1/world/weather`、`GET /api/v1/world/catalog`
  - DTO：`WeatherDto`、`WorldDto`、`CatalogDto`

- [ ] **Step 1: 共享 DTO**

`packages/shared/src/schemas/world.ts`：

```ts
export interface WeatherDto {
  id: number;
  name: string;
  type: number;
  effects: Record<string, number>;
  note: string;
  until: string;
}

export interface WorldDto {
  weather: WeatherDto;
  krabStreet: number;
  krabStreetName: string;
  holidayMultiplier: number;
  planktonRestId: number | null;
}

export interface CatalogGoodsDto {
  id: number;
  name: string;
  type: number;
  deviceType: number | null;
  level: number;
  desc: string;
  coin: number;
  diamond: number;
  stackable: boolean;
}

export interface CatalogFoodDto {
  id: number;
  name: string;
  level: number;
  odds: number;
  coin: number;
  type: number | null;
}

/** 前端显示名称用的目录（道具、食材、街道、天气、设施位），按配置版本缓存 */
export interface CatalogDto {
  version: string;
  goods: CatalogGoodsDto[];
  foods: CatalogFoodDto[];
  streets: Array<{ id: number; name: string; cookName: string }>;
  weather: Array<{ id: number; name: string }>;
  devices: Array<{ id: number; name: string; deviceType: number; needStar: number }>;
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/world';`。

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/world/world.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, hashSeed, latestSlot, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { runDueJobs } from '../../worker/periodic';
import { isNight, rollWeather, weatherPool } from './rules';

const config = testConfig();
const w = config.tuning.world;
let t: TestGame;
let http: TestContext;
beforeAll(async () => {
  t = await createTestGame();
  http = await createTestApp();
});
afterAll(async () => {
  await t.close();
  await http.close();
});

describe('天气规则（规格书 12 §12.1）', () => {
  it('21~5 点是夜间', () => {
    expect([20, 21, 23, 0, 5, 6].map((h) => isNight(h, w))).toEqual([false, true, true, true, true, false]);
  });
  it('夜间池：夜间和全天天气，不含特殊天气；白天池不含夜间天气', () => {
    const night = weatherPool(config, true, w).items;
    const day = weatherPool(config, false, w).items;
    expect(night.map((x) => x.id)).toEqual(expect.arrayContaining([28, 29, 30]));
    expect(night.every((x) => (x.daytime === 2 || x.daytime === 3) && !x.special)).toBe(true);
    expect(day.some((x) => x.daytime === 2)).toBe(false);
    expect(day.some((x) => x.special)).toBe(false);
  });
});

describe('WorldService', () => {
  it('ensure 只创建一次', async () => {
    const shardId = await createShard(t.db);
    const a = await t.game.world.ensure(shardId);
    const b = await t.game.world.ensure(shardId);
    expect(b).toEqual(a);
    expect(a.krabStreet).toBeGreaterThanOrEqual(1);
    expect(a.krabStreet).toBeLessThanOrEqual(13);
  });

  it('换天气：同一区服同一时点结果固定，并发新闻', async () => {
    const shardId = await createShard(t.db);
    const slot = latestSlot(gameTime('2026-09-30', 23, 10), w.weatherHours);
    const r = await t.game.world.changeWeather(shardId, slot, slot.start);
    const expected = rollWeather(config, 23, w, seededRng(hashSeed(shardId, 'weather', slot.key)));
    expect(r.to).toBe(expected.id);
    expect((await t.game.world.ensure(shardId)).weather.id).toBe(expected.id);
    const news = await t.db.selectFrom('news').selectAll().where('shard_id', '=', shardId).execute();
    expect(news.map((n) => n.type)).toContain('weather.change');
  });

  it('周期任务：10:30 触发 9 点的天气和每日事件，各一次', async () => {
    const shardId = await createShard(t.db);
    t.clock.set(gameTime('2026-09-30', 10, 30));
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: () => {} } };
    const first = await runDueJobs(deps, t.game.jobs, { shardIds: [shardId] });
    expect(first.filter((r) => r.job === 'weather' || r.job === 'daily-event').map((r) => [r.job, r.period])).toEqual([
      ['weather', '2026-09-30@09'],
      ['daily-event', '2026-09-30@09'],
    ]);
    const second = await runDueJobs(deps, t.game.jobs, { shardIds: [shardId] });
    expect(second.filter((r) => r.job === 'weather')).toEqual([]);
    t.clock.set(new Date());
  });
});

describe('接口', () => {
  it('天气需要先选区服', async () => {
    const shardId = await createShard(http.deps.db);
    const u = await registerUser(http.app);
    expect((await call(http.app, 'GET', '/api/v1/world/weather', { cookie: u.cookie })).json.code).toBe(
      'NO_SHARD_SELECTED',
    );
    await call(http.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
    const r = await call(http.app, 'GET', '/api/v1/world/weather', { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(r.json.data.weather.name).toBeTruthy();
    expect(r.json.data.holidayMultiplier).toBeGreaterThanOrEqual(1);
  });

  it('目录接口不需要登录', async () => {
    const r = await call(http.app, 'GET', '/api/v1/world/catalog');
    expect(r.json.data.goods).toHaveLength(601);
    expect(r.json.data.foods).toHaveLength(313);
    expect(r.json.data.version).toBe(config.version);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/world`
Expected: FAIL，模块不存在

- [ ] **Step 4: 实现规则**

`apps/server/src/modules/world/rules.ts`：

```ts
import type { GameConfig, Tuning, Weather } from '@dt/config';
import { buildPool, pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

/** 21~5 点用夜间和全天天气，其他时段用白天和全天天气（规格书 12 §12.1） */
export function isNight(hour: number, w: Tuning['world']): boolean {
  return hour >= w.nightFrom || hour <= w.nightTo;
}

/**
 * 天气池：排除只能用钻石召唤的特殊天气（设计文档 裁定 12）。
 * 权重：夜间专属天气用 nightWeatherOdds；其他天气用 probability × dayWeightScale（设计文档 裁定 13）
 */
export function weatherPool(config: GameConfig, night: boolean, w: Tuning['world']): WeightedPool<Weather> {
  const nightOdds = new Map(w.nightWeatherOdds);
  const allowed = night ? [2, 3] : [1, 3];
  const list = [...config.weather.values()]
    .filter((x) => !x.special && allowed.includes(x.daytime))
    .sort((a, b) => a.id - b.id);
  return buildPool(list, (x) => nightOdds.get(x.id) ?? (x.probability ?? 0) * w.dayWeightScale);
}

export function rollWeather(config: GameConfig, hour: number, w: Tuning['world'], rng: Rng): Weather {
  return pickWeighted(weatherPool(config, isNight(hour, w), w), rng);
}

export function rollKrabStreet(w: Tuning['world'], rng: Rng): number {
  return w.krabStreetMin + rng.int(w.krabStreetMax - w.krabStreetMin + 1);
}
```

- [ ] **Step 5: 实现服务、任务、路由**

`apps/server/src/modules/world/service.ts`：

```ts
import type { Kysely } from 'kysely';
import type { Weather } from '@dt/config';
import { gameParts, hashSeed, seededRng, type CatalogDto, type Slot, type WorldDto } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { DB } from '../../db/schema';
import { postNews } from '../news/news';
import { rollKrabStreet, rollWeather } from './rules';

export interface WorldSnapshot {
  weather: Weather;
  weatherUntil: Date;
  krabStreet: number;
  planktonRestId: number | null;
}

const WEATHER_MS = 2 * 3600_000;

export function createWorldService(d: GameDeps) {
  let catalog: CatalogDto | null = null;

  function weatherOf(id: number): Weather {
    const w = d.config.weather.get(id);
    if (!w) throw new Error(`unknown weather ${id}`);
    return w;
  }

  async function read(db: Kysely<DB>, shardId: number) {
    return db.selectFrom('world_state').selectAll().where('shard_id', '=', shardId).executeTakeFirst();
  }

  /** 取区服小镇状态；新区服第一次访问时创建 */
  async function ensure(shardId: number, now: Date = d.now()): Promise<WorldSnapshot> {
    let row = await read(d.db, shardId);
    if (!row) {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(hashSeed(shardId, 'world-init'));
      const w = rollWeather(d.config, gameParts(now).hour, tuning.world, rng);
      await d.db
        .insertInto('world_state')
        .values({
          shard_id: shardId,
          weather_id: w.id,
          weather_until: new Date(now.getTime() + WEATHER_MS),
          krab_street: rollKrabStreet(tuning.world, rng),
          updated_at: now,
        })
        .onConflict((oc) => oc.column('shard_id').doNothing())
        .execute();
      row = (await read(d.db, shardId))!;
    }
    return {
      weather: weatherOf(row.weather_id),
      weatherUntil: row.weather_until,
      krabStreet: row.krab_street,
      planktonRestId: row.plankton_rest_id,
    };
  }

  return {
    ensure,

    async changeWeather(shardId: number, slot: Slot, now: Date): Promise<{ from: number; to: number }> {
      const before = await ensure(shardId, now);
      const { tuning } = await d.shards.settings(shardId);
      const w = rollWeather(d.config, slot.hour, tuning.world, seededRng(hashSeed(shardId, 'weather', slot.key)));
      await d.db
        .updateTable('world_state')
        .set({ weather_id: w.id, weather_until: new Date(slot.start.getTime() + WEATHER_MS), updated_at: now })
        .where('shard_id', '=', shardId)
        .execute();
      await postNews(d.db, { shardId, type: 'weather.change', params: { from: before.weather.id, to: w.id } }, now);
      return { from: before.weather.id, to: w.id };
    },

    async changeKrabStreet(shardId: number, slot: Slot, now: Date): Promise<{ street: number }> {
      await ensure(shardId, now);
      const { tuning } = await d.shards.settings(shardId);
      const street = rollKrabStreet(tuning.world, seededRng(hashSeed(shardId, 'krab', slot.key)));
      await d.db
        .updateTable('world_state')
        .set({ krab_street: street, updated_at: now })
        .where('shard_id', '=', shardId)
        .execute();
      return { street };
    },

    /** 设置痞老板驻留店；onlyIf 给定时只有当前驻留店等于它才修改（赶走时用）。返回是否修改了 */
    async setPlankton(db: Kysely<DB>, shardId: number, restId: number | null, onlyIf?: number): Promise<boolean> {
      let q = db.updateTable('world_state').set({ plankton_rest_id: restId }).where('shard_id', '=', shardId);
      if (onlyIf !== undefined) q = q.where('plankton_rest_id', '=', onlyIf);
      const r = await q.executeTakeFirst();
      return Number(r.numUpdatedRows) > 0;
    },

    async view(shardId: number): Promise<WorldDto> {
      const now = d.now();
      const s = await ensure(shardId, now);
      return {
        weather: {
          id: s.weather.id,
          name: s.weather.name,
          type: s.weather.type,
          effects: s.weather.effects,
          note: s.weather.note,
          until: s.weatherUntil.toISOString(),
        },
        krabStreet: s.krabStreet,
        krabStreetName: d.config.streets.get(s.krabStreet)?.name ?? '',
        holidayMultiplier: d.config.holidayMultiplier(now),
        planktonRestId: s.planktonRestId,
      };
    },

    catalog(): CatalogDto {
      catalog ??= {
        version: d.config.version,
        goods: d.config.bundle.goods.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          deviceType: g.deviceType,
          level: g.level,
          desc: g.desc,
          coin: g.coin,
          diamond: g.diamond,
          stackable: g.stackable,
        })),
        foods: d.config.bundle.foods.map((f) => ({
          id: f.id,
          name: f.name,
          level: f.level,
          odds: f.odds,
          coin: f.coin,
          type: f.type,
        })),
        streets: d.config.bundle.streets.map((s) => ({ id: s.id, name: s.name, cookName: s.cookName })),
        weather: d.config.bundle.weather.map((w) => ({ id: w.id, name: w.name })),
        devices: d.config.bundle.devices.map((x) => ({
          id: x.id,
          name: x.name,
          deviceType: x.deviceType,
          needStar: x.needStar,
        })),
      };
      return catalog;
    },
  };
}

export type WorldService = ReturnType<typeof createWorldService>;
```

`apps/server/src/modules/world/jobs.ts`：

```ts
import { latestSlot, parseSlotKey } from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { WorldService } from './service';

export function worldJobs(world: WorldService): PeriodicJob[] {
  return [
    {
      name: 'weather',
      feature: 'world',
      period: (now, s) => latestSlot(now, s.tuning.world.weatherHours).key,
      run: ({ shardId, period, now }) => world.changeWeather(shardId, parseSlotKey(period), now),
    },
    {
      name: 'daily-event',
      feature: 'world',
      period: (now, s) => latestSlot(now, [s.tuning.world.krabHour]).key,
      run: ({ shardId, period, now }) => world.changeKrabStreet(shardId, parseSlotKey(period), now),
    },
  ];
}
```

`apps/server/src/modules/world/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { requireAccount } from '../../security/session';
import type { WorldService } from './service';

export function worldRoutes(world: WorldService): FastifyPluginAsync {
  return async (r) => {
    r.get('/weather', async (req) => {
      const { shardId } = requireAccount(req).data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      return ok(await world.view(shardId));
    });
    r.get('/catalog', async () => ok(world.catalog()));
  };
}
```

`apps/server/src/game.ts`：
- 导入 `import { createWorldService, type WorldService } from './modules/world/service';` 和 `import { worldJobs } from './modules/world/jobs';`
- `Game` 接口加 `world: WorldService;`
- `createGame` 里在 `const jobs` 之前加 `const world = createWorldService(deps);`，`jobs.push(...worldJobs(world));`，返回对象加 `world`

`apps/server/src/modules/index.ts` 加：

```ts
import { worldRoutes } from './world/routes';
// …
  app.register(worldRoutes(game.world), { prefix: '/api/v1/world' });
```

- [ ] **Step 6: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/world`
Expected: PASS

- [ ] **Step 7: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(server): world state per shard (weather rotation, krab street, plankton host), catalog endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: 结算核心（一）——类型、输入构造、各项汇总率

**Files:**
- Create: `apps/server/src/modules/settlement/types.ts`
- Create: `apps/server/src/modules/settlement/globals.ts`
- Create: `apps/server/src/modules/settlement/rates.ts`
- Test: `apps/server/src/modules/settlement/rates.test.ts`

**Interfaces:**
- Consumes: `GameConfig`（`cookbookIndex`、`grade`、`requireCookbook`、`requireFood`）、`Tuning`、`CookbookCounts`、`TableState`、`Rng`、`luckRate`
- Produces:
  - 类型 `SettleRest`、`SpecialDish`、`SettleInput`、`SettleGlobals`、`RatePart`、`Rates`、`Flags`、`Drop`、`SettleLog`、`SettleResult`
  - `buildGlobals(config, tuning, patch?: Partial<SettleGlobals>): SettleGlobals`
  - `buildInput(config, patch?: InputPatch): SettleInput`（测试和模拟器用；`InputPatch { rest?; tables?; cookbooks?: Record<number, number>; agg?; special?; cupboard?; now? }`）
  - `normalizeCounts(raw: unknown): CookbookCounts`
  - `computeRates(input, g, rng): { rates: Rates; flags: Flags }`——恰好消耗 2 个随机数（上座浮动、挑剔浮动）

- [ ] **Step 1: 写类型和输入构造**

`apps/server/src/modules/settlement/types.ts`：

```ts
import type { CookbookGrade, CookbookIndex, Food, Tuning } from '@dt/config';
import type { CookbookCounts, TableState } from '../../db/schema';

export interface SettleRest {
  id: number;
  level: number;
  star: number;
  oil: number;
  oilMax: number;
  coin: number;
  streetId: number;
  renown: number;
  /** 基础幸运（等级带来的） */
  luck: number;
  cteOn: boolean;
  cookfoodsFlag: number;
}

/** 当前在售的特色菜（子项目 4 提供；2A 为 null） */
export interface SpecialDish {
  price: number;
  level: number;
  leftNum: number;
}

export interface SettleInput {
  rest: SettleRest;
  tables: TableState[];
  /** 下标 = 食谱 id，值 = 品级 */
  levels: Uint8Array;
  counts: CookbookCounts;
  /** 加成汇总（含收集类派生键） */
  agg: Record<string, number>;
  special: SpecialDish | null;
  /** 食材 id → 橱柜数量；只有开了挑剔消耗食材的店才提供 */
  cupboard: ReadonlyMap<number, number> | null;
  now: Date;
}

export interface SettleGlobals {
  weather: Record<string, number>;
  krabStreet: number | null;
  planktonRestId: number | null;
  holidayMultiplier: number;
  /** 小镇祝福（子项目 4 提供；2A 为空） */
  bless: Record<string, number>;
  tuning: Tuning;
  cookbooks: CookbookIndex;
  grade(g: number): CookbookGrade;
  needFoods(cookbookId: number, grade: number): ReadonlyArray<{ foodsId: number; num: number }>;
  food(id: number): Food;
}

export interface RatePart {
  total: number;
  parts: Record<string, number>;
}

export interface Rates {
  atRate: RatePart;
  spRate: RatePart;
  coinRate: RatePart;
  expRate: RatePart;
  coinValue: RatePart;
  expValue: RatePart;
  oilRate: RatePart;
  oilValue: RatePart;
  luck: RatePart;
  /** 上座桌数 = round(上座率 × 餐桌数) */
  seated: number;
}

/** 开关型荣誉和其他系数 */
export interface Flags {
  husky: boolean;
  ali: boolean;
  flute: boolean;
  paintingTop: boolean;
  pinkBook: boolean;
  spCoinRate: number;
  mcCoinRate: number;
  mcExpRate: number;
  cookfoodSpExpRate: number;
  sqExpRate: number;
  roachMul: number;
  roachClear: number;
  luckRate: number;
}

export interface Drop {
  goodsId: number;
  num: number;
  /** 勋章有效期覆盖（小时） */
  hours?: number;
}

export interface SettleLog {
  type: string;
  params: Record<string, unknown>;
}

export interface SettleResult {
  closed: boolean;
  tables: TableState[];
  /** 本轮银币（可能为负：白食） */
  coin: number;
  exp: number;
  /** 本轮实际耗油（≥0，不超过当前油量） */
  oil: number;
  /** 顾客类型 → 桌数 */
  customers: Record<string, number>;
  rates: Rates | null;
  drops: Drop[];
  renown: number;
  foodsUsed: Array<{ foodsId: number; num: number }>;
  specialUsed: number;
  logs: SettleLog[];
  planktonAppeared: boolean;
}
```

`apps/server/src/modules/settlement/globals.ts`：

```ts
import type { GameConfig, Tuning } from '@dt/config';
import type { CookbookCounts, TableState } from '../../db/schema';
import type { SettleGlobals, SettleInput, SettleRest, SpecialDish } from './types';

export function buildGlobals(config: GameConfig, tuning: Tuning, patch: Partial<SettleGlobals> = {}): SettleGlobals {
  return {
    weather: {},
    krabStreet: null,
    planktonRestId: null,
    holidayMultiplier: 1,
    bless: {},
    tuning,
    cookbooks: config.cookbookIndex,
    grade: (g) => config.grade(g),
    needFoods: (id, grade) => config.requireCookbook(id).needFoods[grade] ?? [],
    food: (id) => config.requireFood(id),
    ...patch,
  };
}

/** 数据库里的 cookbook_counts 可能是旧的 {}，统一补全 */
export function normalizeCounts(raw: unknown): CookbookCounts {
  const r = (raw ?? {}) as Partial<CookbookCounts>;
  const grade = Array.from({ length: 11 }, (_, i) => r.grade?.[i] ?? 0);
  return { learned: r.learned ?? 0, grade, street: { ...(r.street ?? {}) } };
}

export interface InputPatch {
  rest?: Partial<SettleRest>;
  tables?: TableState[];
  /** 食谱 id → 品级 */
  cookbooks?: Record<number, number>;
  agg?: Record<string, number>;
  special?: SpecialDish | null;
  cupboard?: ReadonlyMap<number, number> | null;
  now?: Date;
}

/** 测试和模拟器用：按补丁构造一份结算输入，默认是一家 0 星新手街 4 桌的新店 */
export function buildInput(config: GameConfig, patch: InputPatch = {}): SettleInput {
  const levels = new Uint8Array(config.maxCookbookId + 1);
  const counts: CookbookCounts = { learned: 0, grade: Array(11).fill(0) as number[], street: {} };
  for (const [id, grade] of Object.entries(patch.cookbooks ?? {})) {
    const cb = config.requireCookbook(Number(id));
    levels[cb.id] = grade;
    if (grade > 0) {
      counts.learned += 1;
      counts.grade[grade]! += 1;
      counts.street[String(cb.streetId)] = (counts.street[String(cb.streetId)] ?? 0) + 1;
    }
  }
  return {
    rest: {
      id: 1,
      level: 1,
      star: 0,
      oil: 1000,
      oilMax: 1000,
      coin: 0,
      streetId: 0,
      renown: 10,
      luck: 0,
      cteOn: false,
      cookfoodsFlag: 0,
      ...patch.rest,
    },
    tables:
      patch.tables ??
      Array.from({ length: 4 }, (_, i) => ({ no: i + 1, floor: 1, customer: 0 })),
    levels,
    counts,
    agg: patch.agg ?? {},
    special: patch.special ?? null,
    cupboard: patch.cupboard ?? null,
    now: patch.now ?? new Date('2026-09-30T04:00:00Z'),
  };
}
```

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/settlement/rates.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { computeRates } from './rates';
import type { SettleGlobals } from './types';

const config = testConfig();
const rates = (patch: InputPatch = {}, g: Partial<SettleGlobals> = {}, rng = [0.5, 0.65]) =>
  computeRates(buildInput(config, patch), buildGlobals(config, config.tuning, g), sequenceRng(rng));

describe('汇总率（规格书 01 §1.3）', () => {
  it('0 星新店：上座 30%、挑剔 10%、星潜力经验 60%；0 星不受天气影响', () => {
    const { rates: r } = rates({}, { weather: { atRate: 0.5, expRate: 1 } });
    expect(r.atRate.total).toBeCloseTo(0.3);
    expect(r.spRate.total).toBeCloseTo(0.1);
    expect(r.expRate.total).toBeCloseTo(0.6);
    expect(r.expRate.parts).toEqual({ starPotential: 0.6 });
    expect(r.coinRate.total).toBe(0);
    expect(r.seated).toBe(1);
  });

  it('食谱加成：各品级食谱数 × r_L × L', () => {
    const ids = config.cookbookIndex.allIds;
    const cookbooks: Record<number, number> = {};
    for (const id of ids.slice(0, 10)) cookbooks[id] = 1;
    for (const id of ids.slice(10, 15)) cookbooks[id] = 7;
    const { rates: r } = rates({ cookbooks });
    expect(r.atRate.parts.cookbook).toBeCloseTo(10 * 0.000098 + 5 * 0.00011 * 7);
  });

  it('浮动：(0.3 + 0.1s) × (随机数 - 0.5)', () => {
    const { rates: r } = rates({}, {}, [0.9, 0.65]);
    expect(r.atRate.total).toBeCloseTo(0.42);
    expect(r.atRate.parts.float).toBeCloseTo(0.12);
  });

  it('上座率超过 1.2 的部分按 1.5 折算进经验率；有史前怪石(atToExp)时不折算', () => {
    const a = rates({ agg: { atRate: 1.5 } }).rates;
    expect(a.atRate.total).toBe(1);
    expect(a.expRate.parts.atOverflow).toBeCloseTo(0.4);
    const b = rates({ agg: { atRate: 1.5, atToExp: 1 } }).rates;
    expect(b.expRate.parts.atOverflow).toBeCloseTo(0.6);
  });

  it('负声望：上座率 -80%，截断到 0，没有上座桌', () => {
    const { rates: r } = rates({ rest: { renown: -1 } });
    expect(r.atRate.total).toBe(0);
    expect(r.atRate.parts.renown).toBeCloseTo(-0.8);
    expect(r.seated).toBe(0);
  });

  it('阿刁：挑剔率超过 1 的部分一半转成银币率', () => {
    const { rates: r } = rates({ rest: { star: 2 }, agg: { spRate: 1, adiao: 1 } });
    expect(r.spRate.total).toBe(1);
    expect(r.coinRate.parts.spOverflow).toBeCloseTo(0.11);
  });

  it('银币转经验：银币率 ×1.5 加到经验率，银币率清零', () => {
    const { rates: r } = rates({ rest: { cteOn: true }, agg: { coinRate: 0.2 } });
    expect(r.coinRate.total).toBe(0);
    expect(r.expRate.parts.cte).toBeCloseTo(0.3);
    expect(r.expRate.total).toBeCloseTo(0.9);
  });

  it('星潜力：1 星 45%，4 星及以上 0', () => {
    expect(rates({ rest: { star: 1 } }).rates.expRate.parts.starPotential).toBeCloseTo(0.45);
    expect(rates({ rest: { star: 4 } }).rates.expRate.parts.starPotential).toBeUndefined();
  });

  it('收集类加成计入银币率和经验率', () => {
    const { rates: r } = rates({
      agg: { plaqueSum: 0.02, honorAddCoin: 0.004, honorAddExp: 0.004, potCoinRate: 0.08, paintingExpRate: 0.8 },
    });
    expect(r.coinRate.total).toBeCloseTo(0.104);
    expect(r.expRate.total).toBeCloseTo(1.424);
  });

  it('1 星及以上受天气影响；幸运 = 基础 + 加成 + 天气', () => {
    const { rates: r, flags } = rates(
      { rest: { star: 1, luck: 100 }, agg: { luckValue: 36 } },
      { weather: { atRate: 0.1, luckValue: 10 } },
    );
    expect(r.atRate.total).toBeCloseTo(0.45);
    expect(r.luck.total).toBe(146);
    expect(flags.luckRate).toBeCloseTo(Math.sqrt(3 * 146) / 100);
  });

  it('开关型荣誉和系数', () => {
    const { flags } = rates({ agg: { husky: 1, ali: 1, spCoinRate: 0.5, squidwardExpRate: 1, roachClearRate: 0.2 } });
    expect(flags).toMatchObject({ husky: true, ali: true, flute: false, spCoinRate: 0.5, sqExpRate: 2, roachClear: 0.2 });
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/settlement/rates.test.ts`
Expected: FAIL，`./rates` 不存在

- [ ] **Step 4: 实现汇总率**

`apps/server/src/modules/settlement/rates.ts`：

```ts
import { luckRate, type Rng } from '@dt/shared';
import type { Flags, RatePart, Rates, SettleGlobals, SettleInput } from './types';

const v = (o: Record<string, number>, k: string): number => o[k] ?? 0;
const round = (x: number): number => Math.round(x * 1e9) / 1e9;

/** 各来源求和；为 0 的来源不记（income_round 里保存的分项更紧凑） */
function part(parts: Record<string, number>): RatePart {
  const kept: Record<string, number> = {};
  let total = 0;
  for (const [k, x] of Object.entries(parts)) {
    if (x === 0) continue;
    kept[k] = round(x);
    total += x;
  }
  return { total: round(total), parts: kept };
}

/**
 * 各项汇总率（规格书 01 §1.3，设计文档 §4.2）。随机数恰好取两次：先上座浮动，再挑剔浮动。
 * 0 星餐厅不受天气影响。
 */
export function computeRates(input: SettleInput, g: SettleGlobals, rng: Rng): { rates: Rates; flags: Flags } {
  const { rest, agg: a } = input;
  const s = rest.star;
  const rt = g.tuning.rest;
  const st = g.tuning.settlement;
  const w = s === 0 ? {} : g.weather;
  const b = g.bless;

  let cookbook = 0;
  for (let L = 1; L < input.counts.grade.length; L++) {
    const n = input.counts.grade[L] ?? 0;
    if (n > 0) cookbook += n * g.grade(L).atRatePerCookbook * L;
  }
  const atFloat = (st.atFloatBase + st.atFloatPerStar * s) * (rng.next() - 0.5);
  const at = part({
    base: rt.atRateBase + rt.atRatePerStar * s,
    cookbook,
    effects: v(a, 'atRate'),
    weather: v(w, 'atRate'),
    bless: v(b, 'atRate'),
    renown: rest.renown < 0 ? st.negativeRenownAtRate : 0,
    float: atFloat,
  });
  const leftAt = (at.total - st.atOverflowThreshold) / (v(a, 'atToExp') > 0 ? 1 : st.atOverflowDivisor);
  const atRate = Math.min(Math.max(at.total, 0), 1);

  const spFloat = st.spFloatPerStar * s * (rng.next() - st.spFloatCenter);
  const sp = part({
    base: rt.spRateBase + rt.spRatePerStar * s,
    effects: v(a, 'spRate'),
    weather: v(w, 'spRate'),
    float: spFloat,
  });
  const spOverflow = v(a, 'adiao') > 0 && sp.total > 1 ? (sp.total - 1) * st.adiaoOverflowRate : 0;

  const coinParts: Record<string, number> = {
    effects: v(a, 'coinRate'),
    plaque: v(a, 'plaqueSum'),
    honor: v(a, 'honorAddCoin'),
    pot: v(a, 'potCoinRate'),
    painting: v(a, 'paintingCoinRate'),
    weather: v(w, 'coinRate'),
    bless: v(b, 'coinRate'),
    spOverflow,
  };
  const expParts: Record<string, number> = {
    effects: v(a, 'expRate'),
    starPotential: st.starPotential[s] ?? 0,
    plaque: v(a, 'plaqueSum'),
    honor: v(a, 'honorAddExp'),
    pot: v(a, 'potExpRate'),
    painting: v(a, 'paintingExpRate'),
    weather: v(w, 'expRate'),
    bless: v(b, 'expRate'),
    atOverflow: Math.max(leftAt, 0),
  };
  let coin = part(coinParts);
  if (rest.cteOn && coin.total !== 0) {
    expParts.cte = coin.total * st.cteRate;
    coin = part({ ...coinParts, cte: -coin.total });
    coin.total = 0;
  }

  const luckSum = rest.luck + v(a, 'luckValue') + v(w, 'luckValue');
  const rates: Rates = {
    atRate: { total: atRate, parts: at.parts },
    spRate: { total: Math.min(Math.max(sp.total, 0), 1), parts: sp.parts },
    coinRate: coin,
    expRate: part(expParts),
    coinValue: part({ effects: v(a, 'coinValue'), weather: v(w, 'coinValue') }),
    expValue: part({ effects: v(a, 'expValue'), weather: v(w, 'expValue') }),
    oilRate: part({ effects: v(a, 'oilRate'), weather: v(w, 'oilRate') }),
    oilValue: part({ effects: v(a, 'oilValue'), weather: v(w, 'oilValue') }),
    luck: part({ base: rest.luck, effects: v(a, 'luckValue'), weather: v(w, 'luckValue') }),
    seated: Math.round(atRate * input.tables.length),
  };
  const flags: Flags = {
    husky: v(a, 'husky') > 0,
    ali: v(a, 'ali') > 0,
    flute: v(a, 'magicFlute') > 0,
    paintingTop: v(a, 'paintingTop') > 0,
    pinkBook: v(a, 'pinkBook') > 0,
    spCoinRate: v(a, 'spCoinRate'),
    mcCoinRate: v(a, 'mcCoinRate'),
    mcExpRate: v(a, 'mcExpRate'),
    cookfoodSpExpRate: v(a, 'cookfoodSpExpRate'),
    sqExpRate: 1 + v(a, 'squidwardExpRate'),
    roachMul: 1 + v(w, 'roachRate'),
    roachClear: v(a, 'roachClearRate'),
    luckRate: luckRate(luckSum),
  };
  return { rates, flags };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/settlement/rates.test.ts`
Expected: PASS（11 个用例）

- [ ] **Step 6: 提交**

```bash
pnpm typecheck && pnpm format
git add apps/server/src/modules/settlement
git commit -m "feat(settlement): settlement input types and aggregated rates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 结算核心（二）——逐桌分配、本轮汇总、挑剔消耗食材

**Files:**
- Create: `apps/server/src/modules/settlement/tables.ts`
- Create: `apps/server/src/modules/settlement/settle.ts`
- Test: `apps/server/src/modules/settlement/settle.test.ts`

**Interfaces:**
- Consumes: Task 10 的全部类型、`computeRates`、`buildGlobals`、`buildInput`、`GOODS`
- Produces:
  - `splitLearned(levels, street, streetId): { all; local; other }`
  - `realValue(x, add)`、`incomeValue(x, r)`
  - `allocateTables(input, g, rates, flags, rng): TableOutcome`
  - `settleRestaurant(input, g, rng): SettleResult`

**随机数的消耗顺序（测试按这个顺序写固定序列）：** 先上座浮动、挑剔浮动（Task 10）；然后按桌号逐桌：
- 白食桌：白食者经验随机、损失随机（`int(0)` 不消耗）
- 蟑螂桌：是否被蟑螂药消灭
- 痞老板桌：不消耗
- 其他桌：（本店是痞老板驻留店、本轮和桌上都还没有痞老板、星级 >0 时）痞老板判定 → 蟑螂判定 → 超出上座桌数则停止 → （≥3 星）章鱼哥判定 → 挑剔判定 →
  - 挑剔且不在新手街：蟹老板判定 → 蟹老板：要求品级、抽食谱（有已学食谱时）→ 不满足时依次：二哈判定（有二哈时）、名画判定（名画满档时）
  - 普通挑剔：要求品级（星级 0 时不消耗）、本地判定、抽食谱（池子非空时）

最后是挑剔消耗食材：每张候选桌依次抽美味券（`1 + Σ五级食材(101-odds)/35` 次）、蟹币判定、声望判定。

**关于挑剔消耗食材的经验：** 规格书 01 §1.8 写的是 `⌊Σ食材售价/100⌋ × expRate × (1+cookfoodSpExpRate)`，其中 expRate 是加成率（例如 0.5），直接相乘会让没有经验加成的店得到 0 经验。这里按 `× (1 + expRate)` 实现，执行时把这一条写进 ledger 的 Ruling。

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/settlement/settle.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { incomeValue, settleRestaurant } from './settle';
import type { SettleGlobals } from './types';

const config = testConfig();
const price = (id: number) => config.cookbookIndex.coin[id]!;
const street1 = config.cookbookIndex.idsByStreet.get(1)![0]!;
const settle = (patch: InputPatch, g: Partial<SettleGlobals>, rng: number[]) =>
  settleRestaurant(buildInput(config, patch), buildGlobals(config, config.tuning, g), sequenceRng(rng));

describe('incomeValue（规格书 01 §1.6）', () => {
  it('有加成时向下取整且至少为 1；没有加成时取整', () => {
    expect(incomeValue(2, 0.6)).toBe(3);
    expect(incomeValue(1, 0.1)).toBe(1);
    expect(incomeValue(10.7, 0)).toBe(10);
    expect(incomeValue(0, 0.5)).toBe(0);
  });
  it('负数（白食损失）不吃加成，也不会变成 1', () => {
    expect(incomeValue(-26, 0.5)).toBe(-26);
  });
});

describe('逐桌分配（规格书 01 §1.5）', () => {
  it('普通顾客：基础 油2 银币10 经验2；上座 1 桌，其余空桌', () => {
    const r = settle({}, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r).toMatchObject({ closed: false, coin: 10, exp: 3, oil: 2 });
    expect(r.customers).toEqual({ '1': 1, '0': 3 });
    expect(r.tables[0]).toMatchObject({ customer: 1, last: { type: 1, coin: 10, exp: 2, oil: 2 } });
  });

  it('每桌银币加成只加一次（设计文档 裁定 1）', () => {
    const r = settle({ agg: { coinValue: 3 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.coin).toBe(13);
  });

  it('挑剔满足：耗油加倍再加品级，经验加品级，银币加售价 ×(1+品级加成)', () => {
    const r = settle({ cookbooks: { 194: 1 } }, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 1, grade: 1, cookbookId: 194, satisfied: true, exp: 3, oil: 5 });
    expect(r.coin).toBe(Math.floor(10 + price(194) * 1.2));
    expect(r.exp).toBe(4);
    expect(r.oil).toBe(5);
  });

  it('挑剔点了没学过的菜：经验减半，没有二哈时银币减半', () => {
    const r = settle({}, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 1, satisfied: false, coin: 5, exp: 1, oil: 2 });
    const h = settle({ agg: { husky: 1 } }, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.9, 0.9, 0.9]);
    expect(h.tables[0]!.last!.coin).toBe(10);
  });

  it('蟑螂：原有蟑螂被蟑螂药消灭变成 -3；新蟑螂在上座判定之前产生', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T00:00:00.000Z' } },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
      { no: 4, floor: 1, customer: 0 },
    ];
    const r = settle({ tables, agg: { roachClearRate: 0.2 } }, {}, [0.5, 0.65, 0.1, 0.001, 0.9, 0.9]);
    expect(r.tables.map((t) => t.customer)).toEqual([-3, 3, 0, 0]);
    expect(r.tables[1]!.roach!.by).toBeNull();
    expect(r.coin).toBe(0);
    const kept = settle({ tables, agg: { roachClearRate: 0.2 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9]);
    expect(kept.tables[0]).toMatchObject({ customer: 3, roach: { by: 7 } });
  });

  it('蟹老板满足：得到回味无穷(133)，银币 = 售价 ×(1+品级加成)×5', () => {
    const r = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 3 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ type: 8, req: 2, grade: 3, satisfied: true, oil: 7, exp: 17 });
    expect(r.coin).toBe(Math.floor(10 + price(street1) * 1.6 * 5));
    expect(r.exp).toBe(24);
    expect(r.drops).toEqual([{ goodsId: 133, num: 1 }]);
    expect(r.logs.map((l) => l.type)).toContain('krab.happy');
  });

  it('蟹老板不满足：扫兴而归(134)，银币经验减半；有二哈时 30% 摸二哈不惩罚', () => {
    const angry = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.9, 0.9, 0.9],
    );
    expect(angry.tables[0]!.last).toMatchObject({ type: 8, satisfied: false, coin: 5, exp: 1 });
    expect(angry.drops).toEqual([{ goodsId: 134, num: 1 }]);
    const husky = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 1 }, agg: { husky: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.1, 0.9, 0.9, 0.9],
    );
    expect(husky.tables[0]!.last).toMatchObject({ type: 8, satisfied: false, coin: 10, exp: 2 });
    expect(husky.drops).toEqual([]);
  });

  it('痞老板：驻留店每轮最多出现一次，×5；下一轮保持', () => {
    const r = settle({ rest: { star: 1 } }, { planktonRestId: 1 }, [0.5, 0.65, 0.00005, 0.9, 0.9, 0.9]);
    expect(r.tables[0]).toMatchObject({ customer: 7, last: { type: 7, coin: 50, exp: 10, oil: 10 } });
    expect(r.drops).toEqual([{ goodsId: 363, num: 1 }]);
    expect(r.planktonAppeared).toBe(true);
    const next = settle({ rest: { star: 1 }, tables: r.tables }, { planktonRestId: 1 }, [0.5, 0.65, 0.9, 0.9, 0.9]);
    expect(next.tables[0]!.last).toMatchObject({ type: 7, coin: 50 });
  });

  it('白食：损失记为负银币，白食者累计收益；白食桌不占上座名额（Review Focus 3）', () => {
    const now = new Date('2026-09-30T04:00:00Z');
    const tables = [
      {
        no: 1,
        floor: 1,
        customer: 9,
        freeloader: { restId: 99, level: 16, since: '2026-09-30T03:00:00.000Z', coin: 0, exp: 0 },
      },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
      { no: 4, floor: 1, customer: 0 },
    ];
    const r = settle({ tables, now }, {}, [0.5, 0.65, 0.5, 0.5, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.freeloader).toMatchObject({ coin: 36, exp: 18 });
    expect(r.tables[0]!.last).toMatchObject({ type: 9, coin: -36, oil: 5 });
    expect(r.tables[1]!.customer).toBe(1);
    expect(r.coin).toBe(-26);
    expect(r.oil).toBe(7);
  });

  it('章鱼哥（≥3 星）：银币经验都是 1', () => {
    const r = settle(
      { rest: { star: 3, streetId: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.001, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.customers).toEqual({ '6': 1, '1': 1, '0': 2 });
    expect(r.tables[0]!.last).toMatchObject({ type: 6, coin: 1, exp: 1, oil: 1 });
    expect(r.coin).toBe(10);
  });

  it('特色菜（输入存在时）：普通顾客吃 1 份半价', () => {
    const r = settle({ special: { price: 100, level: 3, leftNum: 1 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.specialUsed).toBe(1);
    expect(r.tables[0]!.last).toMatchObject({ coin: 60, exp: 3 });
  });

  it('没油：停业，桌子原样保留，不消耗随机数', () => {
    const r = settle({ rest: { oil: 0 } }, {}, [0.5]);
    expect(r).toMatchObject({ closed: true, coin: 0, exp: 0, oil: 0, rates: null });
    expect(r.tables).toHaveLength(4);
  });

  it('耗油不超过当前油量', () => {
    const r = settle({ rest: { oil: 1 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.oil).toBe(1);
  });
});

describe('挑剔消耗食材（规格书 01 §1.8）', () => {
  const cb = street1;
  const need = config.requireCookbook(cb).needFoods[4]!;
  const cupboard = (n: number) => new Map(need.map((f) => [f.foodsId, n]));
  const seq = [0.5, 0.65, 0.9, 0.9, 0.1, 0.9, 0.7, 0.1, 0, 0.9, 0.9, 0.9, 0.9, 0.9, ...Array(40).fill(0.99)];
  const patch = (n: number): InputPatch => ({
    rest: { star: 6, streetId: 1, cookfoodsFlag: 1 },
    cookbooks: { [cb]: 5 },
    cupboard: cupboard(n),
  });

  it('要求品级 ≥5 且满足的桌：扣第 4 级所需食材，得到经验和声望', () => {
    const r = settle(patch(60), {}, seq);
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 5, grade: 5, satisfied: true });
    expect(r.foodsUsed).toEqual(need.map((f) => ({ foodsId: f.foodsId, num: f.num })));
    const foodPrice = need.reduce((s, f) => s + config.requireFood(f.foodsId).coin * f.num, 0);
    expect(r.exp).toBe(15 + Math.floor(foodPrice / 100));
    const krab = need.reduce((s, f) => {
      const food = config.requireFood(f.foodsId);
      return s + food.level * (101 - food.odds);
    }, 0);
    expect(r.renown).toBe(Math.sqrt(krab) / 100 > 0.2 ? 1 : 0);
  });

  it('任何一种食材少于 档位×50 就不消耗', () => {
    const r = settle(patch(49), {}, seq);
    expect(r.foodsUsed).toEqual([]);
    expect(r.exp).toBe(15);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/settlement/settle.test.ts`
Expected: FAIL，`./settle` 不存在

- [ ] **Step 3: 实现逐桌分配**

`apps/server/src/modules/settlement/tables.ts`：

```ts
import { GOODS } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { TableResult, TableState } from '../../db/schema';
import type { Drop, Flags, Rates, SettleGlobals, SettleInput, SettleLog } from './types';

export interface Learned {
  all: number[];
  local: number[];
  other: number[];
}

/** 已学食谱按"本街 / 外街"分组（每轮每店扫一遍 levels，约 2400 字节） */
export function splitLearned(levels: Uint8Array, street: Int16Array, streetId: number): Learned {
  const all: number[] = [];
  const local: number[] = [];
  const other: number[] = [];
  const n = Math.min(levels.length, street.length);
  for (let id = 1; id < n; id++) {
    if (levels[id]! === 0 || street[id]! < 0) continue;
    all.push(id);
    (street[id] === streetId ? local : other).push(id);
  }
  return { all, local, other };
}

/** 规格书 01 §1.5E：原值为 0 或加上之后 ≤0 时为 0 */
export function realValue(x: number, add: number): number {
  return x === 0 ? 0 : Math.max(0, x + add);
}

export interface Candidate {
  cookbookId: number;
  req: number;
}

export interface TableOutcome {
  tables: TableState[];
  oil: number;
  coin: number;
  exp: number;
  customers: Record<string, number>;
  drops: Drop[];
  logs: SettleLog[];
  candidates: Candidate[];
  specialUsed: number;
  planktonAppeared: boolean;
}

/** 付费的顾客类型：普通、挑剔、章鱼哥、痞老板、蟹老板 */
const PAYING: ReadonlySet<number> = new Set([1, 2, 6, 7, 8]);

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 逐桌分配（规格书 01 §1.5；设计文档 裁定 1：每桌银币加成只加一次） */
export function allocateTables(
  input: SettleInput,
  g: SettleGlobals,
  rates: Rates,
  flags: Flags,
  rng: Rng,
): TableOutcome {
  const { rest } = input;
  const s = rest.star;
  const t = g.tuning.settlement;
  const rt = g.tuning.rest;
  const coinBase = rt.coinBase - Math.floor(s / 2);
  const expBase = rt.expBase + Math.floor(s / 2);
  const oilBase = rt.oilBase;
  const learned = splitLearned(input.levels, g.cookbooks.street, rest.streetId);
  const sameKrabStreet = g.krabStreet !== null && g.krabStreet === rest.streetId;
  const isHost = g.planktonRestId === rest.id;
  const special = input.special ? { ...input.special } : null;

  const out: TableOutcome = {
    tables: [],
    oil: 0,
    coin: 0,
    exp: 0,
    customers: {},
    drops: [],
    logs: [],
    candidates: [],
    specialUsed: 0,
    planktonAppeared: false,
  };
  const count = (type: number) => {
    out.customers[String(type)] = (out.customers[String(type)] ?? 0) + 1;
  };
  /** 规格书 01 §1.7 */
  const eatSpecial = (portions: number, half: boolean): { coin: number; exp: number } => {
    if (!special || special.leftNum <= 0) return { coin: 0, exp: 0 };
    const n = Math.min(portions, special.leftNum);
    special.leftNum -= n;
    out.specialUsed += n;
    return {
      coin: special.price * n * (1 + flags.mcCoinRate) * (half ? 0.5 : 1),
      exp: (half ? 1 : special.level) * (1 + flags.mcExpRate),
    };
  };

  let seatedLimit = rates.seated;
  // 店里已经坐着痞老板时，本轮不会再出现第二个
  let planktonShown = input.tables.some((x) => x.customer === 7);
  const sorted = [...input.tables].sort((a, b) => a.no - b.no);

  for (const table of sorted) {
    let oil = oilBase;
    let coin = coinBase;
    let exp = expBase;
    let mcCoin = 0;
    let mcExp = 0;
    let satisfied = false;
    let type = 0;
    let next: TableState = { no: table.no, floor: table.floor, customer: 0 };
    const extra: Partial<TableResult> = {};

    // B. 白食桌
    if (table.customer === 9 && table.freeloader) {
      const f = table.freeloader;
      const tt = Math.floor(Math.sqrt(f.level));
      const hours = (input.now.getTime() - Date.parse(f.since)) / 3_600_000;
      let loss: number;
      let fexp: number;
      if (hours < 7) {
        oil = oilBase + 1 + Math.floor(Math.sqrt(tt));
        fexp = (expBase + s) * 3 + rng.int(6 * tt);
        loss = (coinBase + s) * 3 + rng.int(3 * tt);
      } else {
        oil = oilBase + 1;
        fexp = expBase + s + rng.int(tt);
        loss = coinBase + s + rng.int(tt);
      }
      if (table.no <= seatedLimit) seatedLimit += 1;
      const oilT = realValue(oil, rates.oilValue.total);
      out.oil += oilT;
      out.coin -= loss;
      next = {
        ...next,
        customer: 9,
        freeloader: { ...f, coin: f.coin + loss, exp: f.exp + fexp },
        last: { type: 9, coin: -loss, exp: 0, oil: r2(oilT) },
      };
      out.tables.push(next);
      count(9);
      continue;
    }

    // C. 蟑螂桌
    if (table.customer === 3) {
      const killed = rng.chance(flags.roachClear);
      type = killed ? -3 : 3;
      next = killed
        ? { ...next, customer: -3 }
        : { ...next, customer: 3, ...(table.roach ? { roach: table.roach } : {}) };
      next.last = { type, coin: 0, exp: 0, oil: 0 };
      out.tables.push(next);
      count(type);
      continue;
    }

    if (table.customer === 7) {
      // D. 痞老板桌：保持，×5
      type = 7;
      next.customer = 7;
      oil *= t.planktonMultiplier;
      coin *= t.planktonMultiplier;
      exp *= t.planktonMultiplier;
    } else if (
      isHost &&
      !planktonShown &&
      s > 0 &&
      rng.chance(t.planktonRateBase + t.planktonRatePerStar * s)
    ) {
      // A1. 痞老板出现
      type = 7;
      next.customer = 7;
      planktonShown = true;
      oil *= t.planktonMultiplier;
      coin *= t.planktonMultiplier;
      exp *= t.planktonMultiplier;
      out.drops.push({ goodsId: GOODS.plankton, num: 1 });
      out.logs.push({ type: 'plankton.appear', params: { table: table.no } });
      out.planktonAppeared = true;
    } else if (rng.chance((t.roachRateBase - t.roachRatePerStar * s) * flags.roachMul)) {
      // A2. 蟑螂
      type = 3;
      next = { ...next, customer: 3, roach: { by: null, at: input.now.toISOString() } };
    } else if (table.no > seatedLimit) {
      // A3. 空桌
      type = 0;
    } else if (
      s >= t.squidwardMinStar &&
      rng.chance(t.squidwardRate * Math.sqrt(2 * s) * (sameKrabStreet ? 1 : t.squidwardOtherStreetFactor))
    ) {
      // A4. 章鱼哥
      type = 6;
      next.customer = 6;
      oil = 1;
      coin = 1;
      exp = 1;
      if (special && special.leftNum > 0) {
        const n = Math.min(t.squidwardPortions, special.leftNum);
        special.leftNum -= n;
        out.specialUsed += n;
        if (flags.flute) {
          exp = special.price * t.squidwardPortions * (1 + flags.mcCoinRate);
          satisfied = true;
        }
      }
      exp *= flags.sqExpRate;
    } else if (rng.chance(rates.spRate.total)) {
      if (
        rest.streetId !== 0 &&
        rng.chance(t.krabRate * (sameKrabStreet ? t.krabSameStreetFactor : 1) + flags.luckRate / t.krabLuckDivisor)
      ) {
        // 神秘顾客（蟹老板）
        type = 8;
        next.customer = 8;
        const req = rng.intMin1(t.krabMaxGrade);
        const cb = learned.all.length > 0 ? learned.all[rng.int(learned.all.length)]! : null;
        const grade = cb === null ? 0 : input.levels[cb]!;
        Object.assign(extra, { req, grade, ...(cb !== null ? { cookbookId: cb } : {}) });
        if (cb !== null && grade >= req) {
          satisfied = true;
          oil = oil + oil + grade;
          exp += t.krabExpPerGrade * grade;
          coin += g.cookbooks.coin[cb]! * (1 + g.grade(grade).spCoinAddRate) * t.krabCoinMultiplier;
          out.drops.push({ goodsId: GOODS.krabHappy, num: 1 });
          out.logs.push({ type: 'krab.happy', params: { cookbookId: cb, grade, req } });
        } else if (flags.husky && rng.chance(t.huskyRate)) {
          out.logs.push({ type: 'krab.husky', params: { req } });
        } else if (flags.paintingTop && rng.chance(t.painting13Rate)) {
          out.drops.push({ goodsId: GOODS.krabHappy, num: 1, hours: t.painting13Hours });
          out.logs.push({ type: 'krab.painting', params: { req } });
        } else {
          coin /= 2;
          exp /= 2;
          out.drops.push({ goodsId: GOODS.krabAngry, num: 1 });
          out.logs.push({ type: 'krab.angry', params: { req } });
        }
      } else {
        // 普通挑剔顾客
        type = 2;
        next.customer = 2;
        const req = rng.intMin1(Math.min(s, t.pickyMaxGrade));
        const localRate = rest.streetId === 0 ? 1 : rt.localRateBase - rt.localRatePerStar * s;
        const local = rng.chance(localRate);
        const pool = local ? learned.local : learned.other;
        const cb = pool.length > 0 ? pool[rng.int(pool.length)]! : null;
        if (cb !== null) {
          const grade = input.levels[cb]!;
          Object.assign(extra, { req, grade, cookbookId: cb });
          oil = oil + oil + grade;
          exp += grade * (local ? 1 : 2);
          if (grade >= req) {
            satisfied = true;
            coin += g.cookbooks.coin[cb]! * (1 + g.grade(grade).spCoinAddRate);
            const m = eatSpecial(2, false);
            mcCoin += m.coin;
            mcExp += m.exp;
            if (req >= t.cookfoodsMinGrade && grade >= t.cookfoodsMinGrade) {
              out.candidates.push({ cookbookId: cb, req });
            }
          } else {
            coin += grade;
            if (flags.ali) {
              const m = eatSpecial(1, false);
              mcCoin += m.coin;
              mcExp += m.exp;
            }
          }
        } else {
          Object.assign(extra, { req });
          exp /= 2;
          if (flags.ali) {
            const m = eatSpecial(1, true);
            mcCoin += m.coin;
            mcExp += m.exp;
          }
        }
        if (!satisfied && !flags.husky) coin /= 2;
      }
    } else {
      // 普通顾客
      type = 1;
      next.customer = 1;
      const m = eatSpecial(1, true);
      mcCoin += m.coin;
      mcExp += m.exp;
    }

    // E. 每桌最终值
    let oilT = 0;
    let coinT = 0;
    let expT = 0;
    if (PAYING.has(type)) {
      oilT = realValue(oil, rates.oilValue.total);
      coinT = coin + rates.coinValue.total + mcCoin;
      expT = realValue(exp + mcExp, rates.expValue.total);
    }
    const cond = satisfied ? coinT * flags.spCoinRate : 0;
    out.oil += oilT;
    out.coin += coinT + cond;
    out.exp += expT;
    next.last = {
      type,
      coin: r2(coinT + cond),
      exp: r2(expT),
      oil: r2(oilT),
      ...extra,
      ...(type === 2 || type === 8 ? { satisfied } : {}),
    };
    out.tables.push(next);
    count(type);
  }
  return out;
}
```

- [ ] **Step 4: 实现本轮汇总与挑剔消耗食材**

`apps/server/src/modules/settlement/settle.ts`：

```ts
import { GOODS } from '@dt/config';
import type { Rng } from '@dt/shared';
import { computeRates } from './rates';
import { allocateTables, type Candidate } from './tables';
import type { Drop, Flags, Rates, SettleGlobals, SettleInput, SettleResult } from './types';

/** 规格书 01 §1.6；负数（白食损失）不吃加成（Review Focus 3） */
export function incomeValue(x: number, r: number): number {
  if (x <= 0 || r === 0) return Math.floor(x);
  return Math.max(1, Math.floor(x * (1 + r)));
}

function mergeDrops(drops: Drop[]): Drop[] {
  const out: Drop[] = [];
  for (const d of drops) {
    const same = out.find((x) => x.goodsId === d.goodsId && x.hours === d.hours);
    if (same) same.num += d.num;
    else out.push({ ...d });
  }
  return out;
}

/** 挑剔消耗食材（规格书 01 §1.8） */
function cookFoods(
  cands: Candidate[],
  input: SettleInput,
  g: SettleGlobals,
  rates: Rates,
  flags: Flags,
  rng: Rng,
): { exp: number; renown: number; drops: Drop[]; foodsUsed: Array<{ foodsId: number; num: number }> } {
  const t = g.tuning.settlement;
  const flag = input.rest.cookfoodsFlag;
  const stock = new Map(input.cupboard ?? []);
  const used = new Map<number, number>();
  const drops: Drop[] = [];
  let exp = 0;
  let renown = 0;
  for (const c of cands) {
    const need = g.needFoods(c.cookbookId, Math.min(c.req, t.cookfoodsNeedGradeCap));
    const ok =
      need.length > 0 &&
      need.every((f) => (stock.get(f.foodsId) ?? 0) >= Math.max(flag * t.cookfoodsPerFlag, f.num));
    if (!ok) continue;
    let price = 0;
    let odds5 = 0;
    let krab = 0;
    for (const f of need) {
      stock.set(f.foodsId, (stock.get(f.foodsId) ?? 0) - f.num);
      used.set(f.foodsId, (used.get(f.foodsId) ?? 0) + f.num);
      const food = g.food(f.foodsId);
      price += food.coin * f.num;
      if (food.level === 5) odds5 += 101 - food.odds;
      krab += food.level * (101 - food.odds);
    }
    exp += Math.floor(Math.floor(price / 100) * (1 + rates.expRate.total) * (1 + flags.cookfoodSpExpRate));
    const times = Math.floor(1 + odds5 / t.dtTicketOddsDivisor);
    const p = t.dtTicketBaseRate * g.holidayMultiplier + flags.luckRate / t.dtTicketLuckDivisor;
    let tickets = 0;
    for (let i = 0; i < times; i++) if (rng.chance(p)) tickets += 1;
    if (tickets > 0) drops.push({ goodsId: GOODS.dtTicket, num: tickets });
    const curOdd = Math.sqrt(krab) / 100;
    if (
      tickets === 0 &&
      (rng.chance(t.krabCoinBaseRate) ||
        (curOdd > t.krabCoinOddThreshold && rng.chance((curOdd - t.krabCoinOddThreshold) * t.krabCoinOddStep)))
    ) {
      drops.push({ goodsId: GOODS.krabCoin, num: 1 });
    }
    if (flags.pinkBook || rng.chance(t.renownRate) || curOdd > t.renownOddThreshold) renown += 1;
  }
  return { exp, renown, drops, foodsUsed: [...used].map(([foodsId, num]) => ({ foodsId, num })) };
}

/** 一家店的一轮结算：纯函数，不访问数据库、不读时间（设计文档 §4.2） */
export function settleRestaurant(input: SettleInput, g: SettleGlobals, rng: Rng): SettleResult {
  if (input.rest.oil <= 0) {
    return {
      closed: true,
      tables: input.tables,
      coin: 0,
      exp: 0,
      oil: 0,
      customers: {},
      rates: null,
      drops: [],
      renown: 0,
      foodsUsed: [],
      specialUsed: 0,
      logs: [],
      planktonAppeared: false,
    };
  }
  const { rates, flags } = computeRates(input, g, rng);
  const o = allocateTables(input, g, rates, flags, rng);
  const coin = incomeValue(o.coin, rates.coinRate.total);
  let exp = incomeValue(o.exp, rates.expRate.total);
  const oil = Math.min(Math.max(0, incomeValue(o.oil, rates.oilRate.total)), input.rest.oil);
  const drops = [...o.drops];
  let renown = 0;
  let foodsUsed: Array<{ foodsId: number; num: number }> = [];
  if (input.rest.cookfoodsFlag > 0 && input.cupboard && o.candidates.length > 0) {
    const cf = cookFoods(o.candidates, input, g, rates, flags, rng);
    exp += cf.exp;
    renown += cf.renown;
    drops.push(...cf.drops);
    foodsUsed = cf.foodsUsed;
  }
  return {
    closed: false,
    tables: o.tables,
    coin,
    exp,
    oil,
    customers: o.customers,
    rates,
    drops: mergeDrops(drops),
    renown,
    foodsUsed,
    specialUsed: o.specialUsed,
    logs: o.logs,
    planktonAppeared: o.planktonAppeared,
  };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/settlement`
Expected: PASS。若某个用例失败，先核对随机数消耗顺序（本任务开头的说明）与测试序列是否一致；序列和手算期望值有误时修正测试并在 ledger 记 Ruling，规则代码以规格书为准。

- [ ] **Step 6: 提交**

```bash
pnpm typecheck && pnpm format
git add apps/server/src/modules/settlement
git commit -m "feat(settlement): per-table allocation, round totals, picky customers consuming ingredients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: 结算批处理、体力恢复、老鼠捣乱

**Files:**
- Create: `apps/server/src/modules/settlement/runner.ts`
- Create: `apps/server/src/modules/settlement/strength.ts`
- Create: `apps/server/src/modules/settlement/mouse.ts`
- Create: `apps/server/src/modules/settlement/jobs.ts`
- Modify: `apps/server/src/game.ts`
- Test: `apps/server/src/modules/settlement/runner.test.ts`
- Test: `apps/server/src/modules/settlement/recovery.test.ts`

**Interfaces:**
- Consumes: `settleRestaurant`、`buildGlobals`、`normalizeCounts`、`runSystemOp`、`setRest`、`restLog`、`opNews`、`gainCoin/gainExp/gainRenown/gainOil/spendCoin`、`opAgg`、`opLuck`、`grantGoodsOp`、`subFoods`、`WorldService.ensure/setPlankton`、`roundOf`、`seededRng`、`hashSeed`、`luckRate`
- Produces:
  - `settleShardRound(d, world, shardId, round, now, opts?): Promise<RoundStats>`，`RoundStats = { round; restaurants; settled; skipped; closed; failed; ms }`，`RoundOptions { onRestaurant?(restId, ms); log? }`
  - `settleOne(op, globals, round): Promise<'settled' | 'skipped' | 'closed'>`
  - `autoRefuel(op, agg): number`
  - `regenStrength(d, shardId, period, now): Promise<{ updated: number }>`
  - `mouseRound(d, shardId, period, now): Promise<MouseStats>`
  - `settlementJobs(d, world): PeriodicJob[]`（`settlement` 每 4 分钟、`strength` 每 10 分钟、`mouse` 每 30 分钟，功能都是 `settlement`）

- [ ] **Step 1: 写结算批处理的失败测试**

`apps/server/src/modules/settlement/runner.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { grantGoods } from '../store/grant';
import { settleShardRound } from './runner';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const round = roundOf(new Date());
const settle = (shardId: number, r = round) => settleShardRound(t.game.deps, t.game.world, shardId, r, new Date());
const income = (restId: number) =>
  t.db.selectFrom('income_round').selectAll().where('rest_id', '=', restId).execute();

describe('settleShardRound', () => {
  it('每轮每店只结算一次；收益写入餐厅和 income_round', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 1000 } });
    const s1 = await settle(shardId);
    expect(s1).toMatchObject({ restaurants: 1, settled: 1, failed: 0 });
    const rows = await income(ctx.restaurantId);
    expect(rows).toHaveLength(1);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(1000 + rows[0]!.coin);
    expect(r.oil).toBe(1000 - rows[0]!.oil);
    const tables = await t.db
      .selectFrom('restaurant_tables')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(tables.round_no).toBe(round);
    expect(tables.tables.every((x) => x.last !== undefined)).toBe(true);

    const s2 = await settle(shardId);
    expect(s2).toMatchObject({ settled: 0, skipped: 1 });
    expect(await income(ctx.restaurantId)).toHaveLength(1);
  });

  it('没油：停业，不写收益；停业店不再进入结算', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { oil: 0 } });
    expect(await settle(shardId)).toMatchObject({ closed: 1 });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ state: 2, state_reason: 'no_oil' });
    expect(await income(ctx.restaurantId)).toHaveLength(0);
    expect(await settle(shardId, round + 1)).toMatchObject({ restaurants: 0 });
  });

  it('白食让本轮银币为负时，餐厅银币最低到 0（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const tables = [1, 2, 3, 4].map((no) => ({
      no,
      floor: 1,
      customer: 9,
      freeloader: { restId: 1, level: 100, since, coin: 0, exp: 0 },
    }));
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 5 }, tables });
    await settle(shardId);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(0);
    expect((await income(ctx.restaurantId))[0]!.coin).toBeLessThan(0);
  });

  it('结算与玩家操作同时进行：行锁串行，两边的改动都在', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000 } });
    await Promise.all([
      settle(shardId),
      runOp(t.game.deps, ctx, { feature: 'restaurant', source: 'test' }, async (op) => spendCoin(op, 100)),
    ]);
    const [row] = await income(ctx.restaurantId);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1000 - 100 + row!.coin);
  });

  it('没有痞老板驻留店时，从 1 星及以上的营业店里选一家', async () => {
    const shardId = await createShard(t.db);
    await newRestaurant(t, { shardId });
    const star = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
    await settle(shardId);
    expect((await t.game.world.ensure(shardId)).planktonRestId).toBe(star.restaurantId);
  });

  it('集齐 7 幅名画：油量低于 2000 时自动加满', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 100000, oil: 1000, oil_max: 1500 } });
    for (const id of [312, 336, 337, 349, 359, 360, 361]) {
      await grantGoods(t.db, t.game.deps.config, ctx.restaurantId, id, 1, new Date());
    }
    await settle(shardId);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.oil).toBe(1500);
    expect(r.coin).toBeLessThan(100000 + (await income(ctx.restaurantId))[0]!.coin);
  });
});
```

- [ ] **Step 2: 写体力和老鼠的失败测试**

`apps/server/src/modules/settlement/recovery.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { mouseRound } from './mouse';
import { regenStrength } from './strength';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('体力恢复（规格书 01 §1.10）', () => {
  it('每次 +1（幸运时 +2），不超过上限；圣佑提高上限', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { strength: 50, strength_max: 100 } });
    const full = await newRestaurant(t, { shardId, patch: { strength: 100, strength_max: 100 } });
    const holy = await newRestaurant(t, { shardId, patch: { strength: 150, strength_max: 100 } });
    await t.db
      .updateTable('restaurant')
      .set({ effect_agg: JSON.stringify({ holyBless: 100 }) })
      .where('id', '=', holy.restaurantId)
      .execute();
    const r = await regenStrength(t.game.deps, shardId, 'p1', new Date());
    expect(r.updated).toBe(2);
    expect([51, 52]).toContain((await restRow(t, low.restaurantId)).strength);
    expect((await restRow(t, full.restaurantId)).strength).toBe(100);
    expect([151, 152]).toContain((await restRow(t, holy.restaurantId)).strength);
  });

  it('沙漏倍率', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { strength: 10, strength_max: 100 } });
    await t.db
      .updateTable('restaurant')
      .set({ effect_agg: JSON.stringify({ autoReStrength: 2 }) })
      .where('id', '=', ctx.restaurantId)
      .execute();
    await regenStrength(t.game.deps, shardId, 'p1', new Date());
    expect([12, 14]).toContain((await restRow(t, ctx.restaurantId)).strength);
  });
});

describe('老鼠捣乱（规格书 01 §1.9）', () => {
  async function alwaysMouseShard() {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { mouse: { rateBase: 10 } } }) })
      .execute();
    return shardId;
  }

  it('没有幸运和捕鼠夹：偷走一种未锁定食材', async () => {
    const shardId = await alwaysMouseShard();
    const ctx = await newRestaurant(t, { shardId, foods: { 101: 5 } });
    const s = await mouseRound(t.game.deps, shardId, 'p1', new Date());
    expect(s).toMatchObject({ triggered: 1, stolen: 1 });
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(4);
    const logs = await t.db.selectFrom('rest_log').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(logs.map((l) => [l.type, l.params])).toEqual([['mouse.steal', { foodsId: 101, num: 1 }]]);
  });

  it('只有锁定的食材时什么也偷不到', async () => {
    const shardId = await alwaysMouseShard();
    const ctx = await newRestaurant(t, { shardId, foods: { 101: 5 } });
    await t.db.updateTable('cupboard_food').set({ locked: true }).where('rest_id', '=', ctx.restaurantId).execute();
    const s = await mouseRound(t.game.deps, shardId, 'p1', new Date());
    expect(s).toMatchObject({ triggered: 1, nothing: 1 });
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(5);
  });

  it('捕鼠夹 100% 时抓到老鼠，得到银币', async () => {
    const shardId = await alwaysMouseShard();
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 0, level: 10 }, foods: { 101: 5 } });
    await t.db
      .updateTable('restaurant')
      .set({ effect_agg: JSON.stringify({ trapRate: 1 }), effect_dirty: false })
      .where('id', '=', ctx.restaurantId)
      .execute();
    const s = await mouseRound(t.game.deps, shardId, 'p1', new Date());
    expect(s).toMatchObject({ trapped: 1 });
    const coin = (await restRow(t, ctx.restaurantId)).coin;
    expect(coin).toBeGreaterThanOrEqual(100);
    expect(coin).toBeLessThanOrEqual(300);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/settlement/runner.test.ts apps/server/src/modules/settlement/recovery.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 4: 实现批处理**

`apps/server/src/modules/settlement/runner.ts`：

```ts
import { hashSeed, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opAgg } from '../../core/luck';
import { opNews, restLog, runSystemOp, setRest, type Op } from '../../core/op';
import { gainCoin, gainExp, gainOil, gainRenown, spendCoin } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import type { WorldService } from '../world/service';
import { buildGlobals, normalizeCounts } from './globals';
import { settleRestaurant } from './settle';
import type { SettleGlobals, SettleInput } from './types';

export type RoundStats = {
  round: number;
  restaurants: number;
  settled: number;
  skipped: number;
  closed: number;
  failed: number;
  ms: number;
};

export interface RoundOptions {
  onRestaurant?: (restId: number, ms: number) => void;
  log?: { error(obj: object, msg: string): void };
}

/** 最多 n 个并发地处理 items */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const x = items[i++]!;
      await fn(x);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/** 自动加油（集名画"七韵丹青"）：油量低于门槛且银币够时加满 */
export function autoRefuel(op: Op, agg: Record<string, number>): number {
  if ((agg.autoAddOil ?? 0) <= 0) return 0;
  if (op.rest.oil >= op.tuning.settlement.autoRefuelThreshold) return 0;
  const need = op.rest.oil_max - op.rest.oil;
  if (need <= 0 || op.rest.coin < need) return 0;
  spendCoin(op, need, { source: 'oil.auto', event: false });
  return gainOil(op, need, { source: 'oil.auto', event: false });
}

/** 一家店的一轮：锁内读三行 + 加成汇总 → 纯函数 → 写回（设计文档 §4.1） */
export async function settleOne(op: Op, g: SettleGlobals, round: number): Promise<'settled' | 'skipped' | 'closed'> {
  if (op.rest.state !== 1) return 'skipped';
  const tr = await op.tx
    .selectFrom('restaurant_tables')
    .selectAll()
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  if (tr.round_no >= round) return 'skipped';
  const cb = await op.tx
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  const agg = await opAgg(op);
  let cupboard: Map<number, number> | null = null;
  if (op.rest.cookfoods_flag > 0) {
    const rows = await op.tx
      .selectFrom('cupboard_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', op.rest.id)
      .where('num', '>', 0)
      .execute();
    cupboard = new Map(rows.map((r) => [r.foods_id, r.num]));
  }
  const input: SettleInput = {
    rest: {
      id: op.rest.id,
      level: op.rest.level,
      star: op.rest.star_level,
      oil: op.rest.oil,
      oilMax: op.rest.oil_max,
      coin: op.rest.coin,
      streetId: op.rest.street_id,
      renown: op.rest.renown,
      luck: op.rest.luck,
      cteOn: op.rest.cte_on,
      cookfoodsFlag: op.rest.cookfoods_flag,
    },
    tables: tr.tables,
    levels: new Uint8Array(cb.levels),
    counts: normalizeCounts(op.rest.cookbook_counts),
    agg,
    special: null,
    cupboard,
    now: op.now,
  };
  const r = settleRestaurant(input, g, op.rng);
  if (r.closed) {
    setRest(op, 'state', 2);
    setRest(op, 'state_reason', 'no_oil');
    restLog(op, 'rest.closed', { reason: 'no_oil' });
    await op.tx.updateTable('restaurant_tables').set({ round_no: round }).where('rest_id', '=', op.rest.id).execute();
    return 'closed';
  }
  // 结算的银币经验由 income_round 记录，不写流水；银币最低到 0
  gainCoin(op, r.coin, { ledger: false, event: false });
  gainExp(op, r.exp, { ledger: false, event: false });
  if (r.oil > 0) setRest(op, 'oil', op.rest.oil - r.oil);
  if (r.renown !== 0) gainRenown(op, r.renown, { source: 'settlement', event: false });
  for (const drop of r.drops) {
    await grantGoodsOp(op, drop.goodsId, drop.num, { source: 'settlement', event: false, hours: drop.hours });
  }
  for (const f of r.foodsUsed) await subFoods(op, f.foodsId, f.num, { source: 'settlement.cookfoods', event: false });
  for (const l of r.logs) restLog(op, l.type, l.params);
  if (r.planktonAppeared) opNews(op, 'plankton.appear');
  autoRefuel(op, agg);
  await op.tx
    .updateTable('restaurant_tables')
    .set({ round_no: round, tables: JSON.stringify(r.tables) })
    .where('rest_id', '=', op.rest.id)
    .execute();
  await op.tx
    .insertInto('income_round')
    .values({
      rest_id: op.rest.id,
      round_no: round,
      coin: r.coin,
      exp: r.exp,
      oil: r.oil,
      customers: JSON.stringify(r.customers),
      rates: JSON.stringify(r.rates),
      drops: JSON.stringify(r.drops),
      created_at: op.now,
    })
    .execute();
  return 'settled';
}

/** 一个区服的一轮结算（设计文档 §4.1）：单店出错只记日志 */
export async function settleShardRound(
  d: GameDeps,
  world: WorldService,
  shardId: number,
  round: number,
  now: Date,
  opts: RoundOptions = {},
): Promise<RoundStats> {
  const started = Date.now();
  const settings = await d.shards.settings(shardId);
  const t = settings.tuning.settlement;
  let snap = await world.ensure(shardId, now);
  if (snap.planktonRestId === null) {
    const cands = await d.db
      .selectFrom('restaurant')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('state', '=', 1)
      .where('star_level', '>=', 1)
      .orderBy('id')
      .execute();
    if (cands.length > 0) {
      const pick = cands[seededRng(hashSeed(shardId, 'plankton', round)).int(cands.length)]!.id;
      await world.setPlankton(d.db, shardId, pick);
      snap = { ...snap, planktonRestId: pick };
    }
  }
  const globals = buildGlobals(d.config, settings.tuning, {
    weather: snap.weather.effects,
    krabStreet: snap.krabStreet,
    planktonRestId: snap.planktonRestId,
    holidayMultiplier: d.config.holidayMultiplier(now),
  });
  const ids = (
    await d.db
      .selectFrom('restaurant')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('state', '=', 1)
      .orderBy('id')
      .execute()
  ).map((r) => r.id);
  const stats: RoundStats = { round, restaurants: ids.length, settled: 0, skipped: 0, closed: 0, failed: 0, ms: 0 };
  for (let i = 0; i < ids.length; i += t.batchSize) {
    await pool(ids.slice(i, i + t.batchSize), t.concurrency, async (restId) => {
      const t0 = Date.now();
      try {
        const result = await runSystemOp(
          d,
          shardId,
          restId,
          { source: 'settlement', now, rng: seededRng(hashSeed(shardId, round, restId)) },
          (op) => settleOne(op, globals, round),
        );
        stats[result] += 1;
      } catch (err) {
        stats.failed += 1;
        opts.log?.error({ err, shardId, round, restId }, 'settlement failed');
      }
      opts.onRestaurant?.(restId, Date.now() - t0);
    });
  }
  stats.ms = Date.now() - started;
  return stats;
}
```

- [ ] **Step 5: 实现体力和老鼠**

`apps/server/src/modules/settlement/strength.ts`：

```ts
import { sql } from 'kysely';
import { hashSeed, luckRate, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';

/**
 * 体力恢复（规格书 01 §1.10）：一条批量 UPDATE，相对增量、不锁店。
 * 加成用缓存的 effect_agg（最多滞后一轮结算），避免在锁外重算缓存。
 */
export async function regenStrength(
  d: GameDeps,
  shardId: number,
  period: string,
  _now: Date,
): Promise<{ updated: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const rows = await d.db
    .selectFrom('restaurant')
    .select(['id', 'strength', 'strength_max', 'luck', 'effect_agg'])
    .where('shard_id', '=', shardId)
    .execute();
  const ids: number[] = [];
  const adds: number[] = [];
  const caps: number[] = [];
  for (const r of rows) {
    const agg = r.effect_agg ?? {};
    const cap = r.strength_max + (agg.holyBless ?? 0);
    if (r.strength >= cap) continue;
    const rng = seededRng(hashSeed(shardId, 'strength', period, r.id));
    const base = rng.chance(luckRate(r.luck + (agg.luckValue ?? 0)))
      ? tuning.strength.luckyRegen
      : tuning.strength.regen;
    const mult = (agg.autoReStrength ?? 0) > 0 ? agg.autoReStrength! : 1;
    ids.push(r.id);
    adds.push(Math.round(base * mult));
    caps.push(cap);
  }
  let updated = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await sql`
      update restaurant r set strength = least(r.strength + u.add, u.cap)
      from unnest(${ids.slice(i, i + 1000)}::int[], ${adds.slice(i, i + 1000)}::int[], ${caps.slice(i, i + 1000)}::int[])
        as u(id, add, cap)
      where r.id = u.id and r.strength < u.cap`.execute(d.db);
    updated += Number(r.numAffectedRows ?? 0);
  }
  return { updated };
}
```

`apps/server/src/modules/settlement/mouse.ts`：

```ts
import { GOODS } from '@dt/config';
import { hashSeed, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, runSystemOp, type Op } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';

export type MouseStats = {
  triggered: number;
  escaped: number;
  trapped: number;
  stolen: number;
  nothing: number;
  maps: number;
};

type Outcome = 'escaped' | 'trapped' | 'stolen' | 'nothing';

async function visit(op: Op): Promise<{ outcome: Outcome; map: boolean }> {
  const mt = op.tuning.mouse;
  const agg = await opAgg(op);
  const { sum, rate } = await opLuck(op);
  let outcome: Outcome;
  if (op.rng.chance(rate / mt.luckDivisor)) {
    outcome = 'escaped';
    restLog(op, 'mouse.escape');
  } else if (op.rng.chance(agg.trapRate ?? 0)) {
    outcome = 'trapped';
    const coin = Math.floor(op.rest.level * mt.trapCoinPerLevel * (0.5 + op.rng.next()) + sum);
    gainCoin(op, coin, { source: 'mouse.trap', event: false });
    restLog(op, 'mouse.trap', { coin });
  } else {
    const foods = await op.tx
      .selectFrom('cupboard_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', op.rest.id)
      .where('num', '>', 0)
      .where('locked', '=', false)
      .orderBy('foods_id')
      .execute();
    if (foods.length === 0) {
      outcome = 'nothing';
      restLog(op, 'mouse.nothing');
    } else {
      const pick = foods[op.rng.int(foods.length)]!;
      const num = Math.min(pick.num, op.rng.intMin1(2 * op.rest.star_level + 1));
      await subFoods(op, pick.foods_id, num, { source: 'mouse', event: false });
      outcome = 'stolen';
      restLog(op, 'mouse.steal', { foodsId: pick.foods_id, num });
    }
  }
  const map = op.rng.chance(agg.earnMapRate ?? 0);
  if (map) {
    await grantGoodsOp(op, GOODS.adventureMap, 1, { source: 'mouse', event: false });
    restLog(op, 'mouse.map');
  }
  return { outcome, map };
}

/** 老鼠捣乱（规格书 01 §1.9）：先按固定种子判定触发，只对触发的店加锁处理 */
export async function mouseRound(d: GameDeps, shardId: number, period: string, now: Date): Promise<MouseStats> {
  const { tuning } = await d.shards.settings(shardId);
  const mt = tuning.mouse;
  const rows = await d.db
    .selectFrom('restaurant')
    .select(['id', 'star_level', 'street_id'])
    .where('shard_id', '=', shardId)
    .orderBy('id')
    .execute();
  const stats: MouseStats = { triggered: 0, escaped: 0, trapped: 0, stolen: 0, nothing: 0, maps: 0 };
  for (const r of rows) {
    const rng = seededRng(hashSeed(shardId, 'mouse', period, r.id));
    const rate = (mt.rateBase - mt.ratePerStar * r.star_level) * (r.street_id === 0 ? mt.newbieFactor : 1);
    if (!rng.chance(rate)) continue;
    stats.triggered += 1;
    const res = await runSystemOp(d, shardId, r.id, { source: 'mouse', now, rng }, visit);
    stats[res.outcome] += 1;
    if (res.map) stats.maps += 1;
  }
  return stats;
}
```

`apps/server/src/modules/settlement/jobs.ts`：

```ts
import { roundOf } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import type { WorldService } from '../world/service';
import { mouseRound } from './mouse';
import { settleShardRound } from './runner';
import { regenStrength } from './strength';

const TEN_MINUTES = 600_000;
const HALF_HOUR = 1_800_000;

export function settlementJobs(d: GameDeps, world: WorldService): PeriodicJob[] {
  return [
    {
      name: 'settlement',
      feature: 'settlement',
      period: (now) => String(roundOf(now)),
      run: ({ shardId, period, now }) => settleShardRound(d, world, shardId, Number(period), now),
    },
    {
      name: 'strength',
      feature: 'settlement',
      period: (now) => String(Math.floor(now.getTime() / TEN_MINUTES)),
      run: ({ shardId, period, now }) => regenStrength(d, shardId, period, now),
    },
    {
      name: 'mouse',
      feature: 'settlement',
      period: (now) => String(Math.floor(now.getTime() / HALF_HOUR)),
      run: ({ shardId, period, now }) => mouseRound(d, shardId, period, now),
    },
  ];
}
```

`apps/server/src/game.ts`：导入 `settlementJobs`，在 `jobs.push(...worldJobs(world));` 之后加 `jobs.push(...settlementJobs(deps, world));`。

- [ ] **Step 6: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/settlement`
Expected: PASS

- [ ] **Step 7: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add apps/server
git commit -m "feat(settlement): shard round runner, strength regen, mouse visits, periodic jobs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: 餐厅读接口——概况扩展、楼层、收益、加成分项、个人日志

**Files:**
- Modify: `packages/shared/src/schemas/restaurant.ts`
- Create: `apps/server/src/modules/restaurant/reads.ts`
- Modify: `apps/server/src/modules/restaurant/rules.ts`（`toRestaurantDto` 扩展）
- Modify: `apps/server/src/modules/restaurant/service.ts`（拆出 `open`，新增读接口）
- Modify: `apps/server/src/modules/restaurant/routes.ts`
- Modify: `apps/server/src/game.ts`
- Test: `apps/server/src/modules/restaurant/reads.test.ts`

**Interfaces:**
- Consumes: `WorldService.ensure`、`listActiveEffects`、`settleShardRound`（测试用）
- Produces:
  - DTO：`TableResultDto`、扩展的 `TableDto { no; floor; customer; roach?; freeloaderRestId?; last? }`、`DeviceSlotDto`、`RoundSummaryDto`、扩展的 `RestaurantDto`（`oilLevel`、`state`、`stateReason`、`promoOn`、`cteOn`、`cookfoodsFlag`、`plaque2Open`、`mainTaskStep`、`devices`、`lastRound`、`weather`、`isPlanktonHost`）、`IncomePageDto`、`RateBreakdownDto`、`BuffsDto`、`RestLogDto`、`LogPageDto`、`pageQuery`
  - `deviceSlots(db, config, rest, now): Promise<DeviceSlotDto[]>`、`slotUnlocked(device, rest): boolean`、`tableDto(t)`、`lastRound(db, restId)`、`incomePage(db, restId, q)`、`buffsOf(db, config, restId, now)`、`logPage(db, restId, q)`
  - `RestaurantService.open(accountId, shardId, rawName): Promise<number>`、`floor(restId)`、`income(restId, q)`、`buffs(restId)`、`log(restId, q)`；`createRestaurantService(d, shards, world)`
  - 路由 `GET /api/v1/restaurant/{floor,income,buffs,log}`

- [ ] **Step 1: 共享 DTO**

把 `packages/shared/src/schemas/restaurant.ts` 里的 `TableDto` 替换为下面的定义，并在文件末尾追加其余类型：

```ts
export interface TableResultDto {
  type: number;
  coin: number;
  exp: number;
  oil: number;
  req?: number;
  grade?: number;
  cookbookId?: number;
  satisfied?: boolean;
}

export interface TableDto {
  no: number;
  floor: number;
  /** 顾客类型（规格书 01 §1.4），0 = 空桌 */
  customer: number;
  roach?: boolean;
  freeloaderRestId?: number;
  last?: TableResultDto;
}

export interface DeviceSlotDto {
  slot: number;
  name: string;
  deviceType: number;
  needStar: number;
  unlocked: boolean;
  goodsId: number | null;
  expiresAt: string | null;
}

export interface RoundSummaryDto {
  roundNo: number;
  coin: number;
  exp: number;
  oil: number;
  customers: Record<string, number>;
  at: string;
}

export interface IncomePageDto {
  items: RoundSummaryDto[];
  nextBefore: string | null;
}

export interface RateBreakdownDto {
  total: number;
  parts: Record<string, number>;
}

export interface BuffsDto {
  roundNo: number | null;
  rates: Record<string, RateBreakdownDto> | null;
  seated: number | null;
  sources: EffectDto[];
}

export interface RestLogDto {
  type: string;
  params: Record<string, unknown>;
  at: string;
}

export interface LogPageDto {
  items: RestLogDto[];
  nextBefore: string | null;
}

export const pageQuery = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PageQuery = z.infer<typeof pageQuery>;
```

`RestaurantDto` 在 `effects` 之前加：

```ts
  oilLevel: number;
  /** 1 营业，2 停业 */
  state: number;
  stateReason: string | null;
  promoOn: boolean;
  cteOn: boolean;
  cookfoodsFlag: number;
  plaque2Open: boolean;
  mainTaskStep: number;
  devices: DeviceSlotDto[];
  lastRound: RoundSummaryDto | null;
  weather: { id: number; name: string } | null;
  isPlanktonHost: boolean;
```

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/restaurant/reads.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { settleShardRound } from '../settlement/runner';

let http: TestContext;
let t: TestGame;
beforeAll(async () => {
  http = await createTestApp();
  t = await createTestGame();
});
afterAll(async () => {
  await http.close();
  await t.close();
});

async function playerWithRestaurant() {
  const shardId = await createShard(http.deps.db);
  const u = await registerUser(http.app);
  await call(http.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
  const r = await call(http.app, 'POST', '/api/v1/restaurant/create', { cookie: u.cookie, body: { name: '读接口小店' + u.username.slice(-3) } });
  return { shardId, cookie: u.cookie, restId: r.json.data.id as number };
}
const get = (cookie: string, path: string) => call(http.app, 'GET', `/api/v1/restaurant${path}`, { cookie });

describe('餐厅读接口', () => {
  it('概况：9 个设施位（0 星只开前三个）、营业中、还没有收益、带天气', async () => {
    const p = await playerWithRestaurant();
    const d = (await get(p.cookie, '/overview')).json.data;
    expect(d.devices).toHaveLength(9);
    expect(d.devices.filter((x: { unlocked: boolean }) => x.unlocked).map((x: { slot: number }) => x.slot)).toEqual([1, 2, 3]);
    expect(d).toMatchObject({ state: 1, stateReason: null, oilLevel: 0, mainTaskStep: 1, lastRound: null, isPlanktonHost: false });
    expect(d.weather.name).toBeTruthy();
  });

  it('结算一轮后：楼层显示每桌结果，收益记录一条，加成分项有明细', async () => {
    const p = await playerWithRestaurant();
    const round = roundOf(new Date());
    await settleShardRound(t.game.deps, t.game.world, p.shardId, round, new Date());
    const floor = (await get(p.cookie, '/floor')).json.data;
    expect(floor.every((x: { last?: unknown }) => x.last !== undefined)).toBe(true);
    const income = (await get(p.cookie, '/income')).json.data;
    expect(income.items).toHaveLength(1);
    expect(income.items[0].roundNo).toBe(round);
    expect(income.nextBefore).toBeNull();
    const buffs = (await get(p.cookie, '/buffs')).json.data;
    expect(buffs.roundNo).toBe(round);
    expect(buffs.rates.atRate.parts.base).toBeCloseTo(0.3);
    expect(buffs.sources.map((s: { sourceId: number }) => s.sourceId).sort()).toEqual([100, 140, 81]);
    const overview = (await get(p.cookie, '/overview')).json.data;
    expect(overview.lastRound.roundNo).toBe(round);
  });

  it('个人日志分页', async () => {
    const p = await playerWithRestaurant();
    const base = Date.now();
    for (let i = 0; i < 3; i++) {
      await http.deps.db
        .insertInto('rest_log')
        .values({ rest_id: p.restId, type: 'level.up', params: JSON.stringify({ to: i + 2 }), created_at: new Date(base - i * 1000) })
        .execute();
    }
    const page1 = (await get(p.cookie, '/log?limit=2')).json.data;
    expect(page1.items.map((x: { params: { to: number } }) => x.params.to)).toEqual([2, 3]);
    expect(page1.nextBefore).not.toBeNull();
    const page2 = (await get(p.cookie, `/log?limit=2&before=${encodeURIComponent(page1.nextBefore)}`)).json.data;
    expect(page2.items.map((x: { params: { to: number } }) => x.params.to)).toEqual([4]);
    expect(page2.nextBefore).toBeNull();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/restaurant/reads.test.ts`
Expected: FAIL（`devices` 为 undefined、`/floor` 404）

- [ ] **Step 4: 实现读取函数**

`apps/server/src/modules/restaurant/reads.ts`：

```ts
import type { Kysely } from 'kysely';
import type { Device, GameConfig } from '@dt/config';
import type {
  BuffsDto,
  DeviceSlotDto,
  IncomePageDto,
  LogPageDto,
  PageQuery,
  RateBreakdownDto,
  RoundSummaryDto,
  TableDto,
} from '@dt/shared';
import type { DB, RestaurantRow, TableState } from '../../db/schema';
import { listActiveEffects } from '../effects/service';

/** 设施位是否已开放：星级够；第二牌匾位（7）还要先开通 */
export function slotUnlocked(d: Device, rest: Pick<RestaurantRow, 'star_level' | 'plaque2_open'>): boolean {
  return rest.star_level >= d.needStar && (d.id !== 7 || rest.plaque2_open);
}

export async function deviceSlots(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  now: Date,
): Promise<DeviceSlotDto[]> {
  const rows = await db.selectFrom('restaurant_device').selectAll().where('rest_id', '=', rest.id).execute();
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  return [...config.devices.values()]
    .sort((a, b) => a.id - b.id)
    .map((d) => {
      const row = bySlot.get(d.id);
      const active = row !== undefined && (row.expires_at === null || row.expires_at > now);
      return {
        slot: d.id,
        name: d.name,
        deviceType: d.deviceType,
        needStar: d.needStar,
        unlocked: slotUnlocked(d, rest),
        goodsId: active ? row.goods_id : null,
        expiresAt: active && row.expires_at ? row.expires_at.toISOString() : null,
      };
    });
}

export function tableDto(t: TableState): TableDto {
  return {
    no: t.no,
    floor: t.floor,
    customer: t.customer,
    ...(t.roach ? { roach: true } : {}),
    ...(t.freeloader ? { freeloaderRestId: t.freeloader.restId } : {}),
    ...(t.last ? { last: t.last } : {}),
  };
}

type IncomeRow = { round_no: number; coin: number; exp: number; oil: number; customers: Record<string, number>; created_at: Date };

function roundDto(r: IncomeRow): RoundSummaryDto {
  return { roundNo: r.round_no, coin: r.coin, exp: r.exp, oil: r.oil, customers: r.customers, at: r.created_at.toISOString() };
}

export async function lastRound(db: Kysely<DB>, restId: number): Promise<RoundSummaryDto | null> {
  const r = await db
    .selectFrom('income_round')
    .select(['round_no', 'coin', 'exp', 'oil', 'customers', 'created_at'])
    .where('rest_id', '=', restId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return r ? roundDto(r) : null;
}

export async function incomePage(db: Kysely<DB>, restId: number, q: PageQuery): Promise<IncomePageDto> {
  let s = db
    .selectFrom('income_round')
    .select(['round_no', 'coin', 'exp', 'oil', 'customers', 'created_at'])
    .where('rest_id', '=', restId);
  if (q.before) s = s.where('created_at', '<', new Date(q.before));
  const rows = await s.orderBy('created_at', 'desc').limit(q.limit + 1).execute();
  const items = rows.slice(0, q.limit).map(roundDto);
  return { items, nextBefore: rows.length > q.limit ? items.at(-1)!.at : null };
}

export async function buffsOf(db: Kysely<DB>, config: GameConfig, restId: number, now: Date): Promise<BuffsDto> {
  const r = await db
    .selectFrom('income_round')
    .select(['round_no', 'rates'])
    .where('rest_id', '=', restId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  const effects = await listActiveEffects(db, restId, now);
  const raw = (r?.rates ?? null) as (Record<string, unknown> & { seated?: number }) | null;
  let rates: Record<string, RateBreakdownDto> | null = null;
  if (raw) {
    rates = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'object' && v !== null && 'total' in v) rates[k] = v as RateBreakdownDto;
    }
  }
  return {
    roundNo: r?.round_no ?? null,
    rates,
    seated: raw?.seated ?? null,
    sources: effects.map((e) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      name:
        e.sourceType === 'device'
          ? (config.devices.get(e.sourceId)?.name ?? '设施')
          : (config.goods.get(e.sourceId)?.name ?? e.sourceType),
      effects: e.effects,
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    })),
  };
}

export async function logPage(db: Kysely<DB>, restId: number, q: PageQuery): Promise<LogPageDto> {
  let s = db.selectFrom('rest_log').select(['type', 'params', 'created_at']).where('rest_id', '=', restId);
  if (q.before) s = s.where('created_at', '<', new Date(q.before));
  const rows = await s.orderBy('created_at', 'desc').limit(q.limit + 1).execute();
  const items = rows.slice(0, q.limit).map((r) => ({ type: r.type, params: r.params, at: r.created_at.toISOString() }));
  return { items, nextBefore: rows.length > q.limit ? items.at(-1)!.at : null };
}
```

- [ ] **Step 5: 扩展 DTO 构造和服务**

`apps/server/src/modules/restaurant/rules.ts` 的 `toRestaurantDto` 改为多接收一个 `extra` 参数：

```ts
export interface OverviewExtra {
  devices: DeviceSlotDto[];
  lastRound: RoundSummaryDto | null;
  weather: { id: number; name: string } | null;
  isPlanktonHost: boolean;
}

export function toRestaurantDto(
  r: RestaurantRow,
  tables: TableState[],
  effects: ActiveEffect[],
  config: GameConfig,
  extra: OverviewExtra,
): RestaurantDto {
```

返回对象里把 `tables: tables.map(...)` 改成 `tables: tables.map(tableDto),`（从 `./reads` 导入 `tableDto`），并在 `effects` 之前加：

```ts
    oilLevel: r.oil_level,
    state: r.state,
    stateReason: r.state_reason,
    promoOn: r.promo_on,
    cteOn: r.cte_on,
    cookfoodsFlag: r.cookfoods_flag,
    plaque2Open: r.plaque2_open,
    mainTaskStep: r.main_task_step,
    devices: extra.devices,
    lastRound: extra.lastRound,
    weather: extra.weather,
    isPlanktonHost: extra.isPlanktonHost,
```

`effects` 的 `name` 改成同 `buffsOf` 一样按来源类型取名（`device` 用设施名）。顶部补 `import type { DeviceSlotDto, RoundSummaryDto } from '@dt/shared';`。

`apps/server/src/modules/restaurant/service.ts`：
1. 签名改为 `export function createRestaurantService(d: RestaurantDeps, shards: ShardService, world: WorldService)`（导入 `WorldService`）。
2. `overview` 改为：

```ts
  async function overview(restId: number): Promise<RestaurantDto> {
    const row = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
    if (!row) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    const tables = await d.db
      .selectFrom('restaurant_tables')
      .select('tables')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    const now = d.now();
    const effects = await listActiveEffects(d.db, restId, now);
    const snap = await world.ensure(row.shard_id, now);
    return toRestaurantDto(row, tables.tables, effects, d.config, {
      devices: await deviceSlots(d.db, d.config, row, now),
      lastRound: await lastRound(d.db, restId),
      weather: { id: snap.weather.id, name: snap.weather.name },
      isPlanktonHost: snap.planktonRestId === restId,
    });
  }
```

3. 把 `create` 里从 `const name = rawName.trim();` 到事务结束（得到 `restId`）的代码搬进一个新函数 `open`，`create` 调用它：

```ts
  /** 开店（不碰会话）：HTTP 的 create 和模拟器共用 */
  async function open(accountId: number, shardId: number, rawName: string): Promise<number> {
    await shards.assertOpen(shardId);
    const settings = await shards.ensureFeature(shardId, 'restaurant');
    const existing = await d.db
      .selectFrom('restaurant')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('account_id', '=', accountId)
      .executeTakeFirst();
    if (existing) throw new AppError(ErrorCode.RESTAURANT_EXISTS, 409);
    const name = rawName.trim();
    const check = checkRestaurantName(name);
    if (check !== 'ok') throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: check });
    const defaults = settings.restaurant;
    const now = d.now();
    return d.db.transaction().execute(async (tx) => {
      let id: number;
      try {
        const row = await tx
          .insertInto('restaurant')
          .values(newRestaurantValues(shardId, accountId, name, defaults))
          .returning('id')
          .executeTakeFirstOrThrow();
        id = row.id;
      } catch (e) {
        const constraint = uniqueViolation(e);
        if (constraint === 'restaurant_shard_account') throw new AppError(ErrorCode.RESTAURANT_EXISTS, 409);
        if (constraint === 'restaurant_shard_name') throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
        throw e;
      }
      await tx
        .insertInto('restaurant_tables')
        .values({ rest_id: id, tables: JSON.stringify(initialTables(defaults.tableNum)) })
        .execute();
      await tx
        .insertInto('restaurant_cookbooks')
        .values({ rest_id: id, levels: emptyCookbookLevels(d.config.maxCookbookId) })
        .execute();
      for (const gift of defaults.giftGoods) await grantGoods(tx, d.config, id, gift.id, gift.num, now);
      await recordLedger(
        tx,
        defaults.giftGoods.map((g) => ({
          restId: id,
          kind: 'goods' as const,
          itemId: g.id,
          delta: g.num,
          source: 'restaurant.create',
        })),
        now,
      );
      await postNews(tx, { shardId, type: 'restaurant.open', restId: id, params: { name } }, now);
      await d.bus.emit(tx, { name: 'restaurant.created', shardId, restId: id });
      return id;
    });
  }
```

（事务体就是原来 `create` 里的代码，只是 `recordLedger`、`postNews` 多传了 `now`。）`create` 变为：

```ts
    async create(session: LoadedSession, rawName: string): Promise<RestaurantDto> {
      const { accountId, shardId } = session.data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      const restId = await open(accountId, shardId, rawName);
      // 区服和餐厅成对写回：期间其他标签页切了区服也不会配错
      await d.sessions.update(session.token, { shardId, restaurantId: restId });
      return overview(restId);
    },
```

4. 返回对象加上：

```ts
    open,
    async floor(restId: number): Promise<TableDto[]> {
      const r = await d.db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', restId).executeTakeFirstOrThrow();
      return r.tables.map(tableDto);
    },
    income: (restId: number, q: PageQuery) => incomePage(d.db, restId, q),
    buffs: (restId: number) => buffsOf(d.db, d.config, restId, d.now()),
    log: (restId: number, q: PageQuery) => logPage(d.db, restId, q),
```

`apps/server/src/modules/restaurant/routes.ts` 追加：

```ts
    r.get('/floor', async (req) => ok(await svc.floor(requireRestaurant(req).restaurantId)));
    r.get('/income', async (req) =>
      ok(await svc.income(requireRestaurant(req).restaurantId, parse(pageQuery, req.query))),
    );
    r.get('/buffs', async (req) => ok(await svc.buffs(requireRestaurant(req).restaurantId)));
    r.get('/log', async (req) => ok(await svc.log(requireRestaurant(req).restaurantId, parse(pageQuery, req.query))));
```

（从 `@dt/shared` 导入 `pageQuery`。）

`apps/server/src/game.ts`：把 `const world = createWorldService(deps);` 挪到创建 `restaurant` 之前，`restaurant: createRestaurantService(app, shards, world)`。

- [ ] **Step 6: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/restaurant`
Expected: PASS（原有开店测试中 `overview` 与 `create` 返回值相等的断言仍成立）

- [ ] **Step 7: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`
Expected: 全部 PASS。`apps/web` 若有用到 `TableDto` 的地方类型报错，只需适配新增的可选字段（不改行为）。

```bash
git add packages/shared apps/server apps/web
git commit -m "feat(restaurant): overview with devices/last round/weather, floor, income, buffs, personal log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 成长（一）——加点、加油、升星、油壶扩容

**Files:**
- Create: `packages/shared/src/schemas/growth.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/growth/rules.ts`
- Create: `apps/server/src/modules/growth/service.ts`
- Create: `apps/server/src/modules/growth/routes.ts`
- Modify: `apps/server/src/http/reply.ts`（`okOp`）
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`
- Test: `apps/server/src/modules/growth/growth.test.ts`

**Interfaces:**
- Consumes: `runOp`、`restCtxOf`、`setRest`、`restLog`、`opNews`、`spendCoin`、`gainOil`、`consumeGoods`、`grantAward`、`emitAction`、`normalizeCounts`、`notEnough`、`requirement`、`invalidState`、`GOODS`
- Produces:
  - DTO / schema：`allocateBody`、`toggleBody`、`cookfoodsBody`、`placeDeviceBody`、`slotBody`、`renameBody`、`moveBody`、`drivePlanktonBody`、`AwardDto`、`NeedCheckDto`、`StarNeedDto`、`OilNeedDto`、`AttrResultDto`
  - `starChecks(rest, counts, certs, need)`、`oilChecks(rest, have, need)`
  - `GrowthService`：`allocate(ctx, body)`、`refuel(ctx)`、`starNeed(ctx)`、`starUp(ctx)`、`oilNeed(ctx)`、`oilExpand(ctx)`（Task 15 继续加）；全部写操作返回 `OpResult<T>`
  - `okOp(r)`（`http/reply.ts`）
  - `Game.growth`；路由前缀 `/api/v1/growth`：`GET /star`、`GET /oil`、`POST /allocate`、`/refuel`、`/star-up`、`/oil-expand`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/growth.ts`：

```ts
import { z } from 'zod';

const points = z.number().int().min(0).max(10000);

export const allocateBody = z
  .object({ cook: points, cutting: points, fire: points })
  .refine((b) => b.cook + b.cutting + b.fire > 0, { message: 'empty' });
export const toggleBody = z.object({ on: z.boolean() });
export const cookfoodsBody = z.object({ flag: z.number().int().min(0).max(10) });
export const placeDeviceBody = z.object({ slot: z.number().int().min(1).max(20), goodsId: z.number().int().positive() });
export const slotBody = z.object({ slot: z.number().int().min(1).max(20) });
export const renameBody = z.object({ name: z.string().max(32) });
export const moveBody = z.object({ streetId: z.number().int().min(0).max(50) });
export const drivePlanktonBody = z.object({ way: z.enum(['strength', 'book']) });

/** 与配置里的 Award 结构相同（shared 不依赖 config） */
export interface AwardDto {
  coin?: number;
  exp?: number;
  diamond?: number;
  renown?: number;
  goods?: Array<{ id: number; num: number }>;
  foods?: Array<{ id: number; num: number }>;
}

export interface NeedCheckDto {
  key: 'level' | 'star' | 'cookbooks' | 'coin' | 'goods';
  id?: number;
  need: number;
  have: number;
  ok: boolean;
}

export interface StarNeedDto {
  star: number;
  nextStar: number | null;
  /** 下一星是否在当前版本开放（泛紫星级在子项目 5） */
  available: boolean;
  checks: NeedCheckDto[];
  award: AwardDto | null;
  ok: boolean;
}

export interface OilNeedDto {
  oilLevel: number;
  oilMax: number;
  nextLevel: number | null;
  nextOilMax: number | null;
  checks: NeedCheckDto[];
  ok: boolean;
}

export interface AttrResultDto {
  attrLeft: number;
  attrs: { cook: number; cutting: number; fire: number; season: number; creatives: number };
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/growth';`。

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/growth/growth.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 取 n 道食谱，全部 1 品级 */
const learned = (n: number) => Object.fromEntries(config.cookbookIndex.allIds.slice(0, n).map((id) => [id, 1]));

describe('加点（规格书 02 §2.3）', () => {
  it('只能加厨艺、刀工、火候，不超过剩余点数', async () => {
    const ctx = await newRestaurant(t, { patch: { attr_left: 3 } });
    const r = await t.game.growth.allocate(ctx, { cook: 2, cutting: 1, fire: 0 });
    expect(r.data).toMatchObject({ attrLeft: 0, attrs: { cook: 2, cutting: 1, fire: 0 } });
    await expect(t.game.growth.allocate(ctx, { cook: 1, cutting: 0, fire: 0 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'attrPoint', need: 1, have: 0 },
    });
  });
});

describe('加油（规格书 02 §2.5）', () => {
  it('1 银币 = 1 油，加满；停业的店恢复营业', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000, oil: 200, oil_max: 1000, state: 2, state_reason: 'no_oil' } });
    const r = await t.game.growth.refuel(ctx);
    expect(r.events).toEqual([
      { type: 'loss', kind: 'coin', num: 800 },
      { type: 'gain', kind: 'oil', num: 800 },
    ]);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 4200, oil: 1000, state: 1, state_reason: null });
  });
  it('油满了、银币不够时报错', async () => {
    const full = await newRestaurant(t, { patch: { oil: 1000, oil_max: 1000 } });
    await expect(t.game.growth.refuel(full)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const poor = await newRestaurant(t, { patch: { coin: 10, oil: 0, oil_max: 1000 } });
    await expect(t.game.growth.refuel(poor)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
  });
});

describe('升星（规格书 02 §2.4、20 §20.5）', () => {
  it('13 级、15 道食谱、1 张凭证 → 1 星，得到一星礼包', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13 }, cookbooks: learned(15), goods: { 86: 1 } });
    const need = await t.game.growth.starNeed(ctx);
    expect(need).toMatchObject({ star: 0, nextStar: 1, available: true, ok: true });
    await t.game.growth.starUp(ctx);
    expect((await restRow(t, ctx.restaurantId)).star_level).toBe(1);
    expect(await goodsNum(t, ctx.restaurantId, 86)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 117)).toBe(1);
    const news = await t.db.selectFrom('news').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(news.map((n) => n.type)).toContain('star.up');
  });

  it('等级不够、食谱不够、凭证不够分别报错', async () => {
    const low = await newRestaurant(t, { patch: { level: 12 }, cookbooks: learned(15), goods: { 86: 1 } });
    await expect(t.game.growth.starUp(low)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'level', need: 13, have: 12 },
    });
    const few = await newRestaurant(t, { patch: { level: 13 }, cookbooks: learned(14), goods: { 86: 1 } });
    await expect(t.game.growth.starUp(few)).rejects.toMatchObject({ params: { reason: 'cookbooks', need: 15, have: 14 } });
    const noCert = await newRestaurant(t, { patch: { level: 13 }, cookbooks: learned(15) });
    await expect(t.game.growth.starUp(noCert)).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'goods', id: 86 } });
  });

  it('七星之后的泛紫星级在当前版本不开放', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 110, star_level: 7 } });
    expect(await t.game.growth.starNeed(ctx)).toMatchObject({ nextStar: 8, available: false, ok: false });
    await expect(t.game.growth.starUp(ctx)).rejects.toMatchObject({ params: { reason: 'not_available' } });
  });
});

describe('油壶扩容（规格书 02 §2.5、20 §20.6）', () => {
  it('1 级：3 级餐厅、5000 银币、初级凭证 ×1 → 上限 1500', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 3, coin: 10000 }, goods: { 24: 1 } });
    await t.game.growth.oilExpand(ctx);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ oil_level: 1, oil_max: 1500, coin: 5000 });
    expect(await goodsNum(t, ctx.restaurantId, 24)).toBe(0);
  });
  it('条件列表', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 2, coin: 100 } });
    const need = await t.game.growth.oilNeed(ctx);
    expect(need).toMatchObject({ oilLevel: 0, nextLevel: 1, nextOilMax: 1500, ok: false });
    expect(need.checks).toEqual([
      { key: 'level', need: 3, have: 2, ok: false },
      { key: 'star', need: 0, have: 0, ok: true },
      { key: 'coin', need: 5000, have: 100, ok: false },
      { key: 'goods', id: 24, need: 1, have: 0, ok: false },
    ]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/growth`
Expected: FAIL，`t.game.growth` 为 undefined

- [ ] **Step 4: 实现**

`apps/server/src/modules/growth/rules.ts`：

```ts
import type { OilNeed, StarNeed } from '@dt/config';
import type { NeedCheckDto } from '@dt/shared';
import type { CookbookCounts } from '../../db/schema';

export function starChecks(
  rest: { level: number },
  counts: CookbookCounts,
  certs: number,
  need: StarNeed,
): NeedCheckDto[] {
  return [
    { key: 'level', need: need.needLevel, have: rest.level, ok: rest.level >= need.needLevel },
    { key: 'cookbooks', need: need.needCookbooks, have: counts.learned, ok: counts.learned >= need.needCookbooks },
    { key: 'goods', id: 86, need: need.needCerts, have: certs, ok: certs >= need.needCerts },
  ];
}

export function oilChecks(
  rest: { level: number; star_level: number; coin: number },
  have: (goodsId: number) => number,
  need: OilNeed,
): NeedCheckDto[] {
  const checks: NeedCheckDto[] = [
    { key: 'level', need: need.needLevel, have: rest.level, ok: rest.level >= need.needLevel },
    { key: 'star', need: need.needStar, have: rest.star_level, ok: rest.star_level >= need.needStar },
    { key: 'coin', need: need.needCoin, have: rest.coin, ok: rest.coin >= need.needCoin },
  ];
  for (const g of need.needGoods) {
    const h = have(g.id);
    checks.push({ key: 'goods', id: g.id, need: g.num, have: h, ok: h >= g.num });
  }
  if (need.needPurpleShells > 0) {
    const h = have(610);
    checks.push({ key: 'goods', id: 610, need: need.needPurpleShells, have: h, ok: h >= need.needPurpleShells });
  }
  return checks;
}
```

`apps/server/src/modules/growth/service.ts`：

```ts
import { GOODS } from '@dt/config';
import type { AttrResultDto, OilNeedDto, StarNeedDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { opNews, restLog, runOp, setRest, type Op, type OpResult } from '../../core/op';
import { gainOil, spendCoin } from '../../core/resources';
import type { RestaurantRow } from '../../db/schema';
import { grantAward } from '../award/award';
import { normalizeCounts } from '../settlement/globals';
import { consumeGoods } from '../store/goods';
import type { WorldService } from '../world/service';
import { oilChecks, starChecks } from './rules';

export function createGrowthService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (op: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'growth', source }, fn);

  async function readRest(restId: number): Promise<RestaurantRow> {
    return d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow();
  }
  async function goodsHave(restId: number): Promise<(id: number) => number> {
    const rows = await d.db.selectFrom('store_item').select(['goods_id', 'num']).where('rest_id', '=', restId).execute();
    const m = new Map(rows.map((r) => [r.goods_id, r.num]));
    return (id) => m.get(id) ?? 0;
  }
  const attrs = (r: RestaurantRow): AttrResultDto => ({
    attrLeft: r.attr_left,
    attrs: {
      cook: r.attr_cook,
      cutting: r.attr_cutting,
      fire: r.attr_fire,
      season: r.attr_season,
      creatives: r.attr_creatives,
    },
  });

  return {
    world,

    allocate(ctx: RestCtx, b: { cook: number; cutting: number; fire: number }) {
      return op(ctx, 'attr.allocate', async (o) => {
        const sum = b.cook + b.cutting + b.fire;
        if (sum > o.rest.attr_left) throw notEnough('attrPoint', sum, o.rest.attr_left);
        setRest(o, 'attr_cook', o.rest.attr_cook + b.cook);
        setRest(o, 'attr_cutting', o.rest.attr_cutting + b.cutting);
        setRest(o, 'attr_fire', o.rest.attr_fire + b.fire);
        setRest(o, 'attr_left', o.rest.attr_left - sum);
        await emitAction(o, 'attr.allocate');
        return attrs(o.rest);
      });
    },

    refuel(ctx: RestCtx) {
      return op(ctx, 'oil.fill', async (o) => {
        const need = o.rest.oil_max - o.rest.oil;
        if (need <= 0) throw invalidState('oil_full');
        spendCoin(o, need);
        gainOil(o, need);
        if (o.rest.state === 2) {
          setRest(o, 'state', 1);
          setRest(o, 'state_reason', null);
          restLog(o, 'rest.reopen');
        }
        await emitAction(o, 'oil.fill');
        return { oil: o.rest.oil };
      });
    },

    async starNeed(ctx: RestCtx): Promise<StarNeedDto> {
      const r = await readRest(ctx.restaurantId);
      const next = r.star_level + 1;
      const need = d.config.starNeed.get(next);
      if (!need) return { star: r.star_level, nextStar: null, available: false, checks: [], award: null, ok: false };
      const available = need.cookbooksKind === 'learned';
      const have = await goodsHave(r.id);
      const checks = starChecks(r, normalizeCounts(r.cookbook_counts), have(GOODS.starCert), need);
      return {
        star: r.star_level,
        nextStar: next,
        available,
        checks,
        award: d.config.starAward.get(next) ?? null,
        ok: available && checks.every((c) => c.ok),
      };
    },

    starUp(ctx: RestCtx) {
      return op(ctx, 'star.up', async (o) => {
        const next = o.rest.star_level + 1;
        const need = o.config.starNeed.get(next);
        if (!need) throw invalidState('max_star');
        if (need.cookbooksKind !== 'learned') throw requirement('not_available', { star: next });
        if (o.rest.level < need.needLevel) throw requirement('level', { need: need.needLevel, have: o.rest.level });
        const counts = normalizeCounts(o.rest.cookbook_counts);
        if (counts.learned < need.needCookbooks)
          throw requirement('cookbooks', { need: need.needCookbooks, have: counts.learned });
        await consumeGoods(o, GOODS.starCert, need.needCerts);
        setRest(o, 'star_level', next);
        const award = o.config.starAward.get(next);
        if (award) await grantAward(o, award);
        restLog(o, 'star.up', { star: next });
        opNews(o, 'star.up', { star: next, name: o.rest.name });
        return { star: next };
      });
    },

    async oilNeed(ctx: RestCtx): Promise<OilNeedDto> {
      const r = await readRest(ctx.restaurantId);
      const need = d.config.oilNeed.get(r.oil_level + 1);
      if (!need) {
        return { oilLevel: r.oil_level, oilMax: r.oil_max, nextLevel: null, nextOilMax: null, checks: [], ok: false };
      }
      const checks = oilChecks(r, await goodsHave(r.id), need);
      return {
        oilLevel: r.oil_level,
        oilMax: r.oil_max,
        nextLevel: need.level,
        nextOilMax: need.oilMax,
        checks,
        ok: checks.every((c) => c.ok),
      };
    },

    oilExpand(ctx: RestCtx) {
      return op(ctx, 'oil.expand', async (o) => {
        const need = o.config.oilNeed.get(o.rest.oil_level + 1);
        if (!need) throw invalidState('max_oil');
        if (o.rest.level < need.needLevel) throw requirement('level', { need: need.needLevel, have: o.rest.level });
        if (o.rest.star_level < need.needStar)
          throw requirement('star', { need: need.needStar, have: o.rest.star_level });
        for (const g of need.needGoods) await consumeGoods(o, g.id, g.num);
        if (need.needPurpleShells > 0) await consumeGoods(o, GOODS.purpleShell, need.needPurpleShells);
        spendCoin(o, need.needCoin);
        setRest(o, 'oil_level', need.level);
        setRest(o, 'oil_max', need.oilMax);
        restLog(o, 'oil.expand', { level: need.level, oilMax: need.oilMax });
        opNews(o, 'oil.expand', { level: need.level, name: o.rest.name });
        return { oilLevel: need.level, oilMax: need.oilMax };
      });
    },
  };
}

export type GrowthService = ReturnType<typeof createGrowthService>;
```

`apps/server/src/http/reply.ts` 末尾追加（写操作的路由统一用它把 `OpResult` 转成响应，后续模块都用）：

```ts
/** 写操作：把服务返回的 { data, events } 转成响应 */
export function okOp<T>(r: { data: T; events: GameEvent[] }): OkResponse<T> {
  return ok(r.data, r.events);
}
```

`apps/server/src/modules/growth/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { allocateBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { GrowthService } from './service';

export function growthRoutes(svc: GrowthService): FastifyPluginAsync {
  return async (r) => {
    r.get('/star', async (req) => ok(await svc.starNeed(restCtxOf(req))));
    r.get('/oil', async (req) => ok(await svc.oilNeed(restCtxOf(req))));
    r.post('/allocate', async (req) => okOp(await svc.allocate(restCtxOf(req), parse(allocateBody, req.body))));
    r.post('/refuel', async (req) => okOp(await svc.refuel(restCtxOf(req))));
    r.post('/star-up', async (req) => okOp(await svc.starUp(restCtxOf(req))));
    r.post('/oil-expand', async (req) => okOp(await svc.oilExpand(restCtxOf(req))));
  };
}
```

`apps/server/src/game.ts`：导入 `createGrowthService`、`GrowthService`；`Game` 加 `growth: GrowthService`；`createGame` 里 `const growth = createGrowthService(deps, world);` 并放进返回对象。

`apps/server/src/modules/index.ts`：`app.register(growthRoutes(game.growth), { prefix: '/api/v1/growth' });`

- [ ] **Step 5: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/growth`
Expected: PASS

- [ ] **Step 6: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(growth): allocate points, refuel, star-up, oil expansion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: 成长（二）——设施、第二牌匾位、改名、搬家、开关、赶走 NPC

**Files:**
- Modify: `packages/shared/src/schemas/growth.ts`（`DeviceOptionsDto`）
- Create: `apps/server/src/modules/growth/devices.ts`
- Modify: `apps/server/src/modules/growth/service.ts`
- Modify: `apps/server/src/modules/growth/routes.ts`
- Test: `apps/server/src/modules/growth/growth2.test.ts`

**Interfaces:**
- Consumes: `deviceHours`、`slotUnlocked`、`deviceSlots`、`countGoods`、`consumeGoods`、`hasValidHonor`、`removeHonor`、`grantGoodsOp`、`upsertEffectSource`、`removeEffectSource`、`opAgg`、`opLuck`、`invalidateAgg`、`spendCoin/spendDiamond/spendStrength/gainRenown/gainExp`、`WorldService.ensure/setPlankton`、`checkRestaurantName`、`uniqueViolation`
- Produces:
  - `placeDevice(op, slot, goodsId)`、`removeDevice(op, slot)`
  - `GrowthService` 新增：`devices(ctx): DeviceOptionsDto`、`placeDevice(ctx, body)`、`removeDevice(ctx, body)`、`openPlaque2(ctx)`、`rename(ctx, name)`、`move(ctx, streetId)`、`setPromo(ctx, on)`、`setCookfoods(ctx, flag)`、`setCte(ctx, on)`、`drivePlankton(ctx, way)`、`driveKrab(ctx)`
  - 路由：`GET /devices`；`POST /device/place`、`/device/remove`、`/plaque2`、`/rename`、`/move`、`/promo`、`/cookfoods`、`/cte`、`/plankton/drive`、`/krab/drive`

- [ ] **Step 1: 共享 DTO**

`packages/shared/src/schemas/growth.ts` 末尾追加：

```ts
import type { DeviceSlotDto } from './restaurant';

export interface DeviceOptionsDto {
  slots: DeviceSlotDto[];
  /** 仓库里可以摆放的设施道具 */
  store: Array<{ goodsId: number; num: number; deviceType: number }>;
}
```

（`import type` 放到文件顶部。）

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/growth/growth2.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { listActiveEffects } from '../effects/service';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const g = () => t.game.growth;
const grant = (restId: number, goodsId: number) => grantGoods(t.db, config, restId, goodsId, 1, t.clock.now);

describe('设施（规格书 02 §2.6）', () => {
  it('摆放海报：消耗 1 个，按时长计时，加成生效', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 2 } });
    t.clock.set(new Date('2026-09-30T00:00:00Z'));
    const r = await g().placeDevice(ctx, { slot: 1, goodsId: 13 });
    expect(r.data.expiresAt).toBe('2026-10-01T00:00:00.000Z');
    expect(await goodsNum(t, ctx.restaurantId, 13)).toBe(1);
    const effects = await listActiveEffects(t.db, ctx.restaurantId, t.clock.now);
    expect(effects).toContainEqual(expect.objectContaining({ sourceType: 'device', sourceId: 1, effects: { coinValue: 2 } }));
    t.clock.set(new Date());
  });

  it('荣誉延长设施时长（幻紫沙漏 +15%）', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 1 } });
    await grant(ctx.restaurantId, 422);
    t.clock.set(new Date('2026-09-30T00:00:00Z'));
    const r = await g().placeDevice(ctx, { slot: 1, goodsId: 13 });
    expect(new Date(r.data.expiresAt!).getTime() - t.clock.now.getTime()).toBe(Math.round(24 * 1.15 * 3600_000));
    t.clock.set(new Date());
  });

  it('类型不对、设施位未开放时报错', async () => {
    const ctx = await newRestaurant(t, { goods: { 10: 1, 16: 1 } });
    await expect(g().placeDevice(ctx, { slot: 1, goodsId: 10 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'wrong_device' },
    });
    await expect(g().placeDevice(ctx, { slot: 4, goodsId: 16 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'slot_locked' },
    });
  });

  it('牌匾不消耗、永久；同一块牌匾不能摆两个位置；第二牌匾位要先开通', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 3, coin: 20_000_000, diamond: 200 },
      goods: { 88: 1 },
    });
    const r = await g().placeDevice(ctx, { slot: 6, goodsId: 88 });
    expect(r.data.expiresAt).toBeNull();
    expect(await goodsNum(t, ctx.restaurantId, 88)).toBe(1);
    await expect(g().placeDevice(ctx, { slot: 7, goodsId: 88 })).rejects.toMatchObject({
      params: { reason: 'slot_locked' },
    });
    await g().openPlaque2(ctx);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ plaque2_open: true, coin: 5_000_000, diamond: 12 });
    await expect(g().placeDevice(ctx, { slot: 7, goodsId: 88 })).rejects.toMatchObject({
      params: { reason: 'plaque_in_use' },
    });
    await expect(g().openPlaque2(ctx)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('撤下设施：加成消失', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 1 } });
    await g().placeDevice(ctx, { slot: 1, goodsId: 13 });
    await g().removeDevice(ctx, { slot: 1 });
    const effects = await listActiveEffects(t.db, ctx.restaurantId, new Date());
    expect(effects.some((e) => e.sourceType === 'device')).toBe(false);
  });

  it('设施选项：设施位 + 仓库里的设施道具', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 2, 86: 1 } });
    const d = await g().devices(ctx);
    expect(d.slots).toHaveLength(9);
    expect(d.store).toEqual([{ goodsId: 13, num: 2, deviceType: 1 }]);
  });
});

describe('改名（规格书 02 §2.8）', () => {
  it('消耗改名卡，发新闻', async () => {
    const ctx = await newRestaurant(t, { goods: { 53: 1 } });
    await g().rename(ctx, '新名字小馆');
    expect((await restRow(t, ctx.restaurantId)).name).toBe('新名字小馆');
    expect(await goodsNum(t, ctx.restaurantId, 53)).toBe(0);
  });
  it('重名：报错且改名卡不扣', async () => {
    const shard = await newRestaurant(t, { goods: { 53: 1 } });
    const other = await newRestaurant(t, { shardId: shard.shardId });
    const otherName = (await restRow(t, other.restaurantId)).name;
    await expect(g().rename(shard, otherName)).rejects.toMatchObject({ code: 'RESTAURANT_NAME_TAKEN' });
    expect(await goodsNum(t, shard.restaurantId, 53)).toBe(1);
  });
  it('只能中英文数字，最多 9 个字', async () => {
    const ctx = await newRestaurant(t, { goods: { 53: 1 } });
    await expect(g().rename(ctx, '好 名字')).rejects.toMatchObject({
      code: 'RESTAURANT_NAME_INVALID',
      params: { reason: 'bad_chars' },
    });
    await expect(g().rename(ctx, '一二三四五六七八九十')).rejects.toMatchObject({
      params: { reason: 'too_long' },
    });
  });
});

describe('搬家（规格书 02 §2.8）', () => {
  it('消耗搬家卡和 桌数×餐桌价/2 银币，换街道勋章', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, goods: { 2: 1 } });
    await grant(ctx.restaurantId, 140);
    await g().move(ctx, 11);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.street_id).toBe(11);
    // 新手街勋章带 36 幸运，有一定概率半价
    expect([100000 - 4 * 2500, 100000 - 2 * 2500]).toContain(r.coin);
    expect(await goodsNum(t, ctx.restaurantId, 140)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 187)).toBe(1);
    const effects = await listActiveEffects(t.db, ctx.restaurantId, new Date());
    expect(effects.filter((e) => e.sourceType === 'street').map((e) => e.sourceId)).toEqual([187]);
  });
  it('持有搬家处工作证时不消耗搬家卡', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 } });
    await grant(ctx.restaurantId, 140);
    await grant(ctx.restaurantId, 111);
    await g().move(ctx, 3);
    expect((await restRow(t, ctx.restaurantId)).street_id).toBe(3);
  });
  it('不能搬到新手街或原街道', async () => {
    const ctx = await newRestaurant(t, { goods: { 2: 1 } });
    await expect(g().move(ctx, 0)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('开关', () => {
  it('大促：开启得到八折促销勋章，关闭收回', async () => {
    const ctx = await newRestaurant(t);
    await g().setPromo(ctx, true);
    expect(await goodsNum(t, ctx.restaurantId, 106)).toBe(1);
    await g().setPromo(ctx, false);
    expect(await goodsNum(t, ctx.restaurantId, 106)).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).promo_on).toBe(false);
  });
  it('挑剔消耗食材：6 星才能开，最多 5 档', async () => {
    const five = await newRestaurant(t, { patch: { star_level: 5 } });
    await expect(g().setCookfoods(five, 1)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    const six = await newRestaurant(t, { patch: { star_level: 6 } });
    await g().setCookfoods(six, 2);
    expect((await restRow(t, six.restaurantId)).cookfoods_flag).toBe(2);
    await expect(g().setCookfoods(six, 6)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('银币转经验：需要阿波罗雕像', async () => {
    const ctx = await newRestaurant(t);
    await expect(g().setCte(ctx, true)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await grant(ctx.restaurantId, 438);
    await g().setCte(ctx, true);
    expect((await restRow(t, ctx.restaurantId)).cte_on).toBe(true);
  });
});

describe('赶走 NPC（规格书 02 §2.8）', () => {
  it('赶走痞老板（体力）：得声望和经验，痞老板离开小镇、桌子清空、勋章收回', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: no === 1 ? 7 : 0 }));
    const ctx = await newRestaurant(t, { patch: { level: 16, strength: 100, renown: 10 }, tables });
    await t.game.world.ensure(ctx.shardId);
    await t.game.world.setPlankton(t.db, ctx.shardId, ctx.restaurantId);
    await grant(ctx.restaurantId, 363);
    await g().drivePlankton(ctx, 'strength');
    const r = await restRow(t, ctx.restaurantId);
    // 声望 = ⌊√16⌋×10 = 40，经验 = 40×300
    expect(r).toMatchObject({ strength: 20, renown: 50, level: 16, exp: 12000 });
    expect((await t.game.world.ensure(ctx.shardId)).planktonRestId).toBeNull();
    expect(await goodsNum(t, ctx.restaurantId, 363)).toBe(0);
    const tr = await t.db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
    expect(tr.tables.map((x) => x.customer)).toEqual([0, 0, 0, 0]);
  });
  it('不是驻留店不能赶', async () => {
    const ctx = await newRestaurant(t);
    await expect(g().drivePlankton(ctx, 'strength')).rejects.toMatchObject({ params: { reason: 'not_plankton_host' } });
  });
  it('赶走生气的蟹老板：需要纪念碑，50 体力', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 60 } });
    await grant(ctx.restaurantId, 134);
    await expect(g().driveKrab(ctx)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await grant(ctx.restaurantId, 439);
    await g().driveKrab(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 134)).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(10);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/growth/growth2.test.ts`
Expected: FAIL，`placeDevice` 不是函数

- [ ] **Step 4: 实现设施**

`apps/server/src/modules/growth/devices.ts`：

```ts
import { deviceHours, DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import { emitAction } from '../../core/action';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { invalidateAgg, opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { removeEffectSource, upsertEffectSource } from '../effects/service';
import { slotUnlocked } from '../restaurant/reads';
import { consumeGoods, countGoods } from '../store/goods';

/** 摆放设施（规格书 02 §2.6）：设施消耗 1 个并按时长计时（× 荣誉延时），牌匾不消耗且永久；可以直接替换旧设施 */
export async function placeDevice(
  op: Op,
  slot: number,
  goodsId: number,
): Promise<{ slot: number; goodsId: number; expiresAt: string | null }> {
  const dev = op.config.devices.get(slot);
  if (!dev) throw invalidState('no_slot', { slot });
  if (!slotUnlocked(dev, op.rest)) throw requirement('slot_locked', { slot, needStar: dev.needStar });
  const g = op.config.requireGoods(goodsId);
  if (g.type !== GOODS_TYPE.device || g.deviceType !== dev.deviceType)
    throw invalidState('wrong_device', { slot, goodsId });
  if (g.deviceType === DEVICE_TYPE.plaque) {
    if ((await countGoods(op, goodsId)) < 1) throw notEnough('goods', 1, 0, goodsId);
    const other = await op.tx
      .selectFrom('restaurant_device')
      .select('slot')
      .where('rest_id', '=', op.rest.id)
      .where('goods_id', '=', goodsId)
      .where('slot', '!=', slot)
      .executeTakeFirst();
    if (other) throw invalidState('plaque_in_use', { slot: other.slot });
  } else {
    await consumeGoods(op, goodsId, 1);
  }
  const hours = deviceHours(g);
  const agg = await opAgg(op);
  const expiresAt =
    hours === null
      ? null
      : new Date(op.now.getTime() + Math.round(hours * (1 + (agg.extendTimeRate ?? 0)) * 3600_000));
  await op.tx
    .insertInto('restaurant_device')
    .values({ rest_id: op.rest.id, slot, goods_id: goodsId, placed_at: op.now, expires_at: expiresAt })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'slot']).doUpdateSet({ goods_id: goodsId, placed_at: op.now, expires_at: expiresAt }),
    )
    .execute();
  const { time: _time, ...effects } = g.effects;
  await upsertEffectSource(op.tx, op.rest.id, { sourceType: 'device', sourceId: slot, effects, expiresAt });
  invalidateAgg(op);
  restLog(op, 'device.place', { slot, goodsId });
  await emitAction(op, 'device.place');
  return { slot, goodsId, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}

/** 撤下设施：设施不退还（牌匾本来就不消耗） */
export async function removeDevice(op: Op, slot: number): Promise<{ slot: number }> {
  await op.tx.deleteFrom('restaurant_device').where('rest_id', '=', op.rest.id).where('slot', '=', slot).execute();
  await removeEffectSource(op.tx, op.rest.id, 'device', slot);
  invalidateAgg(op);
  return { slot };
}
```

- [ ] **Step 5: 扩展服务**

`apps/server/src/modules/growth/service.ts`：

1. 补充导入：

```ts
import { GOODS, GOODS_TYPE } from '@dt/config';
import { checkRestaurantName, ErrorCode, type DeviceOptionsDto } from '@dt/shared';
import { opLuck } from '../../core/luck';
import { gainExp, gainRenown, spendDiamond, spendStrength } from '../../core/resources';
import { uniqueViolation } from '../../db/errors';
import { AppError } from '../../http/errors';
import { deviceSlots } from '../restaurant/reads';
import { grantGoodsOp, hasValidHonor, removeHonor } from '../store/goods';
import { placeDevice, removeDevice } from './devices';
```

（与已有导入合并：`gainOil, spendCoin` 那一行改成 `gainExp, gainOil, gainRenown, spendCoin, spendDiamond, spendStrength`；`consumeGoods` 那一行改成 `consumeGoods, grantGoodsOp, hasValidHonor, removeHonor`。）

2. 在 `createGrowthService` 外面加：

```ts
const NAME_CHARS = /^[\p{Script=Han}A-Za-z0-9]+$/u;
```

3. 返回对象里追加：

```ts
    async devices(ctx: RestCtx): Promise<DeviceOptionsDto> {
      const r = await readRest(ctx.restaurantId);
      const rows = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', r.id)
        .where('num', '>', 0)
        .orderBy('goods_id')
        .execute();
      const store = rows
        .map((x) => ({ goodsId: x.goods_id, num: x.num, g: d.config.goods.get(x.goods_id) }))
        .filter((x) => x.g?.type === GOODS_TYPE.device && x.g.deviceType !== null)
        .map((x) => ({ goodsId: x.goodsId, num: x.num, deviceType: x.g!.deviceType! }));
      return { slots: await deviceSlots(d.db, d.config, r, d.now()), store };
    },

    placeDevice(ctx: RestCtx, b: { slot: number; goodsId: number }) {
      return op(ctx, 'device.place', (o) => placeDevice(o, b.slot, b.goodsId));
    },

    removeDevice(ctx: RestCtx, b: { slot: number }) {
      return op(ctx, 'device.remove', (o) => removeDevice(o, b.slot));
    },

    openPlaque2(ctx: RestCtx) {
      return op(ctx, 'plaque2.open', async (o) => {
        const t = o.tuning.growth;
        if (o.rest.plaque2_open) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        if (o.rest.star_level < t.plaque2Star)
          throw requirement('star', { need: t.plaque2Star, have: o.rest.star_level });
        spendCoin(o, t.plaque2Coin);
        spendDiamond(o, t.plaque2Diamond);
        setRest(o, 'plaque2_open', true);
        return { plaque2Open: true };
      });
    },

    rename(ctx: RestCtx, rawName: string) {
      return op(ctx, 'rest.rename', async (o) => {
        const name = rawName.trim();
        const check = checkRestaurantName(name);
        if (check !== 'ok') throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: check });
        if (!NAME_CHARS.test(name)) throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: 'bad_chars' });
        if ([...name].length > o.tuning.growth.renameMaxLength)
          throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: 'too_long' });
        if (name === o.rest.name) throw invalidState('same_name');
        await consumeGoods(o, GOODS.renameCard, 1);
        // 上周被放蟑螂数：子项目 3 接入前为 0（设计文档 裁定 8）
        const roaches = 0;
        spendCoin(o, roaches * o.tuning.growth.renameCoinPerRoach * o.rest.level * (o.rest.star_level + 1));
        try {
          await o.tx.updateTable('restaurant').set({ name }).where('id', '=', o.rest.id).execute();
        } catch (e) {
          if (uniqueViolation(e) === 'restaurant_shard_name')
            throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
          throw e;
        }
        const from = o.rest.name;
        o.rest.name = name;
        restLog(o, 'rest.rename', { from, to: name });
        opNews(o, 'rest.rename', { from, to: name });
        return { name };
      });
    },

    move(ctx: RestCtx, streetId: number) {
      return op(ctx, 'rest.move', async (o) => {
        if (streetId === 0 || !o.config.streets.has(streetId) || streetId === o.rest.street_id)
          throw invalidState('bad_street', { streetId });
        if (!(await hasValidHonor(o, GOODS.moveJobHonor))) await consumeGoods(o, GOODS.moveCard, 1);
        const tr = await o.tx
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirstOrThrow();
        let cost = Math.floor(tr.tables.length * (o.config.requireGoods(GOODS.tableA).coin / 2));
        const { rate } = await opLuck(o);
        if (o.rng.chance(rate)) cost = Math.floor(cost / 2);
        spendCoin(o, cost);
        await removeHonor(o, o.config.streetMedalId(o.rest.street_id));
        await grantGoodsOp(o, o.config.streetMedalId(streetId), 1);
        const from = o.rest.street_id;
        setRest(o, 'street_id', streetId);
        restLog(o, 'rest.move', { from, to: streetId });
        opNews(o, 'rest.move', { from, to: streetId, name: o.rest.name });
        return { streetId };
      });
    },

    setPromo(ctx: RestCtx, on: boolean) {
      return op(ctx, 'rest.promo', async (o) => {
        if (on === o.rest.promo_on) throw invalidState(on ? 'already_on' : 'already_off');
        if (on) await grantGoodsOp(o, GOODS.promoHonor, 1);
        else await removeHonor(o, GOODS.promoHonor);
        setRest(o, 'promo_on', on);
        return { on };
      });
    },

    setCookfoods(ctx: RestCtx, flag: number) {
      return op(ctx, 'rest.cookfoods', async (o) => {
        if (flag > 0 && o.rest.star_level < o.tuning.growth.cookfoodsMinStar)
          throw requirement('star', { need: o.tuning.growth.cookfoodsMinStar, have: o.rest.star_level });
        if (flag > o.tuning.settlement.cookfoodsMaxFlag) throw invalidState('flag', { max: o.tuning.settlement.cookfoodsMaxFlag });
        setRest(o, 'cookfoods_flag', flag);
        return { flag };
      });
    },

    setCte(ctx: RestCtx, on: boolean) {
      return op(ctx, 'rest.cte', async (o) => {
        if (on && !(await hasValidHonor(o, GOODS.apolloStatue)))
          throw requirement('statue', { goodsId: GOODS.apolloStatue });
        setRest(o, 'cte_on', on);
        return { on };
      });
    },

    drivePlankton(ctx: RestCtx, way: 'strength' | 'book') {
      return op(ctx, 'plankton.drive', async (o) => {
        const snap = await world.ensure(o.shardId, o.now);
        if (snap.planktonRestId !== o.rest.id) throw invalidState('not_plankton_host');
        const t = o.tuning.growth;
        const renown = Math.floor(Math.sqrt(o.rest.level)) * t.drivePlanktonRenownPerSqrt;
        if (way === 'strength') {
          spendStrength(o, t.drivePlanktonStrength);
          gainRenown(o, renown);
          gainExp(o, renown * t.drivePlanktonExpPerRenown);
        } else {
          await consumeGoods(o, GOODS.krabburgerBook, 1);
          gainRenown(o, renown);
          gainExp(o, renown * t.drivePlanktonBookExpPerRenown);
          await grantGoodsOp(o, GOODS.starBlessing, 1);
        }
        await world.setPlankton(o.tx, o.shardId, null, o.rest.id);
        const tr = await o.tx
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirstOrThrow();
        const tables = tr.tables.map((x) => (x.customer === 7 ? { ...x, customer: 0 } : x));
        await o.tx
          .updateTable('restaurant_tables')
          .set({ tables: JSON.stringify(tables) })
          .where('rest_id', '=', o.rest.id)
          .execute();
        await removeHonor(o, GOODS.plankton);
        restLog(o, 'plankton.driven', { way, renown });
        opNews(o, 'plankton.driven', { way, name: o.rest.name });
        return { renown };
      });
    },

    driveKrab(ctx: RestCtx) {
      return op(ctx, 'krab.drive', async (o) => {
        if (!(await hasValidHonor(o, GOODS.armStatue))) throw requirement('statue', { goodsId: GOODS.armStatue });
        if (!(await hasValidHonor(o, GOODS.krabAngry))) throw invalidState('no_angry_krab');
        spendStrength(o, o.tuning.growth.driveKrabStrength);
        await removeHonor(o, GOODS.krabAngry);
        restLog(o, 'krab.driven');
        return { ok: true };
      });
    },
```

- [ ] **Step 6: 路由**

`apps/server/src/modules/growth/routes.ts` 的导入补上 `cookfoodsBody, drivePlanktonBody, moveBody, placeDeviceBody, renameBody, slotBody, toggleBody`，并追加：

```ts
    r.get('/devices', async (req) => ok(await svc.devices(restCtxOf(req))));
    r.post('/device/place', async (req) =>
      okOp(await svc.placeDevice(restCtxOf(req), parse(placeDeviceBody, req.body))),
    );
    r.post('/device/remove', async (req) => okOp(await svc.removeDevice(restCtxOf(req), parse(slotBody, req.body))));
    r.post('/plaque2', async (req) => okOp(await svc.openPlaque2(restCtxOf(req))));
    r.post('/rename', async (req) => okOp(await svc.rename(restCtxOf(req), parse(renameBody, req.body).name)));
    r.post('/move', async (req) => okOp(await svc.move(restCtxOf(req), parse(moveBody, req.body).streetId)));
    r.post('/promo', async (req) => okOp(await svc.setPromo(restCtxOf(req), parse(toggleBody, req.body).on)));
    r.post('/cookfoods', async (req) =>
      okOp(await svc.setCookfoods(restCtxOf(req), parse(cookfoodsBody, req.body).flag)),
    );
    r.post('/cte', async (req) => okOp(await svc.setCte(restCtxOf(req), parse(toggleBody, req.body).on)));
    r.post('/plankton/drive', async (req) =>
      okOp(await svc.drivePlankton(restCtxOf(req), parse(drivePlanktonBody, req.body).way)),
    );
    r.post('/krab/drive', async (req) => okOp(await svc.driveKrab(restCtxOf(req))));
```

- [ ] **Step 7: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/growth`
Expected: PASS

- [ ] **Step 8: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(growth): devices, second plaque slot, rename, move, toggles, driving off NPCs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: 食谱——学习升级、列表、详情、食材需求

**Files:**
- Create: `packages/shared/src/schemas/cookbook.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/cookbook/rules.ts`
- Test: `apps/server/src/modules/cookbook/rules.test.ts`
- Create: `apps/server/src/modules/cookbook/service.ts`
- Create: `apps/server/src/modules/cookbook/routes.ts`
- Test: `apps/server/src/modules/cookbook/cookbook.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `runOp`、`setRest`、`emitAction`、`foodsMap`、`subFoods`、`normalizeCounts`、`notEnough`、`invalidState`、`FOODS`
- Produces:
  - schema / DTO：`cookbookListQuery`、`cookbookIdParam`、`learnBody`、`foodsNeedQuery`、`LearnType`、`NeedFoodDto`、`CookbookRowDto`、`CookbookListDto`、`CookbookDetailDto`、`FoodsNeedDto`、`LearnResultDto`
  - `mergeNeed`、`planLearn(need, have, level): LearnPlan`、`learnTypeOf(plan)`、`applyLearn(counts, streetId, from, to)`、`streetTargetGrade(levels, ids, max)`、`foodsNeedFor(ids, levels, target, needOf)`
  - `CookbookService`：`list(ctx, q)`、`detail(ctx, id)`、`foodsNeed(ctx, q)`、`learn(ctx, cookbookId)`；`Game.cookbook`
  - 路由 `/api/v1/cookbook`：`GET /list`、`GET /detail/:id`、`GET /foods-need`、`POST /learn`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/cookbook.ts`：

```ts
import { z } from 'zod';

export const cookbookListQuery = z.object({
  street: z.coerce.number().int().min(0).max(50),
  page: z.coerce.number().int().min(1).default(1),
  filter: z.enum(['all', 'learnable', 'unlearned', 'learned']).default('all'),
});
export type CookbookListQuery = z.infer<typeof cookbookListQuery>;

export const cookbookIdParam = z.object({ id: z.coerce.number().int().positive() });
export const learnBody = z.object({ cookbookId: z.number().int().positive() });

export const foodsNeedQuery = z.object({
  street: z.coerce.number().int().min(0).max(50).optional(),
  target: z.coerce.number().int().min(1).max(10),
  foodLevel: z.coerce.number().int().min(1).max(9).optional(),
});
export type FoodsNeedQuery = z.infer<typeof foodsNeedQuery>;

/** 学习类型（规格书 03 §3.7）：'0' 可以直接学；'1'~'5' 需要该级万能食材补一种；'z' 不能学；'max' 已是最高品级 */
export type LearnType = 'max' | 'z' | '0' | '1' | '2' | '3' | '4' | '5';

export interface NeedFoodDto {
  foodsId: number;
  num: number;
  have: number;
}

export interface CookbookRowDto {
  id: number;
  name: string;
  grade: number;
  next: NeedFoodDto[] | null;
  learn: LearnType;
}

export interface CookbookListDto {
  street: number;
  page: number;
  pageSize: number;
  total: number;
  items: CookbookRowDto[];
  learned: number;
  streetLearned: number;
  streetTotal: number;
  gradeCounts: number[];
}

export interface CookbookDetailDto {
  id: number;
  name: string;
  streetId: number;
  streetName: string;
  taste: number[];
  coin: number;
  level: number;
  desc: string;
  grade: number;
  learn: LearnType;
  grades: Array<{ grade: number; name: string; foods: NeedFoodDto[] }>;
}

export interface FoodsNeedDto {
  target: number;
  items: Array<{ foodsId: number; need: number; have: number; lack: number }>;
}

export interface LearnResultDto {
  cookbookId: number;
  grade: number;
  learnType: LearnType;
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/cookbook';`。

- [ ] **Step 2: 写规则的失败测试**

`apps/server/src/modules/cookbook/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { applyLearn, foodsNeedFor, planLearn, streetTargetGrade } from './rules';

const level = (id: number) => ({ 1: 1, 2: 2, 3: 3, 7: 7 })[id] ?? 1;
const stock = (m: Record<number, number>) => (id: number) => m[id] ?? 0;
const need = [
  { foodsId: 1, num: 1 },
  { foodsId: 2, num: 2 },
  { foodsId: 3, num: 1 },
];

describe('planLearn（规格书 03 §3.3）', () => {
  it('都够：普通学习', () => {
    expect(planLearn(need, stock({ 1: 1, 2: 2, 3: 1 }), level)).toEqual({ kind: 'normal', consume: need });
  });
  it('恰好缺一种：先扣光已有的，缺口用同级万能食材（466 + 等级）', () => {
    const p = planLearn(need, stock({ 1: 1, 2: 1, 3: 1, 468: 5 }), level);
    expect(p).toEqual({
      kind: 'wildcard',
      level: 2,
      consume: [
        { foodsId: 1, num: 1 },
        { foodsId: 3, num: 1 },
        { foodsId: 2, num: 1 },
        { foodsId: 468, num: 1 },
      ],
    });
  });
  it('万能食材不够、缺两种、缺的是神秘食材时不能学', () => {
    expect(planLearn(need, stock({ 1: 1, 2: 0, 3: 1, 468: 1 }), level).kind).toBe('none');
    expect(planLearn(need, stock({ 1: 1, 468: 9, 469: 9 }), level).kind).toBe('none');
    expect(planLearn([{ foodsId: 7, num: 1 }], stock({}), level).kind).toBe('none');
  });
  it('重复的食材合并计算', () => {
    const dup = [
      { foodsId: 1, num: 1 },
      { foodsId: 1, num: 1 },
    ];
    expect(planLearn(dup, stock({ 1: 1 }), level).kind).toBe('wildcard');
  });
});

describe('派生计数', () => {
  it('新学：已学数和街道数 +1；升级：品级计数挪一格', () => {
    const c0 = { learned: 0, grade: Array(11).fill(0) as number[], street: {} };
    const c1 = applyLearn(c0, 6, 0, 1);
    expect(c1).toEqual({ learned: 1, grade: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: { '6': 1 } });
    const c2 = applyLearn(c1, 6, 1, 2);
    expect(c2.grade.slice(0, 3)).toEqual([0, 0, 1]);
    expect(c2.learned).toBe(1);
    expect(c0.learned).toBe(0);
  });
});

describe('食材需求（规格书 03 §3.8）', () => {
  it('本街目标品级从 5 起算，全部达到就 +1', () => {
    const levels = new Uint8Array([0, 5, 5, 4]);
    expect(streetTargetGrade(levels, [1, 2], 7)).toBe(6);
    expect(streetTargetGrade(levels, [1, 2, 3], 7)).toBe(5);
    expect(streetTargetGrade(new Uint8Array([0, 7]), [1], 7)).toBe(7);
  });
  it('把食谱升到目标品级还要多少食材', () => {
    const levels = new Uint8Array([0, 1, 0]);
    const needOf = (_id: number, g: number) => [{ foodsId: 100 + g, num: g }];
    const m = foodsNeedFor([1, 2], levels, 2, needOf);
    expect([...m]).toEqual([
      [102, 4],
      [101, 1],
    ]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/cookbook/rules.test.ts`
Expected: FAIL，`./rules` 不存在

- [ ] **Step 4: 实现规则**

`apps/server/src/modules/cookbook/rules.ts`：

```ts
import { FOODS } from '@dt/config';
import type { LearnType } from '@dt/shared';
import type { CookbookCounts } from '../../db/schema';

export interface NeedLine {
  foodsId: number;
  num: number;
}

export function mergeNeed(list: readonly NeedLine[]): NeedLine[] {
  const out: NeedLine[] = [];
  for (const l of list) {
    const same = out.find((x) => x.foodsId === l.foodsId);
    if (same) same.num += l.num;
    else out.push({ foodsId: l.foodsId, num: l.num });
  }
  return out;
}

export type LearnPlan =
  | { kind: 'normal'; consume: NeedLine[] }
  | { kind: 'wildcard'; level: number; consume: NeedLine[] }
  | { kind: 'none'; missing: Array<NeedLine & { have: number }> };

/**
 * 学习或升级需要的食材（规格书 03 §3.3）：都够时普通学习；
 * 恰好缺一种 1~5 级食材、且同级万能食材（466 + 等级）能补足缺口时，先扣光这种食材已有的，缺口用万能食材扣
 */
export function planLearn(
  need: readonly NeedLine[],
  have: (id: number) => number,
  level: (id: number) => number,
): LearnPlan {
  const lines = mergeNeed(need);
  const missing = lines.filter((l) => have(l.foodsId) < l.num).map((l) => ({ ...l, have: have(l.foodsId) }));
  if (missing.length === 0) return { kind: 'normal', consume: lines };
  if (missing.length === 1) {
    const m = missing[0]!;
    const lv = level(m.foodsId);
    if (lv >= 1 && lv <= 5) {
      const wid = FOODS.masterBase + lv;
      const gap = m.num - m.have;
      if (have(wid) >= gap) {
        const consume = lines.filter((l) => l.foodsId !== m.foodsId);
        if (m.have > 0) consume.push({ foodsId: m.foodsId, num: m.have });
        consume.push({ foodsId: wid, num: gap });
        return { kind: 'wildcard', level: lv, consume };
      }
    }
  }
  return { kind: 'none', missing };
}

export function learnTypeOf(plan: LearnPlan): LearnType {
  if (plan.kind === 'normal') return '0';
  if (plan.kind === 'wildcard') return String(plan.level) as LearnType;
  return 'z';
}

/** 学习或升级后的派生计数（纯函数，不修改入参） */
export function applyLearn(counts: CookbookCounts, streetId: number, from: number, to: number): CookbookCounts {
  const c: CookbookCounts = { learned: counts.learned, grade: [...counts.grade], street: { ...counts.street } };
  if (from > 0) {
    c.grade[from] = (c.grade[from] ?? 0) - 1;
  } else {
    c.learned += 1;
    c.street[String(streetId)] = (c.street[String(streetId)] ?? 0) + 1;
  }
  c.grade[to] = (c.grade[to] ?? 0) + 1;
  return c;
}

/** 本街目标品级（规格书 03 §3.8）：从 5 起算，本街全部达到当前目标就 +1，不超过 max */
export function streetTargetGrade(levels: Uint8Array, ids: readonly number[], max: number): number {
  let t = Math.min(5, max);
  while (t < max && ids.length > 0 && ids.every((id) => (levels[id] ?? 0) >= t)) t += 1;
  return t;
}

/** 把 ids 里的食谱都升到 target 还需要的食材总量（按食材 id 汇总） */
export function foodsNeedFor(
  ids: readonly number[],
  levels: Uint8Array,
  target: number,
  needOf: (id: number, grade: number) => readonly NeedLine[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) {
    for (let g = (levels[id] ?? 0) + 1; g <= target; g++) {
      for (const f of needOf(id, g)) out.set(f.foodsId, (out.get(f.foodsId) ?? 0) + f.num);
    }
  }
  return out;
}
```

Run: `pnpm exec vitest run apps/server/src/modules/cookbook/rules.test.ts`
Expected: PASS

- [ ] **Step 5: 写服务的失败测试**

`apps/server/src/modules/cookbook/cookbook.test.ts`（食谱 194「新手街」1 品级需要 葡萄 302、薏仁 253、桑椹 366 各 1 个，桑椹是 3 级食材）：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const cb = () => t.game.cookbook;
const levelOf = async (restId: number, id: number) =>
  (await t.db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', restId).executeTakeFirstOrThrow())
    .levels[id];

describe('学习食谱', () => {
  it('食材够：学会 1 品级，扣食材，更新派生计数', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1, 253: 1, 366: 2 } });
    const r = await cb().learn(ctx, 194);
    expect(r.data).toEqual({ cookbookId: 194, grade: 1, learnType: '0' });
    expect(await levelOf(ctx.restaurantId, 194)).toBe(1);
    expect((await foodNum(t, ctx.restaurantId, 366)).num).toBe(1);
    expect((await foodNum(t, ctx.restaurantId, 302)).num).toBe(0);
    const counts = (await restRow(t, ctx.restaurantId)).cookbook_counts;
    expect(counts).toMatchObject({ learned: 1, street: { '0': 1 } });
    expect(counts.grade[1]).toBe(1);
  });

  it('缺一种时用同级万能食材（桑椹 3 级 → 469）', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1, 253: 1, 469: 1 } });
    const r = await cb().learn(ctx, 194);
    expect(r.data.learnType).toBe('3');
    expect((await foodNum(t, ctx.restaurantId, 469)).num).toBe(0);
  });

  it('不够时报 NOT_ENOUGH（带第一种缺的食材）', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1 } });
    await expect(cb().learn(ctx, 194)).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'foods' } });
  });

  it('已经是最高品级（7）时报错', async () => {
    const ctx = await newRestaurant(t, { cookbooks: { 194: 7 } });
    await expect(cb().learn(ctx, 194)).rejects.toMatchObject({ code: 'COOKBOOK_MAX_GRADE' });
  });
});

describe('食谱列表、详情、需求', () => {
  it('列表：可以学的排在前面，带下一级所需食材和持有数', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1, 253: 1, 366: 1 } });
    const list = await cb().list(ctx, { street: 0, page: 1, filter: 'all' });
    expect(list.streetTotal).toBe(72);
    expect(list.items[0]).toMatchObject({ id: 194, grade: 0, learn: '0' });
    expect(list.items[0]!.next).toEqual(
      expect.arrayContaining([{ foodsId: 366, num: 1, have: 1 }]),
    );
    const learnable = await cb().list(ctx, { street: 0, page: 1, filter: 'learnable' });
    expect(learnable.items.every((x) => x.learn !== 'z' && x.learn !== 'max')).toBe(true);
  });

  it('详情：各品级所需食材', async () => {
    const ctx = await newRestaurant(t);
    const d = await cb().detail(ctx, 194);
    expect(d).toMatchObject({ id: 194, streetId: 0, streetName: '新手街', grade: 0, learn: 'z' });
    expect(d.grades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('需求计算：新手街全部学会 1 品级还差多少', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1 } });
    const n = await cb().foodsNeed(ctx, { street: 0, target: 1 });
    const grape = n.items.find((x) => x.foodsId === 302)!;
    expect(grape.have).toBe(1);
    expect(grape.lack).toBe(grape.need - 1);
  });
});
```

- [ ] **Step 6: 实现服务和路由**

`apps/server/src/modules/cookbook/service.ts`：

```ts
import type { Kysely } from 'kysely';
import {
  ErrorCode,
  type CookbookDetailDto,
  type CookbookListDto,
  type CookbookListQuery,
  type CookbookRowDto,
  type FoodsNeedDto,
  type FoodsNeedQuery,
  type LearnResultDto,
  type LearnType,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough } from '../../core/errors';
import { runOp, setRest } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { foodsMap, subFoods } from '../cupboard/foods';
import { normalizeCounts } from '../settlement/globals';
import { applyLearn, foodsNeedFor, learnTypeOf, mergeNeed, planLearn } from './rules';

const PAGE_SIZE = 40;
/** 排序：可学 → 需要万能食材 → 不能学 → 已满级（规格书 03 §3.7 的 t → l → m → n） */
const ORDER: Record<LearnType, number> = { '0': 0, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, z: 2, max: 3 };

export function createCookbookService(d: GameDeps) {
  const levelOfFood = (id: number) => d.config.foods.get(id)?.level ?? 0;
  const needOf = (id: number, grade: number) => d.config.requireCookbook(id).needFoods[grade] ?? [];

  async function levelsOf(db: Kysely<DB>, restId: number): Promise<Uint8Array> {
    const r = await db
      .selectFrom('restaurant_cookbooks')
      .select('levels')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    return new Uint8Array(r.levels);
  }
  async function haveOf(db: Kysely<DB>, restId: number): Promise<(id: number) => number> {
    const m = await foodsMap(db, restId);
    return (id) => m.get(id)?.num ?? 0;
  }
  const maxGrade = async (shardId: number) => (await d.shards.settings(shardId)).tuning.rest.cookbookMaxGrade;

  function rowOf(id: number, levels: Uint8Array, have: (id: number) => number, max: number): CookbookRowDto {
    const c = d.config.requireCookbook(id);
    const grade = levels[id] ?? 0;
    if (grade >= max) return { id, name: c.name, grade, next: null, learn: 'max' };
    const need = mergeNeed(needOf(id, grade + 1));
    return {
      id,
      name: c.name,
      grade,
      next: need.map((n) => ({ foodsId: n.foodsId, num: n.num, have: have(n.foodsId) })),
      learn: learnTypeOf(planLearn(need, have, levelOfFood)),
    };
  }

  return {
    async list(ctx: RestCtx, q: CookbookListQuery): Promise<CookbookListDto> {
      const [levels, have, max, rest] = await Promise.all([
        levelsOf(d.db, ctx.restaurantId),
        haveOf(d.db, ctx.restaurantId),
        maxGrade(ctx.shardId),
        d.db.selectFrom('restaurant').select('cookbook_counts').where('id', '=', ctx.restaurantId).executeTakeFirstOrThrow(),
      ]);
      const ids = d.config.cookbookIndex.idsByStreet.get(q.street) ?? [];
      const rows = ids
        .map((id) => rowOf(id, levels, have, max))
        .filter((r) => {
          if (q.filter === 'learnable') return r.learn !== 'z' && r.learn !== 'max';
          if (q.filter === 'unlearned') return r.grade === 0;
          if (q.filter === 'learned') return r.grade > 0;
          return true;
        })
        .sort(
          (a, b) =>
            ORDER[a.learn] - ORDER[b.learn] ||
            a.grade - b.grade ||
            (a.next?.length ?? 0) - (b.next?.length ?? 0) ||
            a.id - b.id,
        );
      const counts = normalizeCounts(rest.cookbook_counts);
      return {
        street: q.street,
        page: q.page,
        pageSize: PAGE_SIZE,
        total: rows.length,
        items: rows.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE),
        learned: counts.learned,
        streetLearned: counts.street[String(q.street)] ?? 0,
        streetTotal: ids.length,
        gradeCounts: counts.grade,
      };
    },

    async detail(ctx: RestCtx, id: number): Promise<CookbookDetailDto> {
      const c = d.config.cookbooks.get(id);
      if (!c) throw invalidState('no_cookbook', { id });
      const [levels, have, max] = await Promise.all([
        levelsOf(d.db, ctx.restaurantId),
        haveOf(d.db, ctx.restaurantId),
        maxGrade(ctx.shardId),
      ]);
      const row = rowOf(id, levels, have, max);
      return {
        id,
        name: c.name,
        streetId: c.streetId,
        streetName: d.config.streets.get(c.streetId)?.name ?? '',
        taste: c.taste,
        coin: c.coin,
        level: c.level,
        desc: c.desc,
        grade: row.grade,
        learn: row.learn,
        grades: Array.from({ length: max }, (_, i) => i + 1).map((g) => ({
          grade: g,
          name: d.config.grade(g).name,
          foods: mergeNeed(needOf(id, g)).map((n) => ({ foodsId: n.foodsId, num: n.num, have: have(n.foodsId) })),
        })),
      };
    },

    async foodsNeed(ctx: RestCtx, q: FoodsNeedQuery): Promise<FoodsNeedDto> {
      const [levels, have, max] = await Promise.all([
        levelsOf(d.db, ctx.restaurantId),
        haveOf(d.db, ctx.restaurantId),
        maxGrade(ctx.shardId),
      ]);
      const target = Math.min(q.target, max);
      const ids =
        q.street === undefined ? d.config.cookbookIndex.allIds : (d.config.cookbookIndex.idsByStreet.get(q.street) ?? []);
      const items = [...foodsNeedFor(ids, levels, target, needOf)]
        .filter(([id]) => q.foodLevel === undefined || levelOfFood(id) === q.foodLevel)
        .map(([foodsId, need]) => ({ foodsId, need, have: have(foodsId), lack: Math.max(0, need - have(foodsId)) }))
        .sort((a, b) => b.lack - a.lack || a.foodsId - b.foodsId);
      return { target, items };
    },

    learn(ctx: RestCtx, cookbookId: number) {
      return runOp(d, ctx, { feature: 'cookbook', source: 'cookbook.learn' }, async (op): Promise<LearnResultDto> => {
        const c = op.config.cookbooks.get(cookbookId);
        if (!c) throw invalidState('no_cookbook', { id: cookbookId });
        const levels = await levelsOf(op.tx, op.rest.id);
        const from = levels[cookbookId] ?? 0;
        const to = from + 1;
        if (to > op.tuning.rest.cookbookMaxGrade) throw new AppError(ErrorCode.COOKBOOK_MAX_GRADE, 400);
        const fm = await foodsMap(op.tx, op.rest.id);
        const plan = planLearn(c.needFoods[to] ?? [], (id) => fm.get(id)?.num ?? 0, levelOfFood);
        if (plan.kind === 'none') {
          const m = plan.missing[0]!;
          throw notEnough('foods', m.num, m.have, m.foodsId);
        }
        for (const x of plan.consume) await subFoods(op, x.foodsId, x.num);
        levels[cookbookId] = to;
        await op.tx
          .updateTable('restaurant_cookbooks')
          .set({ levels: Buffer.from(levels) })
          .where('rest_id', '=', op.rest.id)
          .execute();
        setRest(op, 'cookbook_counts', applyLearn(normalizeCounts(op.rest.cookbook_counts), c.streetId, from, to));
        await emitAction(op, 'cookbook.learn');
        return { cookbookId, grade: to, learnType: learnTypeOf(plan) };
      });
    },
  };
}

export type CookbookService = ReturnType<typeof createCookbookService>;
```

`apps/server/src/modules/cookbook/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { cookbookIdParam, cookbookListQuery, foodsNeedQuery, learnBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { CookbookService } from './service';

export function cookbookRoutes(svc: CookbookService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(restCtxOf(req), parse(cookbookListQuery, req.query))));
    r.get('/detail/:id', async (req) => ok(await svc.detail(restCtxOf(req), parse(cookbookIdParam, req.params).id)));
    r.get('/foods-need', async (req) => ok(await svc.foodsNeed(restCtxOf(req), parse(foodsNeedQuery, req.query))));
    r.post('/learn', async (req) => okOp(await svc.learn(restCtxOf(req), parse(learnBody, req.body).cookbookId)));
  };
}
```

`game.ts`：`Game` 加 `cookbook: CookbookService`，`createGame` 里 `cookbook: createCookbookService(deps)`。`modules/index.ts`：`app.register(cookbookRoutes(game.cookbook), { prefix: '/api/v1/cookbook' });`

- [ ] **Step 7: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/cookbook`
Expected: PASS

- [ ] **Step 8: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(cookbook): learn and upgrade with wildcard substitution, list, detail, foods-need calculator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 橱柜——列表、冰箱、锁定、解冻、合成分解、万能兑换

**Files:**
- Create: `packages/shared/src/schemas/cupboard.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/cupboard/rules.ts`
- Test: `apps/server/src/modules/cupboard/rules.test.ts`
- Create: `apps/server/src/modules/cupboard/service.ts`
- Create: `apps/server/src/modules/cupboard/routes.ts`
- Test: `apps/server/src/modules/cupboard/cupboard.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `foodsMap`、`cupboardSlotsUsed`、`addFoods`、`subFoods`、`consumeGoods`、`spendCoin/gainCoin/spendStrength`、`opLuck`、`opAgg`、`incrementDaily`、`getDaily`、`gameDay`、`streetTargetGrade`、`foodsNeedFor`、`WorldService.ensure`、`pickWeighted`
- Produces:
  - schema / DTO：`foodsIdBody`、`handleBody`、`exchangeBody`、`CupboardFoodDto`、`CupboardDto`、`FridgeDto`、`HandleResultDto`、`ThawResultDto`
  - `handleTargetLevel(way, level): number | null`、`runHandle(input, pool, rng): HandleOutcome`
  - `CupboardService`：`list`、`fridge`、`readFridge`、`lock`、`unlock`、`thaw`、`handle`、`exchange`；`Game.cupboard`
  - 路由 `/api/v1/cupboard`：`GET /list`、`GET /fridge`、`POST /fridge/read`、`/lock`、`/unlock`、`/thaw`、`/handle`、`/exchange`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/cupboard.ts`：

```ts
import { z } from 'zod';

export const foodsIdBody = z.object({ foodsId: z.number().int().positive() });
export const handleBody = z.object({
  foodsId: z.number().int().positive(),
  way: z.enum(['compose', 'decompose']),
  num: z.number().int().min(1).max(100),
});
export const exchangeBody = z.object({
  foodsId: z.union([z.literal(467), z.literal(468)]),
  times: z.number().int().min(1).max(50),
});

export interface CupboardFoodDto {
  foodsId: number;
  num: number;
  locked: boolean;
  /** 本街食谱升到目标品级还需要多少 */
  streetNeed: number;
}

export interface CupboardDto {
  slotsUsed: number;
  slots: number;
  lockUsed: number;
  lockSlots: number;
  foodsMaxNum: number;
  targetGrade: number;
  fridgeCount: number;
  fridgeUnread: boolean;
  freeHandleLeft: number;
  items: CupboardFoodDto[];
}

export interface FridgeDto {
  items: Array<{ foodsId: number; num: number }>;
}

export interface HandleResultDto {
  chances: number;
  success: number;
  lucky: number;
  failCoin: number;
  strengthUsed: number;
  gained: Array<{ foodsId: number; num: number }>;
}

export interface ThawResultDto {
  foodsId: number;
  moved: number;
  coin: number;
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/cupboard';`。

- [ ] **Step 2: 写规则的失败测试**

`apps/server/src/modules/cupboard/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { handleTargetLevel, runHandle } from './rules';

const config = testConfig();
const base = {
  way: 'decompose' as const,
  num: 1,
  star: 0,
  foodCoin: 1000,
  weatherRate: 0,
  luckRate: 0,
  extraRate: 0,
  tuning: config.tuning,
};

describe('合成分解（规格书 05 §5.4）', () => {
  it('分解 2~6 级，合成 1~4 级；其他不能处理', () => {
    expect(handleTargetLevel('decompose', 2)).toBe(1);
    expect(handleTargetLevel('decompose', 1)).toBeNull();
    expect(handleTargetLevel('decompose', 7)).toBeNull();
    expect(handleTargetLevel('compose', 4)).toBe(5);
    expect(handleTargetLevel('compose', 5)).toBeNull();
  });

  it('分解 1 个 = 2 次机会；成功按权重抽，失败再判幸运，都失败返还半价 × 随机', () => {
    const pool = config.foodPools.get(1)!;
    // 第 1 次：0.5 < 0.9 成功 → 抽取 0；第 2 次：0.95 失败 → 幸运 0.99 失败 → 返还 0.5
    const o = runHandle(base, pool, sequenceRng([0.5, 0, 0.95, 0.99, 0.5]));
    expect(o).toMatchObject({ chances: 2, success: 1, lucky: 0, failCoin: 250 });
    expect(o.picks).toEqual([pool.items[0]!.id]);
  });

  it('合成 2 个 = 1 次机会；天气加成可以让成功率到 100%', () => {
    const pool = config.foodPools.get(3)!;
    const o = runHandle({ ...base, way: 'compose', num: 4, weatherRate: 1 }, pool, sequenceRng([0.99, 0, 0.99, 0]));
    expect(o).toMatchObject({ chances: 2, success: 2 });
  });

  it('额外次数：分解按每个原料、合成按每组判定', () => {
    const pool = config.foodPools.get(1)!;
    const o = runHandle({ ...base, num: 2, extraRate: 0.5 }, pool, sequenceRng([0.1, 0.9, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(o.chances).toBe(5);
  });
});
```

- [ ] **Step 3: 实现规则**

`apps/server/src/modules/cupboard/rules.ts`：

```ts
import type { Food, Tuning } from '@dt/config';
import { pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

export type HandleWay = 'compose' | 'decompose';

/** 分解 2~6 级 → 下一级；合成 1~4 级 → 上一级（规格书 05 §5.4）；不能处理返回 null */
export function handleTargetLevel(way: HandleWay, level: number): number | null {
  if (way === 'decompose') return level >= 2 && level <= 6 ? level - 1 : null;
  return level >= 1 && level <= 4 ? level + 1 : null;
}

export interface HandleInput {
  way: HandleWay;
  num: number;
  star: number;
  foodCoin: number;
  /** 天气 foodsOperRate */
  weatherRate: number;
  luckRate: number;
  /** 分解：套装 operFoodsAddRate；合成：星神之泪 composeFoodsRate */
  extraRate: number;
  tuning: Tuning;
}

export interface HandleOutcome {
  chances: number;
  success: number;
  lucky: number;
  failCoin: number;
  picks: number[];
}

export function runHandle(input: HandleInput, pool: WeightedPool<Food>, rng: Rng): HandleOutcome {
  const base = input.way === 'decompose' ? input.num * 2 : Math.floor(input.num / 2);
  let chances = base;
  if (input.extraRate > 0) {
    const loops = input.way === 'decompose' ? input.num : base;
    for (let i = 0; i < loops; i++) if (rng.chance(input.extraRate)) chances += 1;
  }
  const rt = input.tuning.rest;
  const rate = rt.handleRateBase + rt.handleRatePerStar * input.star + input.weatherRate;
  const out: HandleOutcome = { chances, success: 0, lucky: 0, failCoin: 0, picks: [] };
  for (let i = 0; i < chances; i++) {
    if (rng.next() < rate) {
      out.success += 1;
      out.picks.push(pickWeighted(pool, rng).id);
    } else if (rng.chance(input.luckRate)) {
      out.success += 1;
      out.lucky += 1;
      out.picks.push(pickWeighted(pool, rng).id);
    } else {
      out.failCoin += Math.floor(input.foodCoin * input.tuning.cupboard.failCoinRate * rng.next());
    }
  }
  return out;
}
```

Run: `pnpm exec vitest run apps/server/src/modules/cupboard/rules.test.ts`
Expected: PASS

- [ ] **Step 4: 写服务的失败测试**

`apps/server/src/modules/cupboard/cupboard.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const c = () => t.game.cupboard;

describe('橱柜列表', () => {
  it('格数、锁定格、本街需求', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 3, 101: 1 } });
    const l = await c().list(ctx);
    expect(l).toMatchObject({ slotsUsed: 2, slots: 100, lockUsed: 0, lockSlots: 15, targetGrade: 5 });
    expect(l.items.find((x) => x.foodsId === 302)!.streetNeed).toBeGreaterThan(0);
  });
});

describe('锁定（规格书 05 §5.3）', () => {
  it('锁定占格；锁定格满了报错；解锁已用完的食材时删除记录', async () => {
    const ctx = await newRestaurant(t, { patch: { foods_lock_num: 1 }, foods: { 101: 1, 102: 1 } });
    await c().lock(ctx, 101);
    await expect(c().lock(ctx, 102)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    await t.db.updateTable('cupboard_food').set({ num: 0 }).where('rest_id', '=', ctx.restaurantId).where('foods_id', '=', 101).execute();
    await c().unlock(ctx, 101);
    const rows = await t.db.selectFrom('cupboard_food').select('foods_id').where('rest_id', '=', ctx.restaurantId).execute();
    expect(rows.map((r) => r.foods_id)).toEqual([102]);
  });
});

describe('冰箱（规格书 05 §5.2）', () => {
  it('解冻：移回橱柜，花 数量×单价×0.25 银币', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000 } });
    await t.db.insertInto('cupboard_food').values({ rest_id: ctx.restaurantId, foods_id: 101, num: 0, fridge_num: 2, fridge_unread: true }).execute();
    const f = await c().fridge(ctx);
    expect(f.items).toEqual([{ foodsId: 101, num: 2 }]);
    await c().readFridge(ctx);
    const r = await c().thaw(ctx, 101);
    const cost = Math.ceil(2 * config.requireFood(101).coin * 0.25);
    expect(r.data).toEqual({ foodsId: 101, moved: 2, coin: cost });
    expect(await foodNum(t, ctx.restaurantId, 101)).toEqual({ num: 2, fridge: 0 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(10000 - cost);
  });
  it('橱柜满且没有这种食材时不能解冻', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 1, coin: 10000 }, foods: { 102: 1 } });
    await t.db.insertInto('cupboard_food').values({ rest_id: ctx.restaurantId, foods_id: 101, num: 0, fridge_num: 2 }).execute();
    await expect(c().thaw(ctx, 101)).rejects.toMatchObject({ code: 'CUPBOARD_FULL' });
  });
});

describe('合成分解', () => {
  it('分解 3 个 2 级食材：6 次机会，扣原料，记当天次数', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000 }, foods: { 302: 3 } });
    const r = await c().handle(ctx, { foodsId: 302, way: 'decompose', num: 3 });
    expect(r.data.chances).toBe(6);
    expect(r.data.strengthUsed).toBe(0);
    expect((await foodNum(t, ctx.restaurantId, 302)).num).toBe(0);
    const gained = r.data.gained.reduce((s, g) => s + g.num, 0);
    expect(gained).toBe(r.data.success);
  });

  it('超过当天免体力次数后每次 1 体力（按北京时间的日期）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000, strength: 10 }, foods: { 302: 2 } });
    await t.db
      .insertInto('daily_counter')
      .values({ rest_id: ctx.restaurantId, day: gameDay(t.clock.now), key: 'foods.handle', count: 20 })
      .execute();
    const r = await c().handle(ctx, { foodsId: 302, way: 'decompose', num: 1 });
    expect(r.data.strengthUsed).toBe(1);
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(9);
  });

  it('不能处理的等级、合成数量是奇数、没有银币时报错', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, foods: { 101: 4, 302: 4 } });
    await expect(c().handle(ctx, { foodsId: 101, way: 'decompose', num: 1 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(c().handle(ctx, { foodsId: 101, way: 'compose', num: 3 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(c().handle(ctx, { foodsId: 302, way: 'decompose', num: 1 })).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
  });
});

describe('万能食材兑换（规格书 05 §5.5）', () => {
  it('2 个一级万能食材 → 1 个 2 级稀有食材', async () => {
    const ctx = await newRestaurant(t, { foods: { 467: 4 } });
    const r = await c().exchange(ctx, { foodsId: 467, times: 2 });
    expect((await foodNum(t, ctx.restaurantId, 467)).num).toBe(0);
    const gains = r.events.filter((e) => e.type === 'gain' && e.kind === 'foods');
    expect(gains.reduce((s, e) => s + e.num, 0)).toBe(2);
    for (const e of gains) {
      const f = config.requireFood(e.id!);
      expect(f.level).toBe(2);
      expect(f.odds).toBeLessThan(100);
    }
  });
});
```

- [ ] **Step 5: 实现服务和路由**

`apps/server/src/modules/cupboard/service.ts`：

```ts
import { sql } from 'kysely';
import {
  ErrorCode,
  gameDay,
  pickWeighted,
  type CupboardDto,
  type FridgeDto,
  type HandleResultDto,
  type ThawResultDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin, spendStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { foodsNeedFor, streetTargetGrade } from '../cookbook/rules';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import type { WorldService } from '../world/service';
import { addFoods, cupboardSlotsUsed, foodsMap, subFoods } from './foods';
import { handleTargetLevel, runHandle, type HandleWay } from './rules';

const HANDLE_KEY = 'foods.handle';

export function createCupboardService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'cupboard', source }, fn);
  const needOf = (id: number, grade: number) => d.config.requireCookbook(id).needFoods[grade] ?? [];
  const freeHandles = (star: number, t: { freeHandleBase: number; freeHandlePerStar: number }) =>
    t.freeHandleBase + t.freeHandlePerStar * star;

  return {
    async list(ctx: RestCtx): Promise<CupboardDto> {
      const rest = await d.db.selectFrom('restaurant').selectAll().where('id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const rows = await foodsMap(d.db, rest.id);
      const cb = await d.db
        .selectFrom('restaurant_cookbooks')
        .select('levels')
        .where('rest_id', '=', rest.id)
        .executeTakeFirstOrThrow();
      const levels = new Uint8Array(cb.levels);
      const streetIds = d.config.cookbookIndex.idsByStreet.get(rest.street_id) ?? [];
      const targetGrade = streetTargetGrade(levels, streetIds, tuning.rest.cookbookMaxGrade);
      const needMap = foodsNeedFor(streetIds, levels, targetGrade, needOf);
      const used = await getDaily(d.db, rest.id, HANDLE_KEY, gameDay(d.now()));
      const all = [...rows];
      return {
        slotsUsed: all.filter(([, r]) => r.num > 0).length,
        slots: rest.cupboard_num,
        lockUsed: all.filter(([, r]) => r.locked).length,
        lockSlots: rest.foods_lock_num,
        foodsMaxNum: rest.foods_max_num,
        targetGrade,
        fridgeCount: all.filter(([, r]) => r.fridge > 0).length,
        fridgeUnread: (
          await d.db
            .selectFrom('cupboard_food')
            .select('foods_id')
            .where('rest_id', '=', rest.id)
            .where('fridge_unread', '=', true)
            .where('fridge_num', '>', 0)
            .executeTakeFirst()
        ) !== undefined,
        freeHandleLeft: Math.max(0, freeHandles(rest.star_level, tuning.cupboard) - used),
        items: all
          .filter(([, r]) => r.num > 0)
          .map(([foodsId, r]) => ({ foodsId, num: r.num, locked: r.locked, streetNeed: needMap.get(foodsId) ?? 0 }))
          .sort((a, b) => (d.config.foods.get(a.foodsId)?.level ?? 0) - (d.config.foods.get(b.foodsId)?.level ?? 0) || a.foodsId - b.foodsId),
      };
    },

    async fridge(ctx: RestCtx): Promise<FridgeDto> {
      const rows = await d.db
        .selectFrom('cupboard_food')
        .select(['foods_id', 'fridge_num'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('fridge_num', '>', 0)
        .orderBy('foods_id')
        .execute();
      return { items: rows.map((r) => ({ foodsId: r.foods_id, num: r.fridge_num })) };
    },

    readFridge(ctx: RestCtx) {
      return op(ctx, 'fridge.read', async (o) => {
        await o.tx.updateTable('cupboard_food').set({ fridge_unread: false }).where('rest_id', '=', o.rest.id).execute();
        return { ok: true };
      });
    },

    lock(ctx: RestCtx, foodsId: number) {
      return op(ctx, 'foods.lock', async (o) => {
        const m = await foodsMap(o.tx, o.rest.id);
        const row = m.get(foodsId);
        if (!row || row.num <= 0) throw invalidState('no_food', { foodsId });
        if (row.locked) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        const locked = [...m.values()].filter((r) => r.locked).length;
        if (locked >= o.rest.foods_lock_num) throw limitReached('lock', { max: o.rest.foods_lock_num });
        await o.tx
          .updateTable('cupboard_food')
          .set({ locked: true })
          .where('rest_id', '=', o.rest.id)
          .where('foods_id', '=', foodsId)
          .execute();
        return { foodsId, locked: true };
      });
    },

    unlock(ctx: RestCtx, foodsId: number) {
      return op(ctx, 'foods.unlock', async (o) => {
        const row = (await foodsMap(o.tx, o.rest.id)).get(foodsId);
        if (!row || !row.locked) throw invalidState('not_locked', { foodsId });
        // 食材已经用完的锁：直接删掉这一行，释放锁定格（规格书 05 §5.3）
        if (row.num === 0 && row.fridge === 0) {
          await o.tx.deleteFrom('cupboard_food').where('rest_id', '=', o.rest.id).where('foods_id', '=', foodsId).execute();
        } else {
          await o.tx
            .updateTable('cupboard_food')
            .set({ locked: false })
            .where('rest_id', '=', o.rest.id)
            .where('foods_id', '=', foodsId)
            .execute();
        }
        return { foodsId, locked: false };
      });
    },

    thaw(ctx: RestCtx, foodsId: number) {
      return op(ctx, 'fridge.thaw', async (o): Promise<ThawResultDto> => {
        const row = (await foodsMap(o.tx, o.rest.id)).get(foodsId);
        if (!row || row.fridge <= 0) throw invalidState('fridge_empty', { foodsId });
        if (row.num === 0 && (await cupboardSlotsUsed(o.tx, o.rest.id)) >= o.rest.cupboard_num)
          throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
        const moved = Math.min(row.fridge, o.rest.foods_max_num - row.num);
        if (moved <= 0) throw limitReached('foods_max', { max: o.rest.foods_max_num });
        const coin = Math.ceil(moved * o.config.requireFood(foodsId).coin * o.tuning.cupboard.thawCoinRate);
        spendCoin(o, coin);
        await o.tx
          .updateTable('cupboard_food')
          .set({ num: sql<number>`num + ${moved}`, fridge_num: sql<number>`fridge_num - ${moved}` })
          .where('rest_id', '=', o.rest.id)
          .where('foods_id', '=', foodsId)
          .execute();
        return { foodsId, moved, coin };
      });
    },

    handle(ctx: RestCtx, b: { foodsId: number; way: HandleWay; num: number }) {
      return op(ctx, 'foods.handle', async (o): Promise<HandleResultDto> => {
        const food = o.config.requireFood(b.foodsId);
        const target = handleTargetLevel(b.way, food.level);
        if (target === null) throw invalidState('cannot_handle', { foodsId: b.foodsId });
        if (b.way === 'compose' && b.num % 2 !== 0) throw invalidState('odd_num');
        if (o.rest.coin <= 0) throw notEnough('coin', 1, o.rest.coin);
        await subFoods(o, b.foodsId, b.num);
        const used = await incrementDaily(o.tx, o.rest.id, HANDLE_KEY, 1, gameDay(o.now));
        const strengthUsed = used > freeHandles(o.rest.star_level, o.tuning.cupboard) ? 1 : 0;
        spendStrength(o, strengthUsed);
        const snap = await world.ensure(o.shardId, o.now);
        const agg = await opAgg(o);
        const { rate } = await opLuck(o);
        const outcome = runHandle(
          {
            way: b.way,
            num: b.num,
            star: o.rest.star_level,
            foodCoin: food.coin,
            weatherRate: snap.weather.effects.foodsOperRate ?? 0,
            luckRate: rate,
            extraRate: (b.way === 'decompose' ? agg.operFoodsAddRate : agg.composeFoodsRate) ?? 0,
            tuning: o.tuning,
          },
          o.config.foodPools.get(target)!,
          o.rng,
        );
        const gained = new Map<number, number>();
        for (const id of outcome.picks) gained.set(id, (gained.get(id) ?? 0) + 1);
        for (const [id, n] of gained) await addFoods(o, id, n);
        gainCoin(o, outcome.failCoin);
        await emitAction(o, 'foods.handle');
        return {
          chances: outcome.chances,
          success: outcome.success,
          lucky: outcome.lucky,
          failCoin: outcome.failCoin,
          strengthUsed,
          gained: [...gained].map(([foodsId, num]) => ({ foodsId, num })),
        };
      });
    },

    exchange(ctx: RestCtx, b: { foodsId: 467 | 468; times: number }) {
      return op(ctx, 'foods.exchange.master', async (o) => {
        await subFoods(o, b.foodsId, 2 * b.times);
        const pool = o.config.rareFoodPools.get(b.foodsId === 467 ? 2 : 3)!;
        const got = new Map<number, number>();
        for (let i = 0; i < b.times; i++) {
          const f = pickWeighted(pool, o.rng);
          got.set(f.id, (got.get(f.id) ?? 0) + 1);
        }
        for (const [id, n] of got) await addFoods(o, id, n);
        return { gained: [...got].map(([foodsId, num]) => ({ foodsId, num })) };
      });
    },
  };
}

export type CupboardService = ReturnType<typeof createCupboardService>;
```

`apps/server/src/modules/cupboard/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { exchangeBody, foodsIdBody, handleBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { CupboardService } from './service';

export function cupboardRoutes(svc: CupboardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(restCtxOf(req))));
    r.get('/fridge', async (req) => ok(await svc.fridge(restCtxOf(req))));
    r.post('/fridge/read', async (req) => okOp(await svc.readFridge(restCtxOf(req))));
    r.post('/lock', async (req) => okOp(await svc.lock(restCtxOf(req), parse(foodsIdBody, req.body).foodsId)));
    r.post('/unlock', async (req) => okOp(await svc.unlock(restCtxOf(req), parse(foodsIdBody, req.body).foodsId)));
    r.post('/thaw', async (req) => okOp(await svc.thaw(restCtxOf(req), parse(foodsIdBody, req.body).foodsId)));
    r.post('/handle', async (req) => okOp(await svc.handle(restCtxOf(req), parse(handleBody, req.body))));
    r.post('/exchange', async (req) => okOp(await svc.exchange(restCtxOf(req), parse(exchangeBody, req.body))));
  };
}
```

`game.ts`：`Game` 加 `cupboard: CupboardService`，`cupboard: createCupboardService(deps, world)`。`modules/index.ts`：`app.register(cupboardRoutes(game.cupboard), { prefix: '/api/v1/cupboard' });`

- [ ] **Step 6: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/cupboard`
Expected: PASS

- [ ] **Step 7: 全部测试、类型检查、lint、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(cupboard): list, fridge, locks, thaw, compose/decompose, wildcard exchange

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 18: 仓库——列表、使用道具、道具流水

**Files:**
- Create: `packages/shared/src/schemas/store.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/store/rules.ts`
- Create: `apps/server/src/modules/store/use.ts`
- Create: `apps/server/src/modules/store/service.ts`
- Create: `apps/server/src/modules/store/routes.ts`
- Test: `apps/server/src/modules/store/store.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `GoodsUse`、`consumeGoods`、`grantGoodsOp`、`storeKinds`、`openGift`、`addFoods`、`gainCoin/gainDiamond/gainStrength`、`setRest`、`restLog`、`featureAvailable`、`limitReached`、`invalidState`、`gameParts`、`gameTime`
- Produces:
  - schema / DTO：`storeQuery`、`useBody`、`recordsQuery`、`StoreItemDto`、`StoreDto`、`LedgerRecordDto`
  - `sellPrice(g, tuning): number | null`、`isPlaque(g)`
  - `useGoods(op, goodsId, num): Promise<{ goodsId; num }>`、`addTables(op, num)`
  - `StoreService`：`list(ctx, q)`、`records(ctx, q)`、`use(ctx, body)`；`Game.store`
  - 路由 `/api/v1/store`：`GET /list`、`GET /records`、`POST /use`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/store.ts`：

```ts
import { z } from 'zod';

export const storeQuery = z.object({ type: z.coerce.number().int().min(0).max(20).optional() });
export const useBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(99).default(1),
});
export const recordsQuery = z.object({
  range: z.enum(['1h', '6h', '12h', 'today', 'yesterday', 'before']).default('1h'),
});
export type RecordsRange = z.infer<typeof recordsQuery>['range'];

export interface StoreItemDto {
  goodsId: number;
  num: number;
  expiresAt: string | null;
  usable: boolean;
  batch: boolean;
  sellPrice: number | null;
}

export interface StoreDto {
  kinds: number;
  storeNum: number;
  items: StoreItemDto[];
}

export interface LedgerRecordDto {
  kind: string;
  itemId: number | null;
  delta: number;
  source: string;
  at: string;
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/store';`。

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/store/store.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from './grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const s = () => t.game.store;
const tablesOf = async (restId: number) =>
  (await t.db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', restId).executeTakeFirstOrThrow())
    .tables;

describe('使用道具（规格书 07 §7.4）', () => {
  it('金币可以批量使用', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { 85: 2 } });
    await s().use(ctx, { goodsId: 85, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(200000);
    expect(await goodsNum(t, ctx.restaurantId, 85)).toBe(0);
  });

  it('扩容卡不能批量；橱柜格数不超过食材种类总数', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 310 }, goods: { 3: 2, 5: 1 } });
    await expect(s().use(ctx, { goodsId: 3, num: 2 })).rejects.toMatchObject({ params: { reason: 'no_batch' } });
    await s().use(ctx, { goodsId: 5, num: 1 });
    expect((await restRow(t, ctx.restaurantId)).cupboard_num).toBe(config.foods.size);
  });

  it('餐桌A：加一张桌，受餐桌上限限制；超出时报错且不扣道具', async () => {
    const ctx = await newRestaurant(t, { patch: { table_num: 5 }, goods: { 82: 2 } });
    await s().use(ctx, { goodsId: 82, num: 1 });
    expect((await tablesOf(ctx.restaurantId)).map((x) => x.no)).toEqual([1, 2, 3, 4, 5]);
    await expect(s().use(ctx, { goodsId: 82, num: 1 })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await goodsNum(t, ctx.restaurantId, 82)).toBe(1);
  });

  it('体力卡可以超过上限；神秘食材随机劵得到一个 7 级食材', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 100, strength_max: 100 }, goods: { 29: 1, 139: 1 } });
    await s().use(ctx, { goodsId: 29, num: 1 });
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(200);
    const r = await s().use(ctx, { goodsId: 139, num: 1 });
    const food = r.events.find((e) => e.kind === 'foods' && e.type === 'gain')!;
    expect(config.requireFood(food.id!).level).toBe(7);
  });

  it('洗点卡：返还已加的点；没加过点时报错', async () => {
    const ctx = await newRestaurant(t, { patch: { attr_left: 1, attr_cook: 2, attr_fire: 1 }, goods: { 55: 2 } });
    await s().use(ctx, { goodsId: 55, num: 1 });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ attr_left: 4, attr_cook: 0, attr_fire: 0 });
    await expect(s().use(ctx, { goodsId: 55, num: 1 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await goodsNum(t, ctx.restaurantId, 55)).toBe(1);
  });

  it('鞋带：36 个普通飞弹捆成 1 个极速飞弹', async () => {
    const ctx = await newRestaurant(t, { goods: { 169: 1, 18: 40 } });
    await s().use(ctx, { goodsId: 169, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 18)).toBe(4);
    expect(await goodsNum(t, ctx.restaurantId, 17)).toBe(1);
  });

  it('打开签到礼包', async () => {
    const ctx = await newRestaurant(t, { goods: { 115: 1 } });
    await s().use(ctx, { goodsId: 115, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBeGreaterThanOrEqual(20);
  });

  it('不能用的道具、功能没开的道具报 NOT_USABLE', async () => {
    const ctx = await newRestaurant(t, { goods: { 86: 1, 136: 1 } });
    await expect(s().use(ctx, { goodsId: 86, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
    await expect(s().use(ctx, { goodsId: 136, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
  });
});

describe('仓库列表与流水', () => {
  it('列表：可用、可批量、出售价；过期勋章不显示', async () => {
    const ctx = await newRestaurant(t, { goods: { 85: 1, 13: 1 } });
    await grantGoods(t.db, config, ctx.restaurantId, 133, 1, new Date(Date.now() - 5 * 3600_000));
    const l = await s().list(ctx, {});
    expect(l.items.find((x) => x.goodsId === 85)).toMatchObject({ usable: true, batch: true });
    expect(l.items.find((x) => x.goodsId === 13)).toMatchObject({ usable: false, sellPrice: 700 });
    expect(l.items.some((x) => x.goodsId === 133)).toBe(false);
    expect(l.kinds).toBe(2);
  });

  it('道具流水：最近 1 小时', async () => {
    const ctx = await newRestaurant(t, { goods: { 85: 1 } });
    await s().use(ctx, { goodsId: 85, num: 1 });
    const r = await s().records(ctx, { range: '1h' });
    expect(r.map((x) => [x.kind, x.delta])).toEqual(
      expect.arrayContaining([
        ['goods', -1],
        ['coin', 100000],
      ]),
    );
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/store/store.test.ts`
Expected: FAIL，`t.game.store` 为 undefined

- [ ] **Step 4: 实现**

`apps/server/src/modules/store/rules.ts`：

```ts
import { DEVICE_TYPE, GOODS_TYPE, type Goods, type Tuning } from '@dt/config';

export function isPlaque(g: Goods): boolean {
  return g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque;
}

/** 出售价 = 单价 × 0.7（规格书 07 §7.6）；勋章、宝石、没有价格的不能卖 */
export function sellPrice(g: Goods, tuning: Tuning): number | null {
  if (g.coin <= 0 || g.type === GOODS_TYPE.honor || g.type === GOODS_TYPE.gem) return null;
  return Math.floor(g.coin * tuning.shop.sellRate);
}
```

`apps/server/src/modules/store/use.ts`：

```ts
import { ErrorCode } from '@dt/shared';
import { featureAvailable } from '../../core/features';
import { invalidState, limitReached } from '../../core/errors';
import { restLog, setRest, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { openGift } from '../award/award';
import { addFoods } from '../cupboard/foods';
import { consumeGoods, grantGoodsOp } from './goods';

/** 餐桌A：加 num 张桌，不超过餐桌上限和楼层容量（规格书 07 §7.4、02 §2.7） */
export async function addTables(op: Op, num: number): Promise<number> {
  const tr = await op.tx
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  const perFloor = op.tuning.rest.tablesPerFloor;
  const cap = Math.min(op.rest.table_num, (op.rest.star_level + 1) * perFloor);
  const count = tr.tables.length;
  if (count + num > cap) throw limitReached('tables', { cap, have: count });
  const added = Array.from({ length: num }, (_, i) => {
    const no = count + i + 1;
    return { no, floor: Math.floor((no - 1) / perFloor) + 1, customer: 0 };
  });
  await op.tx
    .updateTable('restaurant_tables')
    .set({ tables: JSON.stringify([...tr.tables, ...added]) })
    .where('rest_id', '=', op.rest.id)
    .execute();
  return count + num;
}

/** 使用道具：按构建时推导的用途分派（设计文档 §5.1）。先扣道具，任何一步失败整体回滚 */
export async function useGoods(op: Op, goodsId: number, num: number): Promise<{ goodsId: number; num: number }> {
  const g = op.config.requireGoods(goodsId);
  const use = g.use;
  if (!use) throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId });
  if (use.kind === 'towerTicket' && !featureAvailable(op.settings, 'tower'))
    throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId, reason: 'feature' });
  if (num > 1 && use.kind !== 'gift' && !op.tuning.store.batchUsable.includes(goodsId))
    throw invalidState('no_batch', { goodsId });
  await consumeGoods(op, goodsId, num, { source: 'store.use' });
  switch (use.kind) {
    case 'currency':
      gainCoin(op, use.coin * num);
      gainDiamond(op, use.diamond * num);
      break;
    case 'addTable':
      await addTables(op, num);
      break;
    case 'strength':
      gainStrength(op, use.amount * num);
      break;
    case 'mysteryFood': {
      const list = op.config.foodsByLevel.get(use.level) ?? [];
      for (let i = 0; i < num && list.length > 0; i++) await addFoods(op, list[op.rng.int(list.length)]!.id, 1);
      break;
    }
    case 'lockSlots':
      setRest(op, 'foods_lock_num', op.rest.foods_lock_num + use.amount * num);
      break;
    case 'resetAttr': {
      const spent = op.rest.attr_cook + op.rest.attr_cutting + op.rest.attr_fire;
      if (spent === 0) throw invalidState('no_points_to_reset');
      setRest(op, 'attr_left', op.rest.attr_left + spent);
      setRest(op, 'attr_cook', 0);
      setRest(op, 'attr_cutting', 0);
      setRest(op, 'attr_fire', 0);
      break;
    }
    case 'bundle':
      await consumeGoods(op, use.goods, use.num * num, { source: 'store.use' });
      await grantGoodsOp(op, use.targetGoods, use.targetNum * num, { source: 'store.use' });
      break;
    case 'foodsMax':
      setRest(op, 'foods_max_num', op.rest.foods_max_num + use.amount * num);
      break;
    case 'storeNum':
      setRest(op, 'store_num', op.rest.store_num + use.amount * num);
      break;
    case 'cupboardNum':
      setRest(op, 'cupboard_num', Math.min(op.rest.cupboard_num + use.amount * num, op.config.foods.size));
      break;
    case 'gift':
      await openGift(op, g, num);
      break;
    case 'towerTicket':
      throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId });
  }
  restLog(op, 'store.use', { goodsId, num });
  return { goodsId, num };
}
```

`apps/server/src/modules/store/service.ts`：

```ts
import { GOODS_TYPE } from '@dt/config';
import { addDays, gameParts, gameTime, type LedgerRecordDto, type RecordsRange, type StoreDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { runOp } from '../../core/op';
import { sellPrice } from './rules';
import { useGoods } from './use';

const HOUR = 3600_000;

function rangeOf(range: RecordsRange, now: Date): [Date, Date] {
  const hours = { '1h': 1, '6h': 6, '12h': 12 } as const;
  if (range in hours) return [new Date(now.getTime() - hours[range as keyof typeof hours] * HOUR), now];
  const day = gameParts(now).day;
  if (range === 'today') return [gameTime(day, 0), now];
  if (range === 'yesterday') return [gameTime(addDays(day, -1), 0), gameTime(day, 0)];
  return [gameTime(addDays(day, -2), 0), gameTime(addDays(day, -1), 0)];
}

export function createStoreService(d: GameDeps) {
  return {
    async list(ctx: RestCtx, q: { type?: number }): Promise<StoreDto> {
      const now = d.now();
      const [rest, settings] = await Promise.all([
        d.db.selectFrom('restaurant').select('store_num').where('id', '=', ctx.restaurantId).executeTakeFirstOrThrow(),
        d.shards.settings(ctx.shardId),
      ]);
      const rows = await d.db
        .selectFrom('store_item')
        .selectAll()
        .where('rest_id', '=', ctx.restaurantId)
        .where('num', '>', 0)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
        .orderBy('goods_id')
        .execute();
      const items = rows
        .map((r) => ({ r, g: d.config.goods.get(r.goods_id) }))
        .filter((x) => x.g !== undefined && (q.type === undefined || x.g.type === q.type))
        .map(({ r, g }) => {
          const use = g!.use;
          const usable = use !== null && (use.kind !== 'towerTicket' || featureAvailable(settings, 'tower'));
          return {
            goodsId: r.goods_id,
            num: r.num,
            expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
            usable,
            batch: usable && (use!.kind === 'gift' || settings.tuning.store.batchUsable.includes(r.goods_id)),
            sellPrice: sellPrice(g!, settings.tuning),
          };
        });
      const kinds = rows.filter((r) => d.config.goods.get(r.goods_id)?.type !== GOODS_TYPE.honor).length;
      return { kinds, storeNum: rest.store_num, items };
    },

    async records(ctx: RestCtx, q: { range: RecordsRange }): Promise<LedgerRecordDto[]> {
      const [from, to] = rangeOf(q.range, d.now());
      const rows = await d.db
        .selectFrom('ledger')
        .select(['kind', 'item_id', 'delta', 'source', 'created_at'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('created_at', '>=', from)
        .where('created_at', '<', new Date(to.getTime() + 1))
        .orderBy('created_at', 'desc')
        .limit(200)
        .execute();
      return rows.map((r) => ({
        kind: r.kind,
        itemId: r.item_id,
        delta: r.delta,
        source: r.source,
        at: r.created_at.toISOString(),
      }));
    },

    use(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return runOp(d, ctx, { feature: 'store', source: 'store.use' }, (op) => useGoods(op, b.goodsId, b.num));
    },
  };
}

export type StoreService = ReturnType<typeof createStoreService>;
```

`apps/server/src/modules/store/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { recordsQuery, storeQuery, useBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { StoreService } from './service';

export function storeRoutes(svc: StoreService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(restCtxOf(req), parse(storeQuery, req.query))));
    r.get('/records', async (req) => ok(await svc.records(restCtxOf(req), parse(recordsQuery, req.query))));
    r.post('/use', async (req) => okOp(await svc.use(restCtxOf(req), parse(useBody, req.body))));
  };
}
```

`game.ts`：`Game` 加 `store: StoreService`，`store: createStoreService(deps)`。`modules/index.ts`：`app.register(storeRoutes(game.store), { prefix: '/api/v1/store' });`

- [ ] **Step 5: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/store`
Expected: PASS

- [ ] **Step 6: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(store): list, use goods by derived kind, gift packs, goods records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: 商店——银币商店、每日特价、黑市、出售、丢弃

**Files:**
- Create: `packages/shared/src/schemas/shop.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/shop/service.ts`
- Create: `apps/server/src/modules/shop/jobs.ts`
- Create: `apps/server/src/modules/shop/routes.ts`
- Test: `apps/server/src/modules/shop/shop.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `countGoods`、`consumeGoods`、`grantGoodsOp`、`assertStoreRoom`、`removeHonor`、`isPlaque`、`sellPrice`、`spendCoin/gainCoin/spendDiamond`、`emitAction`、`latestSlot`、`parseSlotKey`、`seededRng`、`hashSeed`、`postNews`、`goodsEffectHours`
- Produces:
  - schema / DTO：`buyBody`、`buySpecialBody`、`sellBody`、`discardBody`、`ShopItemDto`、`ShopDto`、`ShopSpecialDto`
  - `ShopService`：`items(ctx)`、`special(ctx)`、`buy(ctx, body)`、`buySpecial(ctx, body)`、`buyBlack(ctx, body)`、`sell(ctx, body)`、`discard(ctx, body)`、`rollSpecial(shardId, slot, now)`；`Game.shop`
  - `shopJobs(shop): PeriodicJob[]`（`shop-special`，每天 12 点）
  - 路由 `/api/v1/shop`：`GET /items`、`GET /special`、`POST /buy`、`/buy-special`、`/buy-black`、`/sell`、`/discard`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/shop.ts`：

```ts
import { z } from 'zod';

export const buyBody = z.object({ goodsId: z.number().int().positive(), num: z.number().int().min(1).max(999) });
export const buySpecialBody = z.object({ num: z.number().int().min(1).max(999) });
export const sellBody = buyBody;
export const discardBody = z.object({ goodsId: z.number().int().positive() });

export interface ShopItemDto {
  goodsId: number;
  price: number;
  owned: number;
  /** 一次最多能买几个；null = 不限（受持有上限） */
  limit: number | null;
}

export interface ShopDto {
  coin: ShopItemDto[];
  black: ShopItemDto[];
}

export interface ShopSpecialDto {
  day: string;
  goodsId: number;
  tierName: string;
  discount: number;
  price: number;
  stock: number;
  sold: number;
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/shop';`。

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/shop/shop.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const shop = () => t.game.shop;

describe('银币商店（规格书 06 §6.5）', () => {
  it('买 3 张普通宣传海报：扣银币、进仓库、写流水', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000 } });
    await shop().buy(ctx, { goodsId: 13, num: 3 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(7000);
    expect(await goodsNum(t, ctx.restaurantId, 13)).toBe(3);
    const l = await t.db.selectFrom('ledger').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(l.every((x) => x.source === 'shop.buy')).toBe(true);
  });
  it('没上架的不能买；仓库满了不能买新种类', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000, store_num: 1 }, goods: { 86: 1 } });
    await expect(shop().buy(ctx, { goodsId: 1, num: 1 })).rejects.toMatchObject({ params: { reason: 'not_on_sale' } });
    await expect(shop().buy(ctx, { goodsId: 13, num: 1 })).rejects.toMatchObject({ code: 'STORE_FULL' });
    await shop().buy(ctx, { goodsId: 86, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 86)).toBe(2);
  });
  it('列表：银币商店和黑市', async () => {
    const ctx = await newRestaurant(t);
    const l = await shop().items(ctx);
    expect(l.coin.find((x) => x.goodsId === 13)).toMatchObject({ price: 1000 });
    expect(l.black.find((x) => x.goodsId === 86)).toMatchObject({ price: 5 });
  });
});

describe('每日特价（规格书 06 §6.5、20 §20.9）', () => {
  it('12 点刷新：按固定种子抽商品和折扣档，发新闻；卖完为止', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000_000 } });
    t.clock.set(gameTime('2026-09-30', 12, 30));
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: () => {} } };
    await runDueJobs(deps, t.game.jobs, { shardIds: [ctx.shardId] });
    const sp = (await shop().special(ctx))!;
    expect(sp.day).toBe('2026-09-30');
    expect(config.bundle.shopPools.special).toContain(sp.goodsId);
    const g = config.requireGoods(sp.goodsId);
    expect(sp.price).toBe(Math.ceil(g.coin * sp.discount));
    await shop().buySpecial(ctx, { num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, sp.goodsId)).toBeGreaterThanOrEqual(1);
    await t.db.updateTable('shop_special').set({ sold: sp.stock }).where('shard_id', '=', ctx.shardId).execute();
    await expect(shop().buySpecial(ctx, { num: 1 })).rejects.toMatchObject({ code: 'SOLD_OUT' });
    t.clock.set(new Date());
  });
  it('12 点前看到的是前一天的特价', async () => {
    const ctx = await newRestaurant(t);
    await shop().rollSpecial(ctx.shardId, latestSlot(gameTime('2026-09-29', 12), [12]), gameTime('2026-09-29', 12));
    t.clock.set(gameTime('2026-09-30', 11));
    expect((await shop().special(ctx))!.day).toBe('2026-09-29');
    t.clock.set(new Date());
  });
});

describe('黑市、出售、丢弃', () => {
  it('黑市用钻石买', async () => {
    const ctx = await newRestaurant(t, { patch: { diamond: 20 } });
    await shop().buyBlack(ctx, { goodsId: 86, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(10);
  });
  it('出售 = 单价 × 数量 × 0.7；勋章不能卖；牌匾至少留 1 个', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { 13: 2, 174: 1 } });
    await shop().sell(ctx, { goodsId: 13, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1400);
    await expect(shop().sell(ctx, { goodsId: 174, num: 1 })).rejects.toMatchObject({ params: { reason: 'keep_one_plaque' } });
    await grantGoods(t.db, config, ctx.restaurantId, 167, 1, new Date());
    await expect(shop().sell(ctx, { goodsId: 167, num: 1 })).rejects.toMatchObject({ params: { reason: 'not_sellable' } });
  });
  it('只能丢弃升星促销勋章', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 1 } });
    await grantGoods(t.db, config, ctx.restaurantId, 87, 1, new Date());
    await shop().discard(ctx, { goodsId: 87 });
    expect(await goodsNum(t, ctx.restaurantId, 87)).toBe(0);
    await expect(shop().discard(ctx, { goodsId: 13 })).rejects.toMatchObject({ params: { reason: 'not_discardable' } });
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/shop`
Expected: FAIL

- [ ] **Step 4: 实现**

`apps/server/src/modules/shop/service.ts`：

```ts
import { goodsEffectHours, GOODS_TYPE, type Goods } from '@dt/config';
import {
  ErrorCode,
  hashSeed,
  latestSlot,
  seededRng,
  type ShopDto,
  type ShopItemDto,
  type ShopSpecialDto,
  type Slot,
} from '@dt/shared';
import { sql } from 'kysely';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin, spendDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { postNews } from '../news/news';
import { assertStoreRoom, consumeGoods, countGoods, grantGoodsOp, removeHonor } from '../store/goods';
import { isPlaque, sellPrice } from '../store/rules';

/** 勋章、牌匾只能一个一个买；永久的已拥有就不能再买；其他道具受持有上限和仓库容量限制 */
async function assertBuyable(o: Op, g: Goods, num: number): Promise<void> {
  const plaque = isPlaque(g);
  const honor = g.type === GOODS_TYPE.honor;
  if ((plaque || honor || !g.stackable) && num > 1) throw invalidState('single', { goodsId: g.id });
  const have = await countGoods(o, g.id);
  const permanent = plaque || (honor && goodsEffectHours(g) === null);
  if (permanent && have > 0) throw limitReached('owned', { goodsId: g.id });
  if (!plaque && !honor && have + num > g.maxNum) throw limitReached('max', { max: g.maxNum });
  await assertStoreRoom(o, g.id);
}

export function createShopService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'shop', source }, fn);

  async function specialRow(shardId: number) {
    const { tuning } = await d.shards.settings(shardId);
    const day = latestSlot(d.now(), [tuning.shop.specialHour]).day;
    return d.db
      .selectFrom('shop_special')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .executeTakeFirst();
  }

  return {
    async items(ctx: RestCtx): Promise<ShopDto> {
      const rows = await d.db.selectFrom('store_item').select(['goods_id', 'num']).where('rest_id', '=', ctx.restaurantId).execute();
      const owned = new Map(rows.map((r) => [r.goods_id, r.num]));
      const limitOf = (g: Goods) => (isPlaque(g) || g.type === GOODS_TYPE.honor || !g.stackable ? 1 : null);
      const coin: ShopItemDto[] = d.config.bundle.goods
        .filter((g) => g.onSale && g.coin > 0)
        .map((g) => ({ goodsId: g.id, price: g.coin, owned: owned.get(g.id) ?? 0, limit: limitOf(g) }));
      const black: ShopItemDto[] = d.config.bundle.shopPools.black
        .map((id) => d.config.requireGoods(id))
        .filter((g) => g.diamond > 0)
        .map((g) => ({ goodsId: g.id, price: g.diamond, owned: owned.get(g.id) ?? 0, limit: limitOf(g) }));
      return { coin, black };
    },

    async special(ctx: RestCtx): Promise<ShopSpecialDto | null> {
      const r = await specialRow(ctx.shardId);
      if (!r) return null;
      const g = d.config.requireGoods(r.goods_id);
      return {
        day: r.day,
        goodsId: r.goods_id,
        tierName: r.tier_name,
        discount: r.discount,
        price: Math.ceil(g.coin * r.discount),
        stock: r.stock,
        sold: r.sold,
      };
    },

    /** 每日特价（规格书 06 §6.5）：从特价池均匀抽一个，按 [0,1) 随机数落在哪个区间定折扣档 */
    async rollSpecial(shardId: number, slot: Slot, now: Date): Promise<{ goodsId: number; tier: string }> {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(hashSeed(shardId, 'shop-special', slot.day));
      const pool = d.config.bundle.shopPools.special;
      const goodsId = pool.length > 0 ? pool[rng.int(pool.length)]! : tuning.shop.specialFallbackGoods;
      const roll = rng.next();
      const tiers = d.config.bundle.shopSpecialTiers;
      const tier = tiers.find((x) => roll >= x.from && roll < x.to) ?? tiers[0]!;
      await d.db
        .insertInto('shop_special')
        .values({
          shard_id: shardId,
          day: slot.day,
          goods_id: goodsId,
          discount: tier.discount,
          tier_name: tier.name,
          stock: tier.stock,
        })
        .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
        .execute();
      await postNews(d.db, { shardId, type: 'shop.special', params: { goodsId, tier: tier.name } }, now);
      return { goodsId, tier: tier.name };
    },

    buy(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'shop.buy', async (o) => {
        const g = o.config.requireGoods(b.goodsId);
        if (!g.onSale || g.coin <= 0) throw invalidState('not_on_sale', { goodsId: g.id });
        await assertBuyable(o, g, b.num);
        spendCoin(o, g.coin * b.num);
        await grantGoodsOp(o, g.id, b.num);
        await emitAction(o, 'shop.buy');
        return { goodsId: g.id, num: b.num };
      });
    },

    buySpecial(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'shop.special', async (o) => {
        const day = latestSlot(o.now, [o.tuning.shop.specialHour]).day;
        const row = await o.tx
          .updateTable('shop_special')
          .set({ sold: sql<number>`sold + ${b.num}` })
          .where('shard_id', '=', o.shardId)
          .where('day', '=', day)
          .where(sql<boolean>`sold + ${b.num} <= stock`)
          .returning(['goods_id', 'discount'])
          .executeTakeFirst();
        if (!row) {
          const exists = await o.tx
            .selectFrom('shop_special')
            .select('day')
            .where('shard_id', '=', o.shardId)
            .where('day', '=', day)
            .executeTakeFirst();
          if (!exists) throw invalidState('no_special');
          throw new AppError(ErrorCode.SOLD_OUT, 400);
        }
        const g = o.config.requireGoods(row.goods_id);
        await assertBuyable(o, g, b.num);
        spendCoin(o, Math.ceil(g.coin * row.discount) * b.num);
        await grantGoodsOp(o, g.id, b.num);
        await emitAction(o, 'shop.buy');
        return { goodsId: g.id, num: b.num };
      });
    },

    buyBlack(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'shop.black', async (o) => {
        const g = o.config.requireGoods(b.goodsId);
        if (!o.config.bundle.shopPools.black.includes(g.id) || g.diamond <= 0)
          throw invalidState('not_on_sale', { goodsId: g.id });
        await assertBuyable(o, g, b.num);
        spendDiamond(o, g.diamond * b.num);
        await grantGoodsOp(o, g.id, b.num);
        return { goodsId: g.id, num: b.num };
      });
    },

    sell(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'shop.sell', async (o) => {
        const g = o.config.requireGoods(b.goodsId);
        const price = sellPrice(g, o.tuning);
        if (price === null) throw invalidState('not_sellable', { goodsId: g.id });
        if (isPlaque(g) && (await countGoods(o, g.id)) - b.num < 1) throw invalidState('keep_one_plaque');
        await consumeGoods(o, g.id, b.num);
        gainCoin(o, Math.floor(g.coin * b.num * o.tuning.shop.sellRate));
        return { goodsId: g.id, num: b.num };
      });
    },

    discard(ctx: RestCtx, b: { goodsId: number }) {
      return op(ctx, 'shop.discard', async (o) => {
        if (!o.tuning.shop.discardable.includes(b.goodsId)) throw invalidState('not_discardable', { goodsId: b.goodsId });
        if (!(await removeHonor(o, b.goodsId))) throw invalidState('not_owned', { goodsId: b.goodsId });
        return { goodsId: b.goodsId };
      });
    },
  };
}

export type ShopService = ReturnType<typeof createShopService>;
```

（出售价按 `sellPrice` 判断能不能卖，实际金额按 `单价 × 数量 × 0.7` 整体向下取整，与规格书一致。）

`apps/server/src/modules/shop/jobs.ts`：

```ts
import { latestSlot, parseSlotKey } from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { ShopService } from './service';

export function shopJobs(shop: ShopService): PeriodicJob[] {
  return [
    {
      name: 'shop-special',
      feature: 'shop',
      period: (now, s) => latestSlot(now, [s.tuning.shop.specialHour]).key,
      run: ({ shardId, period, now }) => shop.rollSpecial(shardId, parseSlotKey(period), now),
    },
  ];
}
```

`apps/server/src/modules/shop/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { buyBody, buySpecialBody, discardBody, sellBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ShopService } from './service';

export function shopRoutes(svc: ShopService): FastifyPluginAsync {
  return async (r) => {
    r.get('/items', async (req) => ok(await svc.items(restCtxOf(req))));
    r.get('/special', async (req) => ok(await svc.special(restCtxOf(req))));
    r.post('/buy', async (req) => okOp(await svc.buy(restCtxOf(req), parse(buyBody, req.body))));
    r.post('/buy-special', async (req) => okOp(await svc.buySpecial(restCtxOf(req), parse(buySpecialBody, req.body))));
    r.post('/buy-black', async (req) => okOp(await svc.buyBlack(restCtxOf(req), parse(buyBody, req.body))));
    r.post('/sell', async (req) => okOp(await svc.sell(restCtxOf(req), parse(sellBody, req.body))));
    r.post('/discard', async (req) => okOp(await svc.discard(restCtxOf(req), parse(discardBody, req.body))));
  };
}
```

`game.ts`：`Game` 加 `shop: ShopService`；`const shop = createShopService(deps); jobs.push(...shopJobs(shop));`；返回对象加 `shop`。`modules/index.ts`：`app.register(shopRoutes(game.shop), { prefix: '/api/v1/shop' });`

- [ ] **Step 5: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/shop`
Expected: PASS

- [ ] **Step 6: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(shop): coin shop, daily special, black market, sell and discard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 20: 菜场——三种货架、购买与限购、竞猜

**Files:**
- Create: `packages/shared/src/schemas/market.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/market/rules.ts`
- Test: `apps/server/src/modules/market/rules.test.ts`
- Create: `apps/server/src/modules/market/service.ts`
- Create: `apps/server/src/modules/market/jobs.ts`
- Create: `apps/server/src/modules/market/routes.ts`
- Test: `apps/server/src/modules/market/market.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `runOp`、`runSystemOp`、`addFoods`、`cupboardSlotsUsed`、`foodsMap`、`consumeGoods`、`hasValidHonor`、`grantAward`、`spendCoin`、`emitAction`、`restLog`、`WorldService.ensure`、`latestSlot`、`nextSlot`、`parseSlotKey`、`seededRng`、`hashSeed`、`pickWeighted`、`postNews`、`GOODS`
- Produces:
  - schema / DTO：`marketBuyBody`、`guessBody`、`MarketItemDto`、`MarketDto`
  - `Shelf = 0 | 1 | 2`、`rollShelf(shelf, hour, config, t, rng): ShelfItem[]`、`unitPrice(shelf, food, t, weather)`、`personLimit(shelf, food, openedAt, now, t)`
  - `MarketService`：`view(ctx)`、`buy(ctx, body)`、`joinGuess(ctx, foodsIds)`、`refresh(shardId, shelf, slot, now)`；`Game.market`
  - `marketJobs(market): PeriodicJob[]`（`market-daily`、`market-special`、`market-premium`）
  - 路由 `/api/v1/market`：`GET /view`、`POST /buy`、`POST /guess`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/market.ts`：

```ts
import { z } from 'zod';

export const marketBuyBody = z.object({
  itemId: z.number().int().positive(),
  num: z.number().int().min(1).max(1000),
});
export const guessBody = z.object({ foodsIds: z.array(z.number().int().positive()).min(1).max(20) });

export interface MarketItemDto {
  id: number;
  shelf: 0 | 1 | 2;
  foodsId: number;
  price: number;
  stock: number;
  left: number;
  hot: boolean;
  /** 本轮每人限购 */
  limit: number;
  /** 本轮我已经买了多少 */
  bought: number;
  openedAt: string;
}

export interface MarketDto {
  daily: MarketItemDto[];
  special: MarketItemDto[];
  premium: MarketItemDto[];
  nextDaily: string;
  nextSpecial: string;
  nextPremium: string;
  guess: {
    period: string;
    joined: number[] | null;
    last: { period: string; hits: number | null } | null;
    cost: number;
    maxPick: number;
    pool: number[];
  };
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/market';`。

- [ ] **Step 2: 写规则的失败测试**

`apps/server/src/modules/market/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { personLimit, rollShelf, unitPrice } from './rules';

const config = testConfig();
const t = config.tuning.market;

describe('货架（规格书 06 §6.1）', () => {
  it('日常：5 种（20 点 6 种），1~2 级，不重复；稀有食材库存 2048', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const items = rollShelf(0, 10, config, t, seededRng(seed));
      expect(items).toHaveLength(5);
      expect(new Set(items.map((x) => x.foodsId)).size).toBe(5);
      for (const x of items) {
        const f = config.requireFood(x.foodsId);
        expect([1, 2]).toContain(f.level);
        expect(x.stock).toBe(f.odds < 100 ? 2048 : 5999);
      }
    }
    expect(rollShelf(0, 20, config, t, seededRng(1))).toHaveLength(6);
  });
  it('特价：2 种 3~5 级，库存 40~79；可能多一种热门稀缺食材（库存减半）', () => {
    let sawHot = false;
    for (let seed = 1; seed <= 30; seed++) {
      const items = rollShelf(1, 10, config, t, seededRng(seed));
      const normal = items.filter((x) => !x.hot);
      expect(normal).toHaveLength(2);
      for (const x of normal) {
        expect([3, 4, 5]).toContain(config.requireFood(x.foodsId).level);
        expect(x.stock).toBeGreaterThanOrEqual(40);
        expect(x.stock).toBeLessThan(80);
      }
      const hot = items.filter((x) => x.hot);
      if (hot.length > 0) {
        sawHot = true;
        expect(hot[0]!.stock).toBeLessThan(40);
      }
    }
    expect(sawHot).toBe(true);
  });
  it('高级：3 种 4 级食材', () => {
    const items = rollShelf(2, 12, config, t, seededRng(3));
    expect(items).toHaveLength(3);
    expect(items.every((x) => config.requireFood(x.foodsId).level === 4)).toBe(true);
  });
});

describe('价格与限购（规格书 06 §6.2）', () => {
  const food = config.requireFood(101);
  it('价格随天气浮动；特价固定 2999；高级 ×2', () => {
    expect(unitPrice(0, food, t, { marketCoin: -0.2 })).toBeCloseTo(food.coin * 0.8);
    expect(unitPrice(1, food, t, {})).toBe(2999);
    expect(unitPrice(2, food, t, {})).toBe(food.coin * 2);
  });
  it('日常稀有食材上架 55 分钟内每人最多 odds×2+10 份', () => {
    const opened = new Date('2026-09-30T00:00:00Z');
    expect(personLimit(0, food, opened, new Date(opened.getTime() + 54 * 60_000), t)).toBe(food.odds * 2 + 10);
    expect(personLimit(0, food, opened, new Date(opened.getTime() + 56 * 60_000), t)).toBe(1000);
    expect(personLimit(1, food, opened, opened, t)).toBe(1);
    expect(personLimit(2, food, opened, opened, t)).toBe(9);
  });
});
```

（食材 101 大米的 odds 是 70，属于稀有食材。）

- [ ] **Step 3: 实现规则**

`apps/server/src/modules/market/rules.ts`：

```ts
import type { Food, GameConfig, Tuning } from '@dt/config';
import { buildPool, pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

export type Shelf = 0 | 1 | 2;

export interface ShelfItem {
  foodsId: number;
  stock: number;
  hot: boolean;
}

type MarketTuning = Tuning['market'];

function pickLevel(weights: Array<[number, number]>, rng: Rng): number {
  return pickWeighted(buildPool(weights, (w) => w[1]), rng)[0];
}

/** 货架进货（规格书 06 §6.1）：每种按 odds 在该等级里抽，同一批不重复 */
export function rollShelf(shelf: Shelf, hour: number, config: GameConfig, t: MarketTuning, rng: Rng): ShelfItem[] {
  const used = new Set<number>();
  const pickDistinct = (pool: WeightedPool<Food> | undefined): Food | null => {
    if (!pool || pool.total <= 0) return null;
    for (let i = 0; i < 20; i++) {
      const f = pickWeighted(pool, rng);
      if (!used.has(f.id)) {
        used.add(f.id);
        return f;
      }
    }
    return null;
  };
  const out: ShelfItem[] = [];
  if (shelf === 0) {
    const kinds = hour === t.dailyKindsLastHour ? t.dailyKindsLast : t.dailyKinds;
    for (let k = 0; k < kinds; k++) {
      const f = pickDistinct(config.foodPools.get(pickLevel(t.dailyLevelWeights, rng)));
      if (f) out.push({ foodsId: f.id, stock: f.odds < 100 ? t.dailyRareStock : t.dailyStock, hot: false });
    }
  } else if (shelf === 1) {
    for (let k = 0; k < t.specialKinds; k++) {
      const f = pickDistinct(config.foodPools.get(pickLevel(t.specialLevelWeights, rng)));
      if (f) out.push({ foodsId: f.id, stock: t.specialStockBase + rng.int(t.specialStockRand), hot: false });
    }
    if (rng.chance(t.specialHotChance)) {
      const f = pickDistinct(config.hotFoodPool);
      if (f) {
        out.push({
          foodsId: f.id,
          stock: Math.floor((t.specialStockBase + rng.int(t.specialStockRand)) / 2),
          hot: true,
        });
      }
    }
  } else {
    for (let k = 0; k < t.premiumKinds; k++) {
      const f = pickDistinct(config.foodPools.get(t.premiumLevel));
      if (f) {
        out.push({
          foodsId: f.id,
          stock: f.odds < 100 ? Math.floor(t.premiumStock * t.premiumRareFactor) : t.premiumStock,
          hot: false,
        });
      }
    }
  }
  return out;
}

/** 单价（规格书 06 §6.2）：天气 marketCoin 按比例浮动 */
export function unitPrice(shelf: Shelf, food: Food, t: MarketTuning, weather: Record<string, number>): number {
  const w = 1 + (weather.marketCoin ?? 0);
  if (shelf === 1) return t.specialPrice * w;
  if (shelf === 2) return food.coin * t.premiumPriceFactor * w;
  return food.coin * w;
}

/** 本轮每人（账号 / 设备 / IP 分别计）限购 */
export function personLimit(shelf: Shelf, food: Food, openedAt: Date, now: Date, t: MarketTuning): number {
  const base = t.shelfLimits[shelf];
  if (shelf === 0 && food.odds < 100 && now.getTime() - openedAt.getTime() < t.rareWindowMinutes * 60_000) {
    return Math.min(base, Math.floor(food.odds * t.rareLimitOddsFactor + t.rareLimitBase));
  }
  return base;
}
```

Run: `pnpm exec vitest run apps/server/src/modules/market/rules.test.ts`
Expected: PASS

- [ ] **Step 4: 写服务的失败测试**

`apps/server/src/modules/market/market.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, hashSeed, latestSlot, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';
import { rollShelf } from './rules';

const config = testConfig();
const t_ = config.tuning.market;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const m = () => t.game.market;
const uniqueIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function openShelf(shardId: number, shelf: 0 | 1 | 2, hour = 10) {
  const now = gameTime('2026-09-30', hour);
  t.clock.set(now);
  await m().refresh(shardId, shelf, latestSlot(now, [hour]), now);
  const items = await t.db.selectFrom('market_item').selectAll().where('shard_id', '=', shardId).where('shelf', '=', shelf).execute();
  return items;
}

describe('日常菜场', () => {
  it('进货后可以买：扣银币、进橱柜、记限购；新闻', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const items = await openShelf(ctx.shardId, 0);
    expect(items).toHaveLength(5);
    const it0 = items[0]!;
    const price = config.requireFood(it0.foods_id).coin;
    t.clock.set(new Date(t.clock.now.getTime() + 60 * 60_000));
    await m().buy({ ...ctx, ip: uniqueIp() }, { itemId: it0.id, num: 10 });
    expect((await foodNum(t, ctx.restaurantId, it0.foods_id)).num).toBe(10);
    const coin = (await restRow(t, ctx.restaurantId)).coin;
    expect(1_000_000 - coin).toBeGreaterThanOrEqual(Math.ceil(price * 10 * 0.5));
    const news = await t.db.selectFrom('news').selectAll().where('shard_id', '=', ctx.shardId).execute();
    expect(news.map((n) => n.type)).toContain('market.restock');
    const view = await m().view(ctx);
    expect(view.daily.find((x) => x.id === it0.id)).toMatchObject({ bought: 10, left: it0.stock - 10 });
  });

  it('卖完了报 SOLD_OUT；超过每人限购报 LIMIT_REACHED', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000_000, foods_max_num: 5000 } });
    const [item] = await openShelf(ctx.shardId, 0);
    t.clock.set(new Date(t.clock.now.getTime() + 60 * 60_000));
    await t.db.updateTable('market_item').set({ sold: item!.stock - 1 }).where('id', '=', item!.id).execute();
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 2 })).rejects.toMatchObject({ code: 'SOLD_OUT' });
    await t.db.updateTable('market_item').set({ sold: 0 }).where('id', '=', item!.id).execute();
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1000 })).resolves.toBeTruthy();
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
  });

  it('橱柜满了、没有这种食材时不能买', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, cupboard_num: 1 }, foods: { 457: 1 } });
    const [item] = await openShelf(ctx.shardId, 0);
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({ code: 'CUPBOARD_FULL' });
  });
});

describe('特价和高级菜场', () => {
  it('特价需要验证邮箱，每人每轮 1 份', async () => {
    const unverified = await newRestaurant(t, { patch: { coin: 100000 } });
    const [item] = await openShelf(unverified.shardId, 1);
    await expect(m().buy({ ...unverified, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
    const ctx = await newRestaurant(t, { shardId: unverified.shardId, patch: { coin: 100000 }, verified: true });
    await m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 });
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
    });
  });

  it('同一 IP 两次买特价要间隔 10 分钟（按游戏时间）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, verified: true });
    const items = await openShelf(ctx.shardId, 1);
    const ip = uniqueIp();
    await m().buy({ ...ctx, ip }, { itemId: items[0]!.id, num: 1 });
    await expect(m().buy({ ...ctx, ip }, { itemId: items[1]!.id, num: 1 })).rejects.toMatchObject({ code: 'COOLDOWN' });
    t.clock.advance(11 * 60_000);
    await m().buy({ ...ctx, ip }, { itemId: items[1]!.id, num: 1 });
  });

  it('同一个 IP 的两家店同时抢特价：最多成功一个，不超卖（Review Focus 1）', async () => {
    const a = await newRestaurant(t, { patch: { coin: 100000 }, verified: true });
    const b = await newRestaurant(t, { shardId: a.shardId, patch: { coin: 100000 }, verified: true });
    const [item] = await openShelf(a.shardId, 1);
    const ip = uniqueIp();
    const results = await Promise.allSettled([
      m().buy({ ...a, ip }, { itemId: item!.id, num: 1 }),
      m().buy({ ...b, ip }, { itemId: item!.id, num: 1 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(['LIMIT_REACHED', 'COOLDOWN']).toContain(failed.reason.code);
    const row = await t.db.selectFrom('market_item').select('sold').where('id', '=', item!.id).executeTakeFirstOrThrow();
    expect(row.sold).toBe(1);
  });

  it('高级菜场需要爱心项链；价格 ×2', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const [item] = await openShelf(ctx.shardId, 2, 12);
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
    });
    await grantGoods(t.db, config, ctx.restaurantId, 167, 1, t.clock.now);
    const before = (await restRow(t, ctx.restaurantId)).coin;
    await m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 });
    const food = config.requireFood(item!.foods_id);
    const snap = await t.game.world.ensure(ctx.shardId);
    const expected = Math.ceil(food.coin * 2 * (1 + (snap.weather.effects.marketCoin ?? 0)));
    expect(before - (await restRow(t, ctx.restaurantId)).coin).toBe(expected);
  });
});

describe('竞猜（规格书 06 §6.3）', () => {
  it('在 10:00:00 报名算进 12 点那一轮（Review Focus 2）；花 2 张神秘礼券；每轮一次', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    t.clock.set(gameTime('2026-09-30', 10));
    const r = await m().joinGuess(ctx, [238, 240]);
    expect(r.data.period).toBe('2026-09-30@12');
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    await expect(m().joinGuess(ctx, [238])).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('开奖：猜中 3 种得幸运饼干 ×3 + 三级食材兑换券 ×3；12 点猜中 5 种再加 15 蟹币', async () => {
    const three = await newRestaurant(t, { goods: { 1: 5 } });
    const five = await newRestaurant(t, { shardId: three.shardId, goods: { 1: 5 } });
    const slot = latestSlot(gameTime('2026-09-30', 12), t_.dailyHours);
    const opened = rollShelf(0, 12, config, t_, seededRng(hashSeed(three.shardId, 'market', 0, slot.key))).map((x) => x.foodsId);
    const wrong = config.bundle.marketGuessFoods.filter((id) => !opened.includes(id));
    t.clock.set(gameTime('2026-09-30', 11));
    await m().joinGuess(three, [...opened.slice(0, 3), ...wrong.slice(0, 2)]);
    await m().joinGuess(five, opened.slice(0, 5));
    t.clock.set(slot.start);
    await m().refresh(three.shardId, 0, slot, slot.start);
    expect(await goodsNum(t, three.restaurantId, 491)).toBe(3);
    expect(await goodsNum(t, three.restaurantId, 243)).toBe(3);
    expect(await goodsNum(t, three.restaurantId, 240)).toBe(0);
    expect(await goodsNum(t, five.restaurantId, 491)).toBe(5);
    expect(await goodsNum(t, five.restaurantId, 245)).toBe(5);
    expect(await goodsNum(t, five.restaurantId, 240)).toBe(15);
    const g = await t.db.selectFrom('market_guess').selectAll().where('rest_id', '=', five.restaurantId).executeTakeFirstOrThrow();
    expect(g).toMatchObject({ hits: 5 });
    t.clock.set(new Date());
  });
});
```

- [ ] **Step 5: 实现服务、任务、路由**

`apps/server/src/modules/market/service.ts`：

```ts
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { GOODS } from '@dt/config';
import {
  ErrorCode,
  hashSeed,
  nextSlot,
  seededRng,
  type MarketDto,
  type MarketItemDto,
  type Slot,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, runOp, runSystemOp, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { addFoods, cupboardSlotsUsed, foodsMap } from '../cupboard/foods';
import { postNews } from '../news/news';
import { consumeGoods, hasValidHonor } from '../store/goods';
import type { WorldService } from '../world/service';
import { personLimit, rollShelf, unitPrice, type Shelf } from './rules';

const deviceSubject = (id: string) => `dev:${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;

/**
 * 特价的同 IP 间隔（规格书 06 §6.2）：记下上次购买的游戏时间，按游戏时间比较（模拟器的虚拟时钟也适用），
 * 检查和写入在一个脚本里原子完成。KEYS[1]=键，ARGV=现在(毫秒)、间隔(毫秒)、键的保留秒数
 */
const COOLDOWN_LUA = `
local last = redis.call('GET', KEYS[1])
if last and tonumber(ARGV[1]) - tonumber(last) < tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1`;

/** 限购计数：累加后超过上限就不写入，并报 LIMIT_REACHED（并发时靠行锁串行） */
async function claimLimit(o: Op, itemId: number, subject: string, num: number, limit: number): Promise<void> {
  if (num > limit) throw limitReached('market', { limit });
  const r = await o.tx
    .insertInto('market_buy')
    .values({ market_item_id: itemId, subject, num })
    .onConflict((oc) =>
      oc
        .columns(['market_item_id', 'subject'])
        .doUpdateSet({ num: sql<number>`market_buy.num + excluded.num` })
        .where(sql<boolean>`market_buy.num + excluded.num <= ${limit}`),
    )
    .returning('num')
    .executeTakeFirst();
  if (!r) throw limitReached('market', { limit });
}

export function createMarketService(d: GameDeps, world: WorldService) {
  async function settleGuesses(shardId: number, slot: Slot, opened: number[], now: Date): Promise<number> {
    const guesses = await d.db
      .selectFrom('market_guess')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('period', '=', slot.key)
      .where('settled_at', 'is', null)
      .execute();
    for (const g of guesses) {
      const hits = g.foods_ids.filter((id) => opened.includes(id)).length;
      await runSystemOp(d, shardId, g.rest_id, { source: 'market.guess', now }, async (o) => {
        const award = o.config.bundle.guessAwards.find((a) => a.hits === hits);
        if (award) await grantAward(o, award.award, { source: 'market.guess' });
        if (o.tuning.market.guessBonusHours.includes(slot.hour)) {
          const bonus = o.config.bundle.guessBonus.find((b) => hits >= b.minHits);
          if (bonus) await grantAward(o, bonus.award, { source: 'market.guess.bonus' });
        }
        await o.tx
          .updateTable('market_guess')
          .set({ hits, settled_at: now })
          .where('shard_id', '=', shardId)
          .where('period', '=', slot.key)
          .where('rest_id', '=', g.rest_id)
          .execute();
        restLog(o, 'market.guess', { period: slot.key, hits });
      });
    }
    return guesses.length;
  }

  return {
    async view(ctx: RestCtx): Promise<MarketDto> {
      const now = d.now();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.market;
      const snap = await world.ensure(ctx.shardId, now);
      const rows = await d.db
        .selectFrom('market_item')
        .selectAll()
        .where('shard_id', '=', ctx.shardId)
        .orderBy('shelf')
        .orderBy('id')
        .execute();
      const bought = rows.length
        ? await d.db
            .selectFrom('market_buy')
            .select(['market_item_id', 'num'])
            .where('subject', '=', `rest:${ctx.restaurantId}`)
            .where(
              'market_item_id',
              'in',
              rows.map((r) => r.id),
            )
            .execute()
        : [];
      const boughtMap = new Map(bought.map((b) => [b.market_item_id, b.num]));
      const dto = (r: (typeof rows)[number]): MarketItemDto => {
        const food = d.config.requireFood(r.foods_id);
        const shelf = r.shelf as Shelf;
        return {
          id: r.id,
          shelf,
          foodsId: r.foods_id,
          price: Math.ceil(unitPrice(shelf, food, t, snap.weather.effects)),
          stock: r.stock,
          left: r.stock - r.sold,
          hot: r.hot,
          limit: personLimit(shelf, food, r.opened_at, now, t),
          bought: boughtMap.get(r.id) ?? 0,
          openedAt: r.opened_at.toISOString(),
        };
      };
      const period = nextSlot(now, t.dailyHours).key;
      const joined = await d.db
        .selectFrom('market_guess')
        .select('foods_ids')
        .where('shard_id', '=', ctx.shardId)
        .where('period', '=', period)
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirst();
      const last = await d.db
        .selectFrom('market_guess')
        .select(['period', 'hits'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('settled_at', 'is not', null)
        .orderBy('settled_at', 'desc')
        .limit(1)
        .executeTakeFirst();
      return {
        daily: rows.filter((r) => r.shelf === 0).map(dto),
        special: rows.filter((r) => r.shelf === 1).map(dto),
        premium: rows.filter((r) => r.shelf === 2).map(dto),
        nextDaily: nextSlot(now, t.dailyHours).start.toISOString(),
        nextSpecial: nextSlot(now, t.specialHours).start.toISOString(),
        nextPremium: nextSlot(now, t.premiumHours).start.toISOString(),
        guess: {
          period,
          joined: joined?.foods_ids ?? null,
          last: last ?? null,
          cost: t.guessCost,
          maxPick: t.guessMaxPick,
          pool: d.config.bundle.marketGuessFoods,
        },
      };
    },

    /** 货架刷新：删掉同类旧货，按固定种子进货，发新闻；日常菜场顺便开奖竞猜 */
    async refresh(shardId: number, shelf: Shelf, slot: Slot, now: Date): Promise<{ foods: number[]; guesses: number }> {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(hashSeed(shardId, 'market', shelf, slot.key));
      const items = rollShelf(shelf, slot.hour, d.config, tuning.market, rng);
      await d.db.transaction().execute(async (tx) => {
        await tx.deleteFrom('market_item').where('shard_id', '=', shardId).where('shelf', '=', shelf).execute();
        if (items.length > 0) {
          await tx
            .insertInto('market_item')
            .values(
              items.map((x) => ({
                shard_id: shardId,
                shelf,
                period: slot.key,
                foods_id: x.foodsId,
                stock: x.stock,
                hot: x.hot,
                opened_at: now,
              })),
            )
            .execute();
        }
        await postNews(tx, { shardId, type: 'market.restock', params: { shelf, foods: items.map((x) => x.foodsId) } }, now);
      });
      const foods = items.map((x) => x.foodsId);
      const guesses = shelf === 0 ? await settleGuesses(shardId, slot, foods, now) : 0;
      return { foods, guesses };
    },

    buy(ctx: RestCtx, b: { itemId: number; num: number }) {
      return runOp(d, ctx, { feature: 'market', source: 'market.buy' }, async (o) => {
        const item = await o.tx
          .selectFrom('market_item')
          .selectAll()
          .where('id', '=', b.itemId)
          .where('shard_id', '=', o.shardId)
          .executeTakeFirst();
        if (!item) throw invalidState('item_gone');
        const shelf = item.shelf as Shelf;
        const t = o.tuning.market;
        const food = o.config.requireFood(item.foods_id);
        if (shelf === 1) {
          const acc = await o.tx
            .selectFrom('account')
            .select('email_verified_at')
            .where('id', '=', ctx.accountId)
            .executeTakeFirstOrThrow();
          if (!acc.email_verified_at) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
        }
        if (shelf === 2 && !(await hasValidHonor(o, GOODS.loveNecklace)))
          throw requirement('necklace', { goodsId: GOODS.loveNecklace });
        const have = (await foodsMap(o.tx, o.rest.id)).get(food.id)?.num ?? 0;
        if (have === 0 && (await cupboardSlotsUsed(o.tx, o.rest.id)) >= o.rest.cupboard_num)
          throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
        if (have + b.num > o.rest.foods_max_num) throw limitReached('foods_max', { max: o.rest.foods_max_num });
        const limit = personLimit(shelf, food, item.opened_at, o.now, t);
        await claimLimit(o, item.id, `rest:${o.rest.id}`, b.num, limit);
        if (ctx.deviceId) await claimLimit(o, item.id, deviceSubject(ctx.deviceId), b.num, limit);
        await claimLimit(o, item.id, `ip:${ctx.ip}`, b.num, limit);
        const sold = await o.tx
          .updateTable('market_item')
          .set({ sold: sql<number>`sold + ${b.num}` })
          .where('id', '=', item.id)
          .where(sql<boolean>`sold + ${b.num} <= stock`)
          .returning('sold')
          .executeTakeFirst();
        if (!sold) throw new AppError(ErrorCode.SOLD_OUT, 400);
        const snap = await world.ensure(o.shardId, o.now);
        spendCoin(o, Math.ceil(unitPrice(shelf, food, t, snap.weather.effects) * b.num));
        if (shelf === 1) {
          const ok = await d.redis.eval(
            COOLDOWN_LUA,
            1,
            `mkt-ip:${o.shardId}:${ctx.ip}`,
            o.now.getTime(),
            t.specialIpCooldownSec * 1000,
            86_400,
          );
          if (Number(ok) !== 1) throw new AppError(ErrorCode.COOLDOWN, 429, { seconds: t.specialIpCooldownSec });
        }
        await addFoods(o, food.id, b.num);
        await emitAction(o, 'market.buy');
        return { itemId: item.id, foodsId: food.id, num: b.num };
      });
    },

    joinGuess(ctx: RestCtx, foodsIds: number[]) {
      return runOp(d, ctx, { feature: 'market', source: 'market.guess' }, async (o) => {
        const t = o.tuning.market;
        const ids = [...new Set(foodsIds)];
        if (ids.length === 0 || ids.length > t.guessMaxPick) throw invalidState('pick_count', { max: t.guessMaxPick });
        if (ids.some((id) => !o.config.guessFoodIds.has(id))) throw invalidState('bad_food');
        const period = nextSlot(o.now, t.dailyHours).key;
        const r = await o.tx
          .insertInto('market_guess')
          .values({ shard_id: o.shardId, period, rest_id: o.rest.id, foods_ids: ids, created_at: o.now })
          .onConflict((oc) => oc.columns(['shard_id', 'period', 'rest_id']).doNothing())
          .returning('period')
          .executeTakeFirst();
        if (!r) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        await consumeGoods(o, GOODS.mysteryTicket, t.guessCost);
        await emitAction(o, 'market.guess');
        return { period, foodsIds: ids };
      });
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
```

`apps/server/src/modules/market/jobs.ts`：

```ts
import type { Tuning } from '@dt/config';
import { latestSlot, parseSlotKey } from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { Shelf } from './rules';
import type { MarketService } from './service';

export function marketJobs(market: MarketService): PeriodicJob[] {
  const job = (name: string, shelf: Shelf, hours: (t: Tuning['market']) => number[]): PeriodicJob => ({
    name,
    feature: 'market',
    period: (now, s) => latestSlot(now, hours(s.tuning.market)).key,
    run: ({ shardId, period, now }) => market.refresh(shardId, shelf, parseSlotKey(period), now),
  });
  return [
    job('market-daily', 0, (t) => t.dailyHours),
    job('market-special', 1, (t) => t.specialHours),
    job('market-premium', 2, (t) => t.premiumHours),
  ];
}
```

`apps/server/src/modules/market/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { guessBody, marketBuyBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { MarketService } from './service';

export function marketRoutes(svc: MarketService): FastifyPluginAsync {
  return async (r) => {
    r.get('/view', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/buy', async (req) => okOp(await svc.buy(restCtxOf(req), parse(marketBuyBody, req.body))));
    r.post('/guess', async (req) => okOp(await svc.joinGuess(restCtxOf(req), parse(guessBody, req.body).foodsIds)));
  };
}
```

`game.ts`：`Game` 加 `market: MarketService`；`const market = createMarketService(deps, world); jobs.push(...marketJobs(market));`。`modules/index.ts`：`app.register(marketRoutes(game.market), { prefix: '/api/v1/market' });`

- [ ] **Step 6: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/market`
Expected: PASS

- [ ] **Step 7: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(market): daily/special/premium shelves, purchase limits per account/device/IP, guessing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: 任务、活跃度、签到

**Files:**
- Create: `packages/shared/src/schemas/task.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/task/rules.ts`
- Test: `apps/server/src/modules/task/rules.test.ts`
- Create: `apps/server/src/modules/task/handler.ts`
- Create: `apps/server/src/modules/task/service.ts`
- Create: `apps/server/src/modules/task/routes.ts`
- Test: `apps/server/src/modules/task/task.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `EventBus.on`、`featureAvailable`、`grantAward`、`grantGoodsOp`、`hasValidHonor`、`emitAction`、`incrementDaily`、`gameDay`、`normalizeCounts`、`GameConfig.activationByName/bundle.tasks/bundle.actionMap`
- Produces:
  - schema / DTO：`claimTaskBody`、`claimActivationBody`、`TaskDto`、`TasksDto`、`ActivationDto`
  - `stateValue(key, rest, counts): number | null`、`effectiveMainStep(step, mains, available): number`、`visibleSide(tasks, mainStep, done, available)`、`activationTotal(acts, counts)`
  - `registerTaskHandlers(bus, config)`（订阅 `action` 事件：全历史计数 + 活跃度）
  - `TaskService`：`tasks(ctx)`、`claimTask(ctx, taskId)`、`activation(ctx)`、`claimActivation(ctx, points)`、`signIn(ctx)`；`Game.task`
  - 路由 `/api/v1/task`：`GET /list`、`GET /activation`、`POST /claim`、`POST /activation/claim`、`POST /signin`

- [ ] **Step 1: 共享 schema**

`packages/shared/src/schemas/task.ts`：

```ts
import { z } from 'zod';
import type { AwardDto } from './growth';

export const claimTaskBody = z.object({ taskId: z.number().int().positive() });
export const claimActivationBody = z.object({ points: z.number().int().positive() });

export interface TaskDto {
  id: number;
  main: boolean;
  step: number;
  name: string;
  href: string;
  kind: 'counter' | 'state';
  key: string;
  target: number;
  progress: number;
  done: boolean;
  award: AwardDto;
}

export interface TasksDto {
  /** 实际所在的主线步骤（跳过了未开放的功能） */
  mainStep: number;
  main: TaskDto | null;
  side: TaskDto[];
}

export interface ActivationDto {
  total: number;
  signedIn: boolean;
  items: Array<{ id: number; name: string; points: number; limit: number; count: number; needStar: number }>;
  rewards: Array<{ points: number; award: AwardDto; claimed: boolean; multiplier: number }>;
}
```

`packages/shared/src/index.ts` 追加 `export * from './schemas/task';`。

- [ ] **Step 2: 写规则的失败测试**

`apps/server/src/modules/task/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { activationTotal, effectiveMainStep, stateValue, visibleSide } from './rules';

const config = testConfig();
const mains = config.bundle.tasks.filter((t) => t.main);
const implemented = new Set(['restaurant', 'growth', 'cookbook', 'cupboard', 'market', 'shop', 'store', 'task']);
const available = (f: string) => implemented.has(f);

describe('任务规则（设计文档 §5.8、裁定 7）', () => {
  it('主线跳过未开放功能的步骤：第 8 步打蟑螂、第 9 步加好友都跳到第 10 步', () => {
    expect(effectiveMainStep(7, mains, available)).toBe(7);
    expect(effectiveMainStep(8, mains, available)).toBe(10);
  });
  it('主线全部完成后返回最后一步 +1', () => {
    expect(effectiveMainStep(47, mains, available)).toBe(47);
  });
  it('支线：主线进度超过 step 才出现，已完成和未开放的不显示', () => {
    const side = visibleSide(config.bundle.tasks, 12, new Set(), available);
    expect(side.map((t) => t.cond.key)).toEqual(['market.guess']);
    expect(visibleSide(config.bundle.tasks, 12, new Set([side[0]!.id]), available)).toEqual([]);
  });
  it('状态条件', () => {
    const rest = { level: 12, star_level: 1, oil_level: 2 };
    const counts = { learned: 20, grade: [0, 10, 5, 3, 2, 0, 0, 0, 0, 0, 0], street: {} };
    expect(stateValue('rest.level', rest, counts)).toBe(12);
    expect(stateValue('cookbooks.learned', rest, counts)).toBe(20);
    expect(stateValue('cookbooks.grade3', rest, counts)).toBe(5);
    expect(stateValue('friends.count', rest, counts)).toBeNull();
  });
  it('活跃分：每项按每日次数上限计', () => {
    const acts = config.bundle.activationTasks;
    const counts = new Map([
      [1, 1],
      [29, 5],
    ]);
    expect(activationTotal(acts, counts)).toBe(10 + 5 * 2);
  });
});
```

- [ ] **Step 3: 实现规则**

`apps/server/src/modules/task/rules.ts`：

```ts
import type { ActivationTask, Task } from '@dt/config';
import type { CookbookCounts } from '../../db/schema';

/** 状态型条件的当前值；不认识的键返回 null（对应的功能尚未实现） */
export function stateValue(
  key: string,
  rest: { level: number; star_level: number; oil_level: number },
  counts: CookbookCounts,
): number | null {
  if (key === 'rest.level') return rest.level;
  if (key === 'rest.star') return rest.star_level;
  if (key === 'oil.level') return rest.oil_level;
  if (key === 'cookbooks.learned') return counts.learned;
  const m = /^cookbooks\.grade(\d+)$/.exec(key);
  if (m) {
    const g = Number(m[1]);
    return counts.grade.slice(g).reduce((s, x) => s + (x ?? 0), 0);
  }
  return null;
}

/** 从 step 开始，跳过功能不可用的主线步骤；全部完成时返回最后一步 +1 */
export function effectiveMainStep(step: number, mains: readonly Task[], available: (feature: string) => boolean): number {
  const byStep = new Map(mains.map((t) => [t.step, t]));
  let s = step;
  for (;;) {
    const t = byStep.get(s);
    if (!t || available(t.feature)) return s;
    s += 1;
  }
}

/** 可见的支线：step < 主线进度、没完成过、功能可用 */
export function visibleSide(
  tasks: readonly Task[],
  mainStep: number,
  done: ReadonlySet<number>,
  available: (feature: string) => boolean,
): Task[] {
  return tasks.filter((t) => !t.main && t.step < mainStep && !done.has(t.id) && available(t.feature));
}

/** 当日活跃总分 = Σ min(次数, 上限) × 分值 */
export function activationTotal(acts: readonly ActivationTask[], counts: ReadonlyMap<number, number>): number {
  return acts.reduce((s, a) => s + Math.min(counts.get(a.id) ?? 0, a.limitTimes) * a.points, 0);
}
```

Run: `pnpm exec vitest run apps/server/src/modules/task/rules.test.ts`
Expected: PASS（支线中 step < 12 且功能已实现的只有"参加一次菜场竞猜"）

- [ ] **Step 4: 写服务的失败测试**

`apps/server/src/modules/task/task.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const task = () => t.game.task;

describe('主线任务', () => {
  it('加油一次后完成第 1 步，领奖 2000 银币 + 200 经验，进入第 2 步', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000, oil: 0, oil_max: 1000 } });
    let list = await task().tasks(ctx);
    expect(list.main).toMatchObject({ step: 1, key: 'oil.fill', progress: 0, done: false });
    await t.game.growth.refuel(ctx);
    list = await task().tasks(ctx);
    expect(list.main).toMatchObject({ progress: 1, done: true });
    const before = await restRow(t, ctx.restaurantId);
    await task().claimTask(ctx, list.main!.id);
    const after = await restRow(t, ctx.restaurantId);
    expect(after.coin - before.coin).toBe(2000);
    expect(after.main_task_step).toBe(2);
    await expect(task().claimTask(ctx, list.main!.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('没完成不能领', async () => {
    const ctx = await newRestaurant(t);
    const list = await task().tasks(ctx);
    await expect(task().claimTask(ctx, list.main!.id)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
  });

  it('第 8 步起跳过未开放的功能（设计文档 裁定 7）', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 8, level: 5 } });
    const list = await task().tasks(ctx);
    expect(list.mainStep).toBe(10);
    expect(list.main).toMatchObject({ step: 10, key: 'rest.level', done: true });
    await task().claimTask(ctx, list.main!.id);
    expect((await restRow(t, ctx.restaurantId)).main_task_step).toBe(11);
  });

  it('支线：领完后不再显示', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 12 }, goods: { 1: 2 } });
    await t.game.market.joinGuess(ctx, [238]);
    const list = await task().tasks(ctx);
    const side = list.side.find((x) => x.key === 'market.guess')!;
    expect(side.done).toBe(true);
    await task().claimTask(ctx, side.id);
    expect((await task().tasks(ctx)).side.some((x) => x.id === side.id)).toBe(false);
  });
});

describe('活跃度（规格书 15 §15.2）', () => {
  it('签到 +10；给自己添油每次 5 分、每天最多 2 次', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000, oil: 0, oil_max: 1000 } });
    await task().signIn(ctx);
    for (let i = 0; i < 3; i++) {
      await t.db.updateTable('restaurant').set({ oil: 0 }).where('id', '=', ctx.restaurantId).execute();
      await t.game.growth.refuel(ctx);
    }
    const a = await task().activation(ctx);
    expect(a.signedIn).toBe(true);
    expect(a.total).toBe(10 + 10);
    expect(a.items.find((x) => x.name === '给自己添油')).toMatchObject({ count: 3, limit: 2 });
  });

  it('活跃奖励：经验 × 餐厅等级；有爱心项链翻倍；每档每天一次', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 10, exp: 0 } });
    const day = gameDay(t.clock.now);
    const put = (counts: Record<number, number>) =>
      t.db
        .insertInto('daily_counter')
        .values(Object.entries(counts).map(([id, count]) => ({ rest_id: ctx.restaurantId, day, key: `act:${id}`, count })))
        .execute();
    await put({ 1: 1, 4: 3, 20: 1, 21: 1 });
    expect((await task().activation(ctx)).total).toBe(35);
    await expect(task().claimActivation(ctx, 50)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await put({ 6: 1, 12: 1, 30: 1, 11: 1 });
    expect((await task().activation(ctx)).total).toBe(51);
    await grantGoods(t.db, config, ctx.restaurantId, 167, 1, t.clock.now);
    const r = await task().claimActivation(ctx, 50);
    expect(r.events).toContainEqual({ type: 'gain', kind: 'exp', num: 500 * 10 * 2 });
    await expect(task().claimActivation(ctx, 50)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });
});

describe('签到（规格书 15 §15.3）', () => {
  it('每天一次，得到每日签到礼包；按北京时间换日（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t);
    t.clock.set(new Date('2026-09-30T15:59:00Z'));
    await task().signIn(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 115)).toBe(1);
    await expect(task().signIn(ctx)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    t.clock.set(new Date('2026-09-30T16:00:00Z'));
    await task().signIn(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 115)).toBe(2);
    t.clock.set(new Date());
  });
});
```

（活跃项 id：1 签到 10 分、4 摆放设施 5×3、6 学习食谱 5、11 交换食材 3、12 帮好友添油 5、20 菜场买菜 5、21 商店购买 5、29 给自己添油 5×2、30 合成分解 3。"活跃奖励"用例先凑到 35 分验证不够 50 不能领，再补到 51 分。）

- [ ] **Step 5: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/task/task.test.ts`
Expected: FAIL，`t.game.task` 为 undefined

- [ ] **Step 6: 实现事件订阅、服务、路由**

`apps/server/src/modules/task/handler.ts`：

```ts
import { sql } from 'kysely';
import type { GameConfig } from '@dt/config';
import { gameDay } from '@dt/shared';
import type { EventBus } from '../../events/bus';
import { incrementDaily } from '../counter/dailyCounter';

interface ActionPayload {
  key: string;
  n: number;
  star: number;
  at: string;
}

/** 玩家行为 → 全历史计数（任务）+ 当日活跃（设计文档 §5.1） */
export function registerTaskHandlers(bus: EventBus, config: GameConfig): void {
  bus.on('action', async (tx, e) => {
    const p = e.payload as unknown as ActionPayload;
    await tx
      .insertInto('event_counter')
      .values({ rest_id: e.restId, key: p.key, count: p.n })
      .onConflict((oc) => oc.columns(['rest_id', 'key']).doUpdateSet({ count: sql<number>`event_counter.count + ${p.n}` }))
      .execute();
    const name = config.bundle.actionMap.activation[p.key];
    if (!name) return;
    const act = config.activationByName.get(name);
    if (!act || p.star < act.needStar) return;
    await incrementDaily(tx, e.restId, `act:${act.id}`, p.n, gameDay(new Date(p.at)));
  });
}
```

`apps/server/src/modules/task/service.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type Award, type Task } from '@dt/config';
import { ErrorCode, gameDay, type ActivationDto, type TaskDto, type TasksDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { invalidState, requirement } from '../../core/errors';
import { runOp, setRest, type Op } from '../../core/op';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { incrementDaily } from '../counter/dailyCounter';
import { normalizeCounts } from '../settlement/globals';
import { grantGoodsOp, hasValidHonor } from '../store/goods';
import { activationTotal, effectiveMainStep, stateValue, visibleSide } from './rules';

const SIGNIN_KEY = 'signin';
const claimKey = (points: number) => `act.claim:${points}`;

export function createTaskService(d: GameDeps) {
  const mains = d.config.bundle.tasks.filter((t) => t.main).sort((a, b) => a.step - b.step);

  async function snapshot(db: Kysely<DB>, rest: RestaurantRow) {
    const settings = await d.shards.settings(rest.shard_id);
    const available = (f: string) => featureAvailable(settings, f);
    const done = new Set(
      (await db.selectFrom('task_done').select('task_id').where('rest_id', '=', rest.id).execute()).map((r) => r.task_id),
    );
    const counters = new Map(
      (await db.selectFrom('event_counter').select(['key', 'count']).where('rest_id', '=', rest.id).execute()).map(
        (r) => [r.key, r.count],
      ),
    );
    const counts = normalizeCounts(rest.cookbook_counts);
    const progressOf = (t: Task) =>
      t.cond.kind === 'counter' ? (counters.get(t.cond.key) ?? 0) : (stateValue(t.cond.key, rest, counts) ?? 0);
    const mainStep = effectiveMainStep(rest.main_task_step, mains, available);
    const main = mains.find((t) => t.step === mainStep) ?? null;
    const side = visibleSide(d.config.bundle.tasks, mainStep, done, available);
    return { mainStep, main, side, progressOf };
  }

  const dto = (t: Task, progress: number): TaskDto => ({
    id: t.id,
    main: t.main,
    step: t.step,
    name: t.name,
    href: t.href,
    kind: t.cond.kind,
    key: t.cond.key,
    target: t.cond.target,
    progress,
    done: progress >= t.cond.target,
    award: t.award,
  });

  async function activationOf(db: Kysely<DB>, rest: RestaurantRow, day: string): Promise<ActivationDto> {
    const rows = await db
      .selectFrom('daily_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', rest.id)
      .where('day', '=', day)
      .execute();
    const byKey = new Map(rows.map((r) => [r.key, r.count]));
    const acts = d.config.bundle.activationTasks.filter((a) => a.limitTimes > 0);
    const counts = new Map(acts.map((a) => [a.id, byKey.get(`act:${a.id}`) ?? 0]));
    const necklace = await db
      .selectFrom('store_item')
      .select('expires_at')
      .where('rest_id', '=', rest.id)
      .where('goods_id', '=', GOODS.loveNecklace)
      .executeTakeFirst();
    const multiplier = necklace && (necklace.expires_at === null || necklace.expires_at > d.now()) ? 2 : 1;
    return {
      total: activationTotal(acts, counts),
      signedIn: (byKey.get(SIGNIN_KEY) ?? 0) > 0,
      items: acts.map((a) => ({
        id: a.id,
        name: a.name,
        points: a.points,
        limit: a.limitTimes,
        count: counts.get(a.id) ?? 0,
        needStar: a.needStar,
      })),
      rewards: d.config.bundle.activationRewards.map((r) => ({
        points: r.points,
        award: r.award,
        claimed: (byKey.get(claimKey(r.points)) ?? 0) > 0,
        multiplier,
      })),
    };
  }

  /** 活跃奖励：经验按 × 餐厅等级（规格书 15 §15.2） */
  const scaled = (a: Award, level: number): Award => (a.exp ? { ...a, exp: a.exp * level } : a);

  return {
    async tasks(ctx: RestCtx): Promise<TasksDto> {
      const rest = await d.db.selectFrom('restaurant').selectAll().where('id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
      const s = await snapshot(d.db, rest);
      return {
        mainStep: s.mainStep,
        main: s.main ? dto(s.main, s.progressOf(s.main)) : null,
        side: s.side.map((t) => dto(t, s.progressOf(t))),
      };
    },

    claimTask(ctx: RestCtx, taskId: number) {
      return runOp(d, ctx, { feature: 'task', source: 'task' }, async (o: Op) => {
        const s = await snapshot(o.tx, o.rest);
        const t = s.main?.id === taskId ? s.main : s.side.find((x) => x.id === taskId);
        if (!t) throw invalidState('not_visible', { taskId });
        const progress = s.progressOf(t);
        if (progress < t.cond.target) throw requirement('task', { progress, target: t.cond.target });
        await grantAward(o, t.award, { source: t.main ? 'task.main' : 'task.side' });
        if (t.main) setRest(o, 'main_task_step', t.step + 1);
        else await o.tx.insertInto('task_done').values({ rest_id: o.rest.id, task_id: t.id, done_at: o.now }).execute();
        return { taskId: t.id };
      });
    },

    async activation(ctx: RestCtx): Promise<ActivationDto> {
      const rest = await d.db.selectFrom('restaurant').selectAll().where('id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
      return activationOf(d.db, rest, gameDay(d.now()));
    },

    claimActivation(ctx: RestCtx, points: number) {
      return runOp(d, ctx, { feature: 'task', source: 'activation' }, async (o) => {
        const reward = o.config.bundle.activationRewards.find((r) => r.points === points);
        if (!reward) throw invalidState('no_reward', { points });
        const day = gameDay(o.now);
        const a = await activationOf(o.tx, o.rest, day);
        if (a.total < points) throw requirement('activation', { need: points, have: a.total });
        if ((await incrementDaily(o.tx, o.rest.id, claimKey(points), 1, day)) > 1)
          throw new AppError(ErrorCode.ALREADY_DONE, 400);
        const multiplier = (await hasValidHonor(o, GOODS.loveNecklace)) ? 2 : 1;
        await grantAward(o, scaled(reward.award, o.rest.level), { multiplier });
        return { points };
      });
    },

    signIn(ctx: RestCtx) {
      return runOp(d, ctx, { feature: 'task', source: 'signin' }, async (o) => {
        if ((await incrementDaily(o.tx, o.rest.id, SIGNIN_KEY, 1, gameDay(o.now))) > 1)
          throw new AppError(ErrorCode.ALREADY_DONE, 400);
        await grantGoodsOp(o, GOODS.signInGift, 1);
        await emitAction(o, 'signin');
        return { signedIn: true };
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
```

`apps/server/src/modules/task/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { claimActivationBody, claimTaskBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TaskService } from './service';

export function taskRoutes(svc: TaskService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.tasks(restCtxOf(req))));
    r.get('/activation', async (req) => ok(await svc.activation(restCtxOf(req))));
    r.post('/claim', async (req) => okOp(await svc.claimTask(restCtxOf(req), parse(claimTaskBody, req.body).taskId)));
    r.post('/activation/claim', async (req) =>
      okOp(await svc.claimActivation(restCtxOf(req), parse(claimActivationBody, req.body).points)),
    );
    r.post('/signin', async (req) => okOp(await svc.signIn(restCtxOf(req))));
  };
}
```

`game.ts`：`Game` 加 `task: TaskService`；在 `createGame` 里 `registerTaskHandlers(app.bus, app.config);` 并 `task: createTaskService(deps)`。`modules/index.ts`：`app.register(taskRoutes(game.task), { prefix: '/api/v1/task' });`

- [ ] **Step 7: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/task`
Expected: PASS

- [ ] **Step 8: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add packages/shared apps/server
git commit -m "feat(task): event counters, main/side tasks skipping unavailable features, activation, sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 22: 测试时钟接口

**Files:**
- Create: `apps/server/src/infra/clock.ts`
- Create: `apps/server/src/http/testApi.ts`
- Modify: `apps/server/src/env.ts`（`ENABLE_TEST_API`）
- Modify: `apps/server/src/app.ts`（`AppDeps.clock`，注册测试接口）
- Modify: `apps/server/src/deps.ts`
- Modify: `apps/server/.env.development`、`infra/.env.example`
- Test: `apps/server/src/http/testApi.test.ts`

**Interfaces:**
- Consumes: `runDueJobs`、`Game`
- Produces:
  - `ShiftClock { now(): Date; advance(ms: number): void; offset(): number }`、`createShiftClock(base?)`
  - `AppDeps.clock?: ShiftClock`
  - `POST /api/v1/test/tick { minutes: 0..1440, shardIds?: number[] }` → `{ now, ran: JobRunResult[] }`，只在 `ENABLE_TEST_API=true` 且非生产环境时注册

- [ ] **Step 1: 写失败的测试**

`apps/server/src/http/testApi.test.ts`：

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { createShard } from '../../test/fixtures';
import { call, createTestApp, testEnvWith, type TestContext } from '../../test/helpers';
import { createShiftClock } from '../infra/clock';

const contexts: TestContext[] = [];
afterAll(async () => {
  for (const c of contexts) await c.close();
});

describe('测试时钟接口', () => {
  it('推进时钟并执行到期的周期任务', async () => {
    const clock = createShiftClock();
    const ctx = await createTestApp({ env: testEnvWith({ ENABLE_TEST_API: true }), clock, now: clock.now });
    contexts.push(ctx);
    const shardId = await createShard(ctx.deps.db);
    const before = clock.now().getTime();
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', { body: { minutes: 4, shardIds: [shardId] } });
    expect(r.status).toBe(200);
    expect(new Date(r.json.data.now).getTime() - before).toBeGreaterThanOrEqual(4 * 60_000);
    expect(r.json.data.ran.map((x: { job: string }) => x.job)).toContain('settlement');
  });

  it('没有开启时不存在这个接口', async () => {
    const ctx = await createTestApp();
    contexts.push(ctx);
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', { body: { minutes: 1 } });
    expect(r.status).toBe(404);
  });

  it('生产环境不允许开启', async () => {
    const { loadEnv } = await import('../env');
    expect(() =>
      loadEnv({
        ...process.env,
        NODE_ENV: 'production',
        ENABLE_TEST_API: 'true',
        TURNSTILE_SECRET: 'x',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow('ENABLE_TEST_API');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/http/testApi.test.ts`
Expected: FAIL，`../infra/clock` 不存在

- [ ] **Step 3: 实现**

`apps/server/src/infra/clock.ts`：

```ts
/** 可以推进的时钟：只用于开发和端到端测试（ENABLE_TEST_API） */
export interface ShiftClock {
  now(): Date;
  advance(ms: number): void;
  offset(): number;
}

export function createShiftClock(base: () => number = Date.now): ShiftClock {
  let offset = 0;
  return {
    now: () => new Date(base() + offset),
    advance: (ms) => {
      offset += ms;
    },
    offset: () => offset,
  };
}
```

`apps/server/src/env.ts`：`envSchema` 加 `ENABLE_TEST_API: bool.default('false'),`；`loadEnv` 的生产检查里加：

```ts
    if (env.ENABLE_TEST_API) throw new Error('ENABLE_TEST_API must be false in production');
```

`apps/server/src/http/testApi.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Game } from '../game';
import type { ShiftClock } from '../infra/clock';
import { runDueJobs } from '../worker/periodic';
import { ok } from './reply';
import { parse } from './validate';

const tickBody = z.object({
  minutes: z.number().int().min(0).max(1440),
  shardIds: z.array(z.number().int().positive()).optional(),
});

/** 开发和端到端测试用：推进时钟，并立刻执行到期的周期任务（开发环境不跑 worker） */
export function testApiRoutes(game: Game, clock: ShiftClock): FastifyPluginAsync {
  return async (r) => {
    r.post('/tick', async (req) => {
      const b = parse(tickBody, req.body);
      clock.advance(b.minutes * 60_000);
      const ran = await runDueJobs(
        { db: game.app.db, shards: game.shards, now: game.deps.now, log: req.log },
        game.jobs,
        { shardIds: b.shardIds },
      );
      return ok({ now: game.deps.now().toISOString(), ran });
    });
  };
}
```

`apps/server/src/app.ts`：
1. `AppDeps` 加 `clock?: ShiftClock;`（`import type { ShiftClock } from './infra/clock';`）
2. `registerModules(app, createGame(deps));` 改为：

```ts
  const game = createGame(deps);
  registerModules(app, game);
  if (deps.env.ENABLE_TEST_API && deps.clock) {
    app.register(testApiRoutes(game, deps.clock), { prefix: '/api/v1/test' });
  }
```

（导入 `testApiRoutes`。）

`apps/server/src/deps.ts`：

```ts
export function createDeps(env: Env): AppDeps {
  const redis = createRedis(env.REDIS_URL);
  const clock = env.ENABLE_TEST_API ? createShiftClock() : undefined;
  return {
    env,
    db: createDb(env.DATABASE_URL, env.DB_POOL_SIZE),
    redis,
    config: loadGameConfig(env.CONFIG_BUNDLE_PATH),
    mailer: smtpMailer(env.SMTP_URL, env.MAIL_FROM),
    captcha: env.TURNSTILE_SECRET ? turnstileCaptcha(env.TURNSTILE_SECRET) : disabledCaptcha(),
    bus: new EventBus(),
    sessions: createSessionStore(redis, env.SESSION_TTL_DAYS * 86400),
    now: clock ? clock.now : () => new Date(),
    clock,
  };
}
```

`apps/server/.env.development` 追加一行 `ENABLE_TEST_API=true`；`infra/.env.example` 追加注释和一行：

```
# 只在开发环境使用；生产环境开启会拒绝启动
ENABLE_TEST_API=false
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/http/testApi.test.ts`
Expected: PASS

- [ ] **Step 5: 全部测试、类型检查、提交**

Run: `pnpm exec vitest run apps/server && pnpm typecheck && pnpm format`

```bash
git add apps/server infra
git commit -m "feat(server): shiftable clock and test tick endpoint for dev/e2e

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: 前端基础——接口、目录、得失提示、导航、错误文案

**Files:**
- Modify: `apps/web/src/api/client.ts`（得失事件回调）
- Modify: `apps/web/src/api/endpoints.ts`
- Create: `apps/web/src/stores/catalog.ts`
- Create: `apps/web/src/stores/toast.ts`
- Create: `apps/web/src/stores/restaurant.ts`
- Create: `apps/web/src/utils/events.ts`
- Create: `apps/web/src/utils/labels.ts`
- Test: `apps/web/src/utils/events.test.ts`
- Create: `apps/web/src/components/EventToast.vue`
- Create: `apps/web/src/components/BottomNav.vue`
- Create: `apps/web/src/components/NeedChecks.vue`
- Create: `apps/web/src/views/MoreView.vue`
- Modify: `apps/web/src/i18n/zh-CN.ts`
- Test: `apps/web/src/i18n/zh-CN.test.ts`
- Modify: `apps/web/src/App.vue`、`apps/web/src/main.ts`、`apps/web/src/router.ts`、`apps/web/src/styles/main.css`

**Interfaces:**
- Consumes: 服务端全部路由（Task 9、13~21），`@dt/shared` 的 DTO
- Produces:
  - `setEventsListener(fn: (events: GameEvent[]) => void)`（`api/client.ts`）
  - `endpoints` 新增：`world.weather/catalog`、`restaurant.floor/income/buffs/log`、`growth.*`、`cookbook.*`、`cupboard.*`、`market.*`、`shop.*`、`store.*`、`task.*`（见代码）
  - `useCatalogStore()`：`load()`、`goodsName(id)`、`foodName(id)`、`food(id)`、`goods(id)`、`streetName(id)`
  - `useToastStore()`：`push(text, variant?)`、`items`
  - `useRestaurantStore()`：`rest`、`refresh()`
  - `eventText(e, names)`、`CUSTOMER_NAMES`、`RATE_LABELS`、`PART_LABELS`、`GRADE_NAMES`、`logText(log, names)`
  - `setNameResolver(r)`、`errorText(code, params)` 支持 NOT_ENOUGH / REQUIREMENT_NOT_MET / LIMIT_REACHED / INVALID_STATE 的参数

- [ ] **Step 1: 写失败的测试**

`apps/web/src/utils/events.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { eventText, logText } from './events';

const names = { goodsName: (id: number) => ({ 1: '神秘礼券' })[id] ?? `道具${id}`, foodName: () => '大米' };

describe('得失提示文案', () => {
  it('银币、道具、食材、幸运', () => {
    expect(eventText({ type: 'gain', kind: 'coin', num: 1500 }, names)).toBe('获得 银币 1,500');
    expect(eventText({ type: 'loss', kind: 'coin', num: 200 }, names)).toBe('消耗 银币 200');
    expect(eventText({ type: 'gain', kind: 'goods', id: 1, num: 3, lucky: true }, names)).toBe('获得 神秘礼券×3（幸运）');
    expect(eventText({ type: 'gain', kind: 'foods', id: 101, num: 2 }, names)).toBe('获得 大米×2');
  });
});

describe('个人日志文案', () => {
  it('升级、老鼠、蟹老板', () => {
    expect(logText({ type: 'level.up', params: { from: 1, to: 3 }, at: '' }, names)).toBe('餐厅升到了 3 级');
    expect(logText({ type: 'mouse.steal', params: { foodsId: 101, num: 2 }, at: '' }, names)).toBe('老鼠偷走了 大米×2');
    expect(logText({ type: 'krab.angry', params: {}, at: '' }, names)).toBe('蟹老板扫兴而归');
    expect(logText({ type: 'unknown.type', params: {}, at: '' }, names)).toBe('unknown.type');
  });
});
```

`apps/web/src/i18n/zh-CN.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { errorText, setNameResolver } from './zh-CN';

describe('错误文案', () => {
  it('资源不够时说清楚缺什么', () => {
    setNameResolver({ goodsName: () => '升星凭证', foodName: () => '大米' });
    expect(errorText('NOT_ENOUGH', { kind: 'coin', need: 500, have: 100 })).toBe('银币不够（需要 500，现有 100）');
    expect(errorText('NOT_ENOUGH', { kind: 'goods', id: 86, need: 1, have: 0 })).toBe('升星凭证不够（需要 1，现有 0）');
    expect(errorText('NOT_ENOUGH', { kind: 'foods', id: 101, need: 3, have: 1 })).toBe('大米不够（需要 3，现有 1）');
  });
  it('条件、上限、状态按原因说明', () => {
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'level', need: 13, have: 12 })).toBe('餐厅等级不够（需要 13 级）');
    expect(errorText('LIMIT_REACHED', { what: 'market', limit: 1 })).toBe('这批货每人限购 1 份');
    expect(errorText('INVALID_STATE', { reason: 'oil_full' })).toBe('油壶已经是满的');
    expect(errorText('INVALID_STATE', { reason: 'no_such_reason' })).toBe('当前状态下不能这样做');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/src/utils/events.test.ts apps/web/src/i18n/zh-CN.test.ts`
Expected: FAIL，`./events` 不存在 / `setNameResolver` 不存在

- [ ] **Step 3: 文案与标签**

`apps/web/src/utils/labels.ts`：

```ts
/** 顾客类型（规格书 01 §1.4） */
export const CUSTOMER_NAMES: Record<string, string> = {
  '0': '空桌',
  '1': '普通顾客',
  '2': '挑剔顾客',
  '3': '蟑螂',
  '-3': '蟑螂（已消灭）',
  '6': '章鱼哥',
  '7': '痞老板',
  '8': '蟹老板',
  '9': '白食',
};

export const GRADE_NAMES = ['未学', '普通', '中品', '上品', '极品', '金牌', '珍品', '佳肴', '仙珍', '圣宴', '天馔'];

export const RATE_LABELS: Record<string, { label: string; percent: boolean }> = {
  atRate: { label: '上座率', percent: true },
  spRate: { label: '挑剔率', percent: true },
  coinRate: { label: '银币加成', percent: true },
  expRate: { label: '经验加成', percent: true },
  coinValue: { label: '每桌银币', percent: false },
  expValue: { label: '每桌经验', percent: false },
  oilRate: { label: '耗油加成', percent: true },
  oilValue: { label: '每桌耗油', percent: false },
  luck: { label: '幸运', percent: false },
};

export const PART_LABELS: Record<string, string> = {
  base: '基本',
  cookbook: '食谱',
  effects: '道具与荣誉',
  weather: '天气',
  bless: '祝福',
  renown: '负声望',
  float: '浮动',
  plaque: '集牌匾',
  honor: '集荣誉',
  pot: '集盆栽',
  painting: '集名画',
  spOverflow: '挑剔溢出',
  atOverflow: '上座溢出',
  starPotential: '星潜力',
  cte: '银币转经验',
};

export const TASTE_NAMES = ['', '酸', '甘', '苦', '辛', '咸', '鲜'];

export function pct(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return `${v >= 0 ? '+' : ''}${v}%`;
}
```

`apps/web/src/utils/events.ts`：

```ts
import type { GameEvent, RestLogDto } from '@dt/shared';
import { formatNum } from './format';

export interface Names {
  goodsName(id: number): string;
  foodName(id: number): string;
}

const KIND_NAMES: Record<string, string> = {
  coin: '银币',
  diamond: '钻石',
  exp: '经验',
  renown: '声望',
  oil: '油',
  strength: '体力',
};

export function eventText(e: GameEvent, names: Names): string {
  const verb = e.type === 'gain' ? '获得' : '消耗';
  let what: string;
  if (e.kind === 'goods') what = `${names.goodsName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'foods') what = `${names.foodName(e.id ?? 0)}×${formatNum(e.num)}`;
  else what = `${KIND_NAMES[e.kind] ?? e.kind} ${formatNum(e.num)}`;
  return `${verb} ${what}${e.lucky ? '（幸运）' : ''}`;
}

type P = Record<string, unknown>;
const n = (p: P, k: string) => Number(p[k] ?? 0);

const LOGS: Record<string, (p: P, names: Names) => string> = {
  'level.up': (p) => `餐厅升到了 ${n(p, 'to')} 级`,
  'star.up': (p) => `餐厅升到了 ${n(p, 'star')} 星`,
  'oil.expand': (p) => `油壶扩容到 ${n(p, 'level')} 级（上限 ${formatNum(n(p, 'oilMax'))}）`,
  'rest.closed': () => '油用光了，餐厅停业',
  'rest.reopen': () => '加满了油，餐厅恢复营业',
  'rest.rename': (p) => `餐厅改名为「${String(p.to ?? '')}」`,
  'rest.move': () => '餐厅搬家了',
  'mouse.escape': () => '老鼠来了，幸运地躲过一劫',
  'mouse.trap': (p) => `捕鼠夹抓到了老鼠，得到 ${formatNum(n(p, 'coin'))} 银币`,
  'mouse.steal': (p, names) => `老鼠偷走了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
  'mouse.nothing': () => '老鼠来了，什么也没偷到',
  'mouse.map': () => '老鼠留下了一张探险图',
  'krab.happy': () => '蟹老板吃得很满意，回味无穷',
  'krab.angry': () => '蟹老板扫兴而归',
  'krab.husky': () => '蟹老板摸了摸二哈，没有生气',
  'krab.painting': () => '蟹老板欣赏名画，心满意足',
  'krab.driven': () => '赶走了生气的蟹老板',
  'plankton.appear': () => '痞老板来店里了',
  'plankton.driven': () => '赶走了痞老板',
  'fridge.drop': (p, names) => `冰箱满了，丢掉了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
  'goods.drop': (p, names) => `超过持有上限，丢掉了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
  'device.place': (p, names) => `摆放了 ${names.goodsName(n(p, 'goodsId'))}`,
  'store.use': (p, names) => `使用了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
  'market.guess': (p) => `菜场竞猜开奖：猜中 ${n(p, 'hits')} 种`,
};

export function logText(l: RestLogDto, names: Names): string {
  const f = LOGS[l.type];
  return f ? f(l.params, names) : l.type;
}
```

`apps/web/src/i18n/zh-CN.ts`：
1. 在 `NAME_REASON` 之后加：

```ts
export interface NameResolver {
  goodsName(id: number): string;
  foodName(id: number): string;
}
let names: NameResolver = { goodsName: (id) => `道具${id}`, foodName: (id) => `食材${id}` };
/** 由目录 store 在加载后注入，错误文案里才能显示道具、食材名称 */
export function setNameResolver(r: NameResolver): void {
  names = r;
}

const KIND: Record<string, string> = {
  coin: '银币',
  diamond: '钻石',
  strength: '体力',
  attrPoint: '属性点',
};

const REQUIREMENT: Record<string, (p: Record<string, unknown>) => string> = {
  level: (p) => `餐厅等级不够（需要 ${String(p.need)} 级）`,
  star: (p) => `星级不够（需要 ${String(p.need)} 星）`,
  cookbooks: (p) => `学会的食谱不够（需要 ${String(p.need)} 道）`,
  not_available: () => '这个星级暂未开放',
  slot_locked: () => '这个设施位还没开放',
  statue: (p) => `需要持有 ${names.goodsName(Number(p.goodsId))}`,
  necklace: () => '需要佩戴有效的爱心项链',
  task: (p) => `任务还没完成（${String(p.progress)}/${String(p.target)}）`,
  activation: (p) => `活跃度不够（需要 ${String(p.need)}）`,
};

const LIMIT: Record<string, (p: Record<string, unknown>) => string> = {
  market: (p) => `这批货每人限购 ${String(p.limit)} 份`,
  foods_max: (p) => `单种食材最多 ${String(p.max)} 个`,
  tables: () => '餐桌已经摆满了（受等级和楼层限制）',
  lock: () => '锁定格用完了',
  owned: () => '已经拥有了，不能再买',
  max: (p) => `最多持有 ${String(p.max)} 个`,
};

const STATE: Record<string, string> = {
  oil_full: '油壶已经是满的',
  max_star: '已经是最高星级了',
  max_oil: '油壶已经是最高级了',
  wrong_device: '这个道具不能摆在这个位置',
  plaque_in_use: '这块牌匾已经摆在别的位置了',
  same_name: '新名字和现在一样',
  bad_street: '不能搬到这条街',
  already_on: '已经开启了',
  already_off: '已经关闭了',
  flag: '档位不对',
  not_plankton_host: '痞老板不在你店里',
  no_angry_krab: '蟹老板没有生气',
  no_food: '橱柜里没有这种食材',
  not_locked: '这种食材没有锁定',
  fridge_empty: '冰箱里没有这种食材',
  cannot_handle: '这个等级的食材不能这样处理',
  odd_num: '合成需要成对的食材',
  no_batch: '这个道具不能批量使用',
  no_points_to_reset: '还没有加过属性点',
  not_on_sale: '没有在售',
  no_special: '今天还没有特价',
  single: '一次只能买 1 个',
  not_sellable: '这个道具不能出售',
  keep_one_plaque: '牌匾至少要留 1 块',
  not_discardable: '这个道具不能丢弃',
  not_owned: '没有这个道具',
  item_gone: '这批货已经下架了',
  pick_count: '竞猜的食材数量不对',
  bad_food: '只能竞猜 1~2 级食材',
  not_visible: '这个任务现在不能领取',
};
```

2. 把 `errorText` 改为：

```ts
export function errorText(code: string, params: Record<string, unknown> = {}): string {
  if (code === 'RESTAURANT_NAME_INVALID' && typeof params.reason === 'string' && NAME_REASON[params.reason]) {
    return NAME_REASON[params.reason]!;
  }
  if (code === 'NOT_ENOUGH') {
    const kind = String(params.kind ?? '');
    const what =
      kind === 'goods'
        ? names.goodsName(Number(params.id))
        : kind === 'foods'
          ? names.foodName(Number(params.id))
          : (KIND[kind] ?? '数量');
    return `${what}不够（需要 ${String(params.need)}，现有 ${String(params.have)}）`;
  }
  if (code === 'REQUIREMENT_NOT_MET' && typeof params.reason === 'string' && REQUIREMENT[params.reason]) {
    return REQUIREMENT[params.reason]!(params);
  }
  if (code === 'LIMIT_REACHED' && typeof params.what === 'string' && LIMIT[params.what]) {
    return LIMIT[params.what]!(params);
  }
  if (code === 'INVALID_STATE' && typeof params.reason === 'string' && STATE[params.reason]) {
    return STATE[params.reason]!;
  }
  return (TEXT as Record<string, string>)[code] ?? `出错了（${code}）`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/web/src/utils/events.test.ts apps/web/src/i18n/zh-CN.test.ts`
Expected: PASS

- [ ] **Step 5: 接口客户端与端点**

`apps/web/src/api/client.ts`：在 `export class ApiError` 之前加：

```ts
import type { GameEvent } from '@dt/shared';

type EventsListener = (events: GameEvent[]) => void;
let eventsListener: EventsListener | null = null;
/** 写操作返回的得失提示统一交给这个回调（App 里接到提示组件上） */
export function setEventsListener(fn: EventsListener | null): void {
  eventsListener = fn;
}
```

（`GameEvent` 与已有的 `ApiResponse` 合并成一条 `import type { ApiResponse, GameEvent } from '@dt/shared';`。）在 `request` 里 `if (!payload.ok) throw ...` 之后、`return payload.data;` 之前加：

```ts
    if (payload.events.length > 0) eventsListener?.(payload.events);
```

`apps/web/src/api/endpoints.ts` 整个替换为：

```ts
import type {
  ActivationDto,
  AttrResultDto,
  BuffsDto,
  CatalogDto,
  CookbookDetailDto,
  CookbookListDto,
  CupboardDto,
  DeviceOptionsDto,
  FoodsNeedDto,
  ForgotPasswordInput,
  FridgeDto,
  HandleResultDto,
  IncomePageDto,
  LearnResultDto,
  LedgerRecordDto,
  LogPageDto,
  LoginInput,
  MarketDto,
  MeDto,
  OilNeedDto,
  RegisterInput,
  ResetPasswordInput,
  RestaurantDto,
  SelectShardResult,
  ShardDto,
  ShopDto,
  ShopSpecialDto,
  StarNeedDto,
  StoreDto,
  TableDto,
  TasksDto,
  ThawResultDto,
  WorldDto,
} from '@dt/shared';
import { api } from './client';

type Empty = Record<string, never>;
type Anything = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const endpoints = {
  me: () => api.get<MeDto>('/api/v1/account/me'),
  register: (body: RegisterInput) => api.post<MeDto>('/api/v1/account/register', body),
  login: (body: LoginInput) => api.post<MeDto>('/api/v1/account/login', body),
  logout: () => api.post<Empty>('/api/v1/account/logout'),
  sendVerifyEmail: () => api.post<Empty>('/api/v1/account/send-verify-email'),
  verifyEmail: (token: string) => api.post<Empty>('/api/v1/account/verify-email', { token }),
  forgotPassword: (body: ForgotPasswordInput) => api.post<Empty>('/api/v1/account/forgot-password', body),
  resetPassword: (body: ResetPasswordInput) => api.post<Empty>('/api/v1/account/reset-password', body),
  listShards: () => api.get<ShardDto[]>('/api/v1/shard/list'),
  selectShard: (shardId: number) => api.post<SelectShardResult>('/api/v1/shard/select', { shardId }),
  createRestaurant: (name: string) => api.post<RestaurantDto>('/api/v1/restaurant/create', { name }),
  overview: () => api.get<RestaurantDto>('/api/v1/restaurant/overview'),
  floor: () => api.get<TableDto[]>('/api/v1/restaurant/floor'),
  income: (before?: string) => api.get<IncomePageDto>(`/api/v1/restaurant/income${qs({ before })}`),
  buffs: () => api.get<BuffsDto>('/api/v1/restaurant/buffs'),
  restLog: (before?: string) => api.get<LogPageDto>(`/api/v1/restaurant/log${qs({ before })}`),

  weather: () => api.get<WorldDto>('/api/v1/world/weather'),
  catalog: () => api.get<CatalogDto>('/api/v1/world/catalog'),

  starNeed: () => api.get<StarNeedDto>('/api/v1/growth/star'),
  oilNeed: () => api.get<OilNeedDto>('/api/v1/growth/oil'),
  devices: () => api.get<DeviceOptionsDto>('/api/v1/growth/devices'),
  allocate: (b: { cook: number; cutting: number; fire: number }) => api.post<AttrResultDto>('/api/v1/growth/allocate', b),
  refuel: () => api.post<{ oil: number }>('/api/v1/growth/refuel'),
  starUp: () => api.post<{ star: number }>('/api/v1/growth/star-up'),
  oilExpand: () => api.post<Anything>('/api/v1/growth/oil-expand'),
  placeDevice: (slot: number, goodsId: number) => api.post<Anything>('/api/v1/growth/device/place', { slot, goodsId }),
  removeDevice: (slot: number) => api.post<Anything>('/api/v1/growth/device/remove', { slot }),
  openPlaque2: () => api.post<Anything>('/api/v1/growth/plaque2'),
  rename: (name: string) => api.post<{ name: string }>('/api/v1/growth/rename', { name }),
  move: (streetId: number) => api.post<{ streetId: number }>('/api/v1/growth/move', { streetId }),
  setPromo: (on: boolean) => api.post<Anything>('/api/v1/growth/promo', { on }),
  setCookfoods: (flag: number) => api.post<Anything>('/api/v1/growth/cookfoods', { flag }),
  setCte: (on: boolean) => api.post<Anything>('/api/v1/growth/cte', { on }),
  drivePlankton: (way: 'strength' | 'book') => api.post<Anything>('/api/v1/growth/plankton/drive', { way }),
  driveKrab: () => api.post<Anything>('/api/v1/growth/krab/drive'),

  cookbookList: (q: { street: number; page: number; filter: string }) =>
    api.get<CookbookListDto>(`/api/v1/cookbook/list${qs(q)}`),
  cookbookDetail: (id: number) => api.get<CookbookDetailDto>(`/api/v1/cookbook/detail/${id}`),
  foodsNeed: (q: { street?: number; target: number; foodLevel?: number }) =>
    api.get<FoodsNeedDto>(`/api/v1/cookbook/foods-need${qs(q)}`),
  learn: (cookbookId: number) => api.post<LearnResultDto>('/api/v1/cookbook/learn', { cookbookId }),

  cupboard: () => api.get<CupboardDto>('/api/v1/cupboard/list'),
  fridge: () => api.get<FridgeDto>('/api/v1/cupboard/fridge'),
  readFridge: () => api.post<Anything>('/api/v1/cupboard/fridge/read'),
  lockFood: (foodsId: number) => api.post<Anything>('/api/v1/cupboard/lock', { foodsId }),
  unlockFood: (foodsId: number) => api.post<Anything>('/api/v1/cupboard/unlock', { foodsId }),
  thaw: (foodsId: number) => api.post<ThawResultDto>('/api/v1/cupboard/thaw', { foodsId }),
  handleFoods: (b: { foodsId: number; way: 'compose' | 'decompose'; num: number }) =>
    api.post<HandleResultDto>('/api/v1/cupboard/handle', b),
  exchangeMaster: (foodsId: 467 | 468, times: number) =>
    api.post<Anything>('/api/v1/cupboard/exchange', { foodsId, times }),

  market: () => api.get<MarketDto>('/api/v1/market/view'),
  marketBuy: (itemId: number, num: number) => api.post<Anything>('/api/v1/market/buy', { itemId, num }),
  marketGuess: (foodsIds: number[]) => api.post<{ period: string }>('/api/v1/market/guess', { foodsIds }),

  shop: () => api.get<ShopDto>('/api/v1/shop/items'),
  shopSpecial: () => api.get<ShopSpecialDto | null>('/api/v1/shop/special'),
  shopBuy: (goodsId: number, num: number) => api.post<Anything>('/api/v1/shop/buy', { goodsId, num }),
  shopBuySpecial: (num: number) => api.post<Anything>('/api/v1/shop/buy-special', { num }),
  shopBuyBlack: (goodsId: number, num: number) => api.post<Anything>('/api/v1/shop/buy-black', { goodsId, num }),
  sell: (goodsId: number, num: number) => api.post<Anything>('/api/v1/shop/sell', { goodsId, num }),
  discard: (goodsId: number) => api.post<Anything>('/api/v1/shop/discard', { goodsId }),

  store: (type?: number) => api.get<StoreDto>(`/api/v1/store/list${qs({ type })}`),
  storeRecords: (range: string) => api.get<LedgerRecordDto[]>(`/api/v1/store/records${qs({ range })}`),
  useGoods: (goodsId: number, num: number) => api.post<Anything>('/api/v1/store/use', { goodsId, num }),

  tasks: () => api.get<TasksDto>('/api/v1/task/list'),
  activation: () => api.get<ActivationDto>('/api/v1/task/activation'),
  claimTask: (taskId: number) => api.post<Anything>('/api/v1/task/claim', { taskId }),
  claimActivation: (points: number) => api.post<Anything>('/api/v1/task/activation/claim', { points }),
  signIn: () => api.post<Anything>('/api/v1/task/signin'),
};
```

- [ ] **Step 6: store 和组件**

`apps/web/src/stores/catalog.ts`：

```ts
import { defineStore } from 'pinia';
import type { CatalogDto, CatalogFoodDto, CatalogGoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { setNameResolver } from '../i18n/zh-CN';

const KEY = 'dt_catalog';

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    goodsMap: new Map<number, CatalogGoodsDto>(),
    foodsMap: new Map<number, CatalogFoodDto>(),
    streets: [] as CatalogDto['streets'],
    loaded: false,
  }),
  actions: {
    apply(c: CatalogDto) {
      this.goodsMap = new Map(c.goods.map((g) => [g.id, g]));
      this.foodsMap = new Map(c.foods.map((f) => [f.id, f]));
      this.streets = c.streets;
      this.loaded = true;
      setNameResolver({ goodsName: (id) => this.goodsName(id), foodName: (id) => this.foodName(id) });
    },
    /** 目录按配置版本缓存在浏览器里（只是加速；读不到时直接请求） */
    async load() {
      if (this.loaded) return;
      try {
        const cached = localStorage.getItem(KEY);
        if (cached) this.apply(JSON.parse(cached) as CatalogDto);
      } catch {
        // 存储不可用时忽略
      }
      const fresh = await endpoints.catalog();
      this.apply(fresh);
      try {
        localStorage.setItem(KEY, JSON.stringify(fresh));
      } catch {
        // 忽略
      }
    },
    goodsName(id: number): string {
      return this.goodsMap.get(id)?.name ?? `道具${id}`;
    },
    foodName(id: number): string {
      return this.foodsMap.get(id)?.name ?? `食材${id}`;
    },
    goods(id: number): CatalogGoodsDto | undefined {
      return this.goodsMap.get(id);
    },
    food(id: number): CatalogFoodDto | undefined {
      return this.foodsMap.get(id);
    },
    streetName(id: number): string {
      return this.streets.find((s) => s.id === id)?.name ?? '';
    },
  },
});
```

`apps/web/src/stores/toast.ts`：

```ts
import { defineStore } from 'pinia';

export interface Toast {
  id: number;
  text: string;
  variant: 'success' | 'danger' | 'info';
}

let seq = 0;

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as Toast[] }),
  actions: {
    push(text: string, variant: Toast['variant'] = 'success', ms = 3000) {
      const id = ++seq;
      this.items.push({ id, text, variant });
      if (this.items.length > 5) this.items.shift();
      setTimeout(() => this.remove(id), ms);
    },
    remove(id: number) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  },
});
```

`apps/web/src/stores/restaurant.ts`：

```ts
import { defineStore } from 'pinia';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useRestaurantStore = defineStore('restaurant', {
  state: () => ({ rest: null as RestaurantDto | null }),
  actions: {
    async refresh(): Promise<RestaurantDto> {
      this.rest = await endpoints.overview();
      return this.rest;
    },
  },
});
```

`apps/web/src/components/EventToast.vue`：

```vue
<script setup lang="ts">
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
</script>

<template>
  <div class="dt-toasts" aria-live="polite">
    <div
      v-for="t in toast.items"
      :key="t.id"
      :class="['alert', `alert-${t.variant}`, 'py-1', 'px-2', 'mb-1', 'small', 'shadow-sm']"
      data-testid="toast"
      @click="toast.remove(t.id)"
    >
      {{ t.text }}
    </div>
  </div>
</template>
```

`apps/web/src/components/BottomNav.vue`：

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router';

const tabs = [
  { to: '/', icon: 'bi-shop', label: '餐厅' },
  { to: '/cookbooks', icon: 'bi-journal-text', label: '食谱' },
  { to: '/cupboard', icon: 'bi-box-seam', label: '橱柜' },
  { to: '/market', icon: 'bi-basket', label: '菜场' },
  { to: '/more', icon: 'bi-grid', label: '更多' },
];
</script>

<template>
  <nav class="dt-bottom-nav d-flex">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="flex-fill text-center small py-1">
      <i :class="['bi', t.icon, 'd-block', 'fs-5']"></i>{{ t.label }}
    </RouterLink>
  </nav>
</template>
```

`apps/web/src/components/NeedChecks.vue`（升星、油壶扩容共用的条件列表）：

```vue
<script setup lang="ts">
import type { NeedCheckDto } from '@dt/shared';
import { useCatalogStore } from '../stores/catalog';
import { formatNum } from '../utils/format';

defineProps<{ checks: NeedCheckDto[] }>();
const catalog = useCatalogStore();
const LABEL: Record<string, string> = { level: '餐厅等级', star: '星级', cookbooks: '已学食谱', coin: '银币' };
</script>

<template>
  <ul class="list-unstyled small mb-2">
    <li v-for="(c, i) in checks" :key="i" :class="c.ok ? 'text-success' : 'text-danger'">
      <i :class="['bi', c.ok ? 'bi-check-circle' : 'bi-x-circle']"></i>
      {{ c.key === 'goods' ? catalog.goodsName(c.id ?? 0) : LABEL[c.key] }}：{{ formatNum(c.have) }} /
      {{ formatNum(c.need) }}
    </li>
  </ul>
</template>
```

`apps/web/src/views/MoreView.vue`：

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router';

const links = [
  { to: '/rest/tasks', icon: 'bi-check2-square', label: '任务与活跃' },
  { to: '/store', icon: 'bi-archive', label: '仓库' },
  { to: '/shop', icon: 'bi-bag', label: '商店' },
  { to: '/society', icon: 'bi-bank', label: '协会' },
  { to: '/rest/floor', icon: 'bi-grid-3x3', label: '楼层餐桌' },
  { to: '/rest/income', icon: 'bi-graph-up', label: '收益记录' },
  { to: '/rest/info', icon: 'bi-person-badge', label: '餐厅信息' },
  { to: '/weather', icon: 'bi-cloud-sun', label: '天气' },
  { to: '/shards', icon: 'bi-arrow-left-right', label: '切换区服' },
];
</script>

<template>
  <div class="row g-2">
    <div v-for="l in links" :key="l.to" class="col-4">
      <RouterLink :to="l.to" class="d-block border rounded text-center py-3 small text-decoration-none">
        <i :class="['bi', l.icon, 'd-block', 'fs-4']"></i>{{ l.label }}
      </RouterLink>
    </div>
  </div>
</template>
```

- [ ] **Step 7: 应用外壳、路由、样式**

`apps/web/src/App.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { setEventsListener } from './api/client';
import BottomNav from './components/BottomNav.vue';
import EventToast from './components/EventToast.vue';
import { useCatalogStore } from './stores/catalog';
import { useToastStore } from './stores/toast';
import { eventText } from './utils/events';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const inGame = computed(() => route.meta.needRestaurant === true);

setEventsListener((events) => {
  for (const e of events) toast.push(eventText(e, catalog), e.type === 'gain' ? 'success' : 'info');
});

onMounted(() => {
  catalog.load().catch(() => undefined);
});
</script>

<template>
  <div class="dt-app">
    <header class="dt-header d-flex align-items-center px-2">
      <i class="bi bi-shop me-1"></i>
      <span class="fw-bold">美味小镇</span>
    </header>
    <main :class="['dt-main', { 'dt-main-nav': inGame }]">
      <RouterView />
    </main>
    <EventToast />
    <BottomNav v-if="inGame" />
  </div>
</template>
```

`apps/web/src/styles/main.css` 末尾追加：

```css
.dt-main-nav {
  padding-bottom: 72px;
}
.dt-bottom-nav {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 100%;
  max-width: 720px;
  background: #fff;
  border-top: 1px solid #eee;
  z-index: 1030;
}
.dt-bottom-nav a {
  color: #666;
  text-decoration: none;
}
.dt-bottom-nav a.router-link-exact-active {
  color: var(--dt-primary);
}
.dt-toasts {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 76px;
  width: calc(100% - 32px);
  max-width: 688px;
  z-index: 1040;
}
.dt-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 8px;
  background: #f1f3f5;
  font-size: 12px;
}
```

`apps/web/src/router.ts`：在 `home` 路由之后、通配路由之前加入"更多"页（游戏内页面都带 `meta: { needRestaurant: true }`；其余页面的路由在创建对应视图的任务里加入）：

```ts
  { path: '/more', name: 'more', component: () => import('./views/MoreView.vue'), meta: { needRestaurant: true } },
```

- [ ] **Step 8: 验证**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS（`RestaurantHomeView.test.ts` 的 DTO 需要补上 Task 13 新增的字段：`oilLevel: 0, state: 1, stateReason: null, promoOn: false, cteOn: false, cookfoodsFlag: 0, plaque2Open: false, mainTaskStep: 1, devices: [], lastRound: null, weather: null, isPlanktonHost: false`）

- [ ] **Step 9: 提交**

```bash
pnpm format
git add apps/web
git commit -m "feat(web): endpoints for 2A, catalog store, gain/loss toasts, bottom nav, error texts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 24: 前端——餐厅首页、楼层、收益、餐厅信息、任务

**Files:**
- Modify: `apps/web/src/views/RestaurantHomeView.vue`（重写）
- Modify: `apps/web/src/views/RestaurantHomeView.test.ts`
- Create: `apps/web/src/views/RestFloorView.vue`
- Create: `apps/web/src/views/RestIncomeView.vue`
- Create: `apps/web/src/views/RestInfoView.vue`
- Create: `apps/web/src/views/RestTasksView.vue`
- Test: `apps/web/src/views/RestTasksView.test.ts`
- Modify: `apps/web/src/router.ts`

**Interfaces:**
- Consumes: Task 23 的 `endpoints`、`useRestaurantStore`、`useCatalogStore`、`useToastStore`、`CUSTOMER_NAMES`、`RATE_LABELS`、`PART_LABELS`、`pct`、`logText`、`errorMessage`
- Produces: 路由 `/`、`/rest/floor`、`/rest/income`、`/rest/info`、`/rest/tasks`

- [ ] **Step 1: 写失败的测试**

把 `apps/web/src/views/RestaurantHomeView.test.ts` 整个替换为：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import RestaurantHomeView from './RestaurantHomeView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { overview: vi.fn(), tasks: vi.fn(), refuel: vi.fn(), claimTask: vi.fn(), devices: vi.fn() },
}));

const dto: RestaurantDto = {
  id: 1,
  shardId: 1,
  name: '开张大吉店',
  level: 1,
  exp: 0,
  expToNext: 500,
  coin: 100000,
  diamond: 0,
  strength: 100,
  strengthMax: 100,
  oil: 400,
  oilMax: 1000,
  starLevel: 0,
  streetId: 0,
  streetName: '新手街',
  renown: 10,
  attrLeft: 3,
  attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
  luck: 0,
  tableNum: 4,
  cupboardNum: 100,
  storeNum: 20,
  foodsMaxNum: 999,
  foodsLockNum: 15,
  oilLevel: 0,
  state: 1,
  stateReason: null,
  promoOn: false,
  cteOn: false,
  cookfoodsFlag: 0,
  plaque2Open: false,
  mainTaskStep: 1,
  devices: [
    { slot: 1, name: '宣传海报', deviceType: 1, needStar: 0, unlocked: true, goodsId: null, expiresAt: null },
    { slot: 4, name: '捕鼠夹', deviceType: 4, needStar: 2, unlocked: false, goodsId: null, expiresAt: null },
  ],
  lastRound: { roundNo: 1, coin: 12, exp: 3, oil: 2, customers: { '1': 1, '0': 3 }, at: '2026-09-30T00:00:00.000Z' },
  weather: { id: 1, name: '晴' },
  isPlanktonHost: false,
  tables: [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 })),
  effects: [
    { sourceType: 'street', sourceId: 140, name: '新手街', effects: { atRate: 0.35, luckValue: 36 }, expiresAt: null },
  ],
  createdAt: '2026-09-29T00:00:00.000Z',
};

const mountView = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RestaurantHomeView }] });
  const w = mount(RestaurantHomeView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('RestaurantHomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.overview).mockResolvedValue(dto);
    vi.mocked(endpoints.tasks).mockResolvedValue({
      mainStep: 1,
      main: {
        id: 1,
        main: true,
        step: 1,
        name: '填一次油',
        href: '/',
        kind: 'counter',
        key: 'oil.fill',
        target: 1,
        progress: 0,
        done: false,
        award: { coin: 2000 },
      },
      side: [],
    });
  });

  it('显示概况、本轮收益、主线任务、设施位和加成', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="rest-name"]').text()).toBe('开张大吉店');
    expect(w.find('[data-testid="rest-level"]').text()).toBe('1');
    expect(w.find('[data-testid="rest-coin"]').text()).toBe('100,000');
    expect(w.find('[data-testid="last-round"]').text()).toContain('12');
    expect(w.text()).toContain('填一次油');
    expect(w.findAll('[data-testid^="slot-"]')).toHaveLength(2);
    expect(w.text()).toContain('上座率+35% 幸运+36');
  });

  it('加油：显示花费，点击后刷新', async () => {
    vi.mocked(endpoints.refuel).mockResolvedValue({ oil: 1000 });
    const w = await mountView();
    const btn = w.find('[data-testid="refuel"]');
    expect(btn.text()).toContain('600');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.refuel).toHaveBeenCalled();
    expect(endpoints.overview).toHaveBeenCalledTimes(2);
  });
});
```

`apps/web/src/views/RestTasksView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import RestTasksView from './RestTasksView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { tasks: vi.fn(), activation: vi.fn(), signIn: vi.fn(), claimTask: vi.fn(), claimActivation: vi.fn() },
}));

describe('RestTasksView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.tasks).mockResolvedValue({ mainStep: 1, main: null, side: [] });
    vi.mocked(endpoints.activation).mockResolvedValue({
      total: 55,
      signedIn: false,
      items: [{ id: 1, name: '签到', points: 10, limit: 1, count: 0, needStar: 0 }],
      rewards: [
        { points: 50, award: { exp: 500 }, claimed: false, multiplier: 1 },
        { points: 100, award: { diamond: 2 }, claimed: false, multiplier: 1 },
      ],
    });
    vi.mocked(endpoints.signIn).mockResolvedValue({});
  });

  it('签到按钮；够分的档位可以领，不够的禁用', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RestTasksView }] });
    const w = mount(RestTasksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="claim-50"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="claim-100"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="signin"]').trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/src/views/RestaurantHomeView.test.ts apps/web/src/views/RestTasksView.test.ts`
Expected: FAIL（`last-round`、`RestTasksView.vue` 不存在）

- [ ] **Step 3: 首页**

`apps/web/src/views/RestaurantHomeView.vue` 整个替换为：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { DeviceOptionsDto, EffectDto, TaskDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { describeEffects } from '../utils/effects';
import { formatNum } from '../utils/format';
import { CUSTOMER_NAMES } from '../utils/labels';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rest = computed(() => store.rest);
const error = ref('');
const busy = ref(false);
const mainTask = ref<TaskDto | null>(null);
const options = ref<DeviceOptionsDto | null>(null);
const pickingSlot = ref<number | null>(null);

async function load() {
  try {
    await store.refresh();
    mainTask.value = (await endpoints.tasks()).main;
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '获取餐厅信息失败');
  }
}

async function act(fn: () => Promise<unknown>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const expPercent = computed(() =>
  rest.value ? Math.min(100, Math.floor((rest.value.exp / rest.value.expToNext) * 100)) : 0,
);
const refuelCost = computed(() => (rest.value ? rest.value.oilMax - rest.value.oil : 0));
const customers = computed(() =>
  Object.entries(rest.value?.lastRound?.customers ?? {})
    .filter(([k]) => k !== '0')
    .map(([k, v]) => `${CUSTOMER_NAMES[k] ?? k}×${v}`)
    .join('，'),
);

async function openSlot(slot: number) {
  pickingSlot.value = slot;
  try {
    options.value = await endpoints.devices();
  } catch (e) {
    toast.push(errorMessage(e, '读取设施失败'), 'danger');
  }
}
const choices = computed(() => {
  const slot = options.value?.slots.find((s) => s.slot === pickingSlot.value);
  if (!slot || !options.value) return [];
  return options.value.store.filter((x) => x.deviceType === slot.deviceType);
});
function place(goodsId: number) {
  const slot = pickingSlot.value!;
  pickingSlot.value = null;
  return act(() => endpoints.placeDevice(slot, goodsId), '摆放失败');
}

function expiresText(at: string | null): string {
  if (!at) return '永久';
  const hours = Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000));
  return `剩余 ${hours} 小时`;
}
const effectExpires = (e: EffectDto) => expiresText(e.expiresAt);

let timer: ReturnType<typeof setInterval> | undefined;
const onVisible = () => {
  if (document.visibilityState === 'visible') void load();
};
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 240_000);
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!rest" class="text-muted">加载中……</div>
  <div v-else>
    <div class="d-flex justify-content-between align-items-center">
      <h5 class="mb-0" data-testid="rest-name">{{ rest.name }}</h5>
      <RouterLink to="/weather" class="small">
        <i class="bi bi-cloud-sun"></i> {{ rest.weather?.name ?? '' }}
      </RouterLink>
    </div>
    <div class="small text-muted mb-2">
      {{ rest.streetName }} · {{ rest.starLevel }} 星 · 等级 <b data-testid="rest-level">{{ rest.level }}</b>
      <span v-if="rest.state === 2" class="badge bg-danger ms-1">停业</span>
    </div>

    <div class="row g-1 small">
      <div class="col-6"><i class="bi bi-coin"></i> <b data-testid="rest-coin">{{ formatNum(rest.coin) }}</b></div>
      <div class="col-6"><i class="bi bi-gem"></i> {{ formatNum(rest.diamond) }}</div>
      <div class="col-6"><i class="bi bi-lightning"></i> {{ rest.strength }}/{{ rest.strengthMax }}</div>
      <div class="col-6">声望 {{ rest.renown }}</div>
    </div>
    <div class="progress my-2" role="progressbar" :aria-valuenow="expPercent" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar bg-warning text-dark" :style="{ width: `${expPercent}%` }">
        {{ formatNum(rest.exp) }}/{{ formatNum(rest.expToNext) }}
      </div>
    </div>
    <div class="d-flex align-items-center gap-2 small">
      <span><i class="bi bi-droplet"></i> 油 {{ formatNum(rest.oil) }}/{{ formatNum(rest.oilMax) }}</span>
      <button
        class="btn btn-sm btn-outline-primary ms-auto"
        data-testid="refuel"
        :disabled="busy || refuelCost <= 0"
        @click="act(() => endpoints.refuel(), '加油失败')"
      >
        加满（{{ formatNum(refuelCost) }} 银币）
      </button>
    </div>

    <div v-if="rest.lastRound" class="border rounded p-2 my-2 small" data-testid="last-round">
      <div class="fw-bold mb-1">上一轮收益</div>
      银币 {{ formatNum(rest.lastRound.coin) }} · 经验 {{ formatNum(rest.lastRound.exp) }} · 耗油
      {{ formatNum(rest.lastRound.oil) }}
      <div class="text-muted">{{ customers || '没有客人' }}</div>
      <RouterLink to="/rest/income">收益记录 ›</RouterLink>
      <RouterLink to="/rest/floor" class="ms-3">楼层餐桌 ›</RouterLink>
    </div>

    <div v-if="mainTask" class="border rounded p-2 my-2 small">
      <span class="dt-tag me-1">主线</span>{{ mainTask.name }}
      <span class="text-muted">（{{ Math.min(mainTask.progress, mainTask.target) }}/{{ mainTask.target }}）</span>
      <button
        v-if="mainTask.done"
        class="btn btn-sm btn-success float-end"
        :disabled="busy"
        @click="act(() => endpoints.claimTask(mainTask!.id), '领取失败')"
      >
        领奖
      </button>
    </div>

    <div v-if="rest.isPlanktonHost" class="alert alert-warning py-2 small">
      痞老板赖在店里不走！
      <button class="btn btn-sm btn-outline-dark ms-1" :disabled="busy" @click="act(() => endpoints.drivePlankton('strength'), '赶走失败')">
        花体力赶走
      </button>
      <button class="btn btn-sm btn-outline-dark ms-1" :disabled="busy" @click="act(() => endpoints.drivePlankton('book'), '赶走失败')">
        用蟹黄堡秘方
      </button>
    </div>

    <h6 class="mt-3">设施</h6>
    <div class="row g-1">
      <div v-for="d in rest.devices" :key="d.slot" class="col-4">
        <button
          class="btn btn-light border w-100 small p-1"
          :data-testid="`slot-${d.slot}`"
          :disabled="!d.unlocked || busy"
          @click="openSlot(d.slot)"
        >
          <div class="text-muted">{{ d.name }}</div>
          <div v-if="!d.unlocked"><i class="bi bi-lock"></i> {{ d.needStar }} 星开放</div>
          <div v-else-if="d.goodsId">
            {{ catalog.goodsName(d.goodsId) }}<br /><span class="text-muted">{{ expiresText(d.expiresAt) }}</span>
          </div>
          <div v-else>空</div>
        </button>
      </div>
    </div>
    <div v-if="pickingSlot !== null" class="border rounded p-2 mt-2 small">
      <div class="d-flex justify-content-between">
        <b>选择要摆放的设施</b>
        <a href="#" @click.prevent="pickingSlot = null">取消</a>
      </div>
      <div v-if="choices.length === 0" class="text-muted">仓库里没有能放在这里的设施，可以去商店买。</div>
      <button
        v-for="c in choices"
        :key="c.goodsId"
        class="btn btn-sm btn-outline-primary me-1 mt-1"
        @click="place(c.goodsId)"
      >
        {{ catalog.goodsName(c.goodsId) }}×{{ c.num }}
      </button>
    </div>

    <h6 class="mt-3">经营开关</h6>
    <div class="small">
      <div class="form-check form-switch">
        <input
          id="promo"
          class="form-check-input"
          type="checkbox"
          :checked="rest.promoOn"
          :disabled="busy"
          @change="act(() => endpoints.setPromo(!rest!.promoOn), '设置失败')"
        />
        <label class="form-check-label" for="promo">大促活动（八折促销：上座率大增，收益略降）</label>
      </div>
      <div class="form-check form-switch">
        <input
          id="cte"
          class="form-check-input"
          type="checkbox"
          :checked="rest.cteOn"
          :disabled="busy"
          @change="act(() => endpoints.setCte(!rest!.cteOn), '设置失败')"
        />
        <label class="form-check-label" for="cte">银币转经验（需要阿波罗雕像）</label>
      </div>
      <div v-if="rest.starLevel >= 6" class="d-flex align-items-center gap-2 mt-1">
        挑剔消耗食材档位
        <select
          class="form-select form-select-sm w-auto"
          :value="rest.cookfoodsFlag"
          :disabled="busy"
          @change="act(() => endpoints.setCookfoods(Number(($event.target as HTMLSelectElement).value)), '设置失败')"
        >
          <option v-for="f in [0, 1, 2, 3, 4, 5]" :key="f" :value="f">{{ f === 0 ? '关闭' : `${f} 档` }}</option>
        </select>
      </div>
    </div>

    <h6 class="mt-3">生效的加成</h6>
    <ul class="list-unstyled small">
      <li v-for="e in rest.effects" :key="`${e.sourceType}-${e.sourceId}`" class="mb-1">
        <GameImg :path="`goods/${e.name}`" :alt="e.name" fallback-icon="bi-award" />
        <b>{{ e.name }}</b> {{ describeEffects(e.effects) }}
        <span class="text-muted">（{{ effectExpires(e) }}）</span>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 4: 楼层、收益、信息、任务页**

`apps/web/src/views/RestFloorView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { formatNum } from '../utils/format';
import { CUSTOMER_NAMES } from '../utils/labels';

const tables = ref<TableDto[]>([]);
const floor = ref(1);
const error = ref('');
const floors = computed(() => [...new Set(tables.value.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => tables.value.filter((t) => t.floor === floor.value));

onMounted(async () => {
  try {
    tables.value = await endpoints.floor();
  } catch (e) {
    error.value = errorMessage(e, '读取餐桌失败');
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div class="btn-group btn-group-sm mb-2">
    <button
      v-for="f in floors"
      :key="f"
      :class="['btn', f === floor ? 'btn-primary' : 'btn-outline-primary']"
      @click="floor = f"
    >
      {{ f }} 楼
    </button>
  </div>
  <div class="row g-1">
    <div v-for="t in shown" :key="t.no" class="col-3">
      <div class="border rounded p-1 small text-center" :data-testid="`table-${t.no}`">
        <div class="fw-bold">{{ t.no }}</div>
        <div>{{ CUSTOMER_NAMES[String(t.customer)] ?? '' }}</div>
        <div v-if="t.last && t.last.type !== 0" class="text-muted">
          {{ formatNum(Math.floor(t.last.coin)) }} 银 / {{ formatNum(Math.floor(t.last.exp)) }} 经
        </div>
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/views/RestIncomeView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BuffsDto, RoundSummaryDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';
import { formatNum } from '../utils/format';
import { PART_LABELS, pct, RATE_LABELS } from '../utils/labels';

const items = ref<RoundSummaryDto[]>([]);
const next = ref<string | null>(null);
const buffs = ref<BuffsDto | null>(null);
const error = ref('');

const fmt = (key: string, v: number) => (RATE_LABELS[key]?.percent ? pct(v) : formatNum(Math.round(v * 100) / 100));

async function more() {
  try {
    const page = await endpoints.income(next.value ?? undefined);
    items.value.push(...page.items);
    next.value = page.nextBefore;
  } catch (e) {
    error.value = errorMessage(e, '读取收益失败');
  }
}
onMounted(async () => {
  await more();
  buffs.value = await endpoints.buffs().catch(() => null);
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <h6>加成分项（最近一轮）</h6>
  <div v-if="buffs?.rates" class="small mb-3">
    <div v-for="(meta, key) in RATE_LABELS" :key="key" class="mb-1">
      <template v-if="buffs.rates[key]">
        <b>{{ meta.label }} {{ fmt(key, buffs.rates[key]!.total) }}</b>
        <span v-for="(v, p) in buffs.rates[key]!.parts" :key="p" class="dt-tag ms-1">
          {{ PART_LABELS[p] ?? p }} {{ fmt(key, v) }}
        </span>
      </template>
    </div>
    <div v-if="buffs.seated !== null" class="text-muted">上座桌数 {{ buffs.seated }}</div>
  </div>
  <div v-else class="text-muted small mb-3">还没有结算过</div>
  <h6>加成来源</h6>
  <ul class="list-unstyled small">
    <li v-for="s in buffs?.sources ?? []" :key="`${s.sourceType}-${s.sourceId}`">
      <b>{{ s.name }}</b> {{ describeEffects(s.effects) }}
    </li>
  </ul>
  <h6>收益记录</h6>
  <table class="table table-sm small">
    <thead>
      <tr><th>时间</th><th>银币</th><th>经验</th><th>耗油</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in items" :key="r.roundNo">
        <td>{{ new Date(r.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</td>
        <td>{{ formatNum(r.coin) }}</td>
        <td>{{ formatNum(r.exp) }}</td>
        <td>{{ formatNum(r.oil) }}</td>
      </tr>
    </tbody>
  </table>
  <button v-if="next" class="btn btn-sm btn-outline-secondary w-100" @click="more">更早的记录</button>
</template>
```

`apps/web/src/views/RestInfoView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { RestLogDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { logText } from '../utils/events';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rest = computed(() => store.rest);
const add = reactive({ cook: 0, cutting: 0, fire: 0 });
const logs = ref<RestLogDto[]>([]);
const next = ref<string | null>(null);
const busy = ref(false);
const sum = computed(() => add.cook + add.cutting + add.fire);

async function moreLogs() {
  const page = await endpoints.restLog(next.value ?? undefined);
  logs.value.push(...page.items);
  next.value = page.nextBefore;
}
async function allocate() {
  busy.value = true;
  try {
    await endpoints.allocate({ ...add });
    add.cook = add.cutting = add.fire = 0;
    await store.refresh();
  } catch (e) {
    toast.push(errorMessage(e, '加点失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  await store.refresh().catch(() => undefined);
  await moreLogs().catch(() => undefined);
});
</script>

<template>
  <div v-if="rest">
    <h6>属性（剩余点数 {{ rest.attrLeft }}）</h6>
    <div class="row g-1 small align-items-center">
      <div class="col-4">厨艺 {{ rest.attrs.cook }}</div>
      <div class="col-4">刀工 {{ rest.attrs.cutting }}</div>
      <div class="col-4">火候 {{ rest.attrs.fire }}</div>
      <div class="col-4">调味 {{ rest.attrs.season }}</div>
      <div class="col-4">创意 {{ rest.attrs.creatives }}</div>
      <div class="col-4">幸运 {{ rest.luck }}</div>
    </div>
    <div v-if="rest.attrLeft > 0" class="row g-1 mt-2 small">
      <div class="col-4"><input v-model.number="add.cook" type="number" min="0" class="form-control form-control-sm" placeholder="厨艺" /></div>
      <div class="col-4"><input v-model.number="add.cutting" type="number" min="0" class="form-control form-control-sm" placeholder="刀工" /></div>
      <div class="col-4"><input v-model.number="add.fire" type="number" min="0" class="form-control form-control-sm" placeholder="火候" /></div>
      <div class="col-12">
        <button class="btn btn-sm btn-primary w-100" :disabled="busy || sum <= 0 || sum > rest.attrLeft" @click="allocate">
          加点（{{ sum }}）
        </button>
      </div>
    </div>
    <h6 class="mt-3">容量</h6>
    <div class="row g-1 small">
      <div class="col-6">餐桌上限 {{ rest.tableNum }}</div>
      <div class="col-6">橱柜格数 {{ rest.cupboardNum }}</div>
      <div class="col-6">单种食材上限 {{ rest.foodsMaxNum }}</div>
      <div class="col-6">锁定格 {{ rest.foodsLockNum }}</div>
      <div class="col-6">仓库容量 {{ rest.storeNum }}</div>
      <div class="col-6">油壶 {{ rest.oilLevel }} 级</div>
    </div>
    <h6 class="mt-3">个人日志</h6>
    <ul class="list-unstyled small">
      <li v-for="(l, i) in logs" :key="i">
        <span class="text-muted">{{ new Date(l.at).toLocaleString('zh-CN') }}</span> {{ logText(l, catalog) }}
      </li>
    </ul>
    <button v-if="next" class="btn btn-sm btn-outline-secondary w-100" @click="moreLogs">更早的日志</button>
  </div>
</template>
```

`apps/web/src/views/RestTasksView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ActivationDto, AwardDto, TasksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const tasks = ref<TasksDto | null>(null);
const act = ref<ActivationDto | null>(null);
const busy = ref(false);

function awardText(a: AwardDto): string {
  const parts: string[] = [];
  if (a.coin) parts.push(`银币 ${formatNum(a.coin)}`);
  if (a.exp) parts.push(`经验 ${formatNum(a.exp)}`);
  if (a.diamond) parts.push(`钻石 ${a.diamond}`);
  if (a.renown) parts.push(`声望 ${a.renown}`);
  for (const g of a.goods ?? []) parts.push(`${catalog.goodsName(g.id)}×${g.num}`);
  for (const f of a.foods ?? []) parts.push(`${catalog.foodName(f.id)}×${f.num}`);
  return parts.join('、');
}

async function load() {
  [tasks.value, act.value] = await Promise.all([endpoints.tasks(), endpoints.activation()]);
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取任务失败'), 'danger')));
</script>

<template>
  <div v-if="act">
    <div class="d-flex align-items-center mb-2">
      <h6 class="mb-0">今日活跃 {{ act.total }}</h6>
      <button
        class="btn btn-sm btn-primary ms-auto"
        data-testid="signin"
        :disabled="busy || act.signedIn"
        @click="run(() => endpoints.signIn(), '签到失败')"
      >
        {{ act.signedIn ? '今天已签到' : '签到' }}
      </button>
    </div>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        v-for="r in act.rewards"
        :key="r.points"
        class="btn btn-sm btn-outline-success"
        :data-testid="`claim-${r.points}`"
        :disabled="busy || r.claimed || act.total < r.points"
        @click="run(() => endpoints.claimActivation(r.points), '领取失败')"
      >
        {{ r.points }} 点{{ r.claimed ? '（已领）' : '' }}{{ r.multiplier > 1 ? ' ×2' : '' }}
      </button>
    </div>
    <ul class="list-unstyled small">
      <li v-for="i in act.items" :key="i.id" :class="{ 'text-muted': i.count >= i.limit }">
        {{ i.name }}：{{ Math.min(i.count, i.limit) }}/{{ i.limit }}（每次 {{ i.points }} 点）
      </li>
    </ul>
  </div>
  <div v-if="tasks">
    <h6 class="mt-3">主线</h6>
    <div v-if="tasks.main" class="border rounded p-2 small">
      <b>{{ tasks.main.name }}</b>（{{ Math.min(tasks.main.progress, tasks.main.target) }}/{{ tasks.main.target }}）
      <div class="text-muted">奖励：{{ awardText(tasks.main.award) }}</div>
      <button
        class="btn btn-sm btn-success mt-1"
        :disabled="busy || !tasks.main.done"
        @click="run(() => endpoints.claimTask(tasks!.main!.id), '领取失败')"
      >
        领奖
      </button>
    </div>
    <div v-else class="small text-muted">主线已全部完成</div>
    <h6 class="mt-3">支线</h6>
    <div v-for="s in tasks.side" :key="s.id" class="border rounded p-2 small mb-1">
      <b>{{ s.name }}</b>（{{ Math.min(s.progress, s.target) }}/{{ s.target }}）
      <div class="text-muted">奖励：{{ awardText(s.award) }}</div>
      <button class="btn btn-sm btn-success mt-1" :disabled="busy || !s.done" @click="run(() => endpoints.claimTask(s.id), '领取失败')">
        领奖
      </button>
    </div>
    <div v-if="tasks.side.length === 0" class="small text-muted">暂时没有支线任务</div>
  </div>
</template>
```

- [ ] **Step 5: 路由**

`apps/web/src/router.ts` 在 `more` 路由之前加入：

```ts
  { path: '/rest/floor', name: 'floor', component: () => import('./views/RestFloorView.vue'), meta: { needRestaurant: true } },
  { path: '/rest/income', name: 'income', component: () => import('./views/RestIncomeView.vue'), meta: { needRestaurant: true } },
  { path: '/rest/info', name: 'info', component: () => import('./views/RestInfoView.vue'), meta: { needRestaurant: true } },
  { path: '/rest/tasks', name: 'tasks', component: () => import('./views/RestTasksView.vue'), meta: { needRestaurant: true } },
```

- [ ] **Step 6: 运行确认通过**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
pnpm format
git add apps/web
git commit -m "feat(web): restaurant home, floor, income and buffs, info and log, tasks and activation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 25: 前端——食谱、橱柜

**Files:**
- Create: `apps/web/src/views/CookbooksView.vue`
- Test: `apps/web/src/views/CookbooksView.test.ts`
- Create: `apps/web/src/views/CookbookInfoView.vue`
- Create: `apps/web/src/views/CupboardView.vue`
- Test: `apps/web/src/views/CupboardView.test.ts`
- Modify: `apps/web/src/router.ts`

**Interfaces:**
- Consumes: `endpoints.cookbookList/cookbookDetail/learn/foodsNeed/cupboard/fridge/readFridge/lockFood/unlockFood/thaw/handleFoods/exchangeMaster`、`useCatalogStore`、`useRestaurantStore`、`useToastStore`、`GRADE_NAMES`、`TASTE_NAMES`
- Produces: 路由 `/cookbooks`、`/cookbooks/:id`、`/cupboard`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/CookbooksView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CookbookListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import CookbooksView from './CookbooksView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { cookbookList: vi.fn(), learn: vi.fn(), overview: vi.fn() },
}));

const list: CookbookListDto = {
  street: 0,
  page: 1,
  pageSize: 40,
  total: 2,
  learned: 0,
  streetLearned: 0,
  streetTotal: 72,
  gradeCounts: Array(11).fill(0),
  items: [
    { id: 194, name: '葡萄薏仁羹', grade: 0, learn: '0', next: [{ foodsId: 302, num: 1, have: 1 }] },
    { id: 439, name: '另一道菜', grade: 0, learn: 'z', next: [{ foodsId: 101, num: 1, have: 0 }] },
  ],
};

describe('CookbooksView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.overview).mockResolvedValue({ streetId: 0 } as never);
    vi.mocked(endpoints.cookbookList).mockResolvedValue(list);
    vi.mocked(endpoints.learn).mockResolvedValue({ cookbookId: 194, grade: 1, learnType: '0' });
  });

  it('可学的食谱能点"学习"，学完刷新列表；不能学的按钮禁用', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: CookbooksView }, { path: '/cookbooks/:id', component: CookbooksView }] });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="learn-439"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="learn-194"]').trigger('click');
    await flushPromises();
    expect(endpoints.learn).toHaveBeenCalledWith(194);
    expect(endpoints.cookbookList).toHaveBeenCalledTimes(2);
  });
});
```

`apps/web/src/views/CupboardView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import CupboardView from './CupboardView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    cupboard: vi.fn(),
    fridge: vi.fn(),
    readFridge: vi.fn(),
    handleFoods: vi.fn(),
    lockFood: vi.fn(),
    unlockFood: vi.fn(),
    thaw: vi.fn(),
    exchangeMaster: vi.fn(),
  },
}));

describe('CupboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 按钮是否可用取决于食材等级，目录里放一个 2 级食材
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [{ id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 }],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      slotsUsed: 1,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      foodsMaxNum: 999,
      targetGrade: 5,
      fridgeCount: 0,
      fridgeUnread: false,
      freeHandleLeft: 20,
      items: [{ foodsId: 302, num: 4, locked: false, streetNeed: 3 }],
    });
    vi.mocked(endpoints.handleFoods).mockResolvedValue({
      chances: 2,
      success: 2,
      lucky: 0,
      failCoin: 0,
      strengthUsed: 0,
      gained: [],
    });
  });

  it('选择食材后可以分解', async () => {
    const w = mount(CupboardView);
    await flushPromises();
    await w.find('[data-testid="pick-302"]').trigger('click');
    await w.find('[data-testid="decompose"]').trigger('click');
    await flushPromises();
    expect(endpoints.handleFoods).toHaveBeenCalledWith({ foodsId: 302, way: 'decompose', num: 1 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/src/views/CookbooksView.test.ts apps/web/src/views/CupboardView.test.ts`
Expected: FAIL，视图文件不存在

- [ ] **Step 3: 食谱页**

`apps/web/src/views/CookbooksView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CookbookListDto, CookbookRowDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { GRADE_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const street = ref(0);
const filter = ref<'all' | 'learnable' | 'unlearned' | 'learned'>('all');
const page = ref(1);
const list = ref<CookbookListDto | null>(null);
const busy = ref(false);
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'learnable', label: '可学' },
  { key: 'unlearned', label: '未学' },
  { key: 'learned', label: '已学' },
] as const;

async function load() {
  try {
    list.value = await endpoints.cookbookList({ street: street.value, page: page.value, filter: filter.value });
  } catch (e) {
    toast.push(errorMessage(e, '读取食谱失败'), 'danger');
  }
}

function learnLabel(r: CookbookRowDto): string {
  if (r.learn === 'max') return '已满级';
  if (r.learn === 'z') return '食材不够';
  if (r.learn === '0') return r.grade === 0 ? '学习' : '升级';
  return `用${r.learn}级万能食材`;
}

async function learn(id: number) {
  busy.value = true;
  try {
    await endpoints.learn(id);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '学习失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

watch([street, filter], () => {
  page.value = 1;
  void load();
});
watch(page, () => void load());
onMounted(async () => {
  const rest = await restaurant.refresh().catch(() => null);
  if (rest) street.value = rest.streetId;
  await load();
});
</script>

<template>
  <div class="d-flex gap-2 mb-2">
    <select v-model.number="street" class="form-select form-select-sm w-auto">
      <option v-for="s in catalog.streets" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
    <div class="btn-group btn-group-sm">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        :class="['btn', filter === f.key ? 'btn-primary' : 'btn-outline-primary']"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
    </div>
  </div>
  <div v-if="list" class="small text-muted mb-2">
    本街已学 {{ list.streetLearned }}/{{ list.streetTotal }} · 共学会 {{ list.learned }} 道
  </div>
  <div v-for="r in list?.items ?? []" :key="r.id" class="border rounded p-2 mb-1 small">
    <div class="d-flex align-items-center">
      <RouterLink :to="`/cookbooks/${r.id}`" class="fw-bold">{{ r.name }}</RouterLink>
      <span class="dt-tag ms-2">{{ GRADE_NAMES[r.grade] }}</span>
      <button
        class="btn btn-sm btn-primary ms-auto"
        :data-testid="`learn-${r.id}`"
        :disabled="busy || r.learn === 'z' || r.learn === 'max'"
        @click="learn(r.id)"
      >
        {{ learnLabel(r) }}
      </button>
    </div>
    <div v-if="r.next" class="mt-1">
      <span
        v-for="f in r.next"
        :key="f.foodsId"
        :class="['me-2', f.have >= f.num ? 'text-success' : 'text-danger']"
      >
        {{ catalog.foodName(f.foodsId) }} {{ f.have }}/{{ f.num }}
      </span>
    </div>
  </div>
  <div v-if="list && list.total > list.pageSize" class="d-flex justify-content-between mt-2">
    <button class="btn btn-sm btn-outline-secondary" :disabled="page <= 1" @click="page -= 1">上一页</button>
    <span class="small">{{ page }} / {{ Math.ceil(list.total / list.pageSize) }}</span>
    <button class="btn btn-sm btn-outline-secondary" :disabled="page * list.pageSize >= list.total" @click="page += 1">
      下一页
    </button>
  </div>
</template>
```

`apps/web/src/views/CookbookInfoView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { CookbookDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, TASTE_NAMES } from '../utils/labels';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const d = ref<CookbookDetailDto | null>(null);
const busy = ref(false);
const id = Number(route.params.id);

async function load() {
  d.value = await endpoints.cookbookDetail(id);
}
async function learn() {
  busy.value = true;
  try {
    await endpoints.learn(id);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '学习失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取食谱失败'), 'danger')));
</script>

<template>
  <div v-if="d">
    <h5>{{ d.name }} <span class="dt-tag">{{ GRADE_NAMES[d.grade] }}</span></h5>
    <div class="small text-muted mb-2">
      {{ d.streetName }} · 难度 {{ d.level }} · 口味 {{ d.taste.map((x) => TASTE_NAMES[x]).join('、') }} · 售价
      {{ formatNum(d.coin) }}
    </div>
    <button class="btn btn-sm btn-primary mb-2" :disabled="busy || d.learn === 'z' || d.learn === 'max'" @click="learn">
      {{ d.grade === 0 ? '学习' : '升级' }}
    </button>
    <table class="table table-sm small">
      <thead>
        <tr><th>品级</th><th>所需食材</th></tr>
      </thead>
      <tbody>
        <tr v-for="g in d.grades" :key="g.grade" :class="{ 'table-success': g.grade <= d.grade }">
          <td>{{ g.name }}</td>
          <td>
            <span v-for="f in g.foods" :key="f.foodsId" :class="['me-2', f.have >= f.num ? '' : 'text-danger']">
              {{ catalog.foodName(f.foodsId) }}×{{ f.num }}（{{ f.have }}）
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 4: 橱柜页**

`apps/web/src/views/CupboardView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CupboardDto, FridgeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const tab = ref<'cupboard' | 'fridge'>('cupboard');
const data = ref<CupboardDto | null>(null);
const fridge = ref<FridgeDto | null>(null);
const picked = ref<number | null>(null);
const num = ref(1);
const busy = ref(false);

const pickedItem = computed(() => data.value?.items.find((x) => x.foodsId === picked.value) ?? null);
const pickedLevel = computed(() => (picked.value ? (catalog.food(picked.value)?.level ?? 0) : 0));
const canDecompose = computed(() => pickedLevel.value >= 2 && pickedLevel.value <= 6);
const canCompose = computed(() => pickedLevel.value >= 1 && pickedLevel.value <= 4);

async function load() {
  data.value = await endpoints.cupboard();
}
async function openFridge() {
  tab.value = 'fridge';
  fridge.value = await endpoints.fridge();
  if (data.value?.fridgeUnread) await endpoints.readFridge();
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
    if (tab.value === 'fridge') fridge.value = await endpoints.fridge();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function pick(id: number) {
  picked.value = picked.value === id ? null : id;
  num.value = 1;
}
function handle(way: 'compose' | 'decompose') {
  const foodsId = picked.value!;
  return run(async () => {
    const r = await endpoints.handleFoods({ foodsId, way, num: num.value });
    toast.push(`成功 ${r.success}/${r.chances} 次${r.strengthUsed ? '，消耗 1 体力' : ''}`, 'info');
  }, '处理失败');
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取橱柜失败'), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'cupboard' }]" href="#" @click.prevent="tab = 'cupboard'">橱柜</a>
    </li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'fridge' }]" href="#" @click.prevent="openFridge">
        冰箱<span v-if="data?.fridgeUnread" class="badge bg-danger ms-1">新</span>
      </a>
    </li>
  </ul>

  <template v-if="tab === 'cupboard' && data">
    <div class="small text-muted mb-2">
      格子 {{ data.slotsUsed }}/{{ data.slots }} · 锁定 {{ data.lockUsed }}/{{ data.lockSlots }} · 单种上限
      {{ data.foodsMaxNum }} · 今天免体力处理还剩 {{ data.freeHandleLeft }} 次 · 本街目标 {{ data.targetGrade }} 品
    </div>
    <div class="row g-1">
      <div v-for="f in data.items" :key="f.foodsId" class="col-4">
        <button
          :class="['btn', 'btn-sm', 'w-100', 'border', picked === f.foodsId ? 'btn-warning' : 'btn-light']"
          :data-testid="`pick-${f.foodsId}`"
          @click="pick(f.foodsId)"
        >
          <i v-if="f.locked" class="bi bi-lock-fill"></i>
          {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
          <div v-if="f.streetNeed > 0" class="text-muted" style="font-size: 11px">本街还需 {{ f.streetNeed }}</div>
        </button>
      </div>
    </div>
    <div v-if="pickedItem" class="border rounded p-2 mt-2 small">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <b>{{ catalog.foodName(pickedItem.foodsId) }}</b>
        <input v-model.number="num" type="number" min="1" max="100" class="form-control form-control-sm" style="width: 80px" />
        <button class="btn btn-sm btn-outline-primary" data-testid="decompose" :disabled="busy || !canDecompose" @click="handle('decompose')">
          分解
        </button>
        <button class="btn btn-sm btn-outline-primary" data-testid="compose" :disabled="busy || !canCompose" @click="handle('compose')">
          合成
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          @click="run(() => (pickedItem!.locked ? endpoints.unlockFood(pickedItem!.foodsId) : endpoints.lockFood(pickedItem!.foodsId)), '操作失败')"
        >
          {{ pickedItem.locked ? '解锁' : '锁定' }}
        </button>
        <button
          v-if="pickedItem.foodsId === 467 || pickedItem.foodsId === 468"
          class="btn btn-sm btn-outline-success"
          :disabled="busy || pickedItem.num < 2 * num"
          @click="run(() => endpoints.exchangeMaster(pickedItem!.foodsId as 467 | 468, num), '兑换失败')"
        >
          兑换稀有食材
        </button>
      </div>
      <div class="text-muted mt-1">分解：1 个 → 2 次机会得到低一级食材；合成：2 个 → 1 次机会得到高一级食材。</div>
    </div>
  </template>

  <template v-if="tab === 'fridge' && fridge">
    <div v-if="fridge.items.length === 0" class="small text-muted">冰箱是空的</div>
    <div v-for="f in fridge.items" :key="f.foodsId" class="d-flex align-items-center border-bottom py-1 small">
      {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
      <button class="btn btn-sm btn-outline-primary ms-auto" :disabled="busy" @click="run(() => endpoints.thaw(f.foodsId), '解冻失败')">
        解冻
      </button>
    </div>
  </template>
</template>
```

- [ ] **Step 5: 路由**

`apps/web/src/router.ts` 在 `more` 路由之前加入：

```ts
  { path: '/cookbooks', name: 'cookbooks', component: () => import('./views/CookbooksView.vue'), meta: { needRestaurant: true } },
  { path: '/cookbooks/:id', name: 'cookbook', component: () => import('./views/CookbookInfoView.vue'), meta: { needRestaurant: true } },
  { path: '/cupboard', name: 'cupboard', component: () => import('./views/CupboardView.vue'), meta: { needRestaurant: true } },
```

- [ ] **Step 6: 运行确认通过、提交**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm format`
Expected: PASS

```bash
git add apps/web
git commit -m "feat(web): cookbooks list/detail with learning, cupboard with fridge, locks, compose/decompose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 26: 前端——菜场、商店、仓库

**Files:**
- Create: `apps/web/src/views/MarketView.vue`
- Test: `apps/web/src/views/MarketView.test.ts`
- Create: `apps/web/src/views/ShopView.vue`
- Create: `apps/web/src/views/StoreView.vue`
- Modify: `apps/web/src/router.ts`

**Interfaces:**
- Consumes: `endpoints.market/marketBuy/marketGuess/shop/shopSpecial/shopBuy/shopBuySpecial/shopBuyBlack/sell/discard/store/storeRecords/useGoods`、`useCatalogStore`、`useToastStore`
- Produces: 路由 `/market`、`/shop`、`/store`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/MarketView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import MarketView from './MarketView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { market: vi.fn(), marketBuy: vi.fn(), marketGuess: vi.fn() },
}));

const view: MarketDto = {
  daily: [
    { id: 11, shelf: 0, foodsId: 101, price: 1800, stock: 5999, left: 5990, hot: false, limit: 1000, bought: 0, openedAt: '2026-09-30T00:00:00.000Z' },
  ],
  special: [],
  premium: [],
  nextDaily: '2026-09-30T04:00:00.000Z',
  nextSpecial: '2026-09-30T03:00:00.000Z',
  nextPremium: '2026-09-30T04:00:00.000Z',
  guess: { period: '2026-09-30@12', joined: null, last: null, cost: 2, maxPick: 6, pool: [101, 102, 103] },
};

describe('MarketView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.market).mockResolvedValue(view);
    vi.mocked(endpoints.marketBuy).mockResolvedValue({});
    vi.mocked(endpoints.marketGuess).mockResolvedValue({ period: '2026-09-30@12' });
  });

  it('买菜：按输入的数量购买，买完刷新', async () => {
    const w = mount(MarketView);
    await flushPromises();
    await w.find('[data-testid="qty-11"]').setValue(5);
    await w.find('[data-testid="buy-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketBuy).toHaveBeenCalledWith(11, 5);
    expect(endpoints.market).toHaveBeenCalledTimes(2);
  });

  it('竞猜：展开面板、选择食材后报名', async () => {
    const w = mount(MarketView);
    await flushPromises();
    await w.find('[data-testid="guess-toggle"]').trigger('click');
    await w.find('[data-testid="guess-101"]').trigger('click');
    await w.find('[data-testid="guess-102"]').trigger('click');
    await w.find('[data-testid="guess-join"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketGuess).toHaveBeenCalledWith([101, 102]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/src/views/MarketView.test.ts`
Expected: FAIL，视图不存在

- [ ] **Step 3: 菜场页**

`apps/web/src/views/MarketView.vue`：

```vue
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { MarketDto, MarketItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<MarketDto | null>(null);
const qty = reactive<Record<number, number>>({});
const picks = ref<number[]>([]);
const busy = ref(false);
const guessOpen = ref(false);

const time = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const sections = [
  { key: 'daily', title: '日常菜场', next: 'nextDaily' },
  { key: 'special', title: '特价菜场（需验证邮箱，每人 1 份）', next: 'nextSpecial' },
  { key: 'premium', title: '高级菜场（需爱心项链）', next: 'nextPremium' },
] as const;

async function load() {
  data.value = await endpoints.market();
  for (const it of [...data.value.daily, ...data.value.special, ...data.value.premium]) qty[it.id] ??= 1;
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const buy = (it: MarketItemDto) => run(() => endpoints.marketBuy(it.id, qty[it.id] ?? 1), '购买失败');
function togglePick(id: number) {
  const i = picks.value.indexOf(id);
  if (i >= 0) picks.value.splice(i, 1);
  else if (data.value && picks.value.length < data.value.guess.maxPick) picks.value.push(id);
}
const joinGuess = () => run(() => endpoints.marketGuess([...picks.value]), '竞猜失败');
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取菜场失败'), 'danger')));
</script>

<template>
  <template v-if="data">
    <section v-for="s in sections" :key="s.key" class="mb-3">
      <div class="d-flex align-items-center">
        <h6 class="mb-1">{{ s.title }}</h6>
        <span class="small text-muted ms-auto">下次进货 {{ time(data[s.next]) }}</span>
      </div>
      <div v-if="data[s.key].length === 0" class="small text-muted">还没有进货</div>
      <div v-for="it in data[s.key]" :key="it.id" class="d-flex align-items-center gap-2 border-bottom py-1 small">
        <div class="flex-fill">
          <b>{{ catalog.foodName(it.foodsId) }}</b>
          <span v-if="it.hot" class="badge bg-danger ms-1">热门</span>
          <div class="text-muted">
            {{ formatNum(it.price) }} 银币 · 剩 {{ formatNum(it.left) }} · 限购 {{ it.bought }}/{{ it.limit }}
          </div>
        </div>
        <input
          v-model.number="qty[it.id]"
          :data-testid="`qty-${it.id}`"
          type="number"
          min="1"
          :max="it.limit"
          class="form-control form-control-sm"
          style="width: 72px"
        />
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`buy-${it.id}`"
          :disabled="busy || it.left <= 0 || it.bought >= it.limit"
          @click="buy(it)"
        >
          买
        </button>
      </div>
    </section>

    <section class="border rounded p-2 small">
      <div class="d-flex align-items-center">
        <b>菜场竞猜</b>
        <span class="text-muted ms-2">猜下一轮日常菜场（{{ data.guess.period.slice(-2) }} 点）上什么菜</span>
        <a href="#" class="ms-auto" data-testid="guess-toggle" @click.prevent="guessOpen = !guessOpen">
          {{ guessOpen ? '收起' : '展开' }}
        </a>
      </div>
      <div v-if="data.guess.last" class="text-muted">
        上次猜中 {{ data.guess.last.hits ?? 0 }} 种
      </div>
      <div v-if="data.guess.joined" class="mt-1">
        已报名：{{ data.guess.joined.map((id) => catalog.foodName(id)).join('、') }}
      </div>
      <div v-else-if="guessOpen" class="mt-1">
        <div class="text-muted mb-1">最多选 {{ data.guess.maxPick }} 种，花 {{ data.guess.cost }} 张神秘礼券</div>
        <button
          v-for="id in data.guess.pool"
          :key="id"
          :class="['btn', 'btn-sm', 'me-1', 'mb-1', picks.includes(id) ? 'btn-warning' : 'btn-outline-secondary']"
          :data-testid="`guess-${id}`"
          @click="togglePick(id)"
        >
          {{ catalog.foodName(id) }}
        </button>
        <div>
          <button class="btn btn-sm btn-primary" data-testid="guess-join" :disabled="busy || picks.length === 0" @click="joinGuess">
            报名（{{ picks.length }} 种）
          </button>
        </div>
      </div>
    </section>
  </template>
</template>
```

- [ ] **Step 4: 商店页、仓库页**

`apps/web/src/views/ShopView.vue`：

```vue
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { ShopDto, ShopItemDto, ShopSpecialDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const tab = ref<'coin' | 'black' | 'special'>('coin');
const shop = ref<ShopDto | null>(null);
const special = ref<ShopSpecialDto | null>(null);
const qty = reactive<Record<string, number>>({});
const busy = ref(false);

async function load() {
  [shop.value, special.value] = await Promise.all([endpoints.shop(), endpoints.shopSpecial()]);
}
async function run(fn: () => Promise<unknown>) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '购买失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
const n = (key: string) => qty[key] ?? 1;
const buy = (it: ShopItemDto) =>
  run(() =>
    tab.value === 'coin' ? endpoints.shopBuy(it.goodsId, n(`c${it.goodsId}`)) : endpoints.shopBuyBlack(it.goodsId, n(`b${it.goodsId}`)),
  );
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取商店失败'), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item"><a :class="['nav-link', { active: tab === 'coin' }]" href="#" @click.prevent="tab = 'coin'">银币商店</a></li>
    <li class="nav-item"><a :class="['nav-link', { active: tab === 'black' }]" href="#" @click.prevent="tab = 'black'">黑市</a></li>
    <li class="nav-item"><a :class="['nav-link', { active: tab === 'special' }]" href="#" @click.prevent="tab = 'special'">今日特价</a></li>
  </ul>
  <template v-if="shop && tab !== 'special'">
    <div
      v-for="it in tab === 'coin' ? shop.coin : shop.black"
      :key="it.goodsId"
      class="d-flex align-items-center gap-2 border-bottom py-1 small"
    >
      <div class="flex-fill">
        <b>{{ catalog.goodsName(it.goodsId) }}</b>
        <div class="text-muted">
          {{ formatNum(it.price) }} {{ tab === 'coin' ? '银币' : '钻石' }} · 已有 {{ it.owned }}
          <span v-if="catalog.goods(it.goodsId)?.desc">· {{ catalog.goods(it.goodsId)?.desc }}</span>
        </div>
      </div>
      <input
        v-if="it.limit !== 1"
        v-model.number="qty[`${tab === 'coin' ? 'c' : 'b'}${it.goodsId}`]"
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 64px"
      />
      <button class="btn btn-sm btn-primary" :disabled="busy" @click="buy(it)">买</button>
    </div>
  </template>
  <template v-if="tab === 'special'">
    <div v-if="!special" class="small text-muted">今天中午 12 点上新</div>
    <div v-else class="border rounded p-2 small">
      <b>{{ catalog.goodsName(special.goodsId) }}</b> <span class="badge bg-danger">{{ special.tierName }}</span>
      <div>{{ formatNum(special.price) }} 银币 · 剩 {{ special.stock - special.sold }}/{{ special.stock }}</div>
      <button
        class="btn btn-sm btn-primary mt-1"
        :disabled="busy || special.sold >= special.stock"
        @click="run(() => endpoints.shopBuySpecial(1))"
      >
        抢购
      </button>
    </div>
  </template>
</template>
```

`apps/web/src/views/StoreView.vue`：

```vue
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import type { LedgerRecordDto, StoreDto, StoreItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const tab = ref<'items' | 'records'>('items');
const type = ref<number | undefined>(undefined);
const data = ref<StoreDto | null>(null);
const records = ref<LedgerRecordDto[]>([]);
const range = ref('1h');
const qty = reactive<Record<number, number>>({});
const busy = ref(false);
const TYPES = [
  { v: undefined, label: '全部' },
  { v: 0, label: '消耗品' },
  { v: 1, label: '道具' },
  { v: 2, label: '礼包' },
  { v: 3, label: '设施' },
  { v: 9, label: '勋章' },
];
const RANGES = [
  { v: '1h', label: '1 小时' },
  { v: '6h', label: '6 小时' },
  { v: '12h', label: '12 小时' },
  { v: 'today', label: '今天' },
  { v: 'yesterday', label: '昨天' },
  { v: 'before', label: '前天' },
];

async function load() {
  data.value = await endpoints.store(type.value);
}
async function loadRecords() {
  records.value = await endpoints.storeRecords(range.value);
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const n = (it: StoreItemDto) => Math.min(qty[it.goodsId] ?? 1, it.num);
const expires = (at: string | null) =>
  at ? `剩余 ${Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000))} 小时` : '';
const recordName = (r: LedgerRecordDto) =>
  r.kind === 'goods' ? catalog.goodsName(r.itemId ?? 0) : r.kind === 'foods' ? catalog.foodName(r.itemId ?? 0) : r.kind;

watch(type, () => void load());
watch(range, () => void loadRecords());
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取仓库失败'), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item"><a :class="['nav-link', { active: tab === 'items' }]" href="#" @click.prevent="tab = 'items'">仓库</a></li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'records' }]" href="#" @click.prevent="(tab = 'records'), loadRecords()">道具流水</a>
    </li>
  </ul>
  <template v-if="tab === 'items' && data">
    <div class="d-flex align-items-center mb-2 small">
      <select v-model="type" class="form-select form-select-sm w-auto">
        <option v-for="t in TYPES" :key="t.label" :value="t.v">{{ t.label }}</option>
      </select>
      <span class="ms-auto text-muted">已用 {{ data.kinds }}/{{ data.storeNum }} 种</span>
    </div>
    <div v-for="it in data.items" :key="it.goodsId" class="d-flex align-items-center gap-1 border-bottom py-1 small">
      <div class="flex-fill">
        <b>{{ catalog.goodsName(it.goodsId) }}</b> ×{{ formatNum(it.num) }}
        <span class="text-muted">{{ expires(it.expiresAt) }}</span>
      </div>
      <input
        v-if="it.batch || it.sellPrice !== null"
        v-model.number="qty[it.goodsId]"
        type="number"
        min="1"
        :max="it.num"
        class="form-control form-control-sm"
        style="width: 60px"
      />
      <button
        v-if="it.usable"
        class="btn btn-sm btn-primary"
        :disabled="busy"
        @click="run(() => endpoints.useGoods(it.goodsId, it.batch ? n(it) : 1), '使用失败')"
      >
        使用
      </button>
      <button
        v-if="it.sellPrice !== null"
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        @click="run(() => endpoints.sell(it.goodsId, n(it)), '出售失败')"
      >
        卖 {{ formatNum(it.sellPrice * n(it)) }}
      </button>
      <button v-if="it.goodsId === 87" class="btn btn-sm btn-outline-danger" :disabled="busy" @click="run(() => endpoints.discard(87), '丢弃失败')">
        丢弃
      </button>
    </div>
  </template>
  <template v-if="tab === 'records'">
    <select v-model="range" class="form-select form-select-sm w-auto mb-2">
      <option v-for="r in RANGES" :key="r.v" :value="r.v">{{ r.label }}</option>
    </select>
    <div v-for="(r, i) in records" :key="i" class="d-flex border-bottom py-1 small">
      <span class="text-muted me-2">{{ new Date(r.at).toLocaleTimeString('zh-CN') }}</span>
      {{ recordName(r) }} <b :class="['ms-auto', r.delta >= 0 ? 'text-success' : 'text-danger']">{{ r.delta >= 0 ? '+' : '' }}{{ formatNum(r.delta) }}</b>
    </div>
    <div v-if="records.length === 0" class="small text-muted">这段时间没有变动</div>
  </template>
</template>
```

- [ ] **Step 5: 路由**

`apps/web/src/router.ts` 在 `more` 路由之前加入：

```ts
  { path: '/market', name: 'market', component: () => import('./views/MarketView.vue'), meta: { needRestaurant: true } },
  { path: '/shop', name: 'shop', component: () => import('./views/ShopView.vue'), meta: { needRestaurant: true } },
  { path: '/store', name: 'store', component: () => import('./views/StoreView.vue'), meta: { needRestaurant: true } },
```

- [ ] **Step 6: 运行确认通过、提交**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm format`
Expected: PASS

```bash
git add apps/web
git commit -m "feat(web): market with purchase limits and guessing, shop tabs, store with use/sell and records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 27: 前端——协会（升星、油壶、改名、搬家）、天气、得失提示

**Files:**
- Create: `apps/web/src/views/SocietyView.vue`
- Create: `apps/web/src/views/SocietyStarView.vue`
- Create: `apps/web/src/views/SocietyOilView.vue`
- Create: `apps/web/src/views/SocietyRenameView.vue`
- Create: `apps/web/src/views/SocietyMoveView.vue`
- Create: `apps/web/src/views/WeatherView.vue`
- Test: `apps/web/src/views/SocietyStarView.test.ts`
- Test: `apps/web/src/components/EventToast.test.ts`
- Modify: `apps/web/src/router.ts`

**Interfaces:**
- Consumes: `endpoints.starNeed/starUp/oilNeed/oilExpand/rename/move/weather/overview`、`NeedChecks`、`useToastStore`、`useCatalogStore`、`useRestaurantStore`、`describeEffects`
- Produces: 路由 `/society`、`/society/star`、`/society/oil`、`/society/rename`、`/society/move`、`/weather`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/SocietyStarView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import SocietyStarView from './SocietyStarView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { starNeed: vi.fn(), starUp: vi.fn() } }));

describe('SocietyStarView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('条件都满足时可以升星', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      star: 0,
      nextStar: 1,
      available: true,
      ok: true,
      award: { goods: [{ id: 117, num: 1 }] },
      checks: [{ key: 'level', need: 13, have: 13, ok: true }],
    });
    vi.mocked(endpoints.starUp).mockResolvedValue({ star: 1 });
    const w = mount(SocietyStarView);
    await flushPromises();
    await w.find('[data-testid="star-up"]').trigger('click');
    await flushPromises();
    expect(endpoints.starUp).toHaveBeenCalled();
  });

  it('条件不满足时按钮禁用；未开放的星级给出说明', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      star: 7,
      nextStar: 8,
      available: false,
      ok: false,
      award: null,
      checks: [],
    });
    const w = mount(SocietyStarView);
    await flushPromises();
    expect(w.find('[data-testid="star-up"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('暂未开放');
  });
});
```

`apps/web/src/components/EventToast.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../stores/toast';
import EventToast from './EventToast.vue';

describe('EventToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('显示提示，3 秒后自动消失，点击立即消失', async () => {
    const toast = useToastStore();
    const w = mount(EventToast);
    toast.push('获得 银币 100');
    toast.push('消耗 银币 5', 'info');
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]').map((x) => x.text())).toEqual(['获得 银币 100', '消耗 银币 5']);
    await w.findAll('[data-testid="toast"]')[0]!.trigger('click');
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(0);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/src/views/SocietyStarView.test.ts apps/web/src/components/EventToast.test.ts`
Expected: `SocietyStarView` 用例 FAIL（视图不存在）；`EventToast` 用例 PASS（组件在 Task 23 已完成——这个测试补的是覆盖）

- [ ] **Step 3: 协会和天气页**

`apps/web/src/views/SocietyView.vue`：

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router';

const links = [
  { to: '/society/star', icon: 'bi-star', label: '升星', desc: '等级、食谱、凭证够了就能升星' },
  { to: '/society/oil', icon: 'bi-droplet-half', label: '油壶扩容', desc: '提高油上限，减少停业' },
  { to: '/society/rename', icon: 'bi-pencil', label: '改名', desc: '需要改名卡' },
  { to: '/society/move', icon: 'bi-signpost', label: '搬家', desc: '换一条街，街道勋章跟着换' },
];
</script>

<template>
  <h5>协会</h5>
  <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="d-flex align-items-center border rounded p-2 mb-2 text-decoration-none">
    <i :class="['bi', l.icon, 'fs-4', 'me-2']"></i>
    <div>
      <div class="fw-bold">{{ l.label }}</div>
      <div class="small text-muted">{{ l.desc }}</div>
    </div>
  </RouterLink>
</template>
```

`apps/web/src/views/SocietyStarView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { StarNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import NeedChecks from '../components/NeedChecks.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const need = ref<StarNeedDto | null>(null);
const busy = ref(false);

async function load() {
  need.value = await endpoints.starNeed();
}
async function starUp() {
  busy.value = true;
  try {
    const r = await endpoints.starUp();
    toast.push(`恭喜升到 ${r.star} 星！`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '升星失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取失败'), 'danger')));
</script>

<template>
  <div v-if="need">
    <h5>升星（当前 {{ need.star }} 星）</h5>
    <template v-if="need.nextStar">
      <p v-if="!need.available" class="small text-muted">{{ need.nextStar }} 星暂未开放</p>
      <NeedChecks :checks="need.checks" />
      <div v-if="need.award" class="small mb-2">
        奖励：
        <span v-for="g in need.award.goods ?? []" :key="g.id" class="dt-tag me-1">{{ catalog.goodsName(g.id) }}×{{ g.num }}</span>
      </div>
    </template>
    <p v-else class="small text-muted">已经是最高星级</p>
    <button class="btn btn-primary w-100" data-testid="star-up" :disabled="busy || !need.ok" @click="starUp">
      升到 {{ need.nextStar ?? need.star }} 星
    </button>
  </div>
</template>
```

`apps/web/src/views/SocietyOilView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { OilNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import NeedChecks from '../components/NeedChecks.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const toast = useToastStore();
const need = ref<OilNeedDto | null>(null);
const busy = ref(false);

async function load() {
  need.value = await endpoints.oilNeed();
}
async function expand() {
  busy.value = true;
  try {
    await endpoints.oilExpand();
    toast.push('油壶扩容成功');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '扩容失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取失败'), 'danger')));
</script>

<template>
  <div v-if="need">
    <h5>油壶扩容（当前 {{ need.oilLevel }} 级，上限 {{ formatNum(need.oilMax) }}）</h5>
    <template v-if="need.nextLevel">
      <p class="small">扩容到 {{ need.nextLevel }} 级后上限 {{ formatNum(need.nextOilMax ?? 0) }}</p>
      <NeedChecks :checks="need.checks" />
    </template>
    <p v-else class="small text-muted">已经是最高级</p>
    <button class="btn btn-primary w-100" :disabled="busy || !need.ok" @click="expand">扩容</button>
  </div>
</template>
```

`apps/web/src/views/SocietyRenameView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
const name = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  try {
    const r = await endpoints.rename(name.value.trim());
    toast.push(`已改名为「${r.name}」`);
    name.value = '';
  } catch (e) {
    toast.push(errorMessage(e, '改名失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h5>改名</h5>
  <p class="small text-muted">需要 1 张改名卡。新名字最多 9 个字，只能用中文、字母和数字，不能和本服其他餐厅重名。</p>
  <form @submit.prevent="submit">
    <input v-model="name" class="form-control mb-2" placeholder="新名字" maxlength="32" />
    <button class="btn btn-primary w-100" :disabled="busy || !name.trim()">改名</button>
  </form>
</template>
```

`apps/web/src/views/SocietyMoveView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const target = ref<number | null>(null);
const busy = ref(false);
const rest = computed(() => restaurant.rest);
const streets = computed(() => catalog.streets.filter((s) => s.id !== 0 && s.id !== rest.value?.streetId));
const cost = computed(() => (rest.value ? rest.value.tables.length * Math.floor((catalog.goods(82)?.coin ?? 5000) / 2) : 0));

async function move() {
  if (target.value === null) return;
  busy.value = true;
  try {
    await endpoints.move(target.value);
    toast.push(`已经搬到 ${catalog.streetName(target.value)}`);
    await restaurant.refresh();
  } catch (e) {
    toast.push(errorMessage(e, '搬家失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => restaurant.refresh().catch(() => undefined));
</script>

<template>
  <h5>搬家</h5>
  <p class="small text-muted">
    现在在 {{ rest?.streetName }}。需要 1 张搬家卡（持有搬家处工作证时免），花费约 {{ formatNum(cost) }} 银币（幸运时半价）。
  </p>
  <select v-model="target" class="form-select mb-2">
    <option :value="null" disabled>选择新街道</option>
    <option v-for="s in streets" :key="s.id" :value="s.id">{{ s.name }}（{{ s.cookName }}）</option>
  </select>
  <button class="btn btn-primary w-100" :disabled="busy || target === null" @click="move">搬家</button>
</template>
```

`apps/web/src/views/WeatherView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';

const world = ref<WorldDto | null>(null);
const error = ref('');
onMounted(async () => {
  try {
    world.value = await endpoints.weather();
  } catch (e) {
    error.value = errorMessage(e, '读取天气失败');
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-if="world">
    <h5><i class="bi bi-cloud-sun"></i> {{ world.weather.name }}</h5>
    <p class="small">{{ world.weather.note }}</p>
    <p class="small text-muted">
      {{ describeEffects(world.weather.effects) || '对经营没有影响' }}（0 星餐厅不受天气影响）<br />
      持续到 {{ new Date(world.weather.until).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
    </p>
    <p class="small">蟹老板今天在 <b>{{ world.krabStreetName }}</b>：在这条街营业，遇到神秘顾客的机会更大。</p>
    <p v-if="world.holidayMultiplier > 1" class="small text-success">今天是节日，美味券掉落概率 ×{{ world.holidayMultiplier }}</p>
  </div>
</template>
```

- [ ] **Step 4: 路由**

`apps/web/src/router.ts` 在 `more` 路由之前加入：

```ts
  { path: '/society', name: 'society', component: () => import('./views/SocietyView.vue'), meta: { needRestaurant: true } },
  { path: '/society/star', name: 'society-star', component: () => import('./views/SocietyStarView.vue'), meta: { needRestaurant: true } },
  { path: '/society/oil', name: 'society-oil', component: () => import('./views/SocietyOilView.vue'), meta: { needRestaurant: true } },
  { path: '/society/rename', name: 'society-rename', component: () => import('./views/SocietyRenameView.vue'), meta: { needRestaurant: true } },
  { path: '/society/move', name: 'society-move', component: () => import('./views/SocietyMoveView.vue'), meta: { needRestaurant: true } },
  { path: '/weather', name: 'weather', component: () => import('./views/WeatherView.vue'), meta: { needRestaurant: true } },
```

- [ ] **Step 5: 运行确认通过、构建、提交**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm --filter @dt/web build && pnpm format`
Expected: 全部 PASS，构建成功

```bash
git add apps/web
git commit -m "feat(web): society (star-up, oil, rename, move), weather page, toast tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 28: 数值模拟器（一）——环境、虚拟时钟、机器人、运行循环、指标

**Files:**
- Create: `apps/server/src/sim/env.ts`
- Create: `apps/server/src/sim/bot.ts`
- Create: `apps/server/src/sim/metrics.ts`
- Test: `apps/server/src/sim/metrics.test.ts`
- Create: `apps/server/src/sim/run.ts`
- Modify: `.gitignore`（`sim-out/`）

**Interfaces:**
- Consumes: `createGame`、`AppDeps`、`migrateToLatest`、`runDueJobs`、全部 service（`restaurant.open`、`task.*`、`store.*`、`growth.*`、`shop.*`、`market.*`、`cookbook.*`、`cupboard.*`）、`gameParts`、`gameDay`、`ROUND_MS`、`seededRng`、`hashSeed`
- Produces:
  - `SimClock`、`createSimClock(start)`、`withDatabase(url, db)`、`recreateDatabase(adminUrl, dbName)`
  - `SimEnvOptions { adminUrl; dbName; redisUrl; bundlePath; start; seed; tuning? }`、`SimEnv { deps; game; clock; shardId; dbUrl; close() }`、`openSimEnv(o)`
  - `Persona`、`PERSONAS`、`Bot { name; persona; ctx }`、`createBots(env, personaKeys, perPersona)`、`botTurn(game, bot): Promise<TurnStats>`
  - `BotDay`、`EconomyRow`、`StuckRow`、`snapshot(env, bots, dayIndex)`、`economyOf(db, restIds)`、`detectStuck(days, config, threshold)`、`starDays(days)`
  - `SimOptions { adminUrl; dbName; redisUrl; bundlePath; days; botsPerPersona; personas; seed; start; tuning?; out? }`、`SimResult { options; bots; days; economy; stuck; starDays; elapsedMs }`、`runSim(o): Promise<SimResult>`

- [ ] **Step 1: 写指标的失败测试（纯函数部分）**

`apps/server/src/sim/metrics.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../test/config';
import { detectStuck, starDays, type BotDay } from './metrics';

const config = testConfig();
const day = (d: number, level: number, star: number, learned: number, certs = 0): BotDay => ({
  day: d,
  bot: '勤快1',
  persona: 'diligent',
  level,
  star,
  coin: 0,
  diamond: 0,
  learned,
  certs,
  oilLevel: 0,
  renown: 0,
});

describe('卡点检测', () => {
  it('等级够了但超过 N 天升不了星：报出缺的条件', () => {
    const days = [day(0, 12, 0, 5), day(1, 13, 0, 5), day(2, 14, 0, 6), day(3, 14, 0, 7), day(4, 15, 0, 8), day(5, 15, 0, 9), day(6, 16, 0, 9)];
    const stuck = detectStuck(days, config, 5);
    // 第 1 天等级达到 13，到最后一天（第 6 天）还是 0 星：卡了 5 天
    expect(stuck).toEqual([{ bot: '勤快1', persona: 'diligent', star: 0, days: 5, lacking: ['cookbooks', 'certs'] }]);
  });
  it('升上去了就不算卡点', () => {
    const days = [day(0, 13, 0, 15, 1), day(1, 14, 1, 15)];
    expect(detectStuck(days, config, 1)).toEqual([]);
  });
});

describe('到达星级的天数', () => {
  it('按画像取平均', () => {
    const a = [day(0, 1, 0, 0), day(3, 13, 1, 15)].map((x) => ({ ...x, bot: 'a' }));
    const b = [day(0, 1, 0, 0), day(5, 13, 1, 15)].map((x) => ({ ...x, bot: 'b' }));
    expect(starDays([...a, ...b])).toEqual({ diligent: { '1': 4 } });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/sim/metrics.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 环境与虚拟时钟**

`apps/server/src/sim/env.ts`：

```ts
import pg from 'pg';
import { loadGameConfig } from '@dt/config';
import { hashSeed, seededRng } from '@dt/shared';
import type { AppDeps } from '../app';
import { createDb } from '../db';
import { migrateToLatest } from '../db/migrate';
import { loadEnv } from '../env';
import { EventBus } from '../events/bus';
import { createGame, type Game } from '../game';
import { disabledCaptcha } from '../infra/captcha';
import { memoryMailer } from '../infra/mailer';
import { createRedis } from '../infra/redis';
import { createSessionStore } from '../security/sessionStore';

export interface SimClock {
  now(): Date;
  set(d: Date): void;
  advance(ms: number): void;
}

export function createSimClock(start: Date): SimClock {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    set: (d) => {
      t = d.getTime();
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** 先删后建一次性库（库名只允许小写字母、数字、下划线） */
export async function recreateDatabase(adminUrl: string, dbName: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`bad database name ${dbName}`);
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query(`drop database if exists ${dbName} with (force)`);
    await c.query(`create database ${dbName}`);
  } finally {
    await c.end();
  }
}

export interface SimEnvOptions {
  /** 有建库权限的连接串（开发库 dt 或测试库 dt_test） */
  adminUrl: string;
  dbName: string;
  redisUrl: string;
  bundlePath: string;
  start: Date;
  seed: number;
  /** 区服 tuning 覆盖 */
  tuning?: unknown;
}

export interface SimEnv {
  deps: AppDeps;
  game: Game;
  clock: SimClock;
  shardId: number;
  dbUrl: string;
  close(): Promise<void>;
}

export async function openSimEnv(o: SimEnvOptions): Promise<SimEnv> {
  await recreateDatabase(o.adminUrl, o.dbName);
  const dbUrl = withDatabase(o.adminUrl, o.dbName);
  const db = createDb(dbUrl, 20);
  await migrateToLatest(db);
  const redis = createRedis(o.redisUrl);
  await redis.flushdb();
  const clock = createSimClock(o.start);
  let opSeq = 0;
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'silent',
    DATABASE_URL: dbUrl,
    REDIS_URL: o.redisUrl,
    CONFIG_BUNDLE_PATH: o.bundlePath,
    WEB_ORIGIN: 'http://localhost',
    ENABLE_TEST_API: 'false',
  });
  const deps: AppDeps = {
    env,
    db,
    redis,
    config: loadGameConfig(o.bundlePath),
    mailer: memoryMailer(),
    captcha: disabledCaptcha(),
    bus: new EventBus(),
    sessions: createSessionStore(redis, 3600),
    now: clock.now,
    // 机器人操作按顺序执行，每个操作取一个按序号派生的种子：同样参数两次运行结果一致
    rng: () => seededRng(hashSeed(o.seed, 'op', opSeq++)),
  };
  const game = createGame(deps);
  const shardId = 1;
  await db.insertInto('shard').values({ id: shardId, name: '模拟服', opened_at: o.start }).execute();
  if (o.tuning !== undefined) {
    await db.insertInto('shard_config').values({ shard_id: shardId, override: JSON.stringify({ tuning: o.tuning }) }).execute();
  }
  return {
    deps,
    game,
    clock,
    shardId,
    dbUrl,
    close: async () => {
      await db.destroy();
      redis.disconnect();
    },
  };
}
```

- [ ] **Step 4: 机器人**

`apps/server/src/sim/bot.ts`：

```ts
import type { GoodsUse } from '@dt/config';
import type { RestCtx } from '../core/deps';
import type { Game } from '../game';
import { AppError } from '../http/errors';
import type { SimEnv } from './env';

export interface Persona {
  key: 'diligent' | 'normal' | 'casual';
  label: string;
  /** 每天在这些整点上线 */
  hours: number[];
}

export const PERSONAS: Persona[] = [
  { key: 'diligent', label: '勤快', hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
  { key: 'normal', label: '普通', hours: [9, 13, 20] },
  { key: 'casual', label: '休闲', hours: [20] },
];

export interface Bot {
  name: string;
  persona: Persona;
  ctx: RestCtx;
}

export async function createBots(env: SimEnv, personaKeys: Persona['key'][], perPersona: number): Promise<Bot[]> {
  const bots: Bot[] = [];
  let i = 0;
  for (const persona of PERSONAS.filter((p) => personaKeys.includes(p.key))) {
    for (let k = 1; k <= perPersona; k++) {
      i += 1;
      const acc = await env.deps.db
        .insertInto('account')
        .values({
          username: `bot${i}`,
          password_hash: 'x',
          email: `bot${i}@sim.local`,
          email_verified_at: env.clock.now(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const restId = await env.game.restaurant.open(acc.id, env.shardId, `${persona.label}${k}号`);
      bots.push({
        name: `${persona.label}${k}`,
        persona,
        // 每个机器人独立的 IP 和设备，避免菜场按 IP 限购时互相影响
        ctx: {
          accountId: acc.id,
          shardId: env.shardId,
          restaurantId: restId,
          ip: `10.0.${i >> 8}.${i & 255}`,
          deviceId: `sim-bot-device-${i}`,
        },
      });
    }
  }
  return bots;
}

export interface TurnStats {
  actions: number;
  failures: number;
}

/** 直接用掉的道具用途 */
const USE_ALL: ReadonlySet<GoodsUse['kind']> = new Set([
  'gift',
  'currency',
  'cupboardNum',
  'storeNum',
  'foodsMax',
  'lockSlots',
  'mysteryFood',
]);
/** 设施位没有设施时去商店买的便宜货：海报、奖杯、节油器 */
const CHEAP_DEVICES: Record<number, number> = { 1: 13, 2: 10, 3: 21 };

type Attempt = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * 一次上线（设计文档 §8.1）："认真但不刷极限"的固定策略：
 * 签到 → 用道具 → 加点 → 加油 → 领任务和活跃 → 摆设施 → 升星 / 扩油壶 → 买菜 → 学食谱 → 合成多余食材
 */
export async function botTurn(game: Game, bot: Bot): Promise<TurnStats> {
  const stats: TurnStats = { actions: 0, failures: 0 };
  const ctx = bot.ctx;
  const config = game.app.config;
  const attempt: Attempt = async (fn) => {
    try {
      await fn();
      stats.actions += 1;
      return true;
    } catch (e) {
      if (e instanceof AppError) {
        stats.failures += 1;
        return false;
      }
      throw e;
    }
  };
  const rest = () => game.restaurant.overview(ctx.restaurantId);

  await attempt(() => game.task.signIn(ctx));

  const store = await game.store.list(ctx, {});
  for (const it of store.items) {
    const use = config.requireGoods(it.goodsId).use;
    if (!use || !it.usable) continue;
    if (use.kind === 'addTable') {
      for (let i = 0; i < it.num; i++) {
        if (!(await attempt(() => game.store.use(ctx, { goodsId: it.goodsId, num: 1 })))) break;
      }
      continue;
    }
    if (!USE_ALL.has(use.kind)) continue;
    if (it.batch) await attempt(() => game.store.use(ctx, { goodsId: it.goodsId, num: Math.min(it.num, 99) }));
    else for (let i = 0; i < Math.min(it.num, 20); i++) await attempt(() => game.store.use(ctx, { goodsId: it.goodsId, num: 1 }));
  }

  let r = await rest();
  if (r.attrLeft > 0) await attempt(() => game.growth.allocate(ctx, { cook: r.attrLeft, cutting: 0, fire: 0 }));
  r = await rest();
  if (r.oil < r.oilMax * 0.6) await attempt(() => game.growth.refuel(ctx));

  for (let i = 0; i < 5; i++) {
    const t = await game.task.tasks(ctx);
    const done = [t.main, ...t.side].filter((x) => x?.done);
    if (done.length === 0) break;
    for (const x of done) await attempt(() => game.task.claimTask(ctx, x!.id));
  }
  const act = await game.task.activation(ctx);
  for (const rw of act.rewards) {
    if (!rw.claimed && act.total >= rw.points) await attempt(() => game.task.claimActivation(ctx, rw.points));
  }

  const dev = await game.growth.devices(ctx);
  for (const slot of dev.slots) {
    if (!slot.unlocked || slot.goodsId !== null) continue;
    let goodsId = dev.store.find((x) => x.deviceType === slot.deviceType)?.goodsId;
    const cheap = CHEAP_DEVICES[slot.deviceType];
    if (goodsId === undefined && cheap !== undefined && (await rest()).coin > 50_000) {
      if (await attempt(() => game.shop.buy(ctx, { goodsId: cheap, num: 1 }))) goodsId = cheap;
    }
    if (goodsId !== undefined) {
      const g = goodsId;
      await attempt(() => game.growth.placeDevice(ctx, { slot: slot.slot, goodsId: g }));
    }
  }

  const star = await game.growth.starNeed(ctx);
  if (star.available && star.nextStar !== null) {
    const cert = star.checks.find((c) => c.key === 'goods');
    const others = star.checks.filter((c) => c.key !== 'goods').every((c) => c.ok);
    if (others && cert && !cert.ok) await attempt(() => game.shop.buy(ctx, { goodsId: cert.id!, num: cert.need - cert.have }));
    if (others) await attempt(() => game.growth.starUp(ctx));
  }

  const oil = await game.growth.oilNeed(ctx);
  if (oil.nextLevel !== null && oil.checks.filter((c) => c.key !== 'goods').every((c) => c.ok)) {
    for (const c of oil.checks.filter((x) => x.key === 'goods' && !x.ok)) {
      const g = config.requireGoods(c.id!);
      const num = c.need - c.have;
      if (g.onSale) await attempt(() => game.shop.buy(ctx, { goodsId: g.id, num }));
      else await attempt(() => game.shop.buyBlack(ctx, { goodsId: g.id, num }));
    }
    await attempt(() => game.growth.oilExpand(ctx));
  }

  await shopForFoods(game, bot, attempt);

  for (let street = 0; street <= 13; street++) {
    const list = await game.cookbook.list(ctx, { street, page: 1, filter: 'learnable' });
    for (const row of list.items.slice(0, 20)) await attempt(() => game.cookbook.learn(ctx, row.id));
  }

  await composeSurplus(game, bot, attempt);
  return stats;
}

/** 买"把所有食谱学到 1 品级还缺"的食材；留出加满一次油的钱 */
async function shopForFoods(game: Game, bot: Bot, attempt: Attempt): Promise<void> {
  const ctx = bot.ctx;
  const need = await game.cookbook.foodsNeed(ctx, { target: 1 });
  const lack = new Map(need.items.filter((x) => x.lack > 0).map((x) => [x.foodsId, x.lack]));
  const market = await game.market.view(ctx);
  let r = await game.restaurant.overview(ctx.restaurantId);
  const reserve = r.oilMax + 20_000;
  for (const it of [...market.daily, ...market.special]) {
    const want = lack.get(it.foodsId) ?? 0;
    const room = Math.min(it.limit - it.bought, it.left, want);
    const affordable = Math.floor((r.coin - reserve) / Math.max(1, it.price));
    const num = Math.min(room, affordable);
    if (num <= 0) continue;
    if (await attempt(() => game.market.buy(ctx, { itemId: it.id, num }))) {
      r = await game.restaurant.overview(ctx.restaurantId);
    }
  }
  if (!market.guess.joined && market.daily.length > 0) {
    const pick = market.daily
      .map((x) => x.foodsId)
      .filter((id) => market.guess.pool.includes(id))
      .slice(0, market.guess.maxPick);
    if (pick.length > 0) await attempt(() => game.market.joinGuess(ctx, pick));
  }
}

/** 用当天的免体力次数，把学食谱用不到的 1~4 级食材合成上去 */
async function composeSurplus(game: Game, bot: Bot, attempt: Attempt): Promise<void> {
  const ctx = bot.ctx;
  const cup = await game.cupboard.list(ctx);
  let free = cup.freeHandleLeft;
  const need = await game.cookbook.foodsNeed(ctx, { target: 1 });
  const needed = new Map(need.items.map((x) => [x.foodsId, x.need]));
  for (const it of cup.items) {
    if (free <= 0) break;
    const food = game.app.config.foods.get(it.foodsId);
    if (!food || food.level < 1 || food.level > 4) continue;
    const surplus = it.num - (needed.get(it.foodsId) ?? 0) - 5;
    const num = Math.min(100, surplus - (surplus % 2));
    if (num < 2) continue;
    if (await attempt(() => game.cupboard.handle(ctx, { foodsId: it.foodsId, way: 'compose', num }))) free -= 1;
  }
}
```

- [ ] **Step 5: 指标**

`apps/server/src/sim/metrics.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import type { DB } from '../db/schema';
import { normalizeCounts } from '../modules/settlement/globals';
import type { Bot } from './bot';

/** 每个机器人每天 0 点的状态 */
export interface BotDay {
  day: number;
  bot: string;
  persona: string;
  level: number;
  star: number;
  coin: number;
  diamond: number;
  learned: number;
  certs: number;
  oilLevel: number;
  renown: number;
}

export interface EconomyRow {
  day: string;
  kind: string;
  source: string;
  delta: number;
}

export interface StuckRow {
  bot: string;
  persona: string;
  star: number;
  days: number;
  lacking: string[];
}

export async function snapshot(db: Kysely<DB>, bots: Bot[], dayIndex: number): Promise<BotDay[]> {
  const ids = bots.map((b) => b.ctx.restaurantId);
  const rows = await db.selectFrom('restaurant').selectAll().where('id', 'in', ids).execute();
  const certs = await db
    .selectFrom('store_item')
    .select(['rest_id', 'num'])
    .where('rest_id', 'in', ids)
    .where('goods_id', '=', GOODS.starCert)
    .execute();
  const certMap = new Map(certs.map((c) => [c.rest_id, c.num]));
  return bots.map((b) => {
    const r = rows.find((x) => x.id === b.ctx.restaurantId)!;
    return {
      day: dayIndex,
      bot: b.name,
      persona: b.persona.key,
      level: r.level,
      star: r.star_level,
      coin: r.coin,
      diamond: r.diamond,
      learned: normalizeCounts(r.cookbook_counts).learned,
      certs: certMap.get(r.id) ?? 0,
      oilLevel: r.oil_level,
      renown: r.renown,
    };
  });
}

/** 按北京时间的日期汇总：流水（按种类和来源）+ 结算收益 */
export async function economyOf(db: Kysely<DB>, restIds: number[]): Promise<EconomyRow[]> {
  const ledger = await sql<EconomyRow>`
    select to_char((created_at at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD') as day,
           kind, source, sum(delta)::bigint as delta
    from ledger where rest_id = any(${restIds}::int[])
    group by 1, 2, 3 order by 1, 2, 3`.execute(db);
  const income = await sql<{ day: string; coin: number; exp: number }>`
    select to_char((created_at at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD') as day,
           sum(coin)::bigint as coin, sum(exp)::bigint as exp
    from income_round where rest_id = any(${restIds}::int[])
    group by 1 order by 1`.execute(db);
  const out = ledger.rows.map((r) => ({ ...r, delta: Number(r.delta) }));
  for (const r of income.rows) {
    out.push({ day: r.day, kind: 'coin', source: 'settlement', delta: Number(r.coin) });
    out.push({ day: r.day, kind: 'exp', source: 'settlement', delta: Number(r.exp) });
  }
  return out;
}

/** 卡点：等级已满足下一星要求，却连续 threshold 天以上没升星；列出当时还缺的条件 */
export function detectStuck(days: BotDay[], config: GameConfig, threshold: number): StuckRow[] {
  const out: StuckRow[] = [];
  const byBot = new Map<string, BotDay[]>();
  for (const d of days) byBot.set(d.bot, [...(byBot.get(d.bot) ?? []), d]);
  for (const [bot, list] of byBot) {
    list.sort((a, b) => a.day - b.day);
    const last = list.at(-1)!;
    const need = config.starNeed.get(last.star + 1);
    if (!need || need.cookbooksKind !== 'learned') continue;
    const since = list.find((d) => d.star === last.star && d.level >= need.needLevel);
    if (!since) continue;
    const stuckDays = last.day - since.day;
    if (stuckDays < threshold) continue;
    const lacking: string[] = [];
    if (last.learned < need.needCookbooks) lacking.push('cookbooks');
    if (last.certs < need.needCerts) lacking.push('certs');
    out.push({ bot, persona: last.persona, star: last.star, days: stuckDays, lacking });
  }
  return out;
}

/** 每种画像到达每个星级的平均天数（取每个机器人第一次达到的那天） */
export function starDays(days: BotDay[]): Record<string, Record<string, number>> {
  const first = new Map<string, Map<number, number>>();
  const personaOf = new Map<string, string>();
  for (const d of [...days].sort((a, b) => a.day - b.day)) {
    personaOf.set(d.bot, d.persona);
    const m = first.get(d.bot) ?? new Map<number, number>();
    for (let s = 1; s <= d.star; s++) if (!m.has(s)) m.set(s, d.day);
    first.set(d.bot, m);
  }
  const acc = new Map<string, Map<number, number[]>>();
  for (const [bot, m] of first) {
    const p = personaOf.get(bot)!;
    const pm = acc.get(p) ?? new Map<number, number[]>();
    for (const [s, day] of m) pm.set(s, [...(pm.get(s) ?? []), day]);
    acc.set(p, pm);
  }
  const out: Record<string, Record<string, number>> = {};
  for (const [p, pm] of acc) {
    out[p] = {};
    for (const [s, list] of pm) out[p]![String(s)] = Math.round((list.reduce((x, y) => x + y, 0) / list.length) * 10) / 10;
  }
  return out;
}
```

Run: `pnpm exec vitest run apps/server/src/sim/metrics.test.ts`
Expected: PASS

- [ ] **Step 6: 运行循环**

`apps/server/src/sim/run.ts`：

```ts
import { gameDay, gameParts, ROUND_MS } from '@dt/shared';
import { runDueJobs } from '../worker/periodic';
import { botTurn, createBots, type Bot, type Persona } from './bot';
import { openSimEnv } from './env';
import { detectStuck, economyOf, snapshot, starDays, type BotDay, type EconomyRow, type StuckRow } from './metrics';

export interface SimOptions {
  adminUrl: string;
  dbName: string;
  redisUrl: string;
  bundlePath: string;
  days: number;
  botsPerPersona: number;
  personas: Persona['key'][];
  seed: number;
  start: Date;
  tuning?: unknown;
  stuckDays?: number;
}

export interface SimResult {
  options: Omit<SimOptions, 'adminUrl' | 'redisUrl' | 'bundlePath'>;
  bots: Array<{ name: string; persona: string; restaurantId: number }>;
  days: BotDay[];
  economy: EconomyRow[];
  stuck: StuckRow[];
  starDays: Record<string, Record<string, number>>;
  elapsedMs: number;
}

/**
 * 模拟 N 天（设计文档 §8.1）：每次推进一轮（4 分钟），先执行到期的周期任务，
 * 每个整点让该上线的机器人各行动一次；每天 0 点记一次快照
 */
export async function runSim(o: SimOptions, progress?: (msg: string) => void): Promise<SimResult> {
  const started = Date.now();
  const env = await openSimEnv({
    adminUrl: o.adminUrl,
    dbName: o.dbName,
    redisUrl: o.redisUrl,
    bundlePath: o.bundlePath,
    start: o.start,
    seed: o.seed,
    tuning: o.tuning,
  });
  try {
    const bots: Bot[] = await createBots(env, o.personas, o.botsPerPersona);
    const periodic = { db: env.deps.db, shards: env.game.shards, now: env.clock.now, log: { error: () => {} } };
    const days: BotDay[] = await snapshot(env.deps.db, bots, 0);
    const end = o.start.getTime() + o.days * 86_400_000;
    let lastDay = gameDay(env.clock.now());
    let dayIndex = 0;
    while (env.clock.now().getTime() < end) {
      await runDueJobs(periodic, env.game.jobs, { shardIds: [env.shardId] });
      const { hour, minute } = gameParts(env.clock.now());
      if (minute < ROUND_MS / 60_000) {
        for (const bot of bots) if (bot.persona.hours.includes(hour)) await botTurn(env.game, bot);
      }
      env.clock.advance(ROUND_MS);
      const today = gameDay(env.clock.now());
      if (today !== lastDay) {
        lastDay = today;
        dayIndex += 1;
        days.push(...(await snapshot(env.deps.db, bots, dayIndex)));
        progress?.(`第 ${dayIndex} 天完成`);
      }
    }
    const economy = await economyOf(
      env.deps.db,
      bots.map((b) => b.ctx.restaurantId),
    );
    return {
      options: {
        dbName: o.dbName,
        days: o.days,
        botsPerPersona: o.botsPerPersona,
        personas: o.personas,
        seed: o.seed,
        start: o.start,
        tuning: o.tuning,
        stuckDays: o.stuckDays,
      },
      bots: bots.map((b) => ({ name: b.name, persona: b.persona.key, restaurantId: b.ctx.restaurantId })),
      days,
      economy,
      stuck: detectStuck(days, env.deps.config, o.stuckDays ?? 5),
      starDays: starDays(days),
      elapsedMs: Date.now() - started,
    };
  } finally {
    await env.close();
  }
}
```

根目录 `.gitignore` 追加一行 `sim-out/`。

- [ ] **Step 7: 类型检查、lint、提交**

Run: `pnpm exec vitest run apps/server/src/sim && pnpm typecheck && pnpm lint && pnpm format`
Expected: PASS

```bash
git add apps/server/src/sim .gitignore
git commit -m "feat(sim): throwaway database, virtual clock, persona bots, run loop, metrics and stuck detection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 29: 数值模拟器（二）——报告、对比、单店分解、压测、命令行、冒烟测试

**Files:**
- Create: `apps/server/src/sim/report.ts`
- Test: `apps/server/src/sim/report.test.ts`
- Create: `apps/server/src/sim/explain.ts`
- Create: `apps/server/src/sim/examples/star3.json`
- Create: `apps/server/src/sim/bench.ts`
- Create: `apps/server/src/sim/cli.ts`
- Test: `apps/server/src/sim/sim.test.ts`
- Modify: `apps/server/package.json`、根 `package.json`（脚本）
- Modify: `README.md`（模拟器用法）

**Interfaces:**
- Consumes: `runSim`、`SimResult`、`openSimEnv`、`settleShardRound`、`settleRestaurant`、`buildInput`、`buildGlobals`、`normalizeCounts`、`roundOf`、`ROUND_MS`
- Produces:
  - `lineChart(title, series, xLabel, yLabel): string`、`renderReport(r, cmp?)`、`toCsv(rows)`、`writeReport(dir, r, cmp?)`、`loadResult(dir)`
  - `explain(o: ExplainOptions): Promise<string>`
  - `seedRestaurants(env, n, seed)`、`bench(o: BenchOptions): Promise<BenchResult>`
  - 命令：`pnpm sim`、`pnpm sim:explain`、`pnpm sim:bench`

- [ ] **Step 1: 写报告的失败测试**

`apps/server/src/sim/report.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { lineChart, renderReport, toCsv } from './report';
import type { SimResult } from './run';

const result: SimResult = {
  options: { dbName: 'x', days: 2, botsPerPersona: 1, personas: ['diligent'], seed: 1, start: new Date('2026-10-01T00:00:00+08:00') },
  bots: [{ name: '勤快1', persona: 'diligent', restaurantId: 1 }],
  days: [
    { day: 0, bot: '勤快1', persona: 'diligent', level: 1, star: 0, coin: 100000, diamond: 0, learned: 0, certs: 0, oilLevel: 0, renown: 10 },
    { day: 1, bot: '勤快1', persona: 'diligent', level: 8, star: 0, coin: 90000, diamond: 2, learned: 6, certs: 0, oilLevel: 1, renown: 12 },
  ],
  economy: [
    { day: '2026-10-01', kind: 'coin', source: 'settlement', delta: 30000 },
    { day: '2026-10-01', kind: 'coin', source: 'market.buy', delta: -40000 },
  ],
  stuck: [{ bot: '勤快1', persona: 'diligent', star: 0, days: 6, lacking: ['cookbooks'] }],
  starDays: {},
  elapsedMs: 1000,
};

describe('模拟报告', () => {
  it('折线图是 SVG，包含每条曲线和图例；标题转义', () => {
    const svg = lineChart('<等级>', [{ name: '勤快', points: [[0, 1], [1, 8]] }], '天', '等级');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('勤快');
    expect(svg).toContain('&lt;等级&gt;');
  });
  it('报告包含成长、经济、卡点三部分，不引用外部资源', () => {
    const html = renderReport(result);
    expect(html).toContain('成长节奏');
    expect(html).toContain('经济平衡');
    expect(html).toContain('卡点');
    expect(html).toContain('market.buy');
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  });
  it('对比两次运行时画出对比曲线', () => {
    expect(renderReport(result, result)).toContain('（对比）');
  });
  it('CSV 带表头，含逗号的值加引号', () => {
    expect(toCsv([{ a: 1, b: 'x,y' }])).toBe('a,b\n1,"x,y"\n');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/server/src/sim/report.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现报告**

`apps/server/src/sim/report.ts`：

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BotDay } from './metrics';
import type { SimResult } from './run';

export interface Series {
  name: string;
  points: Array<[number, number]>;
  dashed?: boolean;
}

const COLORS = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e67700', '#0b7285', '#c2255c', '#5c940d'];
const PERSONA_NAMES: Record<string, string> = { diligent: '勤快', normal: '普通', casual: '休闲' };

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function short(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v * 10) / 10);
}

/** 自绘折线图（不依赖任何外部资源，断网也能看） */
export function lineChart(title: string, series: Series[], xLabel: string, yLabel: string): string {
  const W = 680;
  const H = 260;
  const L = 64;
  const R = 12;
  const T = 28;
  const B = 36;
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const xMax = Math.max(1, ...xs);
  const yMax = Math.max(1, ...ys);
  const yMin = Math.min(0, ...ys);
  const x = (v: number) => L + (v / xMax) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const parts: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const yv = yMin + ((yMax - yMin) * i) / 4;
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(yv)}" y2="${y(yv)}" stroke="#eee"/>`);
    parts.push(`<text x="${L - 6}" y="${y(yv) + 4}" text-anchor="end" font-size="11">${short(yv)}</text>`);
    const xv = (xMax * i) / 4;
    parts.push(`<text x="${x(xv)}" y="${H - B + 16}" text-anchor="middle" font-size="11">${short(xv)}</text>`);
  }
  parts.push(`<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="#999"/>`);
  parts.push(`<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#999"/>`);
  parts.push(`<text x="${(L + W) / 2}" y="${H - 4}" text-anchor="middle" font-size="11">${esc(xLabel)}</text>`);
  parts.push(`<text x="12" y="${T - 10}" font-size="11">${esc(yLabel)}</text>`);
  series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length]!;
    const pts = s.points.map(([px, py]) => `${x(px).toFixed(1)},${y(py).toFixed(1)}`).join(' ');
    parts.push(
      `<polyline fill="none" stroke="${color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="6 4"' : ''} points="${pts}"/>`,
    );
    parts.push(`<rect x="${W - R - 150}" y="${T + i * 16 - 9}" width="10" height="10" fill="${color}"/>`);
    parts.push(`<text x="${W - R - 136}" y="${T + i * 16}" font-size="11">${esc(s.name)}</text>`);
  });
  return `<figure><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${parts.join('')}</svg></figure>`;
}

function average(days: BotDay[], persona: string, field: 'level' | 'star' | 'learned' | 'coin' | 'diamond'): Array<[number, number]> {
  const byDay = new Map<number, number[]>();
  for (const d of days) if (d.persona === persona) byDay.set(d.day, [...(byDay.get(d.day) ?? []), d[field]]);
  return [...byDay].sort((a, b) => a[0] - b[0]).map(([day, list]) => [day, list.reduce((s, v) => s + v, 0) / list.length]);
}

function growthSeries(r: SimResult, field: 'level' | 'star' | 'learned' | 'coin' | 'diamond', cmp?: SimResult): Series[] {
  const personas = [...new Set(r.bots.map((b) => b.persona))];
  const out: Series[] = personas.map((p) => ({ name: PERSONA_NAMES[p] ?? p, points: average(r.days, p, field) }));
  if (cmp) {
    for (const p of personas) {
      out.push({ name: `${PERSONA_NAMES[p] ?? p}（对比）`, points: average(cmp.days, p, field), dashed: true });
    }
  }
  return out;
}

function economySeries(r: SimResult, kind: string): Series[] {
  const days = [...new Set(r.economy.map((e) => e.day))].sort();
  const idx = new Map(days.map((d, i) => [d, i]));
  const settle: Array<[number, number]> = [];
  const otherIn = new Map<number, number>();
  const out = new Map<number, number>();
  for (const e of r.economy) {
    if (e.kind !== kind) continue;
    const i = idx.get(e.day)!;
    if (e.source === 'settlement') settle.push([i, e.delta]);
    else if (e.delta >= 0) otherIn.set(i, (otherIn.get(i) ?? 0) + e.delta);
    else out.set(i, (out.get(i) ?? 0) - e.delta);
  }
  const toPoints = (m: Map<number, number>) => [...m].sort((a, b) => a[0] - b[0]);
  return [
    { name: '结算收入', points: settle.sort((a, b) => a[0] - b[0]) },
    { name: '其他收入', points: toPoints(otherIn) },
    { name: '支出', points: toPoints(out) },
  ].filter((s) => s.points.length > 0);
}

function table(head: string[], rows: Array<Array<string | number>>): string {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export function renderReport(r: SimResult, cmp?: SimResult): string {
  const totals = new Map<string, number>();
  for (const e of r.economy) totals.set(`${e.kind}|${e.source}`, (totals.get(`${e.kind}|${e.source}`) ?? 0) + e.delta);
  const totalRows = [...totals]
    .map(([k, v]) => [...k.split('|'), v] as [string, string, number])
    .sort((a, b) => a[0].localeCompare(b[0]) || b[2] - a[2]);
  const starRows = Object.entries(r.starDays).flatMap(([p, m]) =>
    Object.entries(m).map(([star, d]) => [PERSONA_NAMES[p] ?? p, `${star} 星`, d]),
  );
  const LACK: Record<string, string> = { cookbooks: '已学食谱不够', certs: '升星凭证不够' };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>模拟报告</title><style>
body{font-family:system-ui,sans-serif;max-width:760px;margin:16px auto;padding:0 16px;color:#222}
h1{font-size:20px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #eee}
figure{margin:12px 0}figcaption{font-size:13px;font-weight:600}
table{border-collapse:collapse;font-size:13px;width:100%}td,th{border-bottom:1px solid #eee;padding:3px 6px;text-align:left}
.muted{color:#888;font-size:13px}
</style></head><body>
<h1>模拟报告</h1>
<p class="muted">${esc(`${r.options.days} 天 · 每种画像 ${r.options.botsPerPersona} 个机器人 · 种子 ${r.options.seed} · 用时 ${Math.round(r.elapsedMs / 1000)} 秒`)}${cmp ? ' · 虚线为对比运行' : ''}</p>
<h2>成长节奏</h2>
${lineChart('平均等级', growthSeries(r, 'level', cmp), '天', '等级')}
${lineChart('平均星级', growthSeries(r, 'star', cmp), '天', '星级')}
${lineChart('平均已学食谱数', growthSeries(r, 'learned', cmp), '天', '道')}
${table(['画像', '星级', '平均第几天达到'], starRows)}
<h2>经济平衡</h2>
${lineChart('每天的银币（全部机器人合计）', economySeries(r, 'coin'), '天', '银币')}
${lineChart('每天的经验（全部机器人合计）', economySeries(r, 'exp'), '天', '经验')}
${lineChart('平均持有银币', growthSeries(r, 'coin', cmp), '天', '银币')}
${lineChart('平均持有钻石', growthSeries(r, 'diamond', cmp), '天', '钻石')}
${table(['种类', '来源', '合计'], totalRows)}
<h2>卡点</h2>
${r.stuck.length === 0 ? '<p>没有发现卡点。</p>' : table(['机器人', '当前星级', '已卡天数', '缺的条件'], r.stuck.map((s) => [s.bot, s.star, s.days, s.lacking.map((x) => LACK[x] ?? x).join('、') || '（条件都满足，但策略没有升星）']))}
</body></html>`;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const head = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${head.join(',')}\n${rows.map((r) => head.map((h) => cell(r[h])).join(',')).join('\n')}\n`;
}

export function writeReport(dir: string, r: SimResult, cmp?: SimResult): string[] {
  mkdirSync(dir, { recursive: true });
  const files: Array<[string, string]> = [
    ['data.json', JSON.stringify(r)],
    ['report.html', renderReport(r, cmp)],
    ['growth.csv', toCsv(r.days as unknown as Array<Record<string, unknown>>)],
    ['economy.csv', toCsv(r.economy as unknown as Array<Record<string, unknown>>)],
    ['stuck.csv', toCsv(r.stuck as unknown as Array<Record<string, unknown>>)],
  ];
  for (const [name, content] of files) writeFileSync(join(dir, name), content);
  return files.map(([name]) => join(dir, name));
}

export function loadResult(dir: string): SimResult {
  return JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')) as SimResult;
}
```

Run: `pnpm exec vitest run apps/server/src/sim/report.test.ts`
Expected: PASS

- [ ] **Step 4: 单店分解与压测**

`apps/server/src/sim/explain.ts`：

```ts
import { readFileSync } from 'node:fs';
import { loadGameConfig, type GameConfig } from '@dt/config';
import { hashSeed, seededRng } from '@dt/shared';
import { createDb } from '../db';
import { buildGlobals, buildInput, normalizeCounts, type InputPatch } from '../modules/settlement/globals';
import { settleRestaurant } from '../modules/settlement/settle';
import type { SettleGlobals, SettleInput } from '../modules/settlement/types';

const CUSTOMER: Record<string, string> = {
  '0': '空桌',
  '1': '普通',
  '2': '挑剔',
  '3': '蟑螂',
  '-3': '灭蟑',
  '6': '章鱼哥',
  '7': '痞老板',
  '8': '蟹老板',
  '9': '白食',
};

export interface ExplainOptions {
  bundlePath: string;
  rounds: number;
  seed: number;
  /** 快照文件：{ input?: InputPatch, globals?: Partial<SettleGlobals> } */
  state?: string;
  restId?: number;
  dbUrl?: string;
}

async function fromDb(config: GameConfig, dbUrl: string, restId: number): Promise<{ input: SettleInput; globals: SettleGlobals }> {
  const db = createDb(dbUrl, 2);
  try {
    const r = await db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow();
    const tables = await db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', restId).executeTakeFirstOrThrow();
    const cb = await db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', restId).executeTakeFirstOrThrow();
    const ws = await db.selectFrom('world_state').selectAll().where('shard_id', '=', r.shard_id).executeTakeFirst();
    const foods = await db.selectFrom('cupboard_food').select(['foods_id', 'num']).where('rest_id', '=', restId).execute();
    const now = new Date();
    return {
      input: {
        rest: {
          id: r.id,
          level: r.level,
          star: r.star_level,
          oil: r.oil,
          oilMax: r.oil_max,
          coin: r.coin,
          streetId: r.street_id,
          renown: r.renown,
          luck: r.luck,
          cteOn: r.cte_on,
          cookfoodsFlag: r.cookfoods_flag,
        },
        tables: tables.tables,
        levels: new Uint8Array(cb.levels),
        counts: normalizeCounts(r.cookbook_counts),
        agg: r.effect_agg,
        special: null,
        cupboard: r.cookfoods_flag > 0 ? new Map(foods.map((f) => [f.foods_id, f.num])) : null,
        now,
      },
      globals: buildGlobals(config, config.tuning, {
        weather: ws ? (config.weather.get(ws.weather_id)?.effects ?? {}) : {},
        krabStreet: ws?.krab_street ?? null,
        planktonRestId: ws?.plankton_rest_id ?? null,
        holidayMultiplier: config.holidayMultiplier(now),
      }),
    };
  } finally {
    await db.destroy();
  }
}

const f2 = (v: number) => String(Math.round(v * 10000) / 10000);

/** 单店收益分解（设计文档 §8.2）：直接调用结算纯函数，逐轮打印每桌结果和汇总率分项 */
export async function explain(o: ExplainOptions): Promise<string> {
  const config = loadGameConfig(o.bundlePath);
  let input: SettleInput;
  let globals: SettleGlobals;
  if (o.state) {
    const j = JSON.parse(readFileSync(o.state, 'utf8')) as { input?: InputPatch; globals?: Partial<SettleGlobals> };
    input = buildInput(config, j.input);
    globals = buildGlobals(config, config.tuning, j.globals ?? {});
  } else if (o.restId !== undefined && o.dbUrl) {
    ({ input, globals } = await fromDb(config, o.dbUrl, o.restId));
  } else {
    throw new Error('需要 --state 快照文件，或者 --rest 餐厅 id');
  }
  const lines: string[] = [];
  for (let round = 1; round <= o.rounds; round++) {
    const r = settleRestaurant(input, globals, seededRng(hashSeed(o.seed, round)));
    lines.push(`== 第 ${round} 轮：银币 ${r.coin}  经验 ${r.exp}  耗油 ${r.oil}${r.closed ? '（停业）' : ''}`);
    if (r.rates) {
      for (const [k, v] of Object.entries(r.rates)) {
        if (typeof v !== 'object') continue;
        const parts = Object.entries(v.parts).map(([p, x]) => `${p}=${f2(x)}`).join(' ');
        lines.push(`  ${k.padEnd(10)} ${f2(v.total).padStart(8)}  ${parts}`);
      }
      lines.push(`  上座桌数 ${r.rates.seated}`);
    }
    for (const t of r.tables) {
      if (!t.last || t.last.type === 0) continue;
      const req = t.last.req ? ` 要求${t.last.req}品 实际${t.last.grade ?? 0}品${t.last.satisfied ? ' 满足' : ''}` : '';
      lines.push(`  桌${t.no} ${CUSTOMER[String(t.last.type)] ?? t.last.type} 银${t.last.coin} 经${t.last.exp} 油${t.last.oil}${req}`);
    }
    for (const d of r.drops) lines.push(`  掉落 道具${d.goodsId}×${d.num}`);
    for (const l of r.logs) lines.push(`  事件 ${l.type} ${JSON.stringify(l.params)}`);
    input = { ...input, tables: r.tables, rest: { ...input.rest, oil: input.rest.oil - r.oil } };
  }
  return lines.join('\n');
}
```

`apps/server/src/sim/examples/star3.json`（3 星、湖南街、学了三道湖南街的菜：149 姊妹团子、150 糯米蒸排骨、151 金钱蛋；`cookbooks` 的键是食谱 id）：

```json
{
  "input": {
    "rest": { "star": 3, "level": 45, "streetId": 1, "luck": 44 },
    "cookbooks": { "149": 3, "150": 2, "151": 1 },
    "agg": { "atRate": 0.35, "coinValue": 2, "luckValue": 10 }
  },
  "globals": { "krabStreet": 1, "weather": { "coinRate": 0.1 } }
}
```

`apps/server/src/sim/bench.ts`：

```ts
import { hashSeed, roundOf, ROUND_MS, seededRng } from '@dt/shared';
import type { CookbookCounts } from '../db/schema';
import { settleShardRound } from '../modules/settlement/runner';
import { openSimEnv, type SimEnv } from './env';

export interface BenchOptions {
  adminUrl: string;
  dbName: string;
  redisUrl: string;
  bundlePath: string;
  restaurants: number;
  rounds: number;
  seed: number;
}

export interface BenchRound {
  round: number;
  ms: number;
  p50: number;
  p95: number;
  settled: number;
  failed: number;
}

export interface BenchResult {
  restaurants: number;
  rounds: BenchRound[];
  limitMs: number;
  pass: boolean;
}

/** 架构文档的验收指标：5000 家店一轮 ≤ 30 秒 */
export const BENCH_LIMIT_MS = 30_000;

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** 批量造店：等级、星级、食谱数量按分布生成；每家带街道勋章加成来源，第一轮要重新汇总 */
export async function seedRestaurants(env: SimEnv, n: number, seed: number): Promise<void> {
  const db = env.deps.db;
  const config = env.deps.config;
  const rng = seededRng(hashSeed(seed, 'bench'));
  const allIds = config.cookbookIndex.allIds;
  for (let start = 0; start < n; start += 500) {
    const size = Math.min(500, n - start);
    const accounts = await db
      .insertInto('account')
      .values(Array.from({ length: size }, (_, i) => ({ username: `b${start + i}`, password_hash: 'x', email: `b${start + i}@bench.local` })))
      .returning('id')
      .execute();
    const plans = accounts.map((a, i) => {
      const level = 1 + rng.int(99);
      const star = Math.min(7, Math.floor(level / 14));
      const street = 1 + rng.int(13);
      const levels = Buffer.alloc(config.maxCookbookId + 1);
      const counts: CookbookCounts = { learned: 0, grade: Array(11).fill(0) as number[], street: {} };
      const learned = Math.min(allIds.length, level * 20);
      const offset = rng.int(allIds.length);
      for (let k = 0; k < learned; k++) {
        const id = allIds[(offset + k * 7) % allIds.length]!;
        if (levels[id]! > 0) continue;
        const grade = 1 + rng.int(Math.min(7, star + 1));
        levels[id] = grade;
        counts.learned += 1;
        counts.grade[grade]! += 1;
        const s = String(config.cookbookIndex.street[id]);
        counts.street[s] = (counts.street[s] ?? 0) + 1;
      }
      return { account: a.id, name: `压测${start + i}`, level, star, street, levels, counts, tableNum: Math.min(level + 3, (star + 1) * 16) };
    });
    const rests = await db
      .insertInto('restaurant')
      .values(
        plans.map((p) => ({
          shard_id: env.shardId,
          account_id: p.account,
          name: p.name,
          level: p.level,
          coin: 1_000_000,
          diamond: 0,
          strength: 100,
          strength_max: 100,
          oil: 100_000,
          oil_max: 100_000,
          star_level: p.star,
          street_id: p.street,
          renown: 10,
          attr_left: 0,
          luck: p.level - 1,
          table_num: p.tableNum,
          cupboard_num: 100,
          store_num: 20,
          foods_max_num: 999,
          foods_lock_num: 15,
          cookbook_counts: JSON.stringify(p.counts),
        })),
      )
      .returning('id')
      .execute();
    await db
      .insertInto('restaurant_tables')
      .values(
        rests.map((r, i) => ({
          rest_id: r.id,
          tables: JSON.stringify(
            Array.from({ length: plans[i]!.tableNum }, (_, k) => ({ no: k + 1, floor: Math.floor(k / 16) + 1, customer: 0 })),
          ),
        })),
      )
      .execute();
    await db
      .insertInto('restaurant_cookbooks')
      .values(rests.map((r, i) => ({ rest_id: r.id, levels: plans[i]!.levels })))
      .execute();
    await db
      .insertInto('effect_source')
      .values(
        rests.map((r, i) => {
          const medal = config.requireGoods(config.streetMedalId(plans[i]!.street));
          return { rest_id: r.id, source_type: 'street', source_id: medal.id, effects: JSON.stringify(medal.effects), expires_at: null };
        }),
      )
      .execute();
  }
}

/** 结算压测（设计文档 §8.3）：真实批处理跑 rounds 轮，报告每轮耗时和每店耗时分位数 */
export async function bench(o: BenchOptions): Promise<BenchResult> {
  const now = new Date();
  const env = await openSimEnv({
    adminUrl: o.adminUrl,
    dbName: o.dbName,
    redisUrl: o.redisUrl,
    bundlePath: o.bundlePath,
    start: now,
    seed: o.seed,
  });
  try {
    await seedRestaurants(env, o.restaurants, o.seed);
    const base = roundOf(now);
    const rounds: BenchRound[] = [];
    for (let i = 0; i < o.rounds; i++) {
      const times: number[] = [];
      const at = new Date(now.getTime() + i * ROUND_MS);
      const s = await settleShardRound(env.game.deps, env.game.world, env.shardId, base + i, at, {
        onRestaurant: (_id, ms) => times.push(ms),
      });
      rounds.push({ round: i + 1, ms: s.ms, p50: percentile(times, 0.5), p95: percentile(times, 0.95), settled: s.settled, failed: s.failed });
    }
    return {
      restaurants: o.restaurants,
      rounds,
      limitMs: BENCH_LIMIT_MS,
      pass: rounds.every((r) => r.ms <= BENCH_LIMIT_MS && r.failed === 0),
    };
  } finally {
    await env.close();
  }
}
```

- [ ] **Step 5: 命令行和脚本**

`apps/server/src/sim/cli.ts`：

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { bench } from './bench';
import type { Persona } from './bot';
import { explain } from './explain';
import { loadResult, writeReport } from './report';
import { runSim } from './run';

const [command, ...args] = process.argv.slice(2);
const bundlePath = process.env.CONFIG_BUNDLE_PATH!;
const adminUrl = process.env.SIM_ADMIN_URL ?? process.env.DATABASE_URL!;
const redisUrl =
  process.env.SIM_REDIS_URL ??
  (() => {
    const u = new URL(process.env.REDIS_URL!);
    u.pathname = '/15';
    return u.toString();
  })();

async function main(): Promise<void> {
  if (command === 'run') {
    const { values } = parseArgs({
      args,
      options: {
        days: { type: 'string', default: '30' },
        bots: { type: 'string', default: '3' },
        seed: { type: 'string', default: '1' },
        personas: { type: 'string', default: 'diligent,normal,casual' },
        start: { type: 'string', default: '2026-10-01T00:00:00+08:00' },
        tuning: { type: 'string' },
        compare: { type: 'string' },
        out: { type: 'string' },
        'stuck-days': { type: 'string', default: '5' },
      },
    });
    const result = await runSim(
      {
        adminUrl,
        dbName: 'dt_sim',
        redisUrl,
        bundlePath,
        days: Number(values.days),
        botsPerPersona: Number(values.bots),
        personas: values.personas.split(',') as Persona['key'][],
        seed: Number(values.seed),
        start: new Date(values.start),
        tuning: values.tuning ? JSON.parse(readFileSync(values.tuning, 'utf8')) : undefined,
        stuckDays: Number(values['stuck-days']),
      },
      (msg) => console.log(msg),
    );
    const dir = values.out ?? join('sim-out', new Date().toISOString().replace(/[:.]/g, '-'));
    const files = writeReport(dir, result, values.compare ? loadResult(values.compare) : undefined);
    console.log(`完成，用时 ${Math.round(result.elapsedMs / 1000)} 秒`);
    console.log(`到达星级的平均天数：${JSON.stringify(result.starDays)}`);
    console.log(`卡点 ${result.stuck.length} 个`);
    console.log(`报告：${files[1]}`);
    return;
  }
  if (command === 'explain') {
    const { values } = parseArgs({
      args,
      options: {
        rest: { type: 'string' },
        state: { type: 'string' },
        rounds: { type: 'string', default: '5' },
        seed: { type: 'string', default: '1' },
      },
    });
    console.log(
      await explain({
        bundlePath,
        rounds: Number(values.rounds),
        seed: Number(values.seed),
        state: values.state,
        restId: values.rest ? Number(values.rest) : undefined,
        dbUrl: process.env.DATABASE_URL,
      }),
    );
    return;
  }
  if (command === 'bench') {
    const { values } = parseArgs({
      args,
      options: {
        restaurants: { type: 'string', default: '5000' },
        rounds: { type: 'string', default: '3' },
        seed: { type: 'string', default: '1' },
      },
    });
    const r = await bench({
      adminUrl,
      dbName: 'dt_sim_bench',
      redisUrl,
      bundlePath,
      restaurants: Number(values.restaurants),
      rounds: Number(values.rounds),
      seed: Number(values.seed),
    });
    for (const x of r.rounds) {
      console.log(`第 ${x.round} 轮：${x.ms} ms（每店 p50 ${x.p50} ms，p95 ${x.p95} ms），结算 ${x.settled}，失败 ${x.failed}`);
    }
    console.log(r.pass ? `通过（≤ ${r.limitMs} ms）` : `未通过（要求 ≤ ${r.limitMs} ms）`);
    process.exitCode = r.pass ? 0 : 1;
    return;
  }
  console.log('用法：sim run [--days 30 --bots 3 --seed 1 --tuning 覆盖.json --compare 目录] | sim explain --state 快照.json | --rest id | sim bench [--restaurants 5000 --rounds 3]');
  process.exitCode = 1;
}

await main();
```

`apps/server/package.json` 的 `scripts` 加：

```json
    "sim": "tsx --env-file=.env.development src/sim/cli.ts run",
    "sim:explain": "tsx --env-file=.env.development src/sim/cli.ts explain",
    "sim:bench": "tsx --env-file=.env.development src/sim/cli.ts bench"
```

根 `package.json` 的 `scripts` 加：

```json
    "sim": "pnpm --filter @dt/server sim",
    "sim:explain": "pnpm --filter @dt/server sim:explain",
    "sim:bench": "pnpm --filter @dt/server sim:bench"
```

`README.md` 在"开发"一节后追加：

````markdown
## 数值模拟器

需要先 `pnpm infra:dev` 和 `pnpm --filter @dt/config build`。模拟器在开发库里新建一次性的 `dt_sim` / `dt_sim_bench` 库，用 Redis 的 15 号库，不影响开发数据。

```bash
pnpm sim --days 30 --bots 3                  # 成长与经济，报告在 apps/server/sim-out/<时间>/report.html
pnpm sim --days 30 --tuning my.json --compare apps/server/sim-out/<上次的目录>   # 改参数后对比
pnpm sim:explain --state apps/server/src/sim/examples/star3.json --rounds 3   # 单店收益分解
pnpm sim:bench --restaurants 5000            # 结算压测（要求一轮 ≤ 30 秒）
```

`--tuning` 文件的格式与区服覆盖配置里的 `tuning` 一节相同，只写要改的字段。
````

- [ ] **Step 6: 冒烟测试（进 CI）**

`apps/server/src/sim/sim.test.ts`：

```ts
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bench } from './bench';
import { explain } from './explain';
import { writeReport } from './report';
import { runSim } from './run';

const adminUrl = process.env.DATABASE_URL!;
const bundlePath = process.env.CONFIG_BUNDLE_PATH!;
const redisUrl = (() => {
  const u = new URL(process.env.REDIS_URL!);
  u.pathname = '/15';
  return u.toString();
})();
const base = { adminUrl, redisUrl, bundlePath, seed: 1 };
const start = new Date('2026-10-01T00:00:00+08:00');

describe('模拟器冒烟测试', () => {
  it('压测：20 家店 1 轮', async () => {
    const r = await bench({ ...base, dbName: 'dt_sim_bench_test', restaurants: 20, rounds: 1 });
    expect(r.rounds[0]).toMatchObject({ settled: 20, failed: 0 });
  }, 120_000);

  it('1 个勤快机器人跑 1 天，生成报告', async () => {
    const r = await runSim({ ...base, dbName: 'dt_sim_test', days: 1, botsPerPersona: 1, personas: ['diligent'], start });
    expect(r.days.map((d) => d.day)).toEqual([0, 1]);
    expect(r.days[1]!.level).toBeGreaterThan(1);
    expect(r.economy.some((e) => e.source === 'settlement')).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'dt-sim-'));
    writeReport(dir, r);
    expect(existsSync(join(dir, 'report.html'))).toBe(true);
  }, 600_000);

  it('同样的参数跑两次，结果完全一样', async () => {
    const o = { ...base, dbName: 'dt_sim_test', days: 0.25, botsPerPersona: 1, personas: ['diligent' as const], start };
    const a = await runSim(o);
    const b = await runSim(o);
    expect(b.economy).toEqual(a.economy);
  }, 600_000);

  it('单店分解：示例快照能跑', async () => {
    const text = await explain({
      bundlePath,
      rounds: 2,
      seed: 1,
      state: fileURLToPath(new URL('./examples/star3.json', import.meta.url)),
    });
    expect(text).toContain('第 1 轮');
    expect(text).toContain('atRate');
  });
});
```

- [ ] **Step 7: 运行确认通过**

Run: `pnpm exec vitest run apps/server/src/sim`
Expected: PASS（冒烟测试总共约 1~3 分钟）

- [ ] **Step 8: 本地手动跑一遍命令**

Run: `pnpm infra:dev && pnpm --filter @dt/config build && pnpm sim --days 1 --bots 1 && pnpm sim:explain --state apps/server/src/sim/examples/star3.json --rounds 2 && pnpm sim:bench --restaurants 200 --rounds 1`
Expected: 三个命令都成功；`sim` 打印报告路径；`sim:bench` 打印"通过"

- [ ] **Step 9: 全部测试、类型检查、提交**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add apps/server package.json README.md
git commit -m "feat(sim): HTML report with SVG charts, compare runs, settlement explain, bench, CLI, smoke tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 30: 端到端测试、部署文档、验收运行

**Files:**
- Create: `apps/web/e2e/helpers.ts`
- Modify: `apps/web/e2e/acceptance.spec.ts`（改用 helpers）
- Create: `apps/web/e2e/business.spec.ts`
- Modify: `apps/web/package.json`（devDependencies：`pg`、`@types/pg`，端到端测试准备数据用）
- Modify: `docs/deploy.md`
- Create: `docs/superpowers/reports/2a-acceptance.md`
- Modify（视验收结果而定）：`packages/config/data/game/tuning.json`

**Interfaces:**
- Consumes: 全部前端页面、`POST /api/v1/test/tick`、`pnpm sim`、`pnpm sim:bench`
- Produces: 端到端用例"经营循环"；验收报告

- [ ] **Step 1: 端到端辅助函数**

`apps/web/e2e/helpers.ts`（把 `acceptance.spec.ts` 里的 `mailLink` 挪过来，并加注册开店的整段流程）：

```ts
import { expect, type APIRequestContext, type Page } from '@playwright/test';

const MAILPIT = 'http://localhost:8025';

/** 轮询 Mailpit，取出发给 to 的最新邮件里的链接 */
export async function mailLink(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: Array<{ ID: string }> };
    if (messages.length > 0) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as {
        Text: string;
      };
      const m = /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(msg.Text);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no mail for ${to}`);
}

/** 注册 → 验证邮箱 → 选一服 → 开店，返回店名 */
export async function registerAndOpen(page: Page, request: APIRequestContext): Promise<string> {
  const id = Date.now().toString(36).slice(-7);
  const username = `e${id}`;
  const email = `${username}@e2e.local`;
  await page.goto('/register');
  await page.getByPlaceholder('用户名').fill(username);
  await page.getByPlaceholder('密码', { exact: true }).fill('secret123');
  await page.getByPlaceholder('确认密码').fill('secret123');
  await page.getByPlaceholder('邮箱').fill(email);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page).toHaveURL(/\/shards/);
  await page.goto(await mailLink(request, email));
  await expect(page.getByText('邮箱验证成功')).toBeVisible();
  await page.goto('/shards');
  await page.getByRole('button', { name: /一服/ }).click();
  const name = `店${id.slice(-5)}`;
  await page.getByPlaceholder('餐厅名称').fill(name);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('rest-name')).toHaveText(name);
  return name;
}
```

`apps/web/e2e/acceptance.spec.ts`：删掉文件里的 `MAILPIT` 常量和 `mailLink` 函数，改为 `import { mailLink } from './helpers';`（用例本身不变）。

- [ ] **Step 2: 写"经营循环"端到端用例**

`apps/web/package.json` 的 `devDependencies` 加 `"pg": "^8.23.0"`、`"@types/pg": "^8.23.1"`，然后 `pnpm install`。

`apps/web/e2e/business.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('经营循环：签到 → 推进一轮看到收益 → 加油领主线 → 菜场买菜 → 学会第一道食谱', async ({ page, request }) => {
  await registerAndOpen(page, request);

  // 签到
  await page.goto('/rest/tasks');
  await page.getByTestId('signin').click();
  await expect(page.getByText('每日签到礼包')).toBeVisible();

  // 推进一轮：结算、天气、菜场都会执行
  const tick = await page.request.post('/api/v1/test/tick', { data: { minutes: 4 } });
  expect(tick.ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByTestId('last-round')).toBeVisible();

  // 结算耗了油，加油后领主线第 1 步
  await page.getByTestId('refuel').click();
  await expect(page.getByText('消耗 银币')).toBeVisible();
  await page.getByRole('button', { name: '领奖' }).click();
  await expect(page.getByText('获得 银币 2,000')).toBeVisible();

  // 菜场买 1 份日常菜
  await page.goto('/market');
  const firstBuy = page.locator('[data-testid^="buy-"]').first();
  await expect(firstBuy).toBeVisible();
  await firstBuy.click();
  await expect(page.getByText(/^获得 .+×1$/)).toBeVisible();

  // 准备第一道菜（新手街 194）需要的食材，然后在食谱页学会它
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as { data: { id: number } };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const foodsId of [302, 253, 366]) {
      await client.query(
        `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 1)
         on conflict (rest_id, foods_id) do update set num = cupboard_food.num + 1`,
        [overview.data.id, foodsId],
      );
    }
  } finally {
    await client.end();
  }
  await page.goto('/cookbooks');
  await page.getByTestId('learn-194').click();
  await expect(page.getByTestId('learn-194')).not.toHaveText('学习');

  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalScroll).toBe(false);
});
```

- [ ] **Step 3: 跑端到端**

Run: `pnpm infra:dev && pnpm --filter @dt/web e2e`
Expected: 两个用例都通过（开发服务器由 Playwright 自动启动，`.env.development` 已开启 `ENABLE_TEST_API`）

- [ ] **Step 4: 部署文档**

`docs/deploy.md` 追加一节：

```markdown
## 子项目 2A 之后的变化

- worker 现在承担所有周期任务（结算每 4 分钟、体力、老鼠、天气、菜场、商店特价），每 5 秒检查一次到期任务，执行记录在 `job_run` 表（保留 7 天）。**生产环境必须至少跑一个 worker**，两个 worker 时只有主节点执行。
- `ENABLE_TEST_API` 只能在开发环境开启；生产环境设成 true 会拒绝启动。
- 结算并发数和批大小在配置 `tuning.settlement.concurrency / batchSize`，数据库连接池 `DB_POOL_SIZE` 应不小于并发数 + 4。
- 区服数值可以通过 `shard_config.override.tuning` 覆盖（深合并，覆盖后重新校验；写错会导致该区服操作报错，修改前先用 `pnpm sim --tuning` 验证）。
```

- [ ] **Step 5: 验收运行——结算压测**

Run: `pnpm sim:bench --restaurants 5000 --rounds 3`
Expected: 每轮 ≤ 30000 ms，打印"通过"。

不通过时按设计文档 §4.1 的备选方案处理：先把 `tuning.settlement.concurrency` 提到 32、`DB_POOL_SIZE` 相应调大重跑；仍不通过就实现"每个事务处理 20 家店（按 id 升序加锁）"：在 `runner.ts` 里新增 `settleBatchTx(ids)`，用 `withRestaurants(db, ids, …)` 一次锁 20 家、逐家 `createOp` + `settleOne` + `flushOp`，`settleShardRound` 改为按 20 家一组调用它（组内出错时退回逐家处理）。无论怎么处理，都在 ledger 里记 Ruling，写明改动和压测前后的数据。

- [ ] **Step 6: 验收运行——30 天模拟**

Run: `pnpm sim --days 30 --bots 3`
Expected: 报告里勤快画像 30 天内达到 2 星及以上，卡点表里没有长期卡住的机器人。

不满足时：
1. 先读报告的"卡点"和"经济平衡"：是食谱数不够（食材来源不足），还是凭证买不起（银币不够）。
2. 用 `--tuning` 文件试参数（例如 `market.dailyKinds`、`market.dailyStock`、`market.specialKinds`、`rest.handleRateBase`），每次用 `--compare` 与上一次对比。
3. 找到满意的参数后写进 `packages/config/data/game/tuning.json`，跑 `pnpm test` 确认没有测试依赖被改动的默认值（有的话更新断言并在 ledger 记 Ruling）。
4. 机器人策略本身有明显缺陷（例如从不合成高级食材）时，可以改进 `bot.ts` 的策略，同样记 Ruling。

- [ ] **Step 7: 验收报告**

`docs/superpowers/reports/2a-acceptance.md`：记录
- 压测：三轮耗时、每店 p50/p95、机器配置（开发机 Docker）
- 30 天模拟：各画像到达每个星级的平均天数、卡点、主要银币来源和去向
- 调过的 tuning 项：原值 → 新值、理由、对比报告的结论
- 端到端结果

然后提交：

```bash
pnpm format
git add apps/web docs packages/config/data/game/tuning.json
git commit -m "test: 2A e2e business loop, deploy notes, acceptance report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: 全量检查**

Run: `pnpm --filter @dt/config build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && docker build -f apps/server/Dockerfile -t dt-server:local .`
Expected: 全部通过
