# 子项目 4B-1「神殿」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能在神殿用飞弹打守护兽、用探险图探险、给特色菜做试炼、投喂克拉肯换种子和触手、在触手商店换残卷；主线第 25、26 步和试炼支线开放。

**Architecture:** 配置包整理种子表、按道具 id 解析飞弹和探险图，新增 `tuning.temple`；迁移 0009 建 `rest_trial`、`kraken_feed`、`tentacle_shop`、`rest_seed`。服务端新增 `modules/temple/`：纯规则 `rules.ts`，各玩法一个文件（`guardian.ts`、`explore.ts`、`trial.ts`、`kraken.ts`），`service.ts` 装配、`routes.ts` 注册。守护兽状态存在每日计数里，克拉肯每日想吃的菜按"区服 + 日期"种子算出。前端神殿页改为标签页壳，4A 的鉴定内容挪进 `components/temple/AppraisePanel.vue`，新增四个面板。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4b1-temple-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1/temple/...` 下，由 `modules/temple/routes.ts` 的 `templeRoutes(svc)` 注册
- 神殿的写操作走 `runOp`（锁自己的店），功能名 `temple`；读接口开头 `d.shards.ensureFeature(ctx.shardId, 'temple')`
- 不新增错误码。原因名：`INVALID_STATE` reason `guardian_down`、`trial_ready`、`no_trial`、`mc_not_learned`（已有）、`not_feed_time`、`fed_today`、`no_cooking`（已有）、`portions`、`slot_bought`；`REQUIREMENT_NOT_MET` reason `star`（params `need`）、`mc_count`（params `need`）；`VALIDATION_FAILED` reason `not_missile`、`not_map`、`bad_slot`；资源不够一律用现有 `consumeGoods` / `subFoods` / `spendCoin` / `spendStrength`
- 事件键（`emitAction`）：`temple.missile`（每次请求 1）、`temple.explore`（每次探险 1，n = times）、`temple.trial`、`kraken.feed`
- 流水来源：`temple.missile`、`temple.explore`、`temple.trial.prepare`、`temple.trial.refresh`、`temple.trial`、`kraken.feed`、`tentacle.refresh`、`tentacle.exchange`
- 流水 / 事件 kind 新增 `'seed'`（`id` = 种子 id）
- 新闻类型：`temple.guardian.rare`（`{foodsId}`）、`temple.explore.rare`（`{foods: [{foodsId, num}]}`）；个人日志：`temple.trial`（`{mcId, success, worth, exp}`）、`kraken.forget`（`{mcId}`）
- 每日计数键：`guardian.damage`、`guardian.killed`（游戏日 `gameDay(op.now)`）
- 界面文字全部中文；按钮灰掉时写明原因；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交前对改动文件跑 `npx prettier --write`；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 测试命令：`pnpm --filter <包> exec vitest run <路径>`（各包没有 test 脚本）
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build`；`packages/config/data` 被 prettier 忽略，改 JSON 时插入文本块，不整体重写

## 计划层面的裁定（相对设计文档）

1. 探险普通食材的数量按原版源码取整：`⌊round(x × 10) / 10⌋`（x = awardNum × 0.75 或 0.25），设计文档写的"四舍五入"与源码不同；以源码为准。代价：个别情况少 1 个食材
2. 种子从 `ConfigBundle.extra.seeds` 挪到正式字段 `ConfigBundle.seeds`（结构化），`extra` 里不再保留；种子兑换校验改用正式字段
3. 触手商店的 GET 要在当天第一次打开时生成格子（写库），所以 `GET /temple/tentacle` 也走 `runOp`，只返回 `data` 不带事件
4. 负好感度得到的种子数：原版 `(int)Math.sqrt(负数)` 在 Java 里是 0，再 +2 → 2 颗；本计划 `seedCount(favor) = ⌊√max(0, favor)⌋ + 2`，结果一致
5. 克拉肯好感度里 `k × init` 的取整照 Java `(int)` 向零截断（`Math.trunc`），不是向下取整
6. 试炼成功率的"幸运"标记：`roll ≥ getTrial + getFoodsTrial` 且成功时标记，只用于展示
7. 厨力和属性合计抽成 `restGear(db, rest, suits)`（返回属性合计、厨力、激活的套装），`restPower` 改为调用它；探险用激活套装的 `exploreSuccessRate` 之和，试炼用属性合计的 `creatives`

## Review Focus

1. **一次发 99 枚飞弹但第 2 枚就击败**：只扣 2 枚飞弹，剩余不扣；累计伤害按实际打出的记；再打报 `guardian_down`。→ Task 4 测试
2. **探险时体力不够**：报 `NOT_ENOUGH strength`，探险图不扣（整体回滚）。→ Task 5 测试
3. **投喂份数等于剩余份数**：报 `portions`，份数、每日记录都不变；投喂后批次不会被结束（剩余 ≥1）。→ Task 7 测试
4. **负好感度惩罚时这道菜已经被遗忘（rest_mc 不在）**：跳过惩罚，不报错。→ Task 7 测试
5. **试炼对象的菜后来被遗忘了（偷学失败 / 克拉肯惩罚）**：开始试炼报 `mc_not_learned`，不扣任何东西。→ Task 6 测试

---

## 文件结构

```
packages/config/src/types.ts                 Seed、MissileDef、MapDef；ConfigBundle.seeds
packages/config/src/raw.ts                   rawSeed 改为完整结构
packages/config/src/temple.ts                parseMissileDef、parseMapDef（纯函数）
packages/config/src/temple.test.ts
packages/config/src/build.ts                 seeds 正式字段；飞弹 / 探险图校验
packages/config/src/runtime.ts               GameConfig.seeds / seedPool / missiles / maps
packages/config/src/ids.ts                   GOODS 新增神殿道具
packages/config/src/tuning.ts、data/game/tuning.json   temple 段
packages/shared/src/envelope.ts              GameEvent.kind 加 'seed'
packages/shared/src/schemas/temple.ts        接口 body 和 DTO
packages/shared/src/schemas/world.ts         CatalogDto.seeds
apps/server/src/db/migrations/0009_temple.ts、0009.test.ts
apps/server/src/db/schema.ts                 4 张表类型
apps/server/src/modules/ledger/ledger.ts     kind 加 'seed'
apps/server/src/core/features.ts             'temple'
apps/server/src/modules/equip/power.ts       restGear（restPower 改为调用它）
apps/server/src/modules/temple/
  rules.ts            纯规则
  rules.test.ts
  common.ts           badInput、addFoodsMerged、addSeeds、learnedUpTo、pickFood
  guardian.ts         shootMissiles
  explore.ts          explore
  trial.ts            prepareTrial、refreshTrial、startTrial
  kraken.ts           feedKraken、tentacleShop、refreshTentacleShop、exchangeTentacle
  service.ts          createTempleService：overview + 各玩法的 runOp 包装
  routes.ts
  guardian.test.ts、explore.test.ts、trial.test.ts、kraken.test.ts、temple.test.ts
apps/server/src/modules/world/service.ts     catalog 加 seeds
apps/server/src/modules/index.ts、game.ts     装配
apps/web/src/api/endpoints.ts                temple* 接口
apps/web/src/i18n/zh-CN.ts                   错误文案
apps/web/src/stores/catalog.ts               seedName
apps/web/src/utils/events.ts                 seed 事件、日志文案、流水名称
apps/web/src/views/TempleView.vue、TempleView.test.ts          标签页壳
apps/web/src/components/temple/AppraisePanel.vue、AppraisePanel.test.ts   原 TempleView 的鉴定内容
apps/web/src/components/temple/GuardianPanel.vue、ExplorePanel.vue、TrialPanel.vue、KrakenPanel.vue 和各自的 .test.ts
apps/web/e2e/temple.spec.ts
docs/rules/收益与加成.md、docs/deploy.md
```

---

### Task 1: 配置——种子、飞弹、探险图、数值、道具 id

**Files:**
- Create: `packages/config/src/temple.ts`、`packages/config/src/temple.test.ts`
- Modify: `packages/config/src/types.ts`、`raw.ts`、`build.ts`、`runtime.ts`、`ids.ts`、`tuning.ts`、`build.test.ts`、`runtime.test.ts`
- Modify: `packages/config/data/game/tuning.json`

**Interfaces:**
- Produces:
  - `Seed { id; foodsId; name; level; coin; infancy; maturity; autumn; harvest; harvestNum; odds }`（时长单位分钟）
  - `MissileDef { hitRate: number; crit: number; critRate: number; attack: [number, number] }`
  - `MapDef { rate: number; level: [number, number]; num: [number, number]; mysteriousRate: number; needStrength: number }`
  - `parseMissileDef(value: unknown): MissileDef | string`、`parseMapDef(value: unknown): MapDef | string`
  - `ConfigBundle.seeds: Seed[]`
  - `GameConfig.seeds: ReadonlyMap<number, Seed>`、`GameConfig.seedPool: WeightedPool<Seed>`、`GameConfig.missiles: ReadonlyMap<number, MissileDef>`、`GameConfig.maps: ReadonlyMap<number, MapDef>`
  - `Tuning['temple']`（见 Step 5）
  - `GOODS.missileSpeed 17`、`missileNormal 18`、`missileBurst 19`、`mapNormal 170`、`mapHigh 171`、`tentacle 434`、`creativePotion 326`、`meditation 327`、`lamp 377`、`needle 378`、`securityCard 110`、`starKey 408`、`exploreBook 416`、`dreamNet 468`、`seal 164`

- [ ] **Step 1: 写失败测试**

`packages/config/src/temple.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseMapDef, parseMissileDef } from './temple';

describe('parseMissileDef（规格书 09 §9.1）', () => {
  it('解析命中、暴击、暴击倍数、伤害区间', () => {
    expect(parseMissileDef({ attack: [90, 110], hitRate: 0.9, crit: 0.2, critRate: 2 })).toEqual({
      attack: [90, 110],
      hitRate: 0.9,
      crit: 0.2,
      critRate: 2,
    });
  });
  it('字段缺失或类型不对时返回错误说明', () => {
    expect(typeof parseMissileDef({ attack: [90], hitRate: 0.9, crit: 0.2, critRate: 2 })).toBe('string');
    expect(typeof parseMissileDef(null)).toBe('string');
  });
});

describe('parseMapDef（规格书 09 §9.2）', () => {
  it('解析成功率、食材等级和数量区间、神秘率、体力', () => {
    expect(
      parseMapDef({ rate: 0.75, level: [4, 5], num: [5, 10], mysteriousRate: 0.06, needStrength: 2, shell: 0.05 }),
    ).toEqual({ rate: 0.75, level: [4, 5], num: [5, 10], mysteriousRate: 0.06, needStrength: 2 });
  });
  it('字段缺失时返回错误说明', () => {
    expect(typeof parseMapDef({ rate: 0.75, level: [4, 5], mysteriousRate: 0.06, needStrength: 2 })).toBe('string');
  });
});
```

`packages/config/src/build.test.ts` 的 `describe('buildBundle（真实数据）'` 里加：

```ts
  it('种子是正式字段（96 种）：食材、等级、各阶段分钟数、产量、权重', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.seeds).toHaveLength(96);
    expect(bundle!.seeds.find((s) => s.id === 1)).toEqual({
      id: 1,
      foodsId: 101,
      name: '大米种子',
      level: 1,
      coin: 1800,
      infancy: 24,
      maturity: 36,
      autumn: 60,
      harvest: 1440,
      harvestNum: 20,
      odds: 70,
    });
    expect('seeds' in bundle!.extra).toBe(false);
  });
```

`packages/config/src/runtime.test.ts` 末尾加：

```ts
describe('神殿索引（子项目 4B-1）', () => {
  it('飞弹、探险图按道具 id 索引；种子池', () => {
    expect(config.missiles.get(17)).toEqual({ attack: [5000, 5000], hitRate: 0.96, crit: 0.2, critRate: 2 });
    expect([...config.missiles.keys()].sort((a, b) => a - b)).toEqual([17, 18, 19]);
    expect(config.maps.get(171)).toMatchObject({ rate: 0.9, level: [4, 5], num: [10, 20], needStrength: 5 });
    expect([...config.maps.keys()].sort((a, b) => a - b)).toEqual([170, 171, 172, 396]);
    expect(config.seeds.get(1)!.foodsId).toBe(101);
    expect(config.seedPool.items).toHaveLength(96);
    expect(config.tuning.temple.guardianHpBase).toBe(10000);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run`
Expected: FAIL（`./temple` 不存在；`bundle.seeds` 未定义；`config.missiles` 未定义）

- [ ] **Step 3: 类型、纯函数**

`packages/config/src/types.ts` 末尾加：

```ts
/** 种子（规格书 20 §20.8）；infancy / maturity / autumn 是三个生长阶段的分钟数，harvest 是收获期分钟数 */
export interface Seed {
  id: number;
  foodsId: number;
  name: string;
  level: number;
  coin: number;
  infancy: number;
  maturity: number;
  autumn: number;
  harvest: number;
  harvestNum: number;
  odds: number;
}

/** 飞弹（devicetype 97）的 value（规格书 09 §9.1） */
export interface MissileDef {
  hitRate: number;
  crit: number;
  critRate: number;
  attack: [number, number];
}

/** 探险图（devicetype 96）的 value（规格书 09 §9.2） */
export interface MapDef {
  rate: number;
  level: [number, number];
  num: [number, number];
  mysteriousRate: number;
  needStrength: number;
}
```

`ConfigBundle` 里 `mcProficiency: McProficiency[];` 下面加 `seeds: Seed[];`。

`packages/config/src/temple.ts`：

```ts
import type { MapDef, MissileDef } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : null;

/** 飞弹 value → 定义；数据不对时返回错误说明 */
export function parseMissileDef(value: unknown): MissileDef | string {
  if (!isObj(value)) return 'value is not an object';
  const attack = pair(value.attack);
  if (!attack || !isNum(value.hitRate) || !isNum(value.crit) || !isNum(value.critRate)) return 'bad missile value';
  return { attack, hitRate: value.hitRate, crit: value.crit, critRate: value.critRate };
}

/** 探险图 value → 定义（shell、xz 是仙贝相关，子项目 5 才用） */
export function parseMapDef(value: unknown): MapDef | string {
  if (!isObj(value)) return 'value is not an object';
  const level = pair(value.level);
  const num = pair(value.num);
  if (!level || !num || !isNum(value.rate) || !isNum(value.mysteriousRate) || !isNum(value.needStrength))
    return 'bad map value';
  return { rate: value.rate, level, num, mysteriousRate: value.mysteriousRate, needStrength: value.needStrength };
}
```

- [ ] **Step 4: raw、build、runtime**

`packages/config/src/raw.ts`：把 `export const rawSeed = z.object({ id: int, foodsId: int }).passthrough();` 改为：

```ts
export const rawSeed = z.object({
  id: int,
  foodsId: int,
  name: z.string(),
  foodsLevel: int,
  coin: z.number(),
  infancy: int,
  maturity: int,
  autumn: int,
  harvest: int,
  harvestnum: int,
  odds: z.number(),
});
```

`packages/config/src/build.ts`：
- import 加 `import { parseMapDef, parseMissileDef } from './temple';`
- "以后子项目用到的表"段里，`const seedIds = new Set(seedsRaw.map((s) => s.id));` 之前加：

```ts
  const seeds = seedsRaw.map((s) => ({
    id: s.id,
    foodsId: s.foodsId,
    name: s.name,
    level: s.foodsLevel,
    coin: s.coin,
    infancy: s.infancy,
    maturity: s.maturity,
    autumn: s.autumn,
    harvest: s.harvest,
    harvestNum: s.harvestnum,
    odds: s.odds,
  }));
  for (const g of goods) {
    if (g.deviceType === 97) {
      const m = parseMissileDef(g.value);
      if (typeof m === 'string') errors.push(`goods ${g.id} missile ${m}`);
    }
    if (g.deviceType === 96) {
      const m = parseMapDef(g.value);
      if (typeof m === 'string') errors.push(`goods ${g.id} map ${m}`);
    }
  }
```

- `body` 里 `mcProficiency,` 下面加 `seeds,`；`extra` 里删掉 `seeds: seedsRaw,` 这一行

`packages/config/src/runtime.ts`：
- import 加 `MapDef, MissileDef, Seed`（types）和 `import { parseMapDef, parseMissileDef } from './temple';`
- `GameConfig` 加：

```ts
  readonly seeds: ReadonlyMap<number, Seed>;
  readonly seedPool: WeightedPool<Seed>;
  readonly missiles: ReadonlyMap<number, MissileDef>;
  readonly maps: ReadonlyMap<number, MapDef>;
```

- `createGameConfig` 里（`appraiseTools` 循环附近）加：

```ts
  const missiles = new Map<number, MissileDef>();
  const maps = new Map<number, MapDef>();
  for (const g of bundle.goods) {
    if (g.deviceType === 97) {
      const m = parseMissileDef(g.value);
      if (typeof m !== 'string') missiles.set(g.id, m);
    }
    if (g.deviceType === 96) {
      const m = parseMapDef(g.value);
      if (typeof m !== 'string') maps.set(g.id, m);
    }
  }
```

  返回对象加：

```ts
    seeds: byId(bundle.seeds),
    seedPool: buildPool(bundle.seeds, (s) => s.odds),
    missiles,
    maps,
```

- [ ] **Step 5: 道具 id、数值**

`packages/config/src/ids.ts` 的 `GOODS` 末尾（`backStressAll` 之后）加：

```ts
  missileSpeed: 17, // 极速飞弹
  missileNormal: 18, // 普通飞弹
  missileBurst: 19, // 爆裂飞弹
  mapNormal: 170, // 探险图
  mapHigh: 171, // 高级探险图
  seal: 164, // 厨神玉玺
  securityCard: 110, // 保安证
  creativePotion: 326, // 创意药水（试炼准备：注射）
  meditation: 327, // 冥想（试炼准备）
  lamp: 377, // 煤油灯
  needle: 378, // 欲望之针（规格书写作"指南针"）
  starKey: 408, // 星光之钥
  exploreBook: 416, // 探险者秘籍
  tentacle: 434, // 克拉肯断裂的触手
  dreamNet: 468, // 捕梦网
```

`packages/config/src/tuning.ts` 的 `tuningSchema` 在 `mysterious: z.object({...}),` 之后加：

```ts
  temple: z.object({
    guardianHpBase: int,
    guardianHpPerStar: int,
    missileTicketRate: num,
    missileMapRate: num,
    guardianRareRate: num,
    guardianFoodsBase: int,
    guardianFoodsSpread: int,
    injectCoin: int,
    refreshCoin: int,
    trialCoin: int,
    trialWorthMax: int,
    trialExpMax: int,
    trialProficiencyPerLevel: int,
    trialCap: num,
    rareOdds: int,
    krakenHours: z.array(z.tuple([int, int])).min(1),
    krakenRates: z.object({ same: num, road: num, other: num }),
    krabCoinRate: num,
    tentacleFavor: int,
    tentacleRate: num,
    forgetRate: num,
    shopSlots: int.min(1),
    shopExclude: z.array(int),
  }),
```

`packages/config/data/game/tuning.json`：在 `"mysterious": { ... }` 段的右花括号后面补逗号并插入：

```json
  "temple": {
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

- [ ] **Step 6: 运行，确认通过，重建 bundle**

Run: `pnpm --filter @dt/config exec vitest run && pnpm --filter @dt/config build`
Expected: PASS；bundle 重建

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add packages/config
git commit -m "feat(config): structured seeds, missile and exploration map definitions, temple tuning and item ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0009、表类型、流水 kind

**Files:**
- Create: `apps/server/src/db/migrations/0009_temple.ts`、`apps/server/src/db/migrations/0009.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`、`apps/server/src/modules/ledger/ledger.ts`、`packages/shared/src/envelope.ts`

**Interfaces:**
- Produces（`schema.ts`）：`RestTrialTable`、`KrakenFeedTable`、`TentacleShopTable`、`RestSeedTable`；`DB.rest_trial / kraken_feed / tentacle_shop / rest_seed`；`TentacleSlot { mcId: number; bought: boolean }`
- Produces：`LedgerEntry.kind`、`GameEvent.kind` 包含 `'seed'`

- [ ] **Step 1: 写失败测试**

`apps/server/src/db/migrations/0009.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let a: number;
beforeAll(async () => {
  shard = await createShard(db);
  a = await createRestaurantRow(db, shard, await createAccountRow(db));
});

describe('迁移 0009', () => {
  it('每家店一个试炼对象；每天只能投喂一次；种子不能为负', async () => {
    await db.insertInto('rest_trial').values({ rest_id: a, mc_id: 1, way: 2 }).execute();
    await expect(db.insertInto('rest_trial').values({ rest_id: a, mc_id: 2, way: 1 }).execute()).rejects.toThrow();
    const feed = { rest_id: a, shard_id: shard, day: '2026-09-30', mc_id: 1, target_mc_id: 2, num: 5, favor: 3 };
    await db.insertInto('kraken_feed').values(feed).execute();
    await expect(db.insertInto('kraken_feed').values(feed).execute()).rejects.toThrow();
    await expect(db.insertInto('rest_seed').values({ rest_id: a, seed_id: 1, num: -1 }).execute()).rejects.toThrow();
  });

  it('触手商店按店和日期一行，格子存 JSON；删店级联', async () => {
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('tentacle_shop')
      .values({ rest_id: b, day: '2026-09-30', slots: JSON.stringify([{ mcId: 1, bought: false }]) })
      .execute();
    const r = await db.selectFrom('tentacle_shop').selectAll().where('rest_id', '=', b).executeTakeFirstOrThrow();
    expect(r).toMatchObject({ refreshes: 0, slots: [{ mcId: 1, bought: false }] });
    await db.insertInto('rest_seed').values({ rest_id: b, seed_id: 3, num: 2 }).execute();
    await db.deleteFrom('restaurant').where('id', '=', b).execute();
    expect(await db.selectFrom('tentacle_shop').selectAll().where('rest_id', '=', b).execute()).toEqual([]);
    expect(await db.selectFrom('rest_seed').selectAll().where('rest_id', '=', b).execute()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0009.test.ts`
Expected: FAIL，`relation "rest_trial" does not exist`

- [ ] **Step 3: 迁移**

`apps/server/src/db/migrations/0009_temple.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table rest_trial (
      rest_id integer primary key references restaurant(id) on delete cascade,
      mc_id integer not null,
      way smallint not null,
      prepared_at timestamptz not null default now()
    )`,
    sql`create table kraken_feed (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      day text not null,
      mc_id integer not null,
      target_mc_id integer not null,
      num integer not null,
      favor integer not null,
      created_at timestamptz not null default now(),
      unique (rest_id, day)
    )`,
    sql`create index kraken_feed_shard_day on kraken_feed (shard_id, day)`,
    sql`create table tentacle_shop (
      rest_id integer not null references restaurant(id) on delete cascade,
      day text not null,
      refreshes integer not null default 0,
      slots jsonb not null,
      primary key (rest_id, day)
    )`,
    sql`create table rest_seed (
      rest_id integer not null references restaurant(id) on delete cascade,
      seed_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, seed_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['rest_seed', 'tentacle_shop', 'kraken_feed', 'rest_trial']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts` 加 `import * as m0009 from './0009_temple';` 和 `'0009_temple': m0009,`。

- [ ] **Step 4: 表类型、kind**

`apps/server/src/db/schema.ts`：在 `export type EquipRow = ...` 之前加：

```ts
/** 试炼对象（子项目 4B-1）：一家店一行 */
export interface RestTrialTable {
  rest_id: number;
  mc_id: number;
  /** 1 注射 / 2 冥想 */
  way: number;
  prepared_at: TsDefault;
}

export interface KrakenFeedTable {
  id: Generated<number>;
  rest_id: number;
  shard_id: number;
  /** 游戏日 YYYY-MM-DD */
  day: string;
  mc_id: number;
  target_mc_id: number;
  num: number;
  favor: number;
  created_at: TsDefault;
}

export interface TentacleSlot {
  mcId: number;
  bought: boolean;
}

export interface TentacleShopTable {
  rest_id: number;
  day: string;
  refreshes: Default<number>;
  slots: Json<TentacleSlot[]>;
}

export interface RestSeedTable {
  rest_id: number;
  seed_id: number;
  num: number;
}
```

`DB` 接口末尾加：

```ts
  rest_trial: RestTrialTable;
  kraken_feed: KrakenFeedTable;
  tentacle_shop: TentacleShopTable;
  rest_seed: RestSeedTable;
```

`apps/server/src/modules/ledger/ledger.ts` 与 `packages/shared/src/envelope.ts` 的 kind 联合类型末尾加 `| 'seed'`。

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0009.test.ts && pnpm typecheck`
Expected: PASS；类型检查通过

- [ ] **Step 6: 全量并提交**

Run: `pnpm test`
Expected: 全绿

```bash
git add apps/server/src/db packages/shared/src/envelope.ts apps/server/src/modules/ledger/ledger.ts
git commit -m "feat(db): migration 0009 for trial targets, kraken feeding, tentacle shop and seed stock; seed ledger kind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 纯规则

**Files:**
- Create: `apps/server/src/modules/temple/rules.ts`、`apps/server/src/modules/temple/rules.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `MissileDef`、`MapDef`、`Seed`、`Tuning['temple']`
- Produces（纯函数，随机数用注入的 `Rng`）：
  - `type TempleTuning = Tuning['temple']`
  - `guardianHp(star: number, t: TempleTuning): number`
  - `interface ShotInput { def: MissileDef; luckRate: number; hitBonus: number; critBonus: number; sealRate: number }`
  - `interface Shot { hit: boolean; crit: boolean; damage: number; ticket: number; map: boolean; seal: boolean }`
  - `shoot(i: ShotInput, t: TempleTuning, rng: Rng): Shot`（抽随机数顺序：命中 → 暴击 → 伤害（区间 > 0 时）→ 礼券判定 → 礼券张数（中时）→ 探险图 → 玉玺（sealRate > 0 时））
  - `guardianFoods(t: TempleTuning, rng: Rng): Array<{ level: number; num: number }>`（等级 3、2、1）
  - `exploreRate(def: MapDef, b: { needle: boolean; lostRate: number; suitRate: number }): number`
  - `exploreAwardNum(def: MapDef, starKey: boolean, rng: Rng): number`
  - `exploreSplit(def: MapDef, awardNum: number): Array<{ level: number; num: number }>`
  - `trialBase(c: number, t: TempleTuning): number`
  - `foodsTrial(mcLevel: number, main: { level: number; odds: number }, sub: { level: number; odds: number }): number`
  - `trialGainCaps(mainRare: boolean, subRare: boolean): { n: number; m: number }`
  - `krakenTarget(pool: WeightedPool<MysteriousCookbook>, shardId: number, day: string): MysteriousCookbook`
  - `inFeedHours(hour: number, hours: ReadonlyArray<readonly [number, number]>): boolean`
  - `type Relation = 'same' | 'road' | 'other'`；`relationOf(cook: MysteriousCookbook, target: MysteriousCookbook): Relation`
  - `krakenFavor(i: { num: number; level: number; price: number; grade: number; relation: Relation; luckRate: number }, t: TempleTuning, rng: Rng): { init: number; favor: number; luck: number }`（顺序：rand(init) → 同菜时幸运）
  - `seedCount(favor: number): number`
  - `pickSeeds(pool: WeightedPool<Seed>, n: number, rng: Rng): Map<number, number>`
  - `pickShopSlots(pool: WeightedPool<MysteriousCookbook>, n: number, rng: Rng): number[]`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/temple/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { MapDef, MissileDef, MysteriousCookbook } from '@dt/config';
import { buildPool, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  exploreAwardNum,
  exploreRate,
  exploreSplit,
  foodsTrial,
  guardianFoods,
  guardianHp,
  inFeedHours,
  krakenFavor,
  krakenTarget,
  pickSeeds,
  pickShopSlots,
  relationOf,
  seedCount,
  shoot,
  trialBase,
  trialGainCaps,
} from './rules';

const config = testConfig();
const t = config.tuning.temple;
const normal: MissileDef = { attack: [90, 110], hitRate: 0.9, crit: 0.2, critRate: 2 };
const speed: MissileDef = { attack: [5000, 5000], hitRate: 0.96, crit: 0.2, critRate: 2 };
const shot = (def: MissileDef, seq: number[], sealRate = 0) =>
  shoot({ def, luckRate: 0, hitBonus: 0, critBonus: 0, sealRate }, t, sequenceRng(seq));
const map: MapDef = { rate: 0.75, level: [4, 5], num: [5, 10], mysteriousRate: 0.06, needStrength: 2 };
const dish = (patch: Partial<MysteriousCookbook>): MysteriousCookbook => ({
  id: 1,
  name: 'x',
  level: 3,
  road: 1,
  nutritive: 10,
  coin: 1,
  odds: 1,
  taste: [],
  appraisable: true,
  foods: [],
  ...patch,
});

describe('守护兽（规格书 09 §9.1）', () => {
  it('血量 10000 + 5000 × 星级', () => {
    expect(guardianHp(0, t)).toBe(10000);
    expect(guardianHp(2, t)).toBe(20000);
  });

  it('没命中：伤害 0，不再抽后面的', () => {
    expect(shot(normal, [0.95])).toEqual({ hit: false, crit: false, damage: 0, ticket: 0, map: false, seal: false });
  });

  it('命中不暴击：伤害 = min + rand(max − min)', () => {
    expect(shot(normal, [0.5, 0.5, 0.5])).toEqual({
      hit: true,
      crit: false,
      damage: 100,
      ticket: 0,
      map: false,
      seal: false,
    });
  });

  it('暴击：伤害 × 暴击倍数；礼券 rand[1, 伤害/100]；探险图', () => {
    expect(shot(normal, [0, 0, 0.5, 0, 0.99, 0])).toEqual({
      hit: true,
      crit: true,
      damage: 200,
      ticket: 2,
      map: true,
      seal: false,
    });
  });

  it('固定伤害的飞弹不抽伤害；有捕梦网时暴击可能掉玉玺', () => {
    expect(shot(speed, [0, 0, 0.99, 0.99, 0], 0.32)).toEqual({
      hit: true,
      crit: true,
      damage: 10000,
      ticket: 0,
      map: false,
      seal: true,
    });
  });

  it('击败奖励：3、2、1 级各 ⌊60/等级⌋ + rand(10) − 5 个', () => {
    expect(guardianFoods(t, sequenceRng([0]))).toEqual([
      { level: 3, num: 15 },
      { level: 2, num: 25 },
      { level: 1, num: 55 },
    ]);
    expect(guardianFoods(t, sequenceRng([0.99]))).toEqual([
      { level: 3, num: 24 },
      { level: 2, num: 34 },
      { level: 1, num: 64 },
    ]);
  });
});

describe('探险（规格书 09 §9.2）', () => {
  it('成功率：欲望之针补一半失败率；天气迷路率（有针减半）；套装加成只加不减', () => {
    expect(exploreRate(map, { needle: false, lostRate: 0, suitRate: 0 })).toBeCloseTo(0.75, 10);
    expect(exploreRate(map, { needle: true, lostRate: 0, suitRate: 0 })).toBeCloseTo(0.875, 10);
    expect(exploreRate(map, { needle: false, lostRate: 0.2, suitRate: 0 })).toBeCloseTo(0.55, 10);
    expect(exploreRate(map, { needle: true, lostRate: 0.2, suitRate: 0 })).toBeCloseTo(0.775, 10);
    expect(exploreRate(map, { needle: false, lostRate: 0, suitRate: 0.1 })).toBeCloseTo(0.85, 10);
    expect(exploreRate(map, { needle: false, lostRate: 0, suitRate: -0.1 })).toBeCloseTo(0.75, 10);
  });

  it('普通食材总数 = rand[1, max − min] + min（星光之钥 +2）', () => {
    expect(exploreAwardNum(map, false, sequenceRng([0]))).toBe(6);
    expect(exploreAwardNum(map, true, sequenceRng([0]))).toBe(8);
  });

  it('按等级分配：4 级拿 75%，其他 25%，照源码取整（计划裁定 1）', () => {
    expect(exploreSplit(map, 6)).toEqual([
      { level: 5, num: 1 },
      { level: 4, num: 4 },
    ]);
    expect(exploreSplit(map, 7)).toEqual([
      { level: 5, num: 1 },
      { level: 4, num: 5 },
    ]);
    expect(exploreSplit({ ...map, level: [3, 4] }, 6)).toEqual([
      { level: 4, num: 4 },
      { level: 3, num: 1 },
    ]);
  });
});

describe('试炼（规格书 09 §9.4）', () => {
  it('getTrial：0.05 + 创意/750（150 封顶）+ √(超出部分)/100，总和不超过 0.6', () => {
    expect(trialBase(0, t)).toBeCloseTo(0.05, 10);
    expect(trialBase(150, t)).toBeCloseTo(0.25, 10);
    expect(trialBase(250, t)).toBeCloseTo(0.35, 10);
    expect(trialBase(10150, t)).toBeCloseTo(0.6, 10);
  });

  it('getFoodsTrial：食材比菜高的等级和稀有度加成功率', () => {
    expect(foodsTrial(3, { level: 5, odds: 50 }, { level: 4, odds: 120 })).toBeCloseTo(0.05125, 10);
  });

  it('加成上限：价值 n、经验 m 按主辅是否稀有', () => {
    expect(trialGainCaps(true, true)).toEqual({ n: 2, m: 4 });
    expect(trialGainCaps(true, false)).toEqual({ n: 1, m: 3 });
    expect(trialGainCaps(false, true)).toEqual({ n: 0, m: 2 });
    expect(trialGainCaps(false, false)).toEqual({ n: 0, m: 1 });
  });
});

describe('克拉肯（规格书 09 §9.5）', () => {
  const pool = buildPool(
    config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level <= 5),
    (m) => m.odds,
  );

  it('今天想吃的菜：同区服同日稳定，1~5 级可鉴定', () => {
    const a = krakenTarget(pool, 7, '2026-09-30');
    expect(krakenTarget(pool, 7, '2026-09-30').id).toBe(a.id);
    expect(a.level).toBeLessThanOrEqual(5);
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
    expect(new Set(days.map((d) => krakenTarget(pool, 7, d).id)).size).toBeGreaterThan(1);
  });

  it('投喂时段左闭右开', () => {
    expect([11, 13, 14, 17, 20, 21, 0].map((h) => inFeedHours(h, t.krakenHours))).toEqual([
      true,
      true,
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it('关系：同一道菜 / 同道 / 其他', () => {
    const target = dish({ id: 5, road: 2 });
    expect(relationOf(dish({ id: 5, road: 2 }), target)).toBe('same');
    expect(relationOf(dish({ id: 6, road: 2 }), target)).toBe('road');
    expect(relationOf(dish({ id: 7, road: 3 }), target)).toBe('other');
  });

  it('好感度：rand(init) − trunc(k × init)，0 记 1，不超过 init；同菜加幸运', () => {
    const base = { level: 4, grade: 1, luckRate: 0 };
    // init = ⌊√(10×50×2.4)/12⌋ = 2；k = 0 → favor 0 → 1
    expect(krakenFavor({ ...base, num: 10, price: 50, grade: 3, relation: 'same' }, t, sequenceRng([0]))).toEqual({
      init: 2,
      favor: 1,
      luck: 0,
    });
    // 其他：init = ⌊√(100×100×0.5)/12⌋ = 5；k = 0.2 → 0 − 1 = −1
    expect(krakenFavor({ ...base, num: 100, price: 100, relation: 'other' }, t, sequenceRng([0]))).toMatchObject({
      init: 5,
      favor: -1,
    });
    // 同道：init 8，k = 0.1 → trunc(0.8) = 0；rand(8) = 7
    expect(krakenFavor({ ...base, num: 100, price: 100, relation: 'road' }, t, sequenceRng([0.99]))).toMatchObject({
      init: 8,
      favor: 7,
    });
    // 同菜 7 品：init 12，k = −0.36 → trunc(−4.32) = −4；11 + 4 = 15 → 封顶 12
    expect(
      krakenFavor({ ...base, num: 100, price: 100, grade: 7, relation: 'same' }, t, sequenceRng([0.99, 0])),
    ).toMatchObject({ init: 12, favor: 12 });
    // 同菜幸运：rand(⌊12 × 1 / 5⌋ = 2) = 1
    expect(
      krakenFavor({ ...base, num: 100, price: 100, relation: 'same', luckRate: 1 }, t, sequenceRng([0.5, 0.5])),
    ).toEqual({ init: 12, favor: 7, luck: 1 });
  });

  it('种子数 = ⌊√max(0, 好感)⌋ + 2（计划裁定 4）', () => {
    expect([-3, 1, 16, 35].map(seedCount)).toEqual([2, 3, 6, 7]);
  });

  it('抽种子合并计数；触手商店抽 n 格', () => {
    const r = pickSeeds(config.seedPool, 3, sequenceRng([0]));
    expect([...r.values()]).toEqual([3]);
    expect(pickShopSlots(pool, 6, sequenceRng([0.3, 0.6]))).toHaveLength(6);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple/rules.test.ts`
Expected: FAIL，`Cannot find module './rules'`

- [ ] **Step 3: 实现**

`apps/server/src/modules/temple/rules.ts`：

```ts
import type { MapDef, MissileDef, MysteriousCookbook, Seed, Tuning } from '@dt/config';
import { hashSeed, pickWeighted, seededRng, type Rng, type WeightedPool } from '@dt/shared';

export type TempleTuning = Tuning['temple'];

export function guardianHp(star: number, t: TempleTuning): number {
  return t.guardianHpBase + t.guardianHpPerStar * star;
}

export interface ShotInput {
  def: MissileDef;
  luckRate: number;
  /** 天气 hitRate */
  hitBonus: number;
  /** 加成 missileCritRate + 天气 missileCrit */
  critBonus: number;
  /** 捕梦网掉玉玺的概率；没有捕梦网为 0 */
  sealRate: number;
}

export interface Shot {
  hit: boolean;
  crit: boolean;
  damage: number;
  /** 暴击掉的神秘礼券张数 */
  ticket: number;
  /** 暴击掉了探险图 */
  map: boolean;
  /** 暴击掉了厨神玉玺 */
  seal: boolean;
}

/** 一枚飞弹（规格书 09 §9.1） */
export function shoot(i: ShotInput, t: TempleTuning, rng: Rng): Shot {
  const miss: Shot = { hit: false, crit: false, damage: 0, ticket: 0, map: false, seal: false };
  if (!(rng.next() < i.def.hitRate + i.luckRate / 4 + i.hitBonus)) return miss;
  const crit = rng.next() < i.def.crit + i.critBonus;
  const [min, max] = i.def.attack;
  let damage = max === min ? min : min + rng.int(max - min);
  if (!crit) return { ...miss, hit: true, damage };
  damage = Math.floor(damage * i.def.critRate);
  const ticket = rng.next() < t.missileTicketRate + i.luckRate / 4 ? rng.intMin1(Math.floor(damage / 100)) : 0;
  const map = rng.next() < t.missileMapRate + i.luckRate / 20;
  const seal = i.sealRate > 0 && rng.next() < i.sealRate;
  return { hit: true, crit: true, damage, ticket, map, seal };
}

/** 击败奖励：3、2、1 级食材各 ⌊base/等级⌋ + rand(spread) − spread/2 个 */
export function guardianFoods(t: TempleTuning, rng: Rng): Array<{ level: number; num: number }> {
  return [3, 2, 1].map((level) => ({
    level,
    num: Math.max(
      0,
      Math.floor(t.guardianFoodsBase / level) + rng.int(t.guardianFoodsSpread) - Math.floor(t.guardianFoodsSpread / 2),
    ),
  }));
}

/** 探险成功率（不含幸运，规格书 09 §9.2） */
export function exploreRate(def: MapDef, b: { needle: boolean; lostRate: number; suitRate: number }): number {
  let rate = def.rate;
  if (b.needle) rate += (1 - rate) / 2;
  rate -= b.lostRate / (b.needle ? 2 : 1);
  if (b.suitRate > 0) rate += b.suitRate;
  return rate;
}

export function exploreAwardNum(def: MapDef, starKey: boolean, rng: Rng): number {
  const [min, max] = def.num;
  return rng.intMin1(max - min) + min + (starKey ? 2 : 0);
}

/** 按等级分配普通食材：4 级 75%、其他 25%，照源码 ⌊round(x×10)/10⌋ 取整（计划裁定 1） */
export function exploreSplit(def: MapDef, awardNum: number): Array<{ level: number; num: number }> {
  const [min, max] = def.level;
  const out: Array<{ level: number; num: number }> = [];
  for (let level = max; level >= min; level--) {
    const x = awardNum * (level === 4 ? 0.75 : 0.25);
    out.push({ level, num: Math.floor(Math.round(x * 10) / 10) });
  }
  return out;
}

/** getTrial：总和封顶 trialCap（原版 Tools.getTrial） */
export function trialBase(c: number, t: TempleTuning): number {
  const r = 0.05 + Math.min(c, 150) / 750 + (c > 150 ? Math.sqrt(c - 150) / 100 : 0);
  return Math.min(t.trialCap, r);
}

export function foodsTrial(
  mcLevel: number,
  main: { level: number; odds: number },
  sub: { level: number; odds: number },
): number {
  return (main.level - mcLevel) / 80 + (sub.level - mcLevel) / 160 + (200 - main.odds - sub.odds) / 1500;
}

/** 成功时试炼价值 +rand[1,n]（n = 0 不加）、试炼经验 +rand[1,m] */
export function trialGainCaps(mainRare: boolean, subRare: boolean): { n: number; m: number } {
  return {
    n: mainRare ? (subRare ? 2 : 1) : 0,
    m: mainRare ? (subRare ? 4 : 3) : subRare ? 2 : 1,
  };
}

/** 克拉肯今天想吃的菜（设计文档 裁定 2）：按 区服 + 日期 定种子 */
export function krakenTarget(
  pool: WeightedPool<MysteriousCookbook>,
  shardId: number,
  day: string,
): MysteriousCookbook {
  return pickWeighted(pool, seededRng(hashSeed(shardId, 'kraken', day)));
}

export function inFeedHours(hour: number, hours: ReadonlyArray<readonly [number, number]>): boolean {
  return hours.some(([a, b]) => hour >= a && hour < b);
}

export type Relation = 'same' | 'road' | 'other';

export function relationOf(cook: MysteriousCookbook, target: MysteriousCookbook): Relation {
  return cook.id === target.id ? 'same' : cook.road === target.road ? 'road' : 'other';
}

/** 好感度（原版 feedKraken）；k × init 向零截断（计划裁定 5） */
export function krakenFavor(
  i: { num: number; level: number; price: number; grade: number; relation: Relation; luckRate: number },
  t: TempleTuning,
  rng: Rng,
): { init: number; favor: number; luck: number } {
  const rate = t.krakenRates[i.relation];
  const init = Math.floor(Math.sqrt(i.num * (i.level === 6 ? 0.5 : 1) * i.price * rate) / 12);
  const g = i.grade - 1;
  const k = i.relation === 'same' ? -0.06 * g : i.relation === 'road' ? 0.1 - 0.01 * g : 0.2;
  let favor = rng.int(init) - Math.trunc(k * init);
  favor = favor === 0 ? 1 : Math.min(favor, init);
  const luck = i.relation === 'same' ? rng.int(Math.floor((init * i.luckRate) / 5)) : 0;
  return { init, favor: favor + luck, luck };
}

export function seedCount(favor: number): number {
  return Math.floor(Math.sqrt(Math.max(0, favor))) + 2;
}

export function pickSeeds(pool: WeightedPool<Seed>, n: number, rng: Rng): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const s = pickWeighted(pool, rng);
    out.set(s.id, (out.get(s.id) ?? 0) + 1);
  }
  return out;
}

export function pickShopSlots(pool: WeightedPool<MysteriousCookbook>, n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => pickWeighted(pool, rng).id);
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple/rules.test.ts`
Expected: PASS

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/temple
git commit -m "feat(temple): pure rules for missiles, guardian rewards, exploration, trials, kraken favor and seeds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 服务骨架——概览、守护兽、路由、目录、功能

**Files:**
- Create: `packages/shared/src/schemas/temple.ts`
- Create: `apps/server/src/modules/temple/common.ts`、`guardian.ts`、`service.ts`、`routes.ts`、`guardian.test.ts`、`temple.test.ts`
- Modify: `packages/shared/src/index.ts`、`packages/shared/src/schemas/world.ts`
- Modify: `apps/server/src/modules/equip/power.ts`、`apps/server/src/core/features.ts`、`apps/server/src/game.ts`、`apps/server/src/modules/index.ts`、`apps/server/src/modules/world/service.ts`

**Interfaces:**
- Consumes: Task 1~3；`drawDtTickets(op, times)`（`core/tickets.ts`）；`incrementDaily` / `getDaily`（`modules/counter/dailyCounter.ts`）；`addFoods`；`getEffectAgg`
- Produces:
  - shared（本任务一次写全，后续任务直接用）：`missileBody`、`exploreBody`、`trialPrepareBody`、`trialRefreshBody`、`trialStartBody`、`krakenFeedBody`、`tentacleExchangeBody`；`TempleDto`、`MissileResultDto`、`ExploreResultDto`、`TrialResultDto`、`KrakenFeedDto`、`TentacleShopDto`；`CatalogDto.seeds?: Array<{ id: number; foodsId: number; level: number }>`
  - `equip/power.ts`：`restGear(db, rest, suits): Promise<{ total: EquipAttrs; power: number; suits: ActiveSuit[] }>`、`suitEffect(list: ActiveSuit[], key: string): number`
  - `temple/common.ts`：`badInput(reason)`、`bump(map, id, n?)`、`pickFood(o, level): number`、`addFoodsMerged(o, map): Promise<void>`、`addSeeds(o, seedId, num): Promise<void>`、`learnedUpTo(o, maxLevel): Promise<MysteriousCookbook[]>`、`toList(map): Array<{ foodsId: number; num: number }>`
  - `temple/guardian.ts`：`shootMissiles(o: Op, weather: Record<string, number>, b: { goodsId: number; num: number }): Promise<MissileResultDto>`
  - `temple/service.ts`：`createTempleService(d, world)`，返回 `{ overview(ctx), missile(ctx, body) }`（后续任务往返回对象里加方法）；内部 `op(ctx, source, fn)`、`weatherOf(o)`、`krakenPool`；`type TempleService`
  - `Game.temple: TempleService`

- [ ] **Step 1: 接口类型**

`packages/shared/src/schemas/temple.ts`：

```ts
import { z } from 'zod';

const id = z.number().int().positive();
export const missileBody = z.object({ goodsId: id, num: z.number().int().min(1).max(99) });
export const exploreBody = z.object({ goodsId: id, times: z.number().int().min(1).max(99) });
export const trialPrepareBody = z.object({ way: z.union([z.literal(1), z.literal(2)]) });
export const trialRefreshBody = z.object({ mcId: id.optional() });
export const trialStartBody = z.object({ mainFoodsId: id, subFoodsId: id });
export const krakenFeedBody = z.object({ num: z.number().int().min(1).max(1_000_000) });
export const tentacleExchangeBody = z.object({ slot: z.number().int().min(0).max(19) });

type FoodNum = { foodsId: number; num: number };

export interface TempleDto {
  star: number;
  strength: number;
  guardian: { hpMax: number; hpLeft: number; killed: boolean };
  missiles: Array<{ goodsId: number; num: number }>;
  maps: Array<{ goodsId: number; num: number; needStrength: number }>;
  /** mcId 为 null = 没准备过；readyMinutes = 准备勋章剩余分钟，0 = 没准备好 */
  trial: { mcId: number | null; readyMinutes: number; creatives: number };
  kraken: {
    targetMcId: number;
    fed: boolean;
    feedable: boolean;
    hours: Array<[number, number]>;
    current: { mcId: number; grade: number; leftNum: number; price: number } | null;
  };
  seeds: Array<{ seedId: number; num: number }>;
  tentacles: number;
}

export interface MissileResultDto {
  shots: Array<{ hit: boolean; crit: boolean; damage: number; killed: boolean }>;
  hpMax: number;
  hpLeft: number;
  killed: boolean;
  drops: { tickets: number; maps: number; seals: number; dtTickets: number; rare: number | null; foods: FoodNum[] };
}

export interface ExploreResultDto {
  success: number;
  fail: number;
  rare: FoodNum[];
  foods: FoodNum[];
  exp: number;
}

export interface TrialResultDto {
  success: boolean;
  lucky: boolean;
  addWorth: number;
  addExp: number;
  proficiency: number;
  curlevel: number;
}

export interface KrakenFeedDto {
  relation: 'same' | 'road' | 'other';
  favor: number;
  seeds: Array<{ seedId: number; num: number }>;
  krabCoin: number;
  tentacle: boolean;
  punish: { kind: 'exp' | 'worth' | 'forget'; value: number } | null;
}

export interface TentacleShopDto {
  slots: Array<{ mcId: number; bought: boolean }>;
  refreshes: number;
  /** 下次刷新花几条触手（当天第一次免费） */
  refreshCost: number;
  tentacles: number;
}
```

`packages/shared/src/index.ts` 加 `export * from './schemas/temple';`。`packages/shared/src/schemas/world.ts` 的 `CatalogDto` 在 `mysterious?:` 下面加：

```ts
  /** 种子；旧缓存里没有 */
  seeds?: Array<{ id: number; foodsId: number; level: number }>;
```

- [ ] **Step 2: 写失败测试**

`apps/server/src/modules/temple/guardian.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：必中、必暴击、掉落必中 */
let win: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
});

describe('守护兽（规格书 09 §9.1）', () => {
  it('极速飞弹两发击败 1 星守护兽：只扣 2 枚；暴击掉礼券和探险图；击败奖励；再打报 guardian_down（Review Focus 1）', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 }, goods: { 17: 5 } });
    const r = await win.game.temple.missile(ctx, { goodsId: 17, num: 99 });
    expect(r.data.shots).toHaveLength(2);
    expect(r.data.shots.every((s) => s.hit && s.crit && s.damage === 10000)).toBe(true);
    expect(r.data).toMatchObject({ hpMax: 15000, hpLeft: 0, killed: true });
    expect(await goodsNum(win, ctx.restaurantId, 17)).toBe(3);
    expect(r.data.drops).toMatchObject({ tickets: 2, maps: 2, seals: 0, dtTickets: 200 });
    expect(await goodsNum(win, ctx.restaurantId, 1)).toBe(2);
    expect(await goodsNum(win, ctx.restaurantId, 170)).toBe(2);
    expect(r.data.drops.rare).not.toBeNull();
    expect(config.requireFood(r.data.drops.rare!).level).toBe(7);
    expect(r.data.drops.foods.reduce((n, f) => n + f.num, 0)).toBe(1 + 15 + 25 + 55);
    await expect(win.game.temple.missile(ctx, { goodsId: 17, num: 1 })).rejects.toMatchObject({
      params: { reason: 'guardian_down' },
    });
    expect(await goodsNum(win, ctx.restaurantId, 17)).toBe(3);
  });

  it('星级决定血量；伤害当天累计；0 星不能打', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2 }, goods: { 18: 3 } });
    const r = await t.game.temple.missile(ctx, { goodsId: 18, num: 3 });
    const dealt = r.data.shots.reduce((n, s) => n + s.damage, 0);
    expect(r.data).toMatchObject({ hpMax: 20000, hpLeft: 20000 - dealt, killed: false });
    expect((await t.game.temple.overview(ctx)).guardian).toEqual({ hpMax: 20000, hpLeft: 20000 - dealt, killed: false });
    const zero = await newRestaurant(t, { goods: { 18: 1 } });
    await expect(t.game.temple.missile(zero, { goodsId: 18, num: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
  });

  it('捕梦网：暴击时按极速飞弹的概率掉厨神玉玺', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 3 }, goods: { 17: 1 } });
    await grantGoods(win.db, config, ctx.restaurantId, 468, 1, new Date());
    const r = await win.game.temple.missile(ctx, { goodsId: 17, num: 1 });
    expect(r.data.drops.seals).toBe(1);
    expect(await goodsNum(win, ctx.restaurantId, 164)).toBe(1);
  });

  it('不是飞弹报 VALIDATION_FAILED；没有飞弹报 NOT_ENOUGH', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    await expect(t.game.temple.missile(ctx, { goodsId: 85, num: 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_missile' },
    });
    await expect(t.game.temple.missile(ctx, { goodsId: 18, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 18 },
    });
  });

  it('主线第 25 步「攻击一次守护兽」不再跳过', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1, main_task_step: 25 }, goods: { 18: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 25, key: 'temple.missile', done: false });
    await t.game.temple.missile(ctx, { goodsId: 18, num: 1 });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 25, done: true });
  });
});
```

`apps/server/src/modules/temple/temple.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPool, gameDay, gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { krakenTarget } from './rules';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('神殿概览', () => {
  it('飞弹和探险图持有、克拉肯今天想吃的菜和是否在投喂时段、种子库存', async () => {
    const day = gameDay(new Date());
    t.clock.set(gameTime(day, 12));
    const ctx = await newRestaurant(t, { patch: { star_level: 1, strength: 80 }, goods: { 17: 2, 171: 3, 434: 4 } });
    await t.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 5, num: 3 }).execute();
    const o = await t.game.temple.overview(ctx);
    expect(o).toMatchObject({ star: 1, strength: 80, tentacles: 4, seeds: [{ seedId: 5, num: 3 }] });
    expect(o.missiles).toContainEqual({ goodsId: 17, num: 2 });
    expect(o.missiles).toContainEqual({ goodsId: 18, num: 0 });
    expect(o.maps).toContainEqual({ goodsId: 171, num: 3, needStrength: 5 });
    expect(o.trial).toEqual({ mcId: null, readyMinutes: 0, creatives: 0 });
    const pool = buildPool(
      config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level <= 5),
      (m) => m.odds,
    );
    expect(o.kraken).toMatchObject({
      targetMcId: krakenTarget(pool, ctx.shardId, day).id,
      fed: false,
      feedable: true,
      current: null,
    });
    t.clock.set(gameTime(day, 15));
    expect((await t.game.temple.overview(ctx)).kraken.feedable).toBe(false);
  });

  it('目录带种子（id、食材、等级）', () => {
    expect(t.game.world.catalog().seeds!.find((s) => s.id === 1)).toEqual({ id: 1, foodsId: 101, level: 1 });
  });

  it('区服关闭 temple：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 18: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { temple: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.temple.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.temple.missile(ctx, { goodsId: 18, num: 1 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple/guardian.test.ts src/modules/temple/temple.test.ts`
Expected: FAIL（`t.game.temple` 为 undefined）

- [ ] **Step 4: 属性合计抽出来**

`apps/server/src/modules/equip/power.ts` 整个替换为：

```ts
import type { Kysely } from 'kysely';
import type { EquipAttrs, SuitDef } from '@dt/config';
import type { DB, RestaurantRow } from '../../db/schema';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs, type ActiveSuit } from './rules';

/** 餐厅属性合计（加点 + 穿戴厨具含宝石，乘套装百分比）、厨力、激活的套装（规格书 20 §20.18） */
export async function restGear(
  db: Kysely<DB>,
  rest: RestaurantRow,
  suits: ReadonlyMap<number, SuitDef>,
): Promise<{ total: EquipAttrs; power: number; suits: ActiveSuit[] }> {
  const worn = await db
    .selectFrom('equip')
    .selectAll()
    .where('rest_id', '=', rest.id)
    .where('worn', '=', true)
    .execute();
  const gems = await loadGems(
    db,
    worn.map((w) => w.id),
  );
  const gear = worn.reduce((acc, e) => addAttrs(acc, pieceTotal(e, gems.get(e.id) ?? [])), zeroAttrs());
  const points = {
    cook: rest.attr_cook,
    cutting: rest.attr_cutting,
    fire: rest.attr_fire,
    season: rest.attr_season,
    creatives: rest.attr_creatives,
    luck: rest.luck,
  };
  const list = activeSuits(
    worn.map((w) => w.suit_id),
    suits,
  );
  const { total, power } = attrSummary(points, gear, suitPct(list));
  return { total, power, suits: list };
}

/** 厨力（烹制份数、以后的厨塔都用） */
export async function restPower(
  db: Kysely<DB>,
  rest: RestaurantRow,
  suits: ReadonlyMap<number, SuitDef>,
): Promise<number> {
  return (await restGear(db, rest, suits)).power;
}

/** 激活档位里某个效果键之和（如 exploreSuccessRate，不进加成汇总的套装键） */
export function suitEffect(list: ActiveSuit[], key: string): number {
  let sum = 0;
  for (const s of list) s.suit.tiers.forEach((tier, i) => (sum += s.active[i] ? (tier.effects[key] ?? 0) : 0));
  return sum;
}
```

- [ ] **Step 5: 公共函数和守护兽**

`apps/server/src/modules/temple/common.ts`：

```ts
import { sql } from 'kysely';
import type { MysteriousCookbook } from '@dt/config';
import { ErrorCode, pickWeighted } from '@dt/shared';
import type { Op } from '../../core/op';
import { recordChange } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';

export const badInput = (reason: string): AppError => new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

export function bump(m: Map<number, number>, id: number, n = 1): void {
  m.set(id, (m.get(id) ?? 0) + n);
}

export const toList = (m: Map<number, number>): Array<{ foodsId: number; num: number }> =>
  [...m].map(([foodsId, num]) => ({ foodsId, num }));

/** 按权重抽一个该等级的食材 */
export function pickFood(o: Op, level: number): number {
  const pool = o.config.foodPools.get(level);
  if (!pool) throw new Error(`no foods of level ${level}`);
  return pickWeighted(pool, o.rng).id;
}

/** 合并后逐种发放（同一种食材只有一个事件、一条流水） */
export async function addFoodsMerged(o: Op, foods: Map<number, number>): Promise<void> {
  for (const [id, n] of foods) await addFoods(o, id, n);
}

export async function addSeeds(o: Op, seedId: number, num: number): Promise<void> {
  if (num <= 0) return;
  await o.tx
    .insertInto('rest_seed')
    .values({ rest_id: o.rest.id, seed_id: seedId, num })
    .onConflict((oc) => oc.columns(['rest_id', 'seed_id']).doUpdateSet({ num: sql<number>`rest_seed.num + ${num}` }))
    .execute();
  recordChange(o, 'seed', num, {}, seedId);
}

/** 已学的、等级不超过 maxLevel 的特色菜 */
export async function learnedUpTo(o: Op, maxLevel: number): Promise<MysteriousCookbook[]> {
  const rows = await o.tx.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', o.rest.id).execute();
  return rows.flatMap((r) => {
    const m = o.config.mysterious.get(r.mc_id);
    return m && m.level <= maxLevel ? [m] : [];
  });
}
```

`apps/server/src/modules/temple/guardian.ts`：

```ts
import { GOODS } from '@dt/config';
import { gameDay, pickWeighted, type MissileResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { opNews, type Op } from '../../core/op';
import { drawDtTickets } from '../../core/tickets';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods, countGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { addFoodsMerged, badInput, bump, pickFood, toList } from './common';
import { guardianFoods, guardianHp, shoot } from './rules';

/** 发射飞弹（规格书 09 §9.1，设计文档 §3.1） */
export async function shootMissiles(
  o: Op,
  weather: Record<string, number>,
  b: { goodsId: number; num: number },
): Promise<MissileResultDto> {
  const t = o.tuning.temple;
  const def = o.config.missiles.get(b.goodsId);
  if (!def) throw badInput('not_missile');
  if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'guardian.killed', day)) > 0) throw invalidState('guardian_down');
  const have = await countGoods(o, b.goodsId);
  if (have < 1) throw notEnough('goods', 1, 0, b.goodsId);
  const hpMax = guardianHp(o.rest.star_level, t);
  let hpLeft = Math.max(0, hpMax - (await getDaily(o.tx, o.rest.id, 'guardian.damage', day)));
  if (hpLeft === 0) throw invalidState('guardian_down');

  const agg = await opAgg(o);
  const { rate: luck } = await opLuck(o);
  const dream = await hasValidHonor(o, GOODS.dreamNet);
  const net = o.config.requireGoods(GOODS.dreamNet).effects;
  const sealRate = dream ? ((b.goodsId === GOODS.missileSpeed ? net.critSpeedGSRate : net.critGSRate) ?? 0) : 0;
  const input = {
    def,
    luckRate: luck,
    hitBonus: weather.hitRate ?? 0,
    critBonus: (agg.missileCritRate ?? 0) + (weather.missileCrit ?? 0),
    sealRate,
  };
  const shots: MissileResultDto['shots'] = [];
  let total = 0;
  let tickets = 0;
  let maps = 0;
  let seals = 0;
  let killed = false;
  for (let i = 0; i < Math.min(b.num, have) && !killed; i++) {
    const s = shoot(input, t, o.rng);
    total += s.damage;
    tickets += s.ticket;
    if (s.map) maps += 1;
    if (s.seal) seals += 1;
    hpLeft = Math.max(0, hpLeft - s.damage);
    killed = hpLeft === 0;
    shots.push({ hit: s.hit, crit: s.crit, damage: s.damage, killed });
  }
  await consumeGoods(o, b.goodsId, shots.length);
  await incrementDaily(o.tx, o.rest.id, 'guardian.damage', total, day);
  if (tickets > 0) await grantGoodsOp(o, GOODS.mysteryTicket, tickets);
  if (maps > 0) await grantGoodsOp(o, GOODS.mapNormal, maps);
  if (seals > 0) await grantGoodsOp(o, GOODS.seal, seals);

  const foods = new Map<number, number>();
  let rare: number | null = null;
  if (killed) {
    await incrementDaily(o.tx, o.rest.id, 'guardian.killed', 1, day);
    if (o.rng.chance(t.guardianRareRate + luck / 4)) {
      rare = pickWeighted(o.config.foodPools.get(7)!, o.rng).id;
      bump(foods, rare);
      opNews(o, 'temple.guardian.rare', { foodsId: rare });
    }
    for (const x of guardianFoods(t, o.rng)) for (let k = 0; k < x.num; k++) bump(foods, pickFood(o, x.level));
  }
  await addFoodsMerged(o, foods);
  const dtTickets = await drawDtTickets(o, Math.floor(total / 100) * (dream ? 2 : 1));
  await emitAction(o, 'temple.missile');
  return {
    shots,
    hpMax,
    hpLeft,
    killed,
    drops: { tickets, maps, seals, dtTickets, rare, foods: toList(foods) },
  };
}
```

- [ ] **Step 6: 服务、路由、装配、目录**

`apps/server/src/modules/temple/service.ts`：

```ts
import { GOODS } from '@dt/config';
import { buildPool, gameDay, gameParts, type TempleDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { getDaily } from '../counter/dailyCounter';
import { getEffectAgg } from '../effects/service';
import { restGear } from '../equip/power';
import type { WorldService } from '../world/service';
import { shootMissiles } from './guardian';
import { guardianHp, inFeedHours, krakenTarget } from './rules';

export function createTempleService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'temple', source }, fn);
  const weatherOf = async (o: Op) => (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
  /** 克拉肯想吃的菜：1~5 级可鉴定特色菜（设计文档 裁定 2） */
  const krakenPool = buildPool(
    d.config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= 1 && m.level <= 5),
    (m) => m.odds,
  );

  return {
    async overview(ctx: RestCtx): Promise<TempleDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'temple');
      const t = s.tuning.temple;
      const now = d.now();
      const day = gameDay(now);
      const rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const damage = await getDaily(d.db, rest.id, 'guardian.damage', day);
      const killed = (await getDaily(d.db, rest.id, 'guardian.killed', day)) > 0;
      const hpMax = guardianHp(rest.star_level, t);
      const ids = [
        ...d.config.missiles.keys(),
        ...d.config.maps.keys(),
        GOODS.creativePotion,
        GOODS.meditation,
        GOODS.tentacle,
      ];
      const held = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num', 'expires_at'])
        .where('rest_id', '=', rest.id)
        .where('goods_id', 'in', ids)
        .execute();
      const row = (id: number) => held.find((x) => x.goods_id === id);
      const have = (id: number) => {
        const r = row(id);
        return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
      };
      const minutesLeft = (id: number) => {
        const r = row(id);
        if (!r || r.num <= 0) return 0;
        if (r.expires_at === null) return 0;
        return Math.max(0, Math.ceil((r.expires_at.getTime() - now.getTime()) / 60_000));
      };
      const trial = await d.db.selectFrom('rest_trial').selectAll().where('rest_id', '=', rest.id).executeTakeFirst();
      const gear = await restGear(d.db, rest, d.config.suits);
      const agg = await getEffectAgg(d.db, rest.id, now, d.config, s.tuning);
      const fed = await d.db
        .selectFrom('kraken_feed')
        .select('id')
        .where('rest_id', '=', rest.id)
        .where('day', '=', day)
        .executeTakeFirst();
      const cook =
        rest.mc_cook_id === null
          ? undefined
          : await d.db.selectFrom('mc_cook').selectAll().where('id', '=', rest.mc_cook_id).executeTakeFirst();
      const seeds = await d.db
        .selectFrom('rest_seed')
        .select(['seed_id', 'num'])
        .where('rest_id', '=', rest.id)
        .where('num', '>', 0)
        .orderBy('seed_id')
        .execute();
      return {
        star: rest.star_level,
        strength: rest.strength,
        guardian: { hpMax, hpLeft: killed ? 0 : Math.max(0, hpMax - damage), killed },
        missiles: [...d.config.missiles.keys()].map((goodsId) => ({ goodsId, num: have(goodsId) })),
        maps: [...d.config.maps].map(([goodsId, m]) => ({ goodsId, num: have(goodsId), needStrength: m.needStrength })),
        trial: {
          mcId: trial?.mc_id ?? null,
          readyMinutes: Math.max(minutesLeft(GOODS.creativePotion), minutesLeft(GOODS.meditation)),
          creatives: gear.total.creatives + (agg.creatives ?? 0),
        },
        kraken: {
          targetMcId: krakenTarget(krakenPool, ctx.shardId, day).id,
          fed: fed !== undefined,
          feedable: inFeedHours(gameParts(now).hour, t.krakenHours),
          hours: t.krakenHours.map(([a, b]) => [a, b] as [number, number]),
          current: cook
            ? { mcId: cook.mc_id, grade: cook.grade, leftNum: cook.left_num, price: cook.price }
            : null,
        },
        seeds: seeds.map((x) => ({ seedId: x.seed_id, num: x.num })),
        tentacles: have(GOODS.tentacle),
      };
    },

    missile(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'temple.missile', async (o) => shootMissiles(o, await weatherOf(o), b));
    },
  };
}

export type TempleService = ReturnType<typeof createTempleService>;
```

`apps/server/src/modules/temple/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { missileBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TempleService } from './service';

export function templeRoutes(svc: TempleService): FastifyPluginAsync {
  return async (r) => {
    r.get('/temple', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/temple/missile', async (req) => okOp(await svc.missile(restCtxOf(req), parse(missileBody, req.body))));
  };
}
```

装配：
- `apps/server/src/modules/index.ts`：import `templeRoutes`，在 `mysteriousRoutes` 注册后加 `app.register(templeRoutes(game.temple), { prefix: '/api/v1' });`
- `apps/server/src/game.ts`：import `createTempleService, type TempleService`；`Game` 加 `temple: TempleService;`；返回对象加 `temple: createTempleService(deps, world),`
- `apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 在 `'mysterious',` 后加 `'temple',`
- `apps/server/src/modules/world/service.ts` 的 `catalog()`：`mysterious: ...` 之后加：

```ts
        seeds: d.config.bundle.seeds.map((s) => ({ id: s.id, foodsId: s.foodsId, level: s.level })),
```

- [ ] **Step 7: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple src/modules/equip src/modules/mysterious`
Expected: PASS（`restPower` 行为不变，4A 的烹制测试照过）

- [ ] **Step 8: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server packages/shared
git commit -m "feat(temple): overview and guardian beast with missiles, crit drops, kill rewards and delicious tickets; restGear for attributes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 探险

**Files:**
- Create: `apps/server/src/modules/temple/explore.ts`、`apps/server/src/modules/temple/explore.test.ts`
- Modify: `apps/server/src/modules/temple/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 3 的 `exploreRate`、`exploreAwardNum`、`exploreSplit`；Task 4 的 `restGear`、`suitEffect`、`common.ts`、`op`、`weatherOf`
- Produces: `exploreMaps(o: Op, weather: Record<string, number>, b: { goodsId: number; times: number }): Promise<ExploreResultDto>`；服务方法 `explore(ctx, body)`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/temple/explore.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：必成功、必出神秘食材 */
let win: TestGame;
/** 随机数固定 0.99：必迷路 */
let lose: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  lose = await createTestGame({ rng: () => sequenceRng([0.99]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
  await lose.close();
});
const sum = (xs: Array<{ num: number }>) => xs.reduce((n, x) => n + x.num, 0);

describe('探险（规格书 09 §9.2）', () => {
  it('成功：扣图和体力；每次 1 个神秘食材 + 5 个普通食材（5 级 1、4 级 4）；发新闻；活跃按次数计', async () => {
    const ctx = await newRestaurant(win, { patch: { strength: 100 }, goods: { 170: 5 } });
    const r = await win.game.temple.explore(ctx, { goodsId: 170, times: 3 });
    expect(r.data).toMatchObject({ success: 3, fail: 0, exp: 0 });
    expect(sum(r.data.rare)).toBe(3);
    expect(sum(r.data.foods)).toBe(15);
    for (const f of r.data.foods) expect([4, 5]).toContain(config.requireFood(f.foodsId).level);
    expect(await goodsNum(win, ctx.restaurantId, 170)).toBe(2);
    expect((await restRow(win, ctx.restaurantId)).strength).toBe(94);
    const news = await win.db.selectFrom('news').select('type').where('rest_id', '=', ctx.restaurantId).execute();
    expect(news.map((n) => n.type)).toContain('temple.explore.rare');
    const c = await win.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'temple.explore')
      .executeTakeFirst();
    expect(c?.count).toBe(3);
  });

  it('煤油灯：经验 = 每次体力 × 餐厅等级 × (成功×5 + 失败×2)', async () => {
    const ctx = await newRestaurant(win, { patch: { strength: 100, level: 10 }, goods: { 170: 2 } });
    await grantGoods(win.db, config, ctx.restaurantId, 377, 1, new Date());
    const r = await win.game.temple.explore(ctx, { goodsId: 170, times: 2 });
    expect(r.data.exp).toBe(2 * 10 * (2 * 5));
  });

  it('全部迷路：只扣图和体力，没有食材', async () => {
    const ctx = await newRestaurant(lose, { patch: { strength: 100 }, goods: { 170: 2 } });
    const r = await lose.game.temple.explore(ctx, { goodsId: 170, times: 2 });
    expect(r.data).toEqual({ success: 0, fail: 2, rare: [], foods: [], exp: 0 });
    expect(await goodsNum(lose, ctx.restaurantId, 170)).toBe(0);
  });

  it('高级探险图 + 探险者秘籍：额外 2 个 3 级食材', async () => {
    const ctx = await newRestaurant(win, { patch: { strength: 100 }, goods: { 171: 1 } });
    await grantGoods(win.db, config, ctx.restaurantId, 416, 1, new Date());
    const r = await win.game.temple.explore(ctx, { goodsId: 171, times: 1 });
    // awardNum = 1 + 10 = 11：5 级 2、4 级 8，再加 3 级 2
    expect(sum(r.data.foods)).toBe(12);
    const l3 = r.data.foods.filter((f) => config.requireFood(f.foodsId).level === 3);
    expect(sum(l3)).toBe(2);
  });

  it('体力不够：报 NOT_ENOUGH strength，探险图不扣（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 1 }, goods: { 170: 2 } });
    await expect(t.game.temple.explore(ctx, { goodsId: 170, times: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 170)).toBe(2);
  });

  it('不是探险图报 VALIDATION_FAILED not_map', async () => {
    const ctx = await newRestaurant(t, { goods: { 85: 1 } });
    await expect(t.game.temple.explore(ctx, { goodsId: 85, times: 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_map' },
    });
  });

  it('主线第 26 步「探险一次」不再跳过', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 100, main_task_step: 26 }, goods: { 170: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 26, key: 'temple.explore', done: false });
    await t.game.temple.explore(ctx, { goodsId: 170, times: 1 });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 26, done: true });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple/explore.test.ts`
Expected: FAIL（`t.game.temple.explore is not a function`）

- [ ] **Step 3: 实现**

`apps/server/src/modules/temple/explore.ts`：

```ts
import { GOODS } from '@dt/config';
import type { ExploreResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opLuck } from '../../core/luck';
import { opNews, type Op } from '../../core/op';
import { gainExp, spendStrength } from '../../core/resources';
import { restGear, suitEffect } from '../equip/power';
import { consumeGoods, hasValidHonor } from '../store/goods';
import { addFoodsMerged, badInput, bump, pickFood, toList } from './common';
import { exploreAwardNum, exploreRate, exploreSplit } from './rules';

/** 探险（规格书 09 §9.2，设计文档 §3.2） */
export async function exploreMaps(
  o: Op,
  weather: Record<string, number>,
  b: { goodsId: number; times: number },
): Promise<ExploreResultDto> {
  const def = o.config.maps.get(b.goodsId);
  if (!def) throw badInput('not_map');
  await consumeGoods(o, b.goodsId, b.times);
  spendStrength(o, def.needStrength * b.times);
  const { rate: luck } = await opLuck(o);
  const needle = await hasValidHonor(o, GOODS.needle);
  const lamp = await hasValidHonor(o, GOODS.lamp);
  const card = await hasValidHonor(o, GOODS.securityCard);
  const starKey = await hasValidHonor(o, GOODS.starKey);
  const book = b.goodsId === GOODS.mapHigh && (await hasValidHonor(o, GOODS.exploreBook));
  const eff = (id: number, key: string) => o.config.requireGoods(id).effects[key] ?? 0;
  const gear = await restGear(o.tx, o.rest, o.config.suits);
  const rate = exploreRate(def, {
    needle,
    lostRate: weather.mapLostRate ?? 0,
    suitRate: suitEffect(gear.suits, 'exploreSuccessRate'),
  });
  const rareRate =
    def.mysteriousRate +
    (lamp ? eff(GOODS.lamp, 'mysteriousRate') : 0) +
    (needle ? eff(GOODS.needle, 'mysteriousRate') : 0) +
    (card ? eff(GOODS.securityCard, 'mysteriousRate') : 0) +
    (weather.mysteriousRate ?? 0);
  const level3 = book ? eff(GOODS.exploreBook, 'mapL3FoodsNumAdd') : 0;

  let success = 0;
  let fail = 0;
  const rare = new Map<number, number>();
  const foods = new Map<number, number>();
  for (let i = 0; i < b.times; i++) {
    if (!o.rng.chance(rate + luck / 12)) {
      fail += 1;
      continue;
    }
    success += 1;
    if (o.rng.chance(rareRate + luck / 20)) {
      const id = pickFood(o, 7);
      bump(rare, id, starKey && o.rng.chance(0.5) ? 2 : 1);
    }
    for (const x of exploreSplit(def, exploreAwardNum(def, starKey, o.rng)))
      for (let k = 0; k < x.num; k++) bump(foods, pickFood(o, x.level));
    for (let k = 0; k < level3; k++) bump(foods, pickFood(o, 3));
  }
  await addFoodsMerged(o, rare);
  await addFoodsMerged(o, foods);
  const exp = lamp ? def.needStrength * o.rest.level * (success * 5 + fail * 2) : 0;
  if (exp > 0) gainExp(o, exp);
  if (rare.size > 0) opNews(o, 'temple.explore.rare', { foods: toList(rare) });
  await emitAction(o, 'temple.explore', b.times);
  return { success, fail, rare: toList(rare), foods: toList(foods), exp };
}
```

`service.ts`：import `exploreMaps`（`./explore`）；返回对象加：

```ts
    explore(ctx: RestCtx, b: { goodsId: number; times: number }) {
      return op(ctx, 'temple.explore', async (o) => exploreMaps(o, await weatherOf(o), b));
    },
```

`routes.ts`：import `exploreBody`；加：

```ts
    r.post('/temple/explore', async (req) => okOp(await svc.explore(restCtxOf(req), parse(exploreBody, req.body))));
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple`
Expected: PASS

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server
git commit -m "feat(temple): exploration with needle, weather and suit modifiers, rare foods, level split, lamp experience

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 试炼

**Files:**
- Create: `apps/server/src/modules/temple/trial.ts`、`apps/server/src/modules/temple/trial.test.ts`
- Modify: `apps/server/src/modules/temple/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 3 的 `trialBase`、`foodsTrial`、`trialGainCaps`；Task 4 的 `learnedUpTo`、`badInput`、`restGear`；4A 的 `addProficiency`（`mysterious/rules.ts`）
- Produces: `prepareTrial(o, { way }): Promise<{ mcId: number }>`、`refreshTrial(o, { mcId? }): Promise<{ mcId: number }>`、`startTrial(o, { mainFoodsId, subFoodsId }): Promise<TrialResultDto>`；服务方法 `prepareTrial`、`refreshTrial`、`startTrial`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/temple/trial.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：试炼必成功，加成取 1 */
let win: TestGame;
let lose: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  lose = await createTestGame({ rng: () => sequenceRng([0.99]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
  await lose.close();
});

const lvl = (n: number) => config.bundle.mysteriousCookbooks.filter((m) => m.level === n);
const MC3 = lvl(3)[0]!; // 食材 262、310、400
const MC4 = lvl(4)[0]!;
const MC6 = lvl(6)[0]!;
const RARE = 150; // 5 级，odds 70
const COMMON = 423; // 5 级，odds 100

async function ready(g: TestGame, learned: number[] = [MC3.id], patch: Record<string, number> = {}) {
  const foods = Object.fromEntries([RARE, COMMON, ...MC3.foods].map((f) => [f, 5]));
  const ctx = await newRestaurant(g, {
    patch: { star_level: 1, coin: 1_000_000, ...patch },
    goods: { 434: 2 },
    foods,
  });
  for (const id of learned) await g.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: id, way: 1 }).execute();
  return ctx;
}
const mcRow = (g: TestGame, restId: number, mcId: number) =>
  g.db.selectFrom('rest_mc').selectAll().where('rest_id', '=', restId).where('mc_id', '=', mcId).executeTakeFirst();

describe('试炼准备（设计文档 裁定 1、7）', () => {
  it('冥想：免费得勋章 327；只从已学的 ≤5 级菜里抽；准备好时不能再准备', async () => {
    const ctx = await ready(win, [MC3.id, MC6.id]);
    const r = await win.game.temple.prepareTrial(ctx, { way: 2 });
    expect(r.data.mcId).toBe(MC3.id);
    expect(await goodsNum(win, ctx.restaurantId, 327)).toBe(1);
    const row = await win.db.selectFrom('rest_trial').selectAll().where('rest_id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ mc_id: MC3.id, way: 2 });
    await expect(win.game.temple.prepareTrial(ctx, { way: 2 })).rejects.toMatchObject({
      params: { reason: 'trial_ready' },
    });
  });

  it('注射花 25 万银币并得勋章 326；没学 ≤5 级特色菜报 mc_count', async () => {
    const ctx = await ready(t, [MC3.id], { coin: 300_000 });
    await t.game.temple.prepareTrial(ctx, { way: 1 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(50_000);
    expect(await goodsNum(t, ctx.restaurantId, 326)).toBe(1);
    const only6 = await ready(t, [MC6.id]);
    await expect(t.game.temple.prepareTrial(only6, { way: 2 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'mc_count', need: 1 },
    });
  });

  it('换对象：不指定花 2 万银币；用触手指定已学的菜；没学或 >5 级的报 mc_not_learned', async () => {
    const ctx = await ready(win, [MC3.id, MC4.id, MC6.id]);
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const a = await win.game.temple.refreshTrial(ctx, {});
    expect([MC3.id, MC4.id]).toContain(a.data.mcId);
    expect((await restRow(win, ctx.restaurantId)).coin).toBe(1_000_000 - 20_000);
    const b = await win.game.temple.refreshTrial(ctx, { mcId: MC4.id });
    expect(b.data.mcId).toBe(MC4.id);
    expect(await goodsNum(win, ctx.restaurantId, 434)).toBe(1);
    for (const id of [lvl(5)[0]!.id, MC6.id])
      await expect(win.game.temple.refreshTrial(ctx, { mcId: id })).rejects.toMatchObject({
        params: { reason: 'mc_not_learned' },
      });
  });
});

describe('试炼（规格书 09 §9.4）', () => {
  it('成功：扣 1 万银币、主辅食材各 1、这道菜的食材各 1；主稀有辅不稀有 → 价值 +1、经验 +1；熟练度 +800 升到 3 级', async () => {
    const ctx = await ready(win);
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await win.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: COMMON });
    expect(r.data).toMatchObject({ success: true, addWorth: 1, addExp: 1, proficiency: 800, curlevel: 3 });
    expect(await mcRow(win, ctx.restaurantId, MC3.id)).toMatchObject({ trial_worth: 1, trial_exp: 1, curexp: 800, curlevel: 3 });
    expect((await restRow(win, ctx.restaurantId)).coin).toBe(1_000_000 - 10_000);
    for (const f of [RARE, COMMON, ...MC3.foods]) expect((await foodNum(win, ctx.restaurantId, f)).num).toBe(4);
    const c = await win.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'temple.trial')
      .executeTakeFirst();
    expect(c?.count).toBe(1);
  });

  it('价值 50、经验 150 到上限后不再加；主辅同一种时扣 2 个', async () => {
    const ctx = await ready(win);
    await win.db.updateTable('rest_mc').set({ trial_worth: 50, trial_exp: 150 }).where('rest_id', '=', ctx.restaurantId).execute();
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await win.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: RARE });
    expect(r.data).toMatchObject({ success: true, addWorth: 0, addExp: 0 });
    expect((await foodNum(win, ctx.restaurantId, RARE)).num).toBe(3);
  });

  it('失败：只扣花费，没有加成', async () => {
    const ctx = await ready(lose);
    await lose.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await lose.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: COMMON });
    expect(r.data).toMatchObject({ success: false, addWorth: 0, addExp: 0, proficiency: 0 });
    expect(await mcRow(lose, ctx.restaurantId, MC3.id)).toMatchObject({ trial_worth: 0, trial_exp: 0, curexp: 0 });
  });

  it('勋章过期报 no_trial；对象后来被遗忘报 mc_not_learned，什么都不扣（Review Focus 5）', async () => {
    const ctx = await ready(t);
    await t.game.temple.prepareTrial(ctx, { way: 2 });
    await t.db.deleteFrom('rest_mc').where('rest_id', '=', ctx.restaurantId).execute();
    await expect(t.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: COMMON })).rejects.toMatchObject({
      params: { reason: 'mc_not_learned' },
    });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000);
    const ctx2 = await ready(t);
    await t.game.temple.prepareTrial(ctx2, { way: 2 });
    t.clock.advance(2 * 3600_000);
    await expect(t.game.temple.startTrial(ctx2, { mainFoodsId: RARE, subFoodsId: COMMON })).rejects.toMatchObject({
      params: { reason: 'no_trial' },
    });
  });

  it('不认识的食材报 VALIDATION_FAILED bad_food', async () => {
    const ctx = await ready(t);
    await t.game.temple.prepareTrial(ctx, { way: 2 });
    await expect(t.game.temple.startTrial(ctx, { mainFoodsId: 999999, subFoodsId: COMMON })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'bad_food' },
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple/trial.test.ts`
Expected: FAIL（`prepareTrial is not a function`）

- [ ] **Step 3: 实现**

`apps/server/src/modules/temple/trial.ts`：

```ts
import { GOODS } from '@dt/config';
import { buildPool, pickWeighted, type TrialResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { restGear } from '../equip/power';
import { addProficiency } from '../mysterious/rules';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { badInput, learnedUpTo } from './common';
import { foodsTrial, trialBase, trialGainCaps } from './rules';

const ready = async (o: Op) =>
  (await hasValidHonor(o, GOODS.creativePotion)) || (await hasValidHonor(o, GOODS.meditation));

function assertStar(o: Op): void {
  if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
}

async function saveTarget(o: Op, mcId: number, way: number): Promise<void> {
  await o.tx
    .insertInto('rest_trial')
    .values({ rest_id: o.rest.id, mc_id: mcId, way, prepared_at: o.now })
    .onConflict((oc) => oc.column('rest_id').doUpdateSet({ mc_id: mcId, way, prepared_at: o.now }))
    .execute();
}

/** 准备试炼：注射（25 万银币）或冥想（免费），抽一道已学的 ≤5 级菜（设计文档 裁定 1、7） */
export async function prepareTrial(o: Op, b: { way: 1 | 2 }): Promise<{ mcId: number }> {
  assertStar(o);
  if (await ready(o)) throw invalidState('trial_ready');
  const learned = await learnedUpTo(o, 5);
  if (learned.length === 0) throw requirement('mc_count', { need: 1 });
  if (b.way === 1) spendCoin(o, o.tuning.temple.injectCoin);
  await grantGoodsOp(o, b.way === 1 ? GOODS.creativePotion : GOODS.meditation, 1);
  const mc = pickWeighted(
    buildPool(learned, (m) => m.odds),
    o.rng,
  );
  await saveTarget(o, mc.id, b.way);
  return { mcId: mc.id };
}

/** 换对象：不指定时花银币重抽；指定时花 1 条触手 */
export async function refreshTrial(o: Op, b: { mcId?: number }): Promise<{ mcId: number }> {
  assertStar(o);
  const row = await o.tx.selectFrom('rest_trial').selectAll().where('rest_id', '=', o.rest.id).executeTakeFirst();
  if (!row) throw invalidState('no_trial');
  const learned = await learnedUpTo(o, 5);
  let mcId: number;
  if (b.mcId !== undefined) {
    if (!learned.some((m) => m.id === b.mcId)) throw invalidState('mc_not_learned');
    await consumeGoods(o, GOODS.tentacle, 1);
    mcId = b.mcId;
  } else {
    if (learned.length === 0) throw requirement('mc_count', { need: 1 });
    spendCoin(o, o.tuning.temple.refreshCoin);
    mcId = pickWeighted(
      buildPool(learned, (m) => m.odds),
      o.rng,
    ).id;
  }
  await saveTarget(o, mcId, row.way);
  return { mcId };
}

/** 试炼（规格书 09 §9.4） */
export async function startTrial(
  o: Op,
  b: { mainFoodsId: number; subFoodsId: number },
): Promise<TrialResultDto> {
  const t = o.tuning.temple;
  assertStar(o);
  const row = await o.tx.selectFrom('rest_trial').selectAll().where('rest_id', '=', o.rest.id).executeTakeFirst();
  if (!row || !(await ready(o))) throw invalidState('no_trial');
  const mcRow = await o.tx
    .selectFrom('rest_mc')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('mc_id', '=', row.mc_id)
    .executeTakeFirst();
  if (!mcRow) throw invalidState('mc_not_learned');
  const mc = o.config.requireMc(row.mc_id);
  const main = o.config.foods.get(b.mainFoodsId);
  const sub = o.config.foods.get(b.subFoodsId);
  if (!main || !sub) throw badInput('bad_food');

  spendCoin(o, t.trialCoin);
  if (main.id === sub.id) await subFoods(o, main.id, 2);
  else {
    await subFoods(o, main.id, 1);
    await subFoods(o, sub.id, 1);
  }
  for (const f of mc.foods) await subFoods(o, f, 1);

  const agg = await opAgg(o);
  const { rate: luck } = await opLuck(o);
  const gear = await restGear(o.tx, o.rest, o.config.suits);
  const base = trialBase(gear.total.creatives + (agg.creatives ?? 0), t) + foodsTrial(mc.level, main, sub);
  const roll = o.rng.next();
  const success = roll < base + luck / 5;
  let addWorth = 0;
  let addExp = 0;
  let proficiency = 0;
  let curlevel = mcRow.curlevel;
  if (success) {
    const { n, m } = trialGainCaps(main.odds < t.rareOdds, sub.odds < t.rareOdds);
    const worth = n > 0 ? Math.min(t.trialWorthMax, mcRow.trial_worth + o.rng.intMin1(n)) : mcRow.trial_worth;
    const exp = Math.min(t.trialExpMax, mcRow.trial_exp + o.rng.intMin1(m));
    addWorth = worth - mcRow.trial_worth;
    addExp = exp - mcRow.trial_exp;
    proficiency = t.trialProficiencyPerLevel * mcRow.curlevel;
    const prof = addProficiency(mcRow.curlevel, mcRow.curexp, proficiency, o.config.mcProficiency);
    curlevel = prof.curlevel;
    await o.tx
      .updateTable('rest_mc')
      .set({ trial_worth: worth, trial_exp: exp, curlevel: prof.curlevel, curexp: prof.curexp })
      .where('rest_id', '=', o.rest.id)
      .where('mc_id', '=', mc.id)
      .execute();
  }
  restLog(o, 'temple.trial', { mcId: mc.id, success, worth: addWorth, exp: addExp });
  await emitAction(o, 'temple.trial');
  return { success, lucky: success && roll >= base, addWorth, addExp, proficiency, curlevel };
}
```

`service.ts`：import `prepareTrial, refreshTrial, startTrial`（`./trial`）；返回对象加：

```ts
    prepareTrial(ctx: RestCtx, b: { way: 1 | 2 }) {
      return op(ctx, 'temple.trial.prepare', (o) => prepareTrial(o, b));
    },
    refreshTrial(ctx: RestCtx, b: { mcId?: number }) {
      return op(ctx, 'temple.trial.refresh', (o) => refreshTrial(o, b));
    },
    startTrial(ctx: RestCtx, b: { mainFoodsId: number; subFoodsId: number }) {
      return op(ctx, 'temple.trial', (o) => startTrial(o, b));
    },
```

`routes.ts`：import `trialPrepareBody, trialRefreshBody, trialStartBody`；加：

```ts
    r.post('/temple/trial/prepare', async (req) =>
      okOp(await svc.prepareTrial(restCtxOf(req), parse(trialPrepareBody, req.body))),
    );
    r.post('/temple/trial/refresh', async (req) =>
      okOp(await svc.refreshTrial(restCtxOf(req), parse(trialRefreshBody, req.body ?? {}))),
    );
    r.post('/temple/trial/start', async (req) =>
      okOp(await svc.startTrial(restCtxOf(req), parse(trialStartBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple`
Expected: PASS

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server
git commit -m "feat(temple): trials with injection or meditation, target from learned dishes, refresh by silver or tentacle, worth and exp gains with caps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 克拉肯和触手商店

**Files:**
- Create: `apps/server/src/modules/temple/kraken.ts`、`apps/server/src/modules/temple/kraken.test.ts`
- Modify: `apps/server/src/modules/temple/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 3 的 `krakenTarget`、`inFeedHours`、`relationOf`、`krakenFavor`、`seedCount`、`pickSeeds`、`pickShopSlots`；Task 4 的 `addSeeds`、`badInput`、`krakenPool`；4A 的 `currentCook`、`consumeSpecial`（`mysterious/cook.ts`）、`addRemnant`（`mysterious/remnant.ts`）
- Produces: `feedKraken(o, pool, { num }): Promise<KrakenFeedDto>`、`tentacleShop(o): Promise<TentacleShopDto>`、`refreshTentacleShop(o): Promise<TentacleShopDto>`、`exchangeTentacle(o, { slot }): Promise<TentacleShopDto>`；服务方法 `feedKraken`、`tentacleShop`、`refreshTentacle`、`exchangeTentacle`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/temple/kraken.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPool, gameDay, gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { krakenTarget } from './rules';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0 */
let win: TestGame;
const day = gameDay(new Date());
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  for (const g of [t, win]) g.clock.set(gameTime(day, 12));
});
afterAll(async () => {
  await t.close();
  await win.close();
});

const pool = buildPool(
  config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= 1 && m.level <= 5),
  (m) => m.odds,
);
async function serve(g: TestGame, ctx: RestCtx, mcId: number, left: number, price: number, grade = 3) {
  const mc = config.requireMc(mcId);
  const c = await g.db
    .insertInto('mc_cook')
    .values({
      rest_id: ctx.restaurantId,
      shard_id: ctx.shardId,
      mc_id: mcId,
      level: mc.level,
      grade,
      cook_num: 1,
      total_num: left,
      left_num: left,
      price,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await g.db.updateTable('restaurant').set({ mc_cook_id: c.id }).where('id', '=', ctx.restaurantId).execute();
  return c.id;
}
const cookLeft = async (g: TestGame, id: number) =>
  (await g.db.selectFrom('mc_cook').select(['left_num', 'ended_at']).where('id', '=', id).executeTakeFirstOrThrow());
const seedsOf = async (g: TestGame, restId: number) =>
  (await g.db.selectFrom('rest_seed').select('num').where('rest_id', '=', restId).execute()).reduce(
    (n, r) => n + r.num,
    0,
  );

describe('克拉肯（规格书 09 §9.5）', () => {
  it('喂它想吃的菜：好感度、种子进库存、扣份数不结束批次；每天一次', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 } });
    const target = krakenTarget(pool, ctx.shardId, day);
    const cookId = await serve(win, ctx, target.id, 20, 50);
    const r = await win.game.temple.feedKraken(ctx, { num: 10 });
    expect(r.data).toMatchObject({ relation: 'same', krabCoin: 0, tentacle: false, punish: null });
    expect(r.data.favor).toBeGreaterThanOrEqual(1);
    expect(await seedsOf(win, ctx.restaurantId)).toBe(r.data.seeds.reduce((n, s) => n + s.num, 0));
    expect(await cookLeft(win, cookId)).toMatchObject({ left_num: 10, ended_at: null });
    await expect(win.game.temple.feedKraken(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'fed_today' },
    });
    const c = await win.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'kraken.feed')
      .executeTakeFirst();
    expect(c?.count).toBe(1);
  });

  it('不在投喂时段报 not_feed_time；没有在售报 no_cooking；份数等于剩余报 portions，什么都不变（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    await expect(t.game.temple.feedKraken(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'no_cooking' },
    });
    const cookId = await serve(t, ctx, 1, 5, 50);
    await expect(t.game.temple.feedKraken(ctx, { num: 5 })).rejects.toMatchObject({
      params: { reason: 'portions' },
    });
    expect((await cookLeft(t, cookId)).left_num).toBe(5);
    expect(await t.db.selectFrom('kraken_feed').selectAll().where('rest_id', '=', ctx.restaurantId).execute()).toEqual([]);
    t.clock.set(gameTime(day, 15));
    await expect(t.game.temple.feedKraken(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_feed_time' },
    });
    t.clock.set(gameTime(day, 12));
  });

  it('负好感度：先扣这道菜的试炼经验', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 } });
    const target = krakenTarget(pool, ctx.shardId, day);
    const other = config.bundle.mysteriousCookbooks.find((m) => m.level <= 5 && m.road !== target.road)!;
    await win.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: other.id, way: 1, trial_exp: 5 }).execute();
    await serve(win, ctx, other.id, 200, 100, 1);
    const r = await win.game.temple.feedKraken(ctx, { num: 100 });
    expect(r.data).toMatchObject({ relation: 'other', favor: -1, punish: { kind: 'exp', value: 1 } });
    const m = await win.db.selectFrom('rest_mc').select('trial_exp').where('rest_id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
    expect(m.trial_exp).toBe(4);
  });

  it('负好感度且没有试炼加成：25% 遗忘（随机数 0 必中）；这道菜已不在时跳过惩罚（Review Focus 4）', async () => {
    const a = await newRestaurant(win, { patch: { star_level: 1 } });
    const target = krakenTarget(pool, a.shardId, day);
    const other = config.bundle.mysteriousCookbooks.find((m) => m.level <= 5 && m.road !== target.road)!;
    await win.db.insertInto('rest_mc').values({ rest_id: a.restaurantId, mc_id: other.id, way: 1 }).execute();
    await serve(win, a, other.id, 200, 100, 1);
    const r = await win.game.temple.feedKraken(a, { num: 100 });
    expect(r.data.punish).toEqual({ kind: 'forget', value: 0 });
    expect(await win.db.selectFrom('rest_mc').selectAll().where('rest_id', '=', a.restaurantId).execute()).toEqual([]);
    const logs = await win.db.selectFrom('rest_log').select('type').where('rest_id', '=', a.restaurantId).execute();
    expect(logs.map((l) => l.type)).toContain('kraken.forget');

    const b = await newRestaurant(win, { patch: { star_level: 1 } });
    const target2 = krakenTarget(pool, b.shardId, day);
    const other2 = config.bundle.mysteriousCookbooks.find((m) => m.level <= 5 && m.road !== target2.road)!;
    await serve(win, b, other2.id, 200, 100, 1);
    const r2 = await win.game.temple.feedKraken(b, { num: 100 });
    expect(r2.data.punish).toBeNull();
  });
});

describe('触手商店（规格书 09 §9.5）', () => {
  it('当天固定 6 格；首次刷新免费、之后每次 1 条触手；兑换扣等级数的触手得残卷；同格不能换两次', async () => {
    const ctx = await newRestaurant(t, { goods: { 434: 20 } });
    const s1 = await t.game.temple.tentacleShop(ctx);
    expect(s1.data.slots).toHaveLength(6);
    expect(s1.data).toMatchObject({ refreshes: 0, refreshCost: 0, tentacles: 20 });
    expect((await t.game.temple.tentacleShop(ctx)).data.slots).toEqual(s1.data.slots);
    await t.game.temple.refreshTentacle(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 434)).toBe(20);
    const s3 = await t.game.temple.refreshTentacle(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 434)).toBe(19);
    expect(s3.data).toMatchObject({ refreshes: 2, refreshCost: 1 });
    const mc = config.requireMc(s3.data.slots[0]!.mcId);
    const r = await t.game.temple.exchangeTentacle(ctx, { slot: 0 });
    expect(r.data.slots[0]!.bought).toBe(true);
    expect(await goodsNum(t, ctx.restaurantId, 434)).toBe(19 - mc.level);
    const rem = await t.db
      .selectFrom('mc_remnant')
      .select('num')
      .where('rest_id', '=', ctx.restaurantId)
      .where('mc_id', '=', mc.id)
      .executeTakeFirst();
    expect(rem?.num).toBe(1);
    await expect(t.game.temple.exchangeTentacle(ctx, { slot: 0 })).rejects.toMatchObject({
      params: { reason: 'slot_bought' },
    });
    await expect(t.game.temple.exchangeTentacle(ctx, { slot: 9 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'bad_slot' },
    });
  });

  it('不含 id 249', async () => {
    const ctx = await newRestaurant(t, { goods: { 434: 50 } });
    for (let i = 0; i < 5; i++) {
      const s = await t.game.temple.refreshTentacle(ctx);
      expect(s.data.slots.some((x) => x.mcId === 249)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple/kraken.test.ts`
Expected: FAIL（`feedKraken is not a function`）

- [ ] **Step 3: 实现**

`apps/server/src/modules/temple/kraken.ts`：

```ts
import { GOODS, type MysteriousCookbook } from '@dt/config';
import {
  buildPool,
  gameDay,
  gameParts,
  type KrakenFeedDto,
  type TentacleShopDto,
  type WeightedPool,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import type { TentacleSlot } from '../../db/schema';
import { consumeSpecial, currentCook } from '../mysterious/cook';
import { addRemnant } from '../mysterious/remnant';
import { consumeGoods, countGoods, grantGoodsOp } from '../store/goods';
import { addSeeds, badInput } from './common';
import {
  inFeedHours,
  krakenFavor,
  krakenTarget,
  pickSeeds,
  pickShopSlots,
  relationOf,
  seedCount,
  type TempleTuning,
} from './rules';

/** 负好感度惩罚：扣试炼经验 → 扣试炼价值 → 概率遗忘（设计文档 裁定 10）；这道菜已不在则跳过 */
async function punish(o: Op, mcId: number, t: TempleTuning): Promise<KrakenFeedDto['punish']> {
  const row = await o.tx
    .selectFrom('rest_mc')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('mc_id', '=', mcId)
    .executeTakeFirst();
  if (!row) return null;
  const sub = o.rng.intMin1(3);
  if (row.trial_exp > 0) {
    await o.tx
      .updateTable('rest_mc')
      .set({ trial_exp: Math.max(0, row.trial_exp - sub) })
      .where('rest_id', '=', o.rest.id)
      .where('mc_id', '=', mcId)
      .execute();
    return { kind: 'exp', value: Math.min(sub, row.trial_exp) };
  }
  if (row.trial_worth > 0) {
    await o.tx
      .updateTable('rest_mc')
      .set({ trial_worth: Math.max(0, row.trial_worth - sub) })
      .where('rest_id', '=', o.rest.id)
      .where('mc_id', '=', mcId)
      .execute();
    return { kind: 'worth', value: Math.min(sub, row.trial_worth) };
  }
  if (o.rng.chance(t.forgetRate)) {
    await o.tx.deleteFrom('rest_mc').where('rest_id', '=', o.rest.id).where('mc_id', '=', mcId).execute();
    restLog(o, 'kraken.forget', { mcId });
    return { kind: 'forget', value: 0 };
  }
  return null;
}

/** 投喂克拉肯（规格书 09 §9.5，设计文档 §3.4） */
export async function feedKraken(
  o: Op,
  pool: WeightedPool<MysteriousCookbook>,
  b: { num: number },
): Promise<KrakenFeedDto> {
  const t = o.tuning.temple;
  if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
  if (!inFeedHours(gameParts(o.now).hour, t.krakenHours)) throw invalidState('not_feed_time');
  const day = gameDay(o.now);
  const fed = await o.tx
    .selectFrom('kraken_feed')
    .select('id')
    .where('rest_id', '=', o.rest.id)
    .where('day', '=', day)
    .executeTakeFirst();
  if (fed) throw invalidState('fed_today');
  const cook = await currentCook(o);
  if (!cook) throw invalidState('no_cooking');
  if (cook.left_num <= b.num) throw invalidState('portions', { left: cook.left_num });

  const target = krakenTarget(pool, o.shardId, day);
  const mc = o.config.requireMc(cook.mc_id);
  const relation = relationOf(mc, target);
  const { rate: luck } = await opLuck(o);
  const { favor } = krakenFavor(
    { num: b.num, level: mc.level, price: cook.price, grade: cook.grade, relation, luckRate: luck },
    t,
    o.rng,
  );
  await consumeSpecial(o, cook.id, b.num, 'sold');
  const n = seedCount(favor);
  const seeds = pickSeeds(o.config.seedPool, n, o.rng);
  for (const [id, k] of seeds) await addSeeds(o, id, k);
  let krabCoin = 0;
  if (n > 5 && o.rng.chance(t.krabCoinRate + luck / 5)) {
    krabCoin = o.rng.intMin1(Math.floor(n / 4));
    await grantGoodsOp(o, GOODS.krabCoin, krabCoin);
  }
  const penalty = favor < 0 ? await punish(o, mc.id, t) : null;
  const tentacle = favor > t.tentacleFavor && o.rng.chance(t.tentacleRate);
  if (tentacle) await grantGoodsOp(o, GOODS.tentacle, 1);
  await o.tx
    .insertInto('kraken_feed')
    .values({
      rest_id: o.rest.id,
      shard_id: o.shardId,
      day,
      mc_id: mc.id,
      target_mc_id: target.id,
      num: b.num,
      favor,
      created_at: o.now,
    })
    .execute();
  await emitAction(o, 'kraken.feed');
  return {
    relation,
    favor,
    seeds: [...seeds].map(([seedId, num]) => ({ seedId, num })),
    krabCoin,
    tentacle,
    punish: penalty,
  };
}

function shopPool(o: Op): WeightedPool<MysteriousCookbook> {
  const skip = new Set(o.tuning.temple.shopExclude);
  return buildPool(
    o.config.bundle.mysteriousCookbooks.filter((m) => !skip.has(m.id)),
    (m) => m.odds,
  );
}

/** 当天的触手商店；第一次打开时生成（设计文档 裁定 12） */
async function shopRow(o: Op): Promise<{ day: string; refreshes: number; slots: TentacleSlot[] }> {
  const day = gameDay(o.now);
  const row = await o.tx
    .selectFrom('tentacle_shop')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('day', '=', day)
    .executeTakeFirst();
  if (row) return { day, refreshes: row.refreshes, slots: row.slots };
  const slots = pickShopSlots(shopPool(o), o.tuning.temple.shopSlots, o.rng).map((mcId) => ({ mcId, bought: false }));
  await o.tx
    .insertInto('tentacle_shop')
    .values({ rest_id: o.rest.id, day, slots: JSON.stringify(slots) })
    .execute();
  return { day, refreshes: 0, slots };
}

async function shopDto(o: Op, r: { refreshes: number; slots: TentacleSlot[] }): Promise<TentacleShopDto> {
  return {
    slots: r.slots,
    refreshes: r.refreshes,
    refreshCost: r.refreshes === 0 ? 0 : 1,
    tentacles: await countGoods(o, GOODS.tentacle),
  };
}

async function saveShop(o: Op, day: string, refreshes: number, slots: TentacleSlot[]): Promise<void> {
  await o.tx
    .updateTable('tentacle_shop')
    .set({ refreshes, slots: JSON.stringify(slots) })
    .where('rest_id', '=', o.rest.id)
    .where('day', '=', day)
    .execute();
}

export async function tentacleShop(o: Op): Promise<TentacleShopDto> {
  return shopDto(o, await shopRow(o));
}

export async function refreshTentacleShop(o: Op): Promise<TentacleShopDto> {
  const r = await shopRow(o);
  if (r.refreshes > 0) await consumeGoods(o, GOODS.tentacle, 1);
  const slots = pickShopSlots(shopPool(o), o.tuning.temple.shopSlots, o.rng).map((mcId) => ({ mcId, bought: false }));
  await saveShop(o, r.day, r.refreshes + 1, slots);
  return shopDto(o, { refreshes: r.refreshes + 1, slots });
}

export async function exchangeTentacle(o: Op, b: { slot: number }): Promise<TentacleShopDto> {
  const r = await shopRow(o);
  const s = r.slots[b.slot];
  if (!s) throw badInput('bad_slot');
  if (s.bought) throw invalidState('slot_bought');
  const mc = o.config.requireMc(s.mcId);
  await consumeGoods(o, GOODS.tentacle, mc.level);
  await addRemnant(o, mc.id, 1);
  const slots = r.slots.map((x, i) => (i === b.slot ? { ...x, bought: true } : x));
  await saveShop(o, r.day, r.refreshes, slots);
  return shopDto(o, { refreshes: r.refreshes, slots });
}
```

`service.ts`：import `exchangeTentacle, feedKraken, refreshTentacleShop, tentacleShop`（`./kraken`）；返回对象加：

```ts
    feedKraken(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'kraken.feed', (o) => feedKraken(o, krakenPool, b));
    },
    /** 第一次打开要生成当天的格子（写库），所以也走 runOp（计划裁定 3） */
    tentacleShop(ctx: RestCtx) {
      return op(ctx, 'tentacle.view', (o) => tentacleShop(o));
    },
    refreshTentacle(ctx: RestCtx) {
      return op(ctx, 'tentacle.refresh', (o) => refreshTentacleShop(o));
    },
    exchangeTentacle(ctx: RestCtx, b: { slot: number }) {
      return op(ctx, 'tentacle.exchange', (o) => exchangeTentacle(o, b));
    },
```

`routes.ts`：import `krakenFeedBody, tentacleExchangeBody`；加：

```ts
    r.post('/temple/kraken/feed', async (req) =>
      okOp(await svc.feedKraken(restCtxOf(req), parse(krakenFeedBody, req.body))),
    );
    r.get('/temple/tentacle', async (req) => ok((await svc.tentacleShop(restCtxOf(req))).data));
    r.post('/temple/tentacle/refresh', async (req) => okOp(await svc.refreshTentacle(restCtxOf(req))));
    r.post('/temple/tentacle/exchange', async (req) =>
      okOp(await svc.exchangeTentacle(restCtxOf(req), parse(tentacleExchangeBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/temple`
Expected: PASS

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server
git commit -m "feat(temple): kraken feeding with favor, seeds, krab coins, tentacles and penalties; daily tentacle shop with refresh and exchange

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 前端——接口、文案、神殿标签页壳、守护兽和探险面板

**Files:**
- Move: `apps/web/src/views/TempleView.vue` → `apps/web/src/components/temple/AppraisePanel.vue`；`apps/web/src/views/TempleView.test.ts` → `apps/web/src/components/temple/AppraisePanel.test.ts`
- Create: `apps/web/src/views/TempleView.vue`、`TempleView.test.ts`（新的标签页壳）
- Create: `apps/web/src/components/temple/testData.ts`、`GuardianPanel.vue`、`GuardianPanel.test.ts`、`ExplorePanel.vue`、`ExplorePanel.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`、`apps/web/src/i18n/zh-CN.ts`、`apps/web/src/stores/catalog.ts`、`apps/web/src/utils/events.ts`、`apps/web/src/utils/events.test.ts`

**Interfaces:**
- Consumes: Task 4~7 的 DTO 和接口路径
- Produces:
  - `endpoints.temple()`、`templeMissile(goodsId, num)`、`templeExplore(goodsId, times)`、`trialPrepare(way)`、`trialRefresh(mcId?)`、`trialStart(mainFoodsId, subFoodsId)`、`krakenFeed(num)`、`tentacleShop()`、`tentacleRefresh()`、`tentacleExchange(slot)`
  - 目录 store：`seedsMap`、`seedName(id)`
  - 面板约定：`props: { data: TempleDto }`，操作成功后 `emit('reload')`；壳组件据此重新拉 `endpoints.temple()`

- [ ] **Step 1: 挪动鉴定页**

```bash
mkdir -p apps/web/src/components/temple
git mv apps/web/src/views/TempleView.vue apps/web/src/components/temple/AppraisePanel.vue
git mv apps/web/src/views/TempleView.test.ts apps/web/src/components/temple/AppraisePanel.test.ts
```

然后改这两个文件：
- `AppraisePanel.vue`：import 路径 `'../api/endpoints'` → `'../../api/endpoints'`，`'../i18n/zh-CN'` → `'../../i18n/zh-CN'`，`'../stores/...'` → `'../../stores/...'`；模板里删掉 `<h5>神殿</h5>` 这一行，删掉底部 `<p class="small text-muted mt-3">守护兽、探险、试炼和克拉肯稍后开放。</p>`
- `AppraisePanel.test.ts`：`import TempleView from './TempleView.vue';` → `import AppraisePanel from './AppraisePanel.vue';`；`'../api/endpoints'` → `'../../api/endpoints'`（`vi.mock` 和 import 两处）；`'../stores/...'` → `'../../stores/...'`；所有 `mount(TempleView)` → `mount(AppraisePanel)`；`describe('TempleView'` → `describe('AppraisePanel'`

Run: `pnpm --filter @dt/web exec vitest run src/components/temple/AppraisePanel.test.ts`
Expected: PASS（纯挪动，原有 3 个用例照过）

- [ ] **Step 2: 写失败测试**

`apps/web/src/utils/events.test.ts` 追加：

```ts
describe('神殿（子项目 4B-1）', () => {
  const names = {
    goodsName: () => '道具',
    foodName: (id: number) => `食材${id}`,
    mcName: (id: number) => `秘·${id}`,
    seedName: (id: number) => `种子${id}`,
  };
  const at = '2026-09-30T00:00:00Z';
  it('种子事件和流水显示种子名', () => {
    expect(eventText({ type: 'gain', kind: 'seed', id: 5, num: 3 }, names)).toBe('获得 种子5×3');
    expect(recordLabel({ kind: 'seed', itemId: 5 }, names)).toBe('种子5');
  });
  it('试炼、克拉肯遗忘的日志', () => {
    expect(logText({ type: 'temple.trial', params: { mcId: 3, success: true, worth: 1, exp: 2 }, at } as never, names)).toBe(
      '「秘·3」试炼成功：试炼价值 +1%、试炼经验 +2%',
    );
    expect(logText({ type: 'temple.trial', params: { mcId: 3, success: false }, at } as never, names)).toBe(
      '「秘·3」试炼失败',
    );
    expect(logText({ type: 'kraken.forget', params: { mcId: 3 }, at } as never, names)).toBe(
      '克拉肯很不满意，你遗忘了特色菜「秘·3」',
    );
  });
});
```

`apps/web/src/views/TempleView.test.ts`（新的壳）：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import TempleView from './TempleView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { temple: vi.fn() } }));

const stubs = {
  AppraisePanel: { template: '<p>appraise-panel</p>' },
  GuardianPanel: { template: '<p>guardian-panel</p>', props: ['data'] },
  ExplorePanel: { template: '<p>explore-panel</p>', props: ['data'] },
  TrialPanel: { template: '<p>trial-panel</p>', props: ['data'] },
  KrakenPanel: { template: '<p>kraken-panel</p>', props: ['data'] },
};

describe('TempleView（标签页）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.temple).mockResolvedValue({} as never);
  });

  it('默认是鉴定；切到守护兽时读神殿数据；记住上次的标签', async () => {
    const w = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain('appraise-panel');
    expect(endpoints.temple).not.toHaveBeenCalled();
    await w.find('[data-testid="tab-guardian"]').trigger('click');
    await flushPromises();
    expect(endpoints.temple).toHaveBeenCalled();
    expect(w.text()).toContain('guardian-panel');
    const w2 = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(w2.text()).toContain('guardian-panel');
  });
});
```

`apps/web/src/components/temple/testData.ts`（面板测试共用的神殿数据；不是测试文件，免得被别的测试 import 时重复执行用例）：

```ts
import type { TempleDto } from '@dt/shared';

export const templeData = (patch: Partial<TempleDto> = {}): TempleDto => ({
  star: 1,
  strength: 5,
  guardian: { hpMax: 15000, hpLeft: 12000, killed: false },
  missiles: [
    { goodsId: 17, num: 3 },
    { goodsId: 18, num: 0 },
  ],
  maps: [{ goodsId: 170, num: 10, needStrength: 2 }],
  trial: { mcId: null, readyMinutes: 0, creatives: 0 },
  kraken: { targetMcId: 1, fed: false, feedable: true, hours: [[11, 14]], current: null },
  seeds: [],
  tentacles: 0,
  ...patch,
});
```

`apps/web/src/components/temple/GuardianPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import GuardianPanel from './GuardianPanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { templeMissile: vi.fn() } }));


describe('GuardianPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.templeMissile).mockResolvedValue({
      shots: [
        { hit: true, crit: true, damage: 10000, killed: false },
        { hit: false, crit: false, damage: 0, killed: false },
      ],
      hpMax: 15000,
      hpLeft: 2000,
      killed: false,
      drops: { tickets: 1, maps: 0, seals: 0, dtTickets: 3, rare: null, foods: [] },
    });
  });

  it('显示血量；发射数量不超过持有；结果逐枚列出并通知刷新', async () => {
    const w = mount(GuardianPanel, { props: { data: templeData() } });
    expect(w.find('[data-testid="hp"]').text()).toContain('12,000 / 15,000');
    await w.find('[data-testid="num"]').setValue('9');
    await w.find('[data-testid="fire"]').trigger('click');
    await flushPromises();
    expect(endpoints.templeMissile).toHaveBeenCalledWith(17, 3);
    const shots = w.find('[data-testid="shots"]').text();
    expect(shots).toContain('暴击');
    expect(shots).toContain('没打中');
    expect(w.emitted('reload')).toBeTruthy();
  });

  it('今天已击败：按钮灰掉并写明原因', () => {
    const w = mount(GuardianPanel, {
      props: { data: templeData({ guardian: { hpMax: 15000, hpLeft: 0, killed: true } }) },
    });
    expect(w.find('[data-testid="fire"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('明天再来');
  });
});
```

`apps/web/src/components/temple/ExplorePanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ExplorePanel from './ExplorePanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { templeExplore: vi.fn(), templeMissile: vi.fn() } }));

describe('ExplorePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.templeExplore).mockResolvedValue({ success: 1, fail: 1, rare: [], foods: [], exp: 0 });
  });

  it('次数不超过 持有 / 体力÷每次体力 / 99', async () => {
    const w = mount(ExplorePanel, { props: { data: templeData({ strength: 5 }) } });
    await w.find('[data-testid="times"]').setValue('9');
    await w.find('[data-testid="explore"]').trigger('click');
    await flushPromises();
    expect(endpoints.templeExplore).toHaveBeenCalledWith(170, 2);
    expect(w.find('[data-testid="explore-result"]').text()).toContain('迷路 1 次');
  });

  it('体力不够：按钮灰掉并写明原因', () => {
    const w = mount(ExplorePanel, { props: { data: templeData({ strength: 1 }) } });
    expect(w.find('[data-testid="explore"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('体力不够');
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/views/TempleView.test.ts src/components/temple src/utils/events.test.ts`
Expected: FAIL（面板组件不存在、`seed` 文案未实现）

- [ ] **Step 4: 接口、目录、文案**

`apps/web/src/api/endpoints.ts`：类型 import 加 `ExploreResultDto, KrakenFeedDto, MissileResultDto, TempleDto, TentacleShopDto, TrialResultDto`；`endpoints` 末尾加：

```ts
  temple: () => api.get<TempleDto>('/api/v1/temple'),
  templeMissile: (goodsId: number, num: number) =>
    api.post<MissileResultDto>('/api/v1/temple/missile', { goodsId, num }),
  templeExplore: (goodsId: number, times: number) =>
    api.post<ExploreResultDto>('/api/v1/temple/explore', { goodsId, times }),
  trialPrepare: (way: 1 | 2) => api.post<{ mcId: number }>('/api/v1/temple/trial/prepare', { way }),
  trialRefresh: (mcId?: number) =>
    api.post<{ mcId: number }>('/api/v1/temple/trial/refresh', mcId === undefined ? {} : { mcId }),
  trialStart: (mainFoodsId: number, subFoodsId: number) =>
    api.post<TrialResultDto>('/api/v1/temple/trial/start', { mainFoodsId, subFoodsId }),
  krakenFeed: (num: number) => api.post<KrakenFeedDto>('/api/v1/temple/kraken/feed', { num }),
  tentacleShop: () => api.get<TentacleShopDto>('/api/v1/temple/tentacle'),
  tentacleRefresh: () => api.post<TentacleShopDto>('/api/v1/temple/tentacle/refresh'),
  tentacleExchange: (slot: number) => api.post<TentacleShopDto>('/api/v1/temple/tentacle/exchange', { slot }),
```

`apps/web/src/stores/catalog.ts`：state 加 `seedsMap: new Map<number, { id: number; foodsId: number; level: number }>(),`；`apply` 里加 `this.seedsMap = new Map((c.seeds ?? []).map((s) => [s.id, s]));`；actions 加：

```ts
    seedName(id: number): string {
      const s = this.seedsMap.get(id);
      return s ? `${this.foodName(s.foodsId)}种子` : `种子${id}`;
    },
```

`apps/web/src/utils/events.ts`：
- `Names` 加 `seedName?(id: number): string;`；加 `const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? \`种子${id}\`;`
- `eventText` 在 `remnant` 那一支后加：`else if (e.kind === 'seed') what = \`${seedNameOf(names, e.id ?? 0)}×${formatNum(e.num)}\`;`
- `recordLabel` 在 `remnant` 那一行后加：`if (r.kind === 'seed') return seedNameOf(names, r.itemId ?? 0);`
- `LOGS` 加：

```ts
  'temple.trial': (p, names) =>
    p.success
      ? `「${mcNameOf(names, n(p, 'mcId'))}」试炼成功：试炼价值 +${n(p, 'worth')}%、试炼经验 +${n(p, 'exp')}%`
      : `「${mcNameOf(names, n(p, 'mcId'))}」试炼失败`,
  'kraken.forget': (p, names) => `克拉肯很不满意，你遗忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
```

`apps/web/src/i18n/zh-CN.ts` 的 `STATE` 加：

```ts
  guardian_down: '今天已经击败守护兽了，明天再来',
  trial_ready: '试炼勋章还有效，可以直接试炼',
  no_trial: '还没准备试炼（或准备已过期），先注射或冥想',
  not_feed_time: '现在不是投喂时间',
  fed_today: '今天已经投喂过克拉肯了',
  portions: '份数不够：投喂后在售的特色菜至少要留 1 份',
  slot_bought: '这一格已经兑换过了',
```

- [ ] **Step 5: 标签页壳和两个面板**

`apps/web/src/views/TempleView.vue`（新建，替换挪走的文件）：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { TempleDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AppraisePanel from '../components/temple/AppraisePanel.vue';
import ExplorePanel from '../components/temple/ExplorePanel.vue';
import GuardianPanel from '../components/temple/GuardianPanel.vue';
import KrakenPanel from '../components/temple/KrakenPanel.vue';
import TrialPanel from '../components/temple/TrialPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'appraise' | 'guardian' | 'explore' | 'trial' | 'kraken';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'appraise', label: '鉴定' },
  { key: 'guardian', label: '守护兽' },
  { key: 'explore', label: '探险' },
  { key: 'trial', label: '试炼' },
  { key: 'kraken', label: '克拉肯' },
];
const KEY = 'dt_temple_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((x) => x.key === v) ? (v as Tab) : 'appraise';
  } catch {
    return 'appraise';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<TempleDto | null>(null);

async function load() {
  if (tab.value === 'appraise') return;
  try {
    data.value = await endpoints.temple();
  } catch (e) {
    toast.push(errorMessage(e, '读取神殿失败'), 'danger');
  }
}
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
  void load();
});
onMounted(load);
</script>

<template>
  <h5>神殿</h5>
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x.key" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x.key }]"
        href="#"
        :data-testid="`tab-${x.key}`"
        @click.prevent="tab = x.key"
        >{{ x.label }}</a
      >
    </li>
  </ul>
  <AppraisePanel v-if="tab === 'appraise'" />
  <template v-else-if="data">
    <GuardianPanel v-if="tab === 'guardian'" :data="data" @reload="load" />
    <ExplorePanel v-else-if="tab === 'explore'" :data="data" @reload="load" />
    <TrialPanel v-else-if="tab === 'trial'" :data="data" @reload="load" />
    <KrakenPanel v-else :data="data" @reload="load" />
  </template>
</template>
```

`apps/web/src/components/temple/GuardianPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MissileResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const goodsId = ref<number>(
  props.data.missiles.find((m) => m.num > 0)?.goodsId ?? props.data.missiles[0]?.goodsId ?? 0,
);
const num = ref(1);
const busy = ref(false);
const result = ref<MissileResultDto | null>(null);

const held = computed(() => props.data.missiles.find((m) => m.goodsId === goodsId.value)?.num ?? 0);
const max = computed(() => Math.min(held.value, 99));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const g = computed(() => props.data.guardian);
const block = computed(() => {
  if (props.data.star < 1) return '1 星以后才能挑战守护兽';
  if (g.value.killed) return '今天已经击败守护兽了，明天再来';
  if (max.value < 1) return '没有这种飞弹（商店、黑市有售，守护兽暴击也可能掉）';
  return '';
});

async function fire() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeMissile(goodsId.value, n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '发射失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div data-testid="hp">
      守护兽 HP {{ formatNum(g.hpLeft) }} / {{ formatNum(g.hpMax) }}{{ g.killed ? '（已击败）' : '' }}
    </div>
    <div class="progress mb-2" style="height: 8px">
      <div class="progress-bar bg-danger" :style="{ width: `${(g.hpLeft / Math.max(1, g.hpMax)) * 100}%` }"></div>
    </div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="goodsId" class="form-select form-select-sm" data-testid="missile">
        <option v-for="m in data.missiles" :key="m.goodsId" :value="m.goodsId">
          {{ catalog.goodsName(m.goodsId) }}（{{ m.num }}）
        </option>
      </select>
      <input
        v-model.number="num"
        type="number"
        min="1"
        :max="Math.max(1, max)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="num"
      />
      <button class="btn btn-sm btn-danger text-nowrap" data-testid="fire" :disabled="busy || !!block" @click="fire">
        发射 ×{{ n }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <template v-if="result">
      <ol class="mb-1" data-testid="shots">
        <li v-for="(s, i) in result.shots" :key="i">
          {{
            !s.hit
              ? '没打中'
              : `伤害 ${formatNum(s.damage)}${s.crit ? '（暴击）' : ''}${s.killed ? '，击败了守护兽！' : ''}`
          }}
        </li>
      </ol>
      <div class="text-muted" data-testid="drops">
        掉落：神秘礼券 {{ result.drops.tickets }}、探险图 {{ result.drops.maps }}、厨神玉玺
        {{ result.drops.seals }}、美味券 {{ result.drops.dtTickets }}
        <span v-if="result.drops.foods.length > 0">
          ；食材
          {{ result.drops.foods.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join('、') }}
        </span>
      </div>
    </template>
  </div>
</template>
```

`apps/web/src/components/temple/ExplorePanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ExploreResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const goodsId = ref<number>(props.data.maps.find((m) => m.num > 0)?.goodsId ?? props.data.maps[0]?.goodsId ?? 0);
const times = ref(1);
const busy = ref(false);
const result = ref<ExploreResultDto | null>(null);

const map = computed(() => props.data.maps.find((m) => m.goodsId === goodsId.value));
const byStrength = computed(() => (map.value ? Math.floor(props.data.strength / map.value.needStrength) : 0));
const max = computed(() => Math.min(map.value?.num ?? 0, byStrength.value, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, max.value)));
const block = computed(() => {
  if ((map.value?.num ?? 0) < 1) return '没有这种探险图';
  if (byStrength.value < 1) return `体力不够（每次要 ${map.value!.needStrength}，现有 ${props.data.strength}）`;
  return '';
});
const list = (xs: Array<{ foodsId: number; num: number }>) =>
  xs.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join('、');

async function go() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeExplore(goodsId.value, n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '探险失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="goodsId" class="form-select form-select-sm" data-testid="map">
        <option v-for="m in data.maps" :key="m.goodsId" :value="m.goodsId">
          {{ catalog.goodsName(m.goodsId) }}（{{ m.num }}，每次体力 {{ m.needStrength }}）
        </option>
      </select>
      <input
        v-model.number="times"
        type="number"
        min="1"
        :max="Math.max(1, max)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="times"
      />
      <button class="btn btn-sm btn-primary text-nowrap" data-testid="explore" :disabled="busy || !!block" @click="go">
        探险 ×{{ n }}
      </button>
    </div>
    <div class="text-muted mb-1">体力 {{ data.strength }}</div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="result" data-testid="explore-result">
      成功 {{ result.success }} 次，迷路 {{ result.fail }} 次
      <div v-if="result.rare.length > 0" class="text-success">神秘食材：{{ list(result.rare) }}</div>
      <div v-if="result.foods.length > 0">食材：{{ list(result.foods) }}</div>
      <div v-if="result.exp > 0">煤油灯带来经验 {{ result.exp }}</div>
    </div>
  </div>
</template>
```

`TrialPanel.vue`、`KrakenPanel.vue` 在 Task 9 创建。为了让本任务的壳组件能编译，先各建一个占位（Task 9 整体替换）：

```vue
<script setup lang="ts">
import type { TempleDto } from '@dt/shared';
defineProps<{ data: TempleDto }>();
defineEmits<{ reload: [] }>();
</script>

<template>
  <div class="small text-muted">稍后开放</div>
</template>
```

分别存为 `apps/web/src/components/temple/TrialPanel.vue` 和 `KrakenPanel.vue`。

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/views/TempleView.test.ts src/components/temple src/utils/events.test.ts`
Expected: PASS

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/web
git commit -m "feat(web): temple tabs with appraisal moved into a panel, guardian beast and exploration panels, seed names and temple texts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 前端——试炼和克拉肯面板

**Files:**
- Modify（替换占位）: `apps/web/src/components/temple/TrialPanel.vue`、`KrakenPanel.vue`
- Create: `apps/web/src/components/temple/TrialPanel.test.ts`、`KrakenPanel.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `endpoints.trialPrepare / trialRefresh / trialStart / krakenFeed / tentacleShop / tentacleRefresh / tentacleExchange / cupboard / mc`、`templeData()`（`testData.ts`）、目录 `mcName / mc / food / foodName / seedName`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/temple/TrialPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import { templeData } from './testData';
import TrialPanel from './TrialPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    trialPrepare: vi.fn(),
    trialRefresh: vi.fn(),
    trialStart: vi.fn(),
    cupboard: vi.fn(),
    mc: vi.fn(),
    templeMissile: vi.fn(),
  },
}));

describe('TrialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 150, name: '稀有料', level: 5, odds: 70, coin: 1, type: 0 },
        { id: 423, name: '普通料', level: 5, odds: 100, coin: 1, type: 0 },
      ],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [{ id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 1, coin: 1, foods: [] }],
    } as never);
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [
        { foodsId: 150, num: 5, locked: false, streetNeed: 0 },
        { foodsId: 423, num: 5, locked: false, streetNeed: 0 },
      ],
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue({
      learned: [{ mcId: 3, curlevel: 1, levelName: '初学', curexp: 0, expNext: 200, trialWorth: 0, trialExp: 0, way: 1 }],
    } as never);
    vi.mocked(endpoints.trialPrepare).mockResolvedValue({ mcId: 3 });
    vi.mocked(endpoints.trialStart).mockResolvedValue({
      success: true,
      lucky: false,
      addWorth: 1,
      addExp: 2,
      proficiency: 800,
      curlevel: 3,
    });
  });

  it('没准备时显示注射和冥想；冥想调用 way 2', async () => {
    const w = mount(TrialPanel, { props: { data: templeData() } });
    await flushPromises();
    await w.find('[data-testid="trial-meditate"]').trigger('click');
    await flushPromises();
    expect(endpoints.trialPrepare).toHaveBeenCalledWith(2);
    expect(w.emitted('reload')).toBeTruthy();
  });

  it('准备好后选主辅食材开始试炼，显示预计成功率和结果', async () => {
    const w = mount(TrialPanel, {
      props: { data: templeData({ trial: { mcId: 3, readyMinutes: 30, creatives: 5 } }) },
    });
    await flushPromises();
    expect(w.text()).toContain('秘·凤凰展翅');
    await w.find('[data-testid="trial-main"]').setValue('150');
    await w.find('[data-testid="trial-sub"]').setValue('423');
    expect(w.find('[data-testid="trial-rate"]').text()).toContain('%');
    await w.find('[data-testid="trial-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.trialStart).toHaveBeenCalledWith(150, 423);
    expect(w.find('[data-testid="trial-result"]').text()).toContain('试炼价值 +1%');
  });
});
```

`apps/web/src/components/temple/KrakenPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import KrakenPanel from './KrakenPanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    krakenFeed: vi.fn(),
    tentacleShop: vi.fn(),
    tentacleRefresh: vi.fn(),
    tentacleExchange: vi.fn(),
    templeMissile: vi.fn(),
  },
}));

const shop = {
  slots: [
    { mcId: 1, bought: false },
    { mcId: 2, bought: true },
  ],
  refreshes: 0,
  refreshCost: 0,
  tentacles: 5,
};

describe('KrakenPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 1, coin: 1, foods: [] },
        { id: 2, name: '秘·凤凰趴窝', level: 4, road: 1, nutritive: 1, coin: 1, foods: [] },
      ],
    } as never);
    vi.mocked(endpoints.tentacleShop).mockResolvedValue(structuredClone(shop));
    vi.mocked(endpoints.tentacleExchange).mockResolvedValue(structuredClone(shop));
    vi.mocked(endpoints.krakenFeed).mockResolvedValue({
      relation: 'same',
      favor: 9,
      seeds: [{ seedId: 1, num: 5 }],
      krabCoin: 0,
      tentacle: false,
      punish: null,
    });
  });

  it('不在投喂时段：按钮灰掉并写明时段', async () => {
    const w = mount(KrakenPanel, {
      props: {
        data: templeData({
          kraken: {
            targetMcId: 1,
            fed: false,
            feedable: false,
            hours: [
              [11, 14],
              [17, 21],
            ],
            current: { mcId: 1, grade: 3, leftNum: 10, price: 40 },
          },
        }),
      },
    });
    await flushPromises();
    expect(w.find('[data-testid="kraken-feed"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('11~14 点');
  });

  it('投喂份数不超过 剩余 − 1；显示结果；触手商店兑换', async () => {
    const w = mount(KrakenPanel, {
      props: {
        data: templeData({
          kraken: { targetMcId: 1, fed: false, feedable: true, hours: [[11, 14]], current: { mcId: 1, grade: 3, leftNum: 10, price: 40 } },
        }),
      },
    });
    await flushPromises();
    await w.find('[data-testid="kraken-num"]').setValue('99');
    await w.find('[data-testid="kraken-feed"]').trigger('click');
    await flushPromises();
    expect(endpoints.krakenFeed).toHaveBeenCalledWith(9);
    expect(w.find('[data-testid="kraken-result"]').text()).toContain('好感度 9');
    expect(w.find('[data-testid="tentacle-1"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="tentacle-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.tentacleExchange).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/temple/TrialPanel.test.ts src/components/temple/KrakenPanel.test.ts`
Expected: FAIL（占位组件没有这些元素）

- [ ] **Step 3: 试炼面板**

`apps/web/src/components/temple/TrialPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CupboardFoodDto, McLearnedDto, TempleDto, TrialResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const foods = ref<CupboardFoodDto[]>([]);
const learned = ref<McLearnedDto[]>([]);
const main = ref<number | null>(null);
const sub = ref<number | null>(null);
const pick = ref<number | null>(null);
const busy = ref(false);
const result = ref<TrialResultDto | null>(null);
/** 稀有食材：odds < 100（规格书 09 §9.4） */
const RARE = 100;

onMounted(async () => {
  try {
    const [c, m] = await Promise.all([endpoints.cupboard(), endpoints.mc()]);
    foods.value = c.items.filter((x) => x.num > 0);
    learned.value = m.learned.filter((x) => (catalog.mc(x.mcId)?.level ?? 99) <= 5);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
});

const trial = computed(() => props.data.trial);
const dish = computed(() => (trial.value.mcId === null ? undefined : catalog.mc(trial.value.mcId)));
const foodLabel = (f: CupboardFoodDto) => {
  const d = catalog.food(f.foodsId);
  return `${catalog.foodName(f.foodsId)}（${d?.level ?? '?'} 级${d && d.odds < RARE ? '，稀有' : ''}）×${f.num}`;
};
/** 预计成功率（不含幸运），与服务端同一公式，以服务端为准 */
const rate = computed(() => {
  const a = main.value === null ? undefined : catalog.food(main.value);
  const b = sub.value === null ? undefined : catalog.food(sub.value);
  if (!a || !b || !dish.value) return null;
  const c = trial.value.creatives;
  const base = Math.min(0.6, 0.05 + Math.min(c, 150) / 750 + (c > 150 ? Math.sqrt(c - 150) / 100 : 0));
  const f = (a.level - dish.value.level) / 80 + (b.level - dish.value.level) / 160 + (200 - a.odds - b.odds) / 1500;
  return Math.max(0, base + f);
});
const block = computed(() => {
  if (props.data.star < 1) return '1 星以后才能试炼';
  if (trial.value.readyMinutes === 0) return '先注射或冥想做好准备';
  if (trial.value.mcId === null) return '还没有试炼对象';
  if (main.value === null || sub.value === null) return '选好主料和辅料';
  return '';
});

async function run(fn: () => Promise<unknown>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const prepare = (way: 1 | 2) => run(() => endpoints.trialPrepare(way), '准备失败');
const refresh = (mcId?: number) => run(() => endpoints.trialRefresh(mcId), '更换失败');
const start = () =>
  run(async () => {
    result.value = await endpoints.trialStart(main.value!, sub.value!);
  }, '试炼失败');
</script>

<template>
  <div class="small">
    <p class="text-muted">
      试炼能提高特色菜的试炼价值（每份价值，最多 +50%）和试炼经验（烹制时的餐厅经验，最多 +150%）。创意
      {{ trial.creatives }}。
    </p>
    <div v-if="trial.readyMinutes === 0" class="d-flex gap-1 mb-2">
      <button class="btn btn-sm btn-outline-primary" data-testid="trial-inject" :disabled="busy" @click="prepare(1)">
        注射（250,000 银币，创意 +25）
      </button>
      <button class="btn btn-sm btn-outline-primary" data-testid="trial-meditate" :disabled="busy" @click="prepare(2)">
        冥想（免费，创意 +5）
      </button>
    </div>
    <div v-else class="mb-1 text-success">准备勋章还剩 {{ trial.readyMinutes }} 分钟</div>
    <template v-if="dish">
      <div class="mb-1">
        试炼对象：<b>{{ dish.name }}</b>（{{ dish.level }} 级）
        <button class="btn btn-sm btn-link" data-testid="trial-refresh" :disabled="busy" @click="refresh()">
          换一道（20,000 银币）
        </button>
      </div>
      <div class="d-flex gap-1 mb-2">
        <select v-model.number="pick" class="form-select form-select-sm" data-testid="trial-pick">
          <option :value="null" disabled>用触手指定（持有 {{ data.tentacles }}）</option>
          <option v-for="m in learned" :key="m.mcId" :value="m.mcId">{{ catalog.mcName(m.mcId) }}</option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary text-nowrap"
          :disabled="busy || pick === null || data.tentacles < 1"
          @click="refresh(pick!)"
        >
          指定
        </button>
      </div>
      <select v-model.number="main" class="form-select form-select-sm mb-1" data-testid="trial-main">
        <option :value="null" disabled>主料</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">{{ foodLabel(f) }}</option>
      </select>
      <select v-model.number="sub" class="form-select form-select-sm mb-1" data-testid="trial-sub">
        <option :value="null" disabled>辅料</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">{{ foodLabel(f) }}</option>
      </select>
      <div v-if="rate !== null" class="text-muted" data-testid="trial-rate">
        预计成功率 {{ (rate * 100).toFixed(1) }}%（不含幸运）；另扣 10,000 银币和这道菜的每种食材各 1 个
      </div>
    </template>
    <button class="btn btn-sm btn-primary mt-1" data-testid="trial-start" :disabled="busy || !!block" @click="start">
      开始试炼
    </button>
    <div v-if="block" class="text-danger" data-testid="block">{{ block }}</div>
    <div v-if="result" class="mt-1" data-testid="trial-result">
      <template v-if="result.success">
        试炼成功{{ result.lucky ? '（幸运）' : '' }}：试炼价值 +{{ result.addWorth }}%、试炼经验 +{{
          result.addExp
        }}%，熟练度 +{{ result.proficiency }}
      </template>
      <template v-else>试炼失败</template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 克拉肯面板（含触手商店和种子库存）**

`apps/web/src/components/temple/KrakenPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { KrakenFeedDto, TempleDto, TentacleShopDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { GRADE_NAMES, ROAD_NAMES } from '../../utils/labels';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const num = ref(1);
const busy = ref(false);
const result = ref<KrakenFeedDto | null>(null);
const shop = ref<TentacleShopDto | null>(null);

onMounted(async () => {
  try {
    shop.value = await endpoints.tentacleShop();
  } catch (e) {
    toast.push(errorMessage(e, '读取触手商店失败'), 'danger');
  }
});

const k = computed(() => props.data.kraken);
const target = computed(() => catalog.mc(k.value.targetMcId));
const max = computed(() => Math.max(0, (k.value.current?.leftNum ?? 0) - 1));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const hoursText = computed(() => k.value.hours.map(([a, b]) => `${a}~${b} 点`).join('、'));
const block = computed(() => {
  if (props.data.star < 1) return '1 星以后才能投喂';
  if (!k.value.feedable) return `现在不是投喂时间（${hoursText.value}）`;
  if (k.value.fed) return '今天已经投喂过了';
  if (!k.value.current) return '先在特色菜页烹制一道特色菜';
  if (max.value < 1) return '在售份数不够（投喂后至少要留 1 份）';
  return '';
});
const punishText = (p: NonNullable<KrakenFeedDto['punish']>) =>
  p.kind === 'forget' ? '遗忘了这道特色菜' : `试炼${p.kind === 'exp' ? '经验' : '价值'} −${p.value}%`;

async function feed() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.krakenFeed(n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '投喂失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
async function shopAct(fn: () => Promise<TentacleShopDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    shop.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="mb-1">
      克拉肯今天想吃：<b>{{ target?.name ?? catalog.mcName(k.targetMcId) }}</b>
      <span class="text-muted">（{{ ROAD_NAMES[target?.road ?? 0] }}；投喂时间 {{ hoursText }}）</span>
    </div>
    <div v-if="k.current" class="mb-1">
      在售：{{ catalog.mcName(k.current.mcId) }} {{ GRADE_NAMES[k.current.grade] }}，剩 {{ k.current.leftNum }} 份
    </div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <input
        v-model.number="num"
        type="number"
        min="1"
        :max="Math.max(1, max)"
        class="form-control form-control-sm"
        style="width: 80px"
        data-testid="kraken-num"
      />
      <button class="btn btn-sm btn-primary text-nowrap" data-testid="kraken-feed" :disabled="busy || !!block" @click="feed">
        投喂 {{ n }} 份
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="result" class="mb-2" data-testid="kraken-result">
      好感度 {{ result.favor }}
      （{{ result.relation === 'same' ? '正是它想吃的' : result.relation === 'road' ? '同一道' : '不太合口味' }}）
      ；种子 {{ result.seeds.map((s) => `${catalog.seedName(s.seedId)}×${s.num}`).join('、') }}
      <span v-if="result.krabCoin > 0">；蟹币 {{ result.krabCoin }}</span>
      <span v-if="result.tentacle">；触手 1</span>
      <span v-if="result.punish" class="text-danger">；{{ punishText(result.punish) }}</span>
    </div>

    <h6 class="mt-3">触手商店</h6>
    <template v-if="shop">
      <div class="text-muted mb-1">持有触手 {{ shop.tentacles }}；用"特色菜等级"条触手换一张残卷</div>
      <div v-for="(s, i) in shop.slots" :key="i" class="d-flex align-items-center border-bottom py-1">
        <span class="flex-fill">{{ catalog.mcName(s.mcId) }}（{{ catalog.mc(s.mcId)?.level }} 级）</span>
        <button
          class="btn btn-sm btn-outline-success"
          :data-testid="`tentacle-${i}`"
          :disabled="busy || s.bought || shop.tentacles < (catalog.mc(s.mcId)?.level ?? 99)"
          @click="shopAct(() => endpoints.tentacleExchange(i), '兑换失败')"
        >
          {{ s.bought ? '已兑换' : `换（${catalog.mc(s.mcId)?.level ?? '?'} 条触手）` }}
        </button>
      </div>
      <button
        class="btn btn-sm btn-link"
        data-testid="tentacle-refresh"
        :disabled="busy || shop.tentacles < shop.refreshCost"
        @click="shopAct(() => endpoints.tentacleRefresh(), '刷新失败')"
      >
        {{ shop.refreshCost === 0 ? '免费刷新' : '刷新（1 条触手）' }}
      </button>
    </template>

    <h6 class="mt-3">种子库存</h6>
    <div data-testid="seeds">
      <span v-if="data.seeds.length === 0" class="text-muted">还没有种子（投喂克拉肯可以得到）</span>
      <span v-for="s in data.seeds" :key="s.seedId" class="me-2">{{ catalog.seedName(s.seedId) }}×{{ s.num }}</span>
    </div>
    <div class="text-muted">菜园开放后可以种</div>
  </div>
</template>
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/temple src/views/TempleView.test.ts`
Expected: PASS

- [ ] **Step 6: 全量并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/web
git commit -m "feat(web): trial panel with preparation, target refresh, food choice and predicted rate; kraken panel with feeding, tentacle shop and seed stock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/temple.spec.ts`
- Modify: `docs/rules/收益与加成.md`、`docs/deploy.md`

- [ ] **Step 1: 写端到端测试**

`apps/web/e2e/temple.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('神殿：打守护兽 → 探险 → 冥想准备试炼 → 试炼', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as { data: { id: number } };
  const restId = overview.data.id;
  // 准备：1 星、体力、银币；飞弹和探险图；已学 3 号特色菜（秘·凤凰展翅，食材 262、310、400）；试炼要的食材
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set star_level = 1, strength = 200, coin = 1000000 where id = $1', [restId]);
    for (const [goodsId, num] of [
      [17, 2],
      [170, 2],
    ]) {
      await client.query('insert into store_item (rest_id, goods_id, num) values ($1, $2, $3)', [restId, goodsId, num]);
    }
    await client.query('insert into rest_mc (rest_id, mc_id, way) values ($1, 3, 1)', [restId]);
    for (const foodsId of [150, 423, 262, 310, 400]) {
      await client.query(
        `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 5)
         on conflict (rest_id, foods_id) do update set num = 5`,
        [restId, foodsId],
      );
    }
  } finally {
    await client.end();
  }

  await page.goto('/temple');
  await page.getByTestId('tab-guardian').click();
  await page.getByTestId('missile').selectOption('17');
  await page.getByTestId('fire').click();
  await expect(page.getByTestId('shots')).toBeVisible();

  await page.getByTestId('tab-explore').click();
  await page.getByTestId('map').selectOption('170');
  await page.getByTestId('explore').click();
  await expect(page.getByTestId('explore-result')).toContainText('成功');

  await page.getByTestId('tab-trial').click();
  await page.getByTestId('trial-meditate').click();
  await expect(page.getByText('试炼对象')).toBeVisible();
  await page.getByTestId('trial-main').selectOption('150');
  await page.getByTestId('trial-sub').selectOption('423');
  await page.getByTestId('trial-start').click();
  await expect(page.getByTestId('trial-result')).toContainText('试炼');
});
```

- [ ] **Step 2: 跑端到端**

先执行迁移（`pnpm --filter @dt/server migrate:dev`），再按进程树清理旧的 dev 进程后重启 `pnpm dev`（用户已允许随时重启开发服务器），确认 worker 日志有 "became leader"。然后：

Run: `pnpm --filter @dt/web e2e`
Expected: 全部通过（原有 6 个 + 新增 1 个）

- [ ] **Step 3: 文档**

`docs/rules/收益与加成.md` 末尾加：

```markdown
## 7. 神殿（子项目 4B-1）

**守护兽**：每人每天一只，血量 10000 + 5000 × 星级。
- 飞弹：命中率 = 飞弹命中 + 幸运率/4 + 天气；暴击率 = 飞弹暴击 + 勋章 + 天气；暴击伤害 × 暴击倍数。
- 暴击时：10% + 幸运率/4 掉神秘礼券（1 ~ 伤害/100 张），3% + 幸运率/20 掉探险图；有捕梦网时还可能掉厨神玉玺（极速飞弹 32%，其他 3%）。
- 每次攻击按 总伤害/100 次抽美味券（有捕梦网 ×2）。
- 击败：25% + 幸运率/4 得 1 个 7 级食材；3、2、1 级食材各约 20、30、60 个。

**探险**：每次扣 1 张图和图上写的体力。
- 成功率 = 图的成功率，有欲望之针补一半失败率，减天气迷路率，加套装探险加成，再加 幸运率/12。
- 成功时：神秘食材概率 = 图 + 煤油灯 + 欲望之针 + 保安证 + 天气，再加 幸运率/20；普通食材 4 级拿 75%，其他等级 25%。
- 有煤油灯时得经验 = 每次体力 × 餐厅等级 × (成功×5 + 失败×2)。

**试炼**：注射（25 万银币，创意 +25）或冥想（免费，创意 +5）准备，勋章 1 小时；从已学的 ≤5 级特色菜里抽试炼对象。
- 成功率 = min(0.6, 0.05 + 创意/750 …) + (主料等级 − 菜等级)/80 + (辅料等级 − 菜等级)/160 + (200 − 主料权重 − 辅料权重)/1500 + 幸运率/5。
- 成功：主料稀有（权重 < 100）时试炼价值 +1~2%（上限 50%）；试炼经验 +1~4%（上限 150%）；熟练度 +800 × 熟练度等级。

**克拉肯**：每天想吃一道 1~5 级特色菜（全区服相同）；11~14 点、17~21 点可以投喂一次。
- 好感度按份数、每份价值、是否它想吃的菜（×2.4）/ 同道（×1）/ 其他（×0.5）计算。
- 奖励：√好感度 + 2 颗种子；种子多时可能得蟹币；好感度 > 35 时 30% 得触手。
- 好感度为负：扣这道菜的试炼经验 → 试炼价值 → 都没有时 25% 遗忘这道菜。

**触手商店**：每天 6 格特色菜残卷，用"特色菜等级"条触手换一张；每天第一次刷新免费。
```

`docs/deploy.md` 末尾加：

```markdown
## 神殿（子项目 4B-1）

- 迁移 0009 新建 `rest_trial`、`kraken_feed`、`tentacle_shop`、`rest_seed`；守护兽的伤害和是否击败记在 `daily_counter`
- 新功能开关 `features.temple`（默认开）。关闭后守护兽、探险、试炼、克拉肯、触手商店的接口返回"这个区服暂未开放该功能"；4A 的鉴定属于 `mysterious`，不受影响
- 数值在 `tuning.temple`（守护兽血量和掉落、试炼花费和上限、克拉肯投喂时段和倍率、触手商店格数）
- 种子表从配置包的 `extra` 挪到正式字段 `seeds`
- 主线第 25、26 步（守护兽、探险）和试炼支线不再跳过
```

- [ ] **Step 4: 验收**

Run: `npx prettier --check apps packages docs && pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿（`问题记录.md` 是用户的文件，不在检查范围、不格式化、不提交）

对照设计文档 §1 的完成标志：
- 守护兽：guardian.test + GuardianPanel.test + E2E
- 探险：explore.test + ExplorePanel.test + E2E
- 试炼：trial.test + TrialPanel.test + E2E
- 克拉肯和触手商店：kraken.test + KrakenPanel.test
- 主线 25、26 步和试炼支线：guardian.test、explore.test、trial.test

- [ ] **Step 5: 提交**

```bash
git add apps/web/e2e/temple.spec.ts docs
git commit -m "test(e2e): guardian, exploration and a trial in the temple; docs for the temple and deployment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
