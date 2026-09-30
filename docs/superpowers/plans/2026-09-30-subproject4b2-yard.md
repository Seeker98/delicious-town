# 子项目 4B-2「菜园」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能开垦土地、买或换种子、播种浇水施肥除虫除草直到收获，收获进菜篮再存进橱柜；能帮好友照料、偷好友的菜；作物按自然事件长虫长草干涸枯萎，下雨自动浇水；能鉴定、学习配方，合成食材，分解碎片换种子。主线第 28、29 步和配方支线开放。

**Architecture:** 配置包把配方、种子兑换、动作收益变成正式字段，新增肥料索引和 `tuning.yard`；迁移 0010 建 `yard_land`、`yard_plant`、`yard_steal`、`yard_basket`、`rest_formula`。服务端新增 `modules/yard/`：纯规则 `rules.ts`；`common.ts` 放收益、土地经验、锁作物、菜篮和种子增减；`view.ts` 组装页面数据；`land.ts`、`crop.ts`、`steal.ts`、`basket.ts`、`formula.ts`、`seed.ts` 各管一块；`jobs.ts` 是自然事件定时任务（每株作物一个短事务，只锁作物行）；`service.ts` 装配（自己的作物走 `runOp`，好友的作物走 `runPairOp`），`routes.ts` 注册。前端新增 `/yard` 标签页（菜园、菜篮、配方、种子）和好友菜园视图。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4b2-yard-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1/yard/...` 下，由 `modules/yard/routes.ts` 的 `yardRoutes(svc)` 注册
- 菜园的写操作：自己的作物、土地、菜篮、配方、种子走 `runOp`（锁自己的店）；对好友作物的浇水、除虫、除草、偷菜走 `runPairOp`（`friend: 'required'`）；功能名 `yard`；读接口开头 `d.shards.ensureFeature(ctx.shardId, 'yard')`
- 作物行一律在事务里 `FOR UPDATE` 锁住再改（`lockPlant`）；自然事件任务只锁作物行，不锁店（裁定 7）
- 不新增错误码。原因名：`INVALID_STATE` reason `no_land`、`land_busy`、`no_plant`、`no_water`、`has_worm`、`has_grass`、`not_ripe`、`withered`、`no_worm`、`no_grass`、`feed_useless`、`steal_left`、`formula_unlearned`、`formula_learned`、`seed_shop_closed`、`seed_not_sold`；`LIMIT_REACHED` what `lands`（params `max`）；`ALREADY_DONE` what `steal`；`REQUIREMENT_NOT_MET` reason `renown`（params `need: 1`）；`NOT_ENOUGH` kind `basket`（id = 食材）、`seed`（id = 种子）、`fragment`（id = 配方，多一个 `part: 'main' | 'sub'`）；`VALIDATION_FAILED` reason `no_seed`、`not_fertilizer`、`not_formula_tool`、`no_formula`、`no_exchange`；体力、银币、道具、食材不够用现有 `spendStrength` / `spendCoin` / `consumeGoods` / `subFoods`
- 事件键（`emitAction`）：`yard.plant`、`yard.water`、`yard.weed`、`yard.deworm`、`yard.harvest`、`yard.steal`（每次 1）；`formula.appraise`（n = 次数）、`formula.compose`（n = 份数）
- 流水来源：`yard.land`、`yard.plant`、`yard.water`、`yard.feed`、`yard.weed`、`yard.deworm`、`yard.remove`、`yard.reap`、`yard.steal`、`yard.basket`、`formula.appraise`、`formula.learn`、`formula.decompose`、`formula.compose`、`seed.buy`、`seed.exchange`
- 流水 / 事件 kind 新增 `'basket'`（`id` = 食材 id）；前端显示"菜篮·食材名"
- 好友动态（对方的个人日志）：`yard.helped`（`{what: 'water' | 'weed' | 'deworm', foodsId}`）、`yard.stolen`（`{foodsId, num, punished: 食材 id | null}`）
- 动作 id（`income_action`）：50 播种、51 浇水、52 除草、53 除虫、54 收获 / 偷菜、55 铲除、56 施肥
- 随机数一律走 `o.rng` / `d.rng()`；天气取 `world.ensure(...).weather`，`type === 2` 是下雨
- 界面文字全部中文；按钮灰掉时写明原因；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交前对改动文件跑 `npx prettier --write`；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 测试命令：`pnpm --filter <包> exec vitest run <路径>`（各包没有 test 脚本）
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build`；`packages/config/data` 被 prettier 忽略，改 JSON 时插入文本块，不整体重写

## 计划层面的裁定（相对设计文档）

1. 支线任务 114「鉴定一次食材配方」的链接从 `/temple` 改为 `/yard`：配方鉴定放在菜园的配方标签（设计文档 §6）。代价：无
2. 自然事件每株作物每次**固定先抽 6 个随机数**（顺序：虫吃、草吃、长草、干涸加重、开始干涸、长虫），便于用固定随机数测试；作物变成枯叶期后不再往下判断（原版继续判断，但对枯叶期作物没有效果）。设计文档 §3.3 第 4 条第 2 点照源码理解为：`dry > 0 且 rand < 0.1` 时，下雨 → dry = 0，不下雨 → dry += 1 + (有草 ? 1 : 0)。代价：干涸加重比"每次都加"慢，和原版一致
3. 枯叶期（stage 5）的作物只能铲除；浇水、施肥、除虫、除草、收获、偷菜一律报 `withered`。代价：无（枯叶期没有产出）
4. 收获期（stage 4）干涸时浇水只解除干涸，不缩短收获期（缩短收获期等于让作物更快枯萎）。代价：无
5. 土地满级（10 级）后经验归 0、不再累计。代价：满级后经验条显示 0
6. 种子单价 = ⌈种子 coin × seedPriceRate⌉（向上取整，调价后不出小数）
7. 配方碎片不够：`NOT_ENOUGH {kind: 'fragment', part, id: 配方 id, need, have}`（`notEnough` 不带 part，这里直接 `new AppError`）
8. 偷菜声望不够：`requirement('renown', { need: 1 })`；前端 `renown` 文案按有没有 `need` 区分偷菜和点赞（点赞原来不带 need）
9. 合成的事件键 `formula.compose` 按份数计；配方鉴定 `formula.appraise` 按次数计
10. 浇水、除虫、除草、收获接口按作物的主人分流：主人是自己 → `runOp`；否则 → `runPairOp`（要求好友；不同区服报 `RESTAURANT_NOT_FOUND`）。"收获"对好友的作物就是偷菜
11. 星月密卷的 `formulaRate`、`secToMain` 和星神之泪的 `formulaFoodsRate` 从道具 value（`goods.effects`）读，不放进 tuning；肥料分钟数从道具 value 的 `plantTime` 读（`GameConfig.fertilizers`）
12. 边牧惩罚：对方持有有效边牧(339) 且 `rng.chance(tuning.yard.reapPunishRate)` → 从我橱柜里数量 > 0、未锁定的食材（按食材 id 排序）里 `rng.int(n)` 选 1 个，扣 1 个给对方；橱柜空时跳过。随机数顺序：偷的数量 → 惩罚概率 → 选食材
13. 合成额外产出里"幸运率/5"的 5 写在规则里（设计文档的 tuning 块没有这一项）

## Review Focus

1. **枯叶期作物上点浇水、除虫、除草、收获、施肥**：一律报 `withered`，什么都不扣；只有铲除能用。→ Task 5 测试
2. **主人刚收获（作物行已删）好友再偷**：报 `no_plant`，声望、体力都不扣。→ Task 6 测试
3. **菜篮存进橱柜时橱柜格子满了**：进冰箱；菜篮照扣 num；冰箱也满时丢弃并写 `fridge.drop` 日志。→ Task 5 测试
4. **合成时菜篮主料够、橱柜辅料不够**：报 `NOT_ENOUGH foods`，体力、菜篮、添加料都不扣。→ Task 8 测试
5. **自然事件任务处理到一株已经被收获的作物**（列出 id 之后被删）：跳过、不报错，统计里不算变化。→ Task 7 测试

---

## 文件结构

```
packages/config/src/types.ts                 Formula、SeedExchange、IncomeAction；ConfigBundle 三个正式字段
packages/config/src/raw.ts                   rawFormula、rawSeedExchange 完整结构；rawIncomeAction
packages/config/src/source.ts                加 designed/income_action
packages/config/src/build.ts                 三个正式字段、肥料和菜园道具校验；extra 去掉 formulas、seedExchange
packages/config/src/runtime.ts               GameConfig.formulas / formulaPool / seedExchange / fertilizers / incomeAction()
packages/config/src/ids.ts                   GOODS 新增菜园道具
packages/config/src/tuning.ts、data/game/tuning.json   yard 段
packages/config/data/designed/tasks.json     任务 114 链接改 /yard
packages/shared/src/envelope.ts              GameEvent.kind 加 'basket'
packages/shared/src/schemas/yard.ts          接口 body 和 DTO
apps/server/src/db/migrations/0010_yard.ts、0010.test.ts
apps/server/src/db/schema.ts                 5 张表类型
apps/server/src/modules/ledger/ledger.ts     kind 加 'basket'
apps/server/src/core/features.ts             'yard'
apps/server/src/modules/task/service.ts      状态键 yard.lands
apps/server/src/modules/yard/
  rules.ts            纯规则
  rules.test.ts
  common.ts           badInput、ACTION、actionIncome、addLandExp、lockPlant、assertAlive、addBasket、subBasket、subSeed
  view.ts             plantDto、yardView、friendYardView
  land.ts             expandLand
  crop.ts             plantSeed、waterPlant、feedPlant、weedPlant、dewormPlant、removePlant、reapPlant
  steal.ts            stealPlant
  basket.ts           basketView、storeBasket
  formula.ts          formulasView、appraiseFormula、learnFormula、decomposeFormula、composeFormula
  seed.ts             seedsView、buySeed、exchangeSeed
  jobs.ts             yardJobs、runYardEvents、tickOne
  service.ts          createYardService
  routes.ts
  land.test.ts、crop.test.ts、friend.test.ts、jobs.test.ts、formula.test.ts、seed.test.ts
apps/server/src/modules/index.ts、game.ts     装配
apps/web/src/api/endpoints.ts                yard* 接口
apps/web/src/i18n/zh-CN.ts、zh-CN.test.ts    错误文案、NameResolver.seedName
apps/web/src/stores/catalog.ts               setNameResolver 带 seedName
apps/web/src/utils/events.ts、feed.ts         basket 事件和流水名称、菜园好友动态
apps/web/src/router.ts                       /yard
apps/web/src/views/YardView.vue、YardView.test.ts               标签页壳 + 好友视图入口
apps/web/src/views/MoreView.vue、FriendRestView.vue（及测试）   入口
apps/web/src/components/yard/testData.ts
apps/web/src/components/yard/LandPanel.vue、FriendYard.vue、BasketPanel.vue、FormulaPanel.vue、SeedPanel.vue 和各自的 .test.ts
apps/web/e2e/yard.spec.ts
docs/rules/收益与加成.md、docs/deploy.md
```

---

### Task 1: 配置——配方、种子兑换、动作收益、肥料、数值、道具 id

**Files:**
- Modify: `packages/config/src/types.ts`、`raw.ts`、`source.ts`、`build.ts`、`runtime.ts`、`ids.ts`、`tuning.ts`、`build.test.ts`、`runtime.test.ts`
- Modify: `packages/config/data/game/tuning.json`、`packages/config/data/designed/tasks.json`

**Interfaces:**
- Produces:
  - `Formula { id; name; mainFoodsId; subFoodsId; addFoodsId; resFoodsId; odds }`
  - `SeedExchange { seedId; seedNum; essence }`
  - `IncomeAction { id; name; coin; exp; landExp }`（非菜园动作 landExp = 0）
  - `ConfigBundle.formulas: Formula[]`、`ConfigBundle.seedExchange: SeedExchange[]`、`ConfigBundle.incomeActions: IncomeAction[]`
  - `GameConfig.formulas: ReadonlyMap<number, Formula>`、`GameConfig.formulaPool: WeightedPool<Formula>`、`GameConfig.seedExchange: ReadonlyMap<number, SeedExchange>`（按种子 id）、`GameConfig.fertilizers: ReadonlyMap<number, number>`（道具 id → 分钟）、`GameConfig.incomeAction(id: number): IncomeAction`（找不到抛错）
  - `Tuning['yard']`（见 Step 5）
  - `GOODS.formulaScroll 464`、`moonScroll 465`、`starTear 469`、`formulaEssence 470`、`borderCollie 339`

- [ ] **Step 1: 写失败测试**

`packages/config/src/build.test.ts` 的 `describe('buildBundle（真实数据）'` 里加：

```ts
  it('配方、种子兑换、动作收益是正式字段（子项目 4B-2）', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.formulas).toHaveLength(56);
    expect(bundle!.formulas.find((f) => f.id === 1)).toEqual({
      id: 1,
      name: '牡丹籽油配方',
      mainFoodsId: 438,
      subFoodsId: 431,
      addFoodsId: 551,
      resFoodsId: 447,
      odds: 10,
    });
    expect(bundle!.seedExchange).toHaveLength(96);
    expect(bundle!.seedExchange.find((e) => e.seedId === 95)).toEqual({ seedId: 95, seedNum: 1, essence: 30 });
    expect(bundle!.incomeActions.find((a) => a.id === 54)).toEqual({
      id: 54,
      name: '收获',
      coin: 2,
      exp: 3,
      landExp: 20,
    });
    expect(bundle!.incomeActions.find((a) => a.id === 20)!.landExp).toBe(0);
    expect('formulas' in bundle!.extra).toBe(false);
    expect('seedExchange' in bundle!.extra).toBe(false);
  });

  it('任务 114（鉴定一次食材配方）链接到菜园', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.tasks.find((t) => t.id === 114)!.href).toBe('/yard');
  });
```

`packages/config/src/runtime.test.ts` 末尾加：

```ts
describe('菜园索引（子项目 4B-2）', () => {
  it('配方池、种子兑换按种子 id、肥料分钟数、动作收益', () => {
    expect(config.formulas.get(2)!.resFoodsId).toBe(448);
    expect(config.formulaPool.items).toHaveLength(56);
    expect(config.seedExchange.get(1)).toEqual({ seedId: 1, seedNum: 5, essence: 2 });
    expect([...config.fertilizers]).toEqual([
      [427, 20],
      [428, 60],
    ]);
    expect(config.incomeAction(51)).toMatchObject({ coin: 1, exp: 1, landExp: 5 });
    expect(() => config.incomeAction(999)).toThrow();
    expect(config.tuning.yard.maxLands).toBe(9);
    expect(config.tuning.yard.events.minutes).toEqual([7, 27, 47]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run`
Expected: FAIL（`bundle.formulas` 未定义；`config.formulaPool` 未定义；任务 114 的 href 是 `/temple`）

- [ ] **Step 3: 类型**

`packages/config/src/types.ts` 末尾加：

```ts
/** 食材配方（规格书 08 §8.5）：主料从菜篮扣，辅料、添加料从橱柜扣 */
export interface Formula {
  id: number;
  name: string;
  mainFoodsId: number;
  subFoodsId: number;
  addFoodsId: number;
  resFoodsId: number;
  odds: number;
}

/** 配方精华换种子（规格书 20 §20.8）：每次花 essence 个精华换 seedNum 颗 */
export interface SeedExchange {
  seedId: number;
  seedNum: number;
  essence: number;
}

/** 动作收益（规格书 20 §20.7）；landExp 只有菜园动作有，其他为 0 */
export interface IncomeAction {
  id: number;
  name: string;
  coin: number;
  exp: number;
  landExp: number;
}
```

`ConfigBundle` 里 `seeds: Seed[];` 下面加：

```ts
  formulas: Formula[];
  seedExchange: SeedExchange[];
  incomeActions: IncomeAction[];
```

- [ ] **Step 4: raw、source、build、runtime**

`packages/config/src/raw.ts`：把

```ts
export const rawSeedExchange = z.object({ seedId: int }).passthrough();
export const rawFormula = z
  .object({ id: int, mainFoodsId: int, subFoodsId: int, addFoodsId: int, resFoodsId: int })
  .passthrough();
```

改为：

```ts
export const rawSeedExchange = z.object({ seedId: int, seednum: int, remnantnum: int });
export const rawFormula = z.object({
  id: int,
  name: z.string(),
  mainFoodsId: int,
  subFoodsId: int,
  addFoodsId: int,
  resFoodsId: int,
  odds: z.number(),
});
export const rawIncomeAction = z.object({
  id: int,
  name: z.string(),
  coin: z.number(),
  exp: z.number(),
  landExp: int.optional(),
});
```

`packages/config/src/source.ts` 的 `SOURCE_FILES` 里 `'designed/foods_formula',` 下面加 `'designed/income_action',`。

`packages/config/src/build.ts`：
- `const formulasRaw = ...` 下面加 `const incomeRaw = parse('designed/income_action', z.array(raw.rawIncomeAction));`，下面那串 `!formulasRaw ||` 后面加 `!incomeRaw ||`
- 把

```ts
  for (const e of seedExRaw)
    if (!seedIds.has(e.seedId)) errors.push(`seed_exchange references unknown seed ${e.seedId}`);
  for (const f of formulasRaw) {
    for (const id of [f.mainFoodsId, f.subFoodsId, f.addFoodsId, f.resFoodsId]) {
      if (!foodIds.has(id)) errors.push(`formula ${f.id} references unknown food ${id}`);
    }
  }
```

改为：

```ts
  const seedExchange = seedExRaw.map((e) => ({ seedId: e.seedId, seedNum: e.seednum, essence: e.remnantnum }));
  for (const e of seedExchange) {
    if (!seedIds.has(e.seedId)) errors.push(`seed_exchange references unknown seed ${e.seedId}`);
    if (e.seedNum < 1 || e.essence < 1) errors.push(`seed_exchange ${e.seedId} needs positive numbers`);
  }
  const formulas = formulasRaw.map((f) => ({
    id: f.id,
    name: f.name,
    mainFoodsId: f.mainFoodsId,
    subFoodsId: f.subFoodsId,
    addFoodsId: f.addFoodsId,
    resFoodsId: f.resFoodsId,
    odds: f.odds,
  }));
  unique('foods_formula', formulas.map((f) => f.id));
  for (const f of formulas) {
    for (const id of [f.mainFoodsId, f.subFoodsId, f.addFoodsId, f.resFoodsId]) {
      if (!foodIds.has(id)) errors.push(`formula ${f.id} references unknown food ${id}`);
    }
  }
  const incomeActions = incomeRaw.map((a) => ({
    id: a.id,
    name: a.name,
    coin: a.coin,
    exp: a.exp,
    landExp: a.landExp ?? 0,
  }));
  unique('income_action', incomeActions.map((a) => a.id));
  for (const id of [50, 51, 52, 53, 54, 55, 56])
    if (!incomeActions.some((a) => a.id === id)) errors.push(`income_action missing yard action ${id}`);
  for (const id of [464, 465, 469, 470, 339])
    if (!goodsIds.has(id)) errors.push(`yard references unknown goods ${id}`);
  for (const g of goods) {
    if (g.deviceType === 80 && !((g.effects.plantTime ?? 0) > 0))
      errors.push(`goods ${g.id} fertilizer needs a positive plantTime`);
  }
```

- `body` 里 `seeds,` 下面加 `formulas,`、`seedExchange,`、`incomeActions,`；`extra` 里删掉 `seedExchange: seedExRaw,` 和 `formulas: formulasRaw,` 两行

`packages/config/src/runtime.ts`：
- types import 加 `Formula, IncomeAction, SeedExchange`
- `GameConfig` 里 `readonly maps: ReadonlyMap<number, MapDef>;` 下面加：

```ts
  readonly formulas: ReadonlyMap<number, Formula>;
  readonly formulaPool: WeightedPool<Formula>;
  /** 按种子 id */
  readonly seedExchange: ReadonlyMap<number, SeedExchange>;
  /** 肥料（devicetype 80）：道具 id → 每次抵扣的分钟数 */
  readonly fertilizers: ReadonlyMap<number, number>;
  incomeAction(id: number): IncomeAction;
```

- `createGameConfig` 里 `const maps = new Map<number, MapDef>();` 下面加：

```ts
  const fertilizers = new Map<number, number>();
  for (const g of bundle.goods) {
    const minutes = g.effects.plantTime;
    if (g.deviceType === 80 && minutes !== undefined && minutes > 0) fertilizers.set(g.id, minutes);
  }
  const incomeActions = byId(bundle.incomeActions);
```

  返回对象里 `maps,` 下面加：

```ts
    formulas: byId(bundle.formulas),
    formulaPool: buildPool(bundle.formulas, (f) => f.odds),
    seedExchange: new Map(bundle.seedExchange.map((e) => [e.seedId, e])),
    fertilizers,
    incomeAction(id) {
      const a = incomeActions.get(id);
      if (!a) throw new Error(`unknown income action ${id}`);
      return a;
    },
```

- [ ] **Step 5: 道具 id、数值、任务链接**

`packages/config/src/ids.ts` 的 `GOODS` 末尾（`dreamNet` 之后）加：

```ts
  formulaScroll: 464, // 玄奥配方
  moonScroll: 465, // 星月密卷（配方鉴定 +10%、辅碎片转主碎片）
  starTear: 469, // 星神之泪（配方合成额外产出）
  formulaEssence: 470, // 配方精华（essence 是厨具精华）
  borderCollie: 339, // 边牧（偷菜惩罚）
```

`packages/config/src/tuning.ts` 的 `tuningSchema` 在 `temple: z.object({...}),` 之后加：

```ts
  yard: z.object({
    maxLands: int.min(1),
    landBaseCoin: int,
    landMaxLevel: int.min(1),
    yieldPerLevel: num,
    dryWaterSub: int,
    dryWaterMinRate: num,
    removeSeedRate: num,
    stealKeepRate: num,
    stealMax: int.min(1),
    reapPunishRate: num,
    seedShop: z.boolean(),
    seedPriceRate: num,
    formulaMainRate: num,
    formulaAppraiseRatePerLuck: num,
    composeStrength: int,
    composeCritRate: num,
    essenceMain: int,
    essenceSub: int,
    events: z.object({
      minutes: z.array(int.min(0).max(59)).min(1),
      nightMinute: int.min(0).max(59),
      dayFrom: int.min(0).max(23),
      dayTo: int.min(1).max(24),
      wormEatRate: num,
      grassEatRate: num,
      dryDeath: int,
      grassRate: num,
      grassDryFactor: num,
      dryAddRate: num,
      dryStartRate: num,
      dryStartGrassRate: num,
      wormRate: num,
    }),
  }),
```

`packages/config/data/game/tuning.json`：文件末尾现在是

```json
    "shopSlots": 6, "shopExclude": [249]
  }
}
```

改为（temple 段右花括号后补逗号，插入 yard 段）：

```json
    "shopSlots": 6, "shopExclude": [249]
  },
  "yard": {
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
}
```

`packages/config/data/designed/tasks.json`：任务 114 的奖励是玄奥配方(464)，用 Edit 把

```
      "id": 464,
      "num": 1
     }
    ]
   },
   "href": "/temple"
```

改为

```
      "id": 464,
      "num": 1
     }
    ]
   },
   "href": "/yard"
```

（只有这一处奖励 464 的任务；改前用 `grep -n '"id": 464' packages/config/data/designed/tasks.json` 确认只有一处）

- [ ] **Step 6: 运行，确认通过，重建 bundle**

Run: `pnpm --filter @dt/config exec vitest run && pnpm --filter @dt/config build`
Expected: PASS；bundle 重建

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add packages/config
git commit -m "feat(config): formulas, seed exchange and action income as structured fields; fertilizers, yard tuning and item ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0010、表类型、流水 kind

**Files:**
- Create: `apps/server/src/db/migrations/0010_yard.ts`、`apps/server/src/db/migrations/0010.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`、`apps/server/src/modules/ledger/ledger.ts`、`packages/shared/src/envelope.ts`

**Interfaces:**
- Produces:
  - 表 `yard_land`、`yard_plant`、`yard_steal`、`yard_basket`、`rest_formula`（列见 Step 3）
  - `YardLandRow = Selectable<YardLandTable>`、`YardPlantRow = Selectable<YardPlantTable>`（`schema.ts` 导出）
  - `LedgerEntry['kind']`、`GameEvent['kind']` 含 `'basket'`

- [ ] **Step 1: 写失败测试**

`apps/server/src/db/migrations/0010.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

const newRest = async () => createRestaurantRow(db, shard, await createAccountRow(db));
const plantRow = (restId: number, landId: number) => ({
  rest_id: restId,
  shard_id: shard,
  land_id: landId,
  seed_id: 1,
  foods_id: 101,
  stage: 1,
  stage_at: new Date(),
  infancy: 24,
  maturity: 36,
  autumn: 60,
  harvest: 1440,
  harvest_num: 20,
  harvest_max: 20,
});

describe('迁移 0010', () => {
  it('每家店的地号唯一；一块地只能种一株；阶段 1~5', async () => {
    const a = await newRest();
    const land = await db
      .insertInto('yard_land')
      .values({ rest_id: a, no: 1 })
      .returning(['id', 'level', 'exp'])
      .executeTakeFirstOrThrow();
    expect(land).toMatchObject({ level: 1, exp: 0 });
    await expect(db.insertInto('yard_land').values({ rest_id: a, no: 1 }).execute()).rejects.toThrow();
    const p = await db.insertInto('yard_plant').values(plantRow(a, land.id)).returning('id').executeTakeFirstOrThrow();
    const row = await db.selectFrom('yard_plant').selectAll().where('id', '=', p.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ feed_min: 0, worm: 0, grass: 0, dry: 0 });
    await expect(db.insertInto('yard_plant').values(plantRow(a, land.id)).execute()).rejects.toThrow();
    const land2 = await db.insertInto('yard_land').values({ rest_id: a, no: 2 }).returning('id').executeTakeFirstOrThrow();
    await expect(
      db.insertInto('yard_plant').values({ ...plantRow(a, land2.id), stage: 6 }).execute(),
    ).rejects.toThrow();
  });

  it('菜篮、配方碎片不能为负；每人每株只偷一次', async () => {
    const a = await newRest();
    const b = await newRest();
    await expect(
      db.insertInto('yard_basket').values({ rest_id: a, foods_id: 101, num: -1 }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('rest_formula').values({ rest_id: a, formula_id: 1, main_num: -1 }).execute(),
    ).rejects.toThrow();
    const land = await db.insertInto('yard_land').values({ rest_id: a, no: 1 }).returning('id').executeTakeFirstOrThrow();
    const p = await db.insertInto('yard_plant').values(plantRow(a, land.id)).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('yard_steal').values({ plant_id: p.id, rest_id: b }).execute();
    await expect(db.insertInto('yard_steal').values({ plant_id: p.id, rest_id: b }).execute()).rejects.toThrow();
  });

  it('删作物级联偷菜记录；删店级联土地、作物、菜篮、配方', async () => {
    const a = await newRest();
    const b = await newRest();
    const land = await db.insertInto('yard_land').values({ rest_id: a, no: 1 }).returning('id').executeTakeFirstOrThrow();
    const p = await db.insertInto('yard_plant').values(plantRow(a, land.id)).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('yard_steal').values({ plant_id: p.id, rest_id: b }).execute();
    await db.deleteFrom('yard_plant').where('id', '=', p.id).execute();
    expect(await db.selectFrom('yard_steal').selectAll().where('plant_id', '=', p.id).execute()).toEqual([]);
    await db.insertInto('yard_plant').values(plantRow(a, land.id)).execute();
    await db.insertInto('yard_basket').values({ rest_id: a, foods_id: 101, num: 3 }).execute();
    await db.insertInto('rest_formula').values({ rest_id: a, formula_id: 1, sub_num: 2 }).execute();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    for (const table of ['yard_land', 'yard_plant', 'yard_basket', 'rest_formula'] as const) {
      expect(await db.selectFrom(table).selectAll().where('rest_id', '=', a).execute()).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0010.test.ts`
Expected: FAIL（表不存在 / 类型报错）

- [ ] **Step 3: 迁移和表类型**

`apps/server/src/db/migrations/0010_yard.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table yard_land (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      no smallint not null,
      level smallint not null default 1,
      exp integer not null default 0,
      created_at timestamptz not null default now(),
      unique (rest_id, no)
    )`,
    sql`create table yard_plant (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      land_id integer not null unique references yard_land(id) on delete cascade,
      seed_id integer not null,
      foods_id integer not null,
      stage smallint not null check (stage between 1 and 5),
      stage_at timestamptz not null,
      feed_min integer not null default 0,
      infancy integer not null,
      maturity integer not null,
      autumn integer not null,
      harvest integer not null,
      harvest_num integer not null check (harvest_num >= 0),
      harvest_max integer not null,
      worm smallint not null default 0,
      grass smallint not null default 0,
      dry smallint not null default 0,
      planted_at timestamptz not null default now()
    )`,
    sql`create index yard_plant_rest on yard_plant (rest_id)`,
    sql`create index yard_plant_shard_stage on yard_plant (shard_id, stage)`,
    sql`create table yard_steal (
      plant_id integer not null references yard_plant(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (plant_id, rest_id)
    )`,
    sql`create table yard_basket (
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, foods_id)
    )`,
    sql`create table rest_formula (
      rest_id integer not null references restaurant(id) on delete cascade,
      formula_id integer not null,
      main_num integer not null default 0 check (main_num >= 0),
      sub_num integer not null default 0 check (sub_num >= 0),
      learned boolean not null default false,
      primary key (rest_id, formula_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['rest_formula', 'yard_basket', 'yard_steal', 'yard_plant', 'yard_land']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts`：import 加 `import * as m0010 from './0010_yard';`，`migrations` 里 `'0009_temple': m0009,` 下面加 `'0010_yard': m0010,`。

`apps/server/src/db/schema.ts`：在 `RestSeedTable` 之后加：

```ts
/** 菜园土地（子项目 4B-2）：no 从 1 起，最多 9 块 */
export interface YardLandTable {
  id: Generated<number>;
  rest_id: number;
  no: number;
  level: Default<number>;
  exp: Default<number>;
  created_at: TsDefault;
}

/** 作物：一块地一株；stage 1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期；stage_at 是进入本阶段的时刻 */
export interface YardPlantTable {
  id: Generated<number>;
  rest_id: number;
  shard_id: number;
  land_id: number;
  seed_id: number;
  foods_id: number;
  stage: number;
  stage_at: Ts;
  /** 本阶段施肥抵扣的分钟数，进入下一阶段时清零 */
  feed_min: Default<number>;
  /** 各阶段分钟数：播种时从种子复制，干涸浇水会缩短 */
  infancy: number;
  maturity: number;
  autumn: number;
  harvest: number;
  /** 剩余产量 / 播种时的产量（含土地加成） */
  harvest_num: number;
  harvest_max: number;
  worm: Default<number>;
  grass: Default<number>;
  dry: Default<number>;
  planted_at: TsDefault;
}

export interface YardStealTable {
  plant_id: number;
  rest_id: number;
  created_at: TsDefault;
}

export interface YardBasketTable {
  rest_id: number;
  foods_id: number;
  num: number;
}

export interface RestFormulaTable {
  rest_id: number;
  formula_id: number;
  main_num: Default<number>;
  sub_num: Default<number>;
  learned: Default<boolean>;
}
```

`DB` 里 `rest_seed: RestSeedTable;` 下面加：

```ts
  yard_land: YardLandTable;
  yard_plant: YardPlantTable;
  yard_steal: YardStealTable;
  yard_basket: YardBasketTable;
  rest_formula: RestFormulaTable;
```

文件末尾的行类型导出区加：

```ts
export type YardLandRow = Selectable<YardLandTable>;
export type YardPlantRow = Selectable<YardPlantTable>;
```

`apps/server/src/modules/ledger/ledger.ts` 和 `packages/shared/src/envelope.ts` 的 `kind` 联合类型末尾都加 `| 'basket'`（`... | 'remnant' | 'seed' | 'basket'`）。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0010.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/db apps/server/src/modules/ledger/ledger.ts packages/shared/src/envelope.ts
git commit -m "feat(db): migration 0010 for yard lands, plants, steals, basket and formula fragments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: 纯规则

**Files:**
- Create: `apps/server/src/modules/yard/rules.ts`、`apps/server/src/modules/yard/rules.test.ts`

**Interfaces:**
- Consumes: `Tuning['yard']`（Task 1）
- Produces（全部从 `modules/yard/rules.ts` 导出）：
  - `type YardTuning = Tuning['yard']`、`type EventTuning = YardTuning['events']`
  - `interface PlantState { stage; stage_at: Date; feed_min; infancy; maturity; autumn; harvest; harvest_num; worm; grass; dry }`（`YardPlantRow` 结构上兼容）
  - `landExpNeed(level): number`、`applyLandExp(level, exp, gain, maxLevel): { level; exp }`、`landBonus(level, t): number`、`landPrice(n, t): number`、`harvestNumOf(seedNum, bonus): number`
  - `stageMinutes(p, stage?): number`、`waterAt(p): Date | null`、`canWater(p, now): boolean`、`minutesLeft(p, now): number`、`dryWaterMinutes(cur, orig, t): number`、`feedUseful(p, plantTime): boolean`
  - `canStealLeft(left, baseNum, t): boolean`、`stealNum(seedLevel, left, rng, t): number`、`actionRate(restLevel, own): number`
  - `yardPeriod(now, e): string`（形如 `2026-09-30@13:27`）
  - `tickPlant(p, raining, now, rng, e): { next: PlantState; changed: boolean }`
  - `formulaAppraiseRate(toolRate, luckRate, moonRate, t): number`、`formulaPart(rng, moon: { secToMain: number } | null, hasSubOrLearned, t): { part: 'main' | 'sub'; upgraded: boolean }`、`composeExtra(num, luckRate, tearRate: number | null, rng, t): number`、`seedPrice(coin, t): number`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  actionRate,
  applyLandExp,
  canStealLeft,
  canWater,
  composeExtra,
  dryWaterMinutes,
  feedUseful,
  formulaAppraiseRate,
  formulaPart,
  harvestNumOf,
  landBonus,
  landExpNeed,
  landPrice,
  minutesLeft,
  seedPrice,
  stealNum,
  tickPlant,
  yardPeriod,
  type PlantState,
} from './rules';

const t = testConfig().tuning.yard;
const e = t.events;
const day = '2026-09-30';
const at = (h: number, m = 0) => gameTime(day, h, m);
/** 大米：幼年 24、育苗 36、成长 60、收获期 1440 分钟，产量 20；12:00 进入幼年期 */
const plant = (patch: Partial<PlantState> = {}): PlantState => ({
  stage: 1,
  stage_at: at(12),
  feed_min: 0,
  infancy: 24,
  maturity: 36,
  autumn: 60,
  harvest: 1440,
  harvest_num: 20,
  worm: 0,
  grass: 0,
  dry: 0,
  ...patch,
});
/** 6 个随机数依次是：虫吃、草吃、长草、干涸加重、开始干涸、长虫（计划裁定 2） */
const rolls = (...r: number[]) => sequenceRng([...r, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99].slice(0, 6));
const calm = () => rolls();

describe('土地（规格书 08 §8.1，裁定 2）', () => {
  it('升级所需经验 (L−1)²×2000+1000；逐级扣除，可以连升', () => {
    expect(landExpNeed(1)).toBe(1000);
    expect(landExpNeed(2)).toBe(3000);
    expect(applyLandExp(1, 990, 20, 10)).toEqual({ level: 2, exp: 10 });
    expect(applyLandExp(1, 0, 4005, 10)).toEqual({ level: 3, exp: 5 });
  });

  it('满级后不再升级，经验归 0（计划裁定 5）', () => {
    expect(applyLandExp(9, 128_990, 20, 10)).toEqual({ level: 10, exp: 0 });
    expect(applyLandExp(10, 0, 20, 10)).toEqual({ level: 10, exp: 0 });
  });

  it('产量加成每级 8%；第 n 块地 50,000 × 2ⁿ；产量向下取整', () => {
    expect(landBonus(1, t)).toBe(0);
    expect(landBonus(10, t)).toBe(72);
    expect(landPrice(1, t)).toBe(100_000);
    expect(landPrice(9, t)).toBe(25_600_000);
    expect(harvestNumOf(20, 8)).toBe(21);
    expect(harvestNumOf(6, 72)).toBe(10);
  });
});

describe('作物（规格书 08 §8.3）', () => {
  it('能否浇水：本阶段时长 − 施肥抵扣 到了才行；收获期、枯叶期不能', () => {
    expect(canWater(plant(), at(12, 23))).toBe(false);
    expect(canWater(plant(), at(12, 24))).toBe(true);
    expect(canWater(plant({ feed_min: 20 }), at(12, 4))).toBe(true);
    expect(canWater(plant({ stage: 4 }), at(23))).toBe(false);
    expect(canWater(plant({ stage: 5 }), at(23))).toBe(false);
  });

  it('剩余分钟：生长期到能浇水、收获期到枯萎，向上取整；枯叶期 0', () => {
    expect(minutesLeft(plant(), new Date(at(12).getTime() + 30_000))).toBe(24);
    expect(minutesLeft(plant(), at(13))).toBe(0);
    expect(minutesLeft(plant({ stage: 4 }), at(13))).toBe(1380);
    expect(minutesLeft(plant({ stage: 5 }), at(13))).toBe(0);
  });

  it('干涸浇水：本阶段 −5 分钟，低于种子原时长一半时不减', () => {
    expect(dryWaterMinutes(24, 24, t)).toBe(19);
    expect(dryWaterMinutes(17, 24, t)).toBe(12);
    expect(dryWaterMinutes(16, 24, t)).toBe(16);
  });

  it('施肥：本阶段时长 − 已抵扣 − 本次分钟 > 0 才有用；收获期不能施肥', () => {
    expect(feedUseful(plant({ stage: 3 }), 20)).toBe(true);
    expect(feedUseful(plant({ stage: 1 }), 60)).toBe(false);
    expect(feedUseful(plant({ stage: 3, feed_min: 40 }), 20)).toBe(false);
    expect(feedUseful(plant({ stage: 4 }), 20)).toBe(false);
  });

  it('偷菜：剩余 ≥ 种子原产量 × 0.7；7 级只偷 1；其他 1~2 个，不超过剩余', () => {
    expect(canStealLeft(14, 20, t)).toBe(true);
    expect(canStealLeft(13, 20, t)).toBe(false);
    expect(stealNum(7, 5, sequenceRng([0.9]), t)).toBe(1);
    expect(stealNum(1, 5, sequenceRng([0.9]), t)).toBe(2);
    expect(stealNum(1, 5, sequenceRng([0.1]), t)).toBe(1);
    expect(stealNum(1, 1, sequenceRng([0.9]), t)).toBe(1);
  });

  it('动作收益系数：等级 × 2 × (自己的地 2 : 1) + 1', () => {
    expect(actionRate(1, true)).toBe(5);
    expect(actionRate(3, false)).toBe(7);
  });
});

describe('自然事件周期（裁定 11）', () => {
  it('白天取最近一个已到的 07 / 27 / 47 分', () => {
    expect(yardPeriod(at(13, 30), e)).toBe(`${day}@13:27`);
    expect(yardPeriod(at(13, 7), e)).toBe(`${day}@13:07`);
    expect(yardPeriod(at(13, 5), e)).toBe(`${day}@12:47`);
  });

  it('夜里（22 点到次日 6 点）只有 27 分；跨天取前一天', () => {
    expect(yardPeriod(at(23, 10), e)).toBe(`${day}@22:27`);
    expect(yardPeriod(at(22, 20), e)).toBe(`${day}@21:47`);
    expect(yardPeriod(at(7, 5), e)).toBe(`${day}@06:27`);
    expect(yardPeriod(at(0, 10), e)).toBe('2026-09-29@23:27');
  });
});

describe('自然事件（规格书 08 §8.4，裁定 3，计划裁定 2）', () => {
  it('收获期过了 → 枯叶期，干涸清零', () => {
    const r = tickPlant(plant({ stage: 4, stage_at: gameTime('2026-09-29', 11), dry: 3 }), false, at(12), calm(), e);
    expect(r.next).toMatchObject({ stage: 5, dry: 0 });
    expect(r.changed).toBe(true);
  });

  it('有虫：rand < 0.2 减产 1；减到 0 → 枯叶期', () => {
    expect(tickPlant(plant({ worm: 1, harvest_num: 5 }), false, at(12, 1), rolls(0.1), e).next.harvest_num).toBe(4);
    expect(tickPlant(plant({ worm: 1, harvest_num: 5 }), false, at(12, 1), rolls(0.3), e).next.harvest_num).toBe(5);
    expect(tickPlant(plant({ worm: 1, harvest_num: 1 }), false, at(12, 1), rolls(0.1), e).next).toMatchObject({
      stage: 5,
      harvest_num: 0,
    });
  });

  it('有草：rand < 0.03 × 草数 减产', () => {
    expect(tickPlant(plant({ grass: 2 }), false, at(12, 1), rolls(0.99, 0.05), e).next.harvest_num).toBe(19);
    expect(tickPlant(plant({ grass: 1 }), false, at(12, 1), rolls(0.99, 0.05), e).next.harvest_num).toBe(20);
  });

  it('不下雨且干涸 ≥ 100 → 枯叶期；下雨时不会干死', () => {
    expect(tickPlant(plant({ dry: 100 }), false, at(12, 1), calm(), e).next.stage).toBe(5);
    const rain = tickPlant(plant({ dry: 100 }), true, at(12, 1), calm(), e);
    expect(rain.next).toMatchObject({ stage: 1, dry: 100 });
    expect(rain.changed).toBe(false);
  });

  it('长草：不下雨时概率 ×3（0.024），下雨时 0.008', () => {
    expect(tickPlant(plant(), false, at(12, 1), rolls(0.99, 0.99, 0.02), e).next.grass).toBe(1);
    expect(tickPlant(plant(), true, at(12, 1), rolls(0.99, 0.99, 0.02), e).next.grass).toBe(0);
  });

  it('干涸加重：rand < 0.1 时不下雨 +1（有草 +2），下雨清零', () => {
    const r = rolls(0.99, 0.99, 0.99, 0.05);
    expect(tickPlant(plant({ dry: 5 }), false, at(12, 1), r, e).next.dry).toBe(6);
    expect(tickPlant(plant({ dry: 5, grass: 1 }), false, at(12, 1), rolls(0.99, 0.99, 0.99, 0.05), e).next.dry).toBe(7);
    expect(tickPlant(plant({ dry: 5 }), true, at(12, 1), rolls(0.99, 0.99, 0.99, 0.05), e).next.dry).toBe(0);
    expect(tickPlant(plant({ dry: 5 }), false, at(12, 1), rolls(0.99, 0.99, 0.99, 0.5), e).next.dry).toBe(5);
  });

  it('开始干涸：不下雨、没干涸，rand < 0.002（有草 0.01）', () => {
    const roll = () => rolls(0.99, 0.99, 0.99, 0.99, 0.005);
    expect(tickPlant(plant(), false, at(12, 1), roll(), e).next.dry).toBe(0);
    expect(tickPlant(plant({ grass: 1 }), false, at(12, 1), roll(), e).next.dry).toBe(1);
    expect(tickPlant(plant({ grass: 1 }), true, at(12, 1), roll(), e).next.dry).toBe(0);
  });

  it('长虫：没虫时 rand < 0.003', () => {
    expect(tickPlant(plant(), false, at(12, 1), rolls(0.99, 0.99, 0.99, 0.99, 0.99, 0.001), e).next.worm).toBe(1);
  });

  it('下雨自动进入下一阶段：生长期、无虫无草、到了浇水时间', () => {
    const r = tickPlant(plant(), true, at(12, 30), calm(), e);
    expect(r.next).toMatchObject({ stage: 2, stage_at: at(12, 30), feed_min: 0 });
    expect(r.changed).toBe(true);
    expect(tickPlant(plant({ stage: 3 }), true, at(13, 30), calm(), e).next.stage).toBe(4);
    expect(tickPlant(plant({ worm: 1 }), true, at(12, 30), calm(), e).next.stage).toBe(1);
    expect(tickPlant(plant(), false, at(12, 30), calm(), e).next.stage).toBe(1);
    expect(tickPlant(plant(), true, at(12, 10), calm(), e).next.stage).toBe(1);
    expect(tickPlant(plant({ stage: 4 }), true, at(12, 30), calm(), e).next.stage).toBe(4);
  });

  it('什么都没发生时 changed = false', () => {
    expect(tickPlant(plant(), false, at(12, 30), calm(), e).changed).toBe(false);
  });
});

describe('配方（规格书 09 §9.3、08 §8.5）', () => {
  it('鉴定成功率 = 道具 formulaRate + 幸运率 × 0.1 + 星月密卷', () => {
    expect(formulaAppraiseRate(0.25, 0.1, 0.1, t)).toBeCloseTo(0.36);
    expect(formulaAppraiseRate(0.25, 0, 0, t)).toBeCloseTo(0.25);
  });

  it('主碎片 rand < 0.25；星月密卷在已有辅碎片（或已学）时把辅碎片按 secToMain 转成主碎片', () => {
    expect(formulaPart(sequenceRng([0.1]), null, false, t)).toEqual({ part: 'main', upgraded: false });
    expect(formulaPart(sequenceRng([0.5]), null, true, t)).toEqual({ part: 'sub', upgraded: false });
    expect(formulaPart(sequenceRng([0.5, 0.1]), { secToMain: 0.2 }, true, t)).toEqual({
      part: 'main',
      upgraded: true,
    });
    expect(formulaPart(sequenceRng([0.5, 0.1]), { secToMain: 0.2 }, false, t)).toEqual({
      part: 'sub',
      upgraded: false,
    });
  });

  it('合成额外产出：每份 rand < 0.1 +1、rand < 幸运率/5 +1、有星神之泪 rand < 0.25 +1', () => {
    expect(composeExtra(2, 0, null, sequenceRng([0.05, 0.99, 0.99, 0.99]), t)).toBe(1);
    expect(composeExtra(1, 0.5, 0.25, sequenceRng([0.99, 0.05, 0.2]), t)).toBe(2);
    expect(composeExtra(3, 0, null, sequenceRng([0.99]), t)).toBe(0);
  });

  it('种子单价 = ⌈coin × seedPriceRate⌉（计划裁定 6）', () => {
    expect(seedPrice(1800, t)).toBe(1800);
    expect(seedPrice(1801, { ...t, seedPriceRate: 1.5 })).toBe(2702);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/rules.test.ts`
Expected: FAIL（`./rules` 不存在）

- [ ] **Step 3: 实现**

`apps/server/src/modules/yard/rules.ts`：

```ts
import type { Tuning } from '@dt/config';
import { gameParts, type Rng } from '@dt/shared';

export type YardTuning = Tuning['yard'];
export type EventTuning = YardTuning['events'];

/** 作物的可变状态（yard_plant 的一部分列）；阶段 1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期 */
export interface PlantState {
  stage: number;
  stage_at: Date;
  feed_min: number;
  infancy: number;
  maturity: number;
  autumn: number;
  harvest: number;
  harvest_num: number;
  worm: number;
  grass: number;
  dry: number;
}

const MIN = 60_000;

/** 土地升到下一级所需经验（规格书 20 §20.7，裁定 2） */
export function landExpNeed(level: number): number {
  return (level - 1) ** 2 * 2000 + 1000;
}

/** 加土地经验，逐级扣除；满级后经验归 0、不再累计（计划裁定 5） */
export function applyLandExp(
  level: number,
  exp: number,
  gain: number,
  maxLevel: number,
): { level: number; exp: number } {
  let l = level;
  let e = exp + gain;
  while (l < maxLevel && e >= landExpNeed(l)) {
    e -= landExpNeed(l);
    l += 1;
  }
  return { level: l, exp: l >= maxLevel ? 0 : e };
}

/** 土地产量加成（%） */
export function landBonus(level: number, t: YardTuning): number {
  return (level - 1) * t.yieldPerLevel;
}

/** 第 n 块地（从 1 数）的开垦价 */
export function landPrice(n: number, t: YardTuning): number {
  return t.landBaseCoin * 2 ** n;
}

export function harvestNumOf(seedNum: number, bonus: number): number {
  return Math.floor((seedNum * (100 + bonus)) / 100);
}

/** 某阶段的时长（分钟）；枯叶期 0 */
export function stageMinutes(p: PlantState, stage = p.stage): number {
  if (stage === 1) return p.infancy;
  if (stage === 2) return p.maturity;
  if (stage === 3) return p.autumn;
  if (stage === 4) return p.harvest;
  return 0;
}

/** 生长期（1~3）能浇水的时刻；其他阶段 null */
export function waterAt(p: PlantState): Date | null {
  if (p.stage < 1 || p.stage > 3) return null;
  return new Date(p.stage_at.getTime() + (stageMinutes(p) - p.feed_min) * MIN);
}

export function canWater(p: PlantState, now: Date): boolean {
  const w = waterAt(p);
  return w !== null && w.getTime() <= now.getTime();
}

/** 生长期：还要几分钟能浇水；收获期：还有几分钟枯萎；枯叶期 0 */
export function minutesLeft(p: PlantState, now: Date): number {
  const end = p.stage === 4 ? p.stage_at.getTime() + p.harvest * MIN : waterAt(p)?.getTime();
  if (end === undefined) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / MIN));
}

/** 干涸时浇水：本阶段时长 −dryWaterSub，低于种子原时长 × dryWaterMinRate 时不减 */
export function dryWaterMinutes(cur: number, orig: number, t: YardTuning): number {
  const next = cur - t.dryWaterSub;
  return next >= orig * t.dryWaterMinRate ? next : cur;
}

/** 施肥后本阶段是否还有剩余时间（规格书 08 §8.3） */
export function feedUseful(p: PlantState, plantTime: number): boolean {
  return p.stage >= 1 && p.stage <= 3 && stageMinutes(p) - p.feed_min - plantTime > 0;
}

/** 偷菜门槛：剩余产量 ≥ 种子原产量 × stealKeepRate（裁定 4，不含土地加成） */
export function canStealLeft(left: number, baseNum: number, t: YardTuning): boolean {
  return left >= baseNum * t.stealKeepRate;
}

/** 偷几个：7 级 1 个，其他 1~stealMax 个，不超过剩余 */
export function stealNum(seedLevel: number, left: number, rng: Rng, t: YardTuning): number {
  const n = seedLevel >= 7 ? 1 : rng.intMin1(t.stealMax);
  return Math.min(n, left);
}

/** 菜园动作收益系数（规格书 20 §20.7） */
export function actionRate(restLevel: number, own: boolean): number {
  return restLevel * 2 * (own ? 2 : 1) + 1;
}

const pad = (n: number) => String(n).padStart(2, '0');

function allowedMinutes(hour: number, e: EventTuning): readonly number[] {
  return hour >= e.dayFrom && hour < e.dayTo ? e.minutes : [e.nightMinute];
}

/** 最近一个已到的自然事件时点（裁定 11）：白天每小时 minutes 各一次，夜里只有 nightMinute */
export function yardPeriod(now: Date, e: EventTuning): string {
  const { day, hour, minute } = gameParts(now);
  const here = allowedMinutes(hour, e).filter((m) => m <= minute);
  if (here.length > 0) return `${day}@${pad(hour)}:${pad(Math.max(...here))}`;
  const prev = gameParts(new Date(now.getTime() - (minute + 1) * MIN));
  return `${prev.day}@${pad(prev.hour)}:${pad(Math.max(...allowedMinutes(prev.hour, e)))}`;
}

const KEYS: ReadonlyArray<keyof PlantState> = [
  'stage',
  'feed_min',
  'infancy',
  'maturity',
  'autumn',
  'harvest',
  'harvest_num',
  'worm',
  'grass',
  'dry',
];

/**
 * 一株作物的一次自然事件（规格书 08 §8.4、源码 plantTask，裁定 3）。
 * 每次固定先抽 6 个随机数（虫吃、草吃、长草、干涸加重、开始干涸、长虫），枯萎后不再往下判断（计划裁定 2）
 */
export function tickPlant(
  p: PlantState,
  raining: boolean,
  now: Date,
  rng: Rng,
  e: EventTuning,
): { next: PlantState; changed: boolean } {
  const r = Array.from({ length: 6 }, () => rng.next());
  const s: PlantState = { ...p };
  const done = () => ({
    next: s,
    changed: s.stage_at.getTime() !== p.stage_at.getTime() || KEYS.some((k) => s[k] !== p[k]),
  });
  const wither = () => {
    s.stage = 5;
    s.dry = 0;
    return done();
  };
  if (s.stage === 4 && s.stage_at.getTime() + s.harvest * MIN < now.getTime()) return wither();
  if ((s.worm > 0 && r[0]! < e.wormEatRate) || r[1]! < e.grassEatRate * s.grass) {
    s.harvest_num = Math.max(0, s.harvest_num - 1);
    if (s.harvest_num === 0) return wither();
  }
  if (!raining && s.dry >= e.dryDeath) return wither();
  if (r[2]! < e.grassRate * (raining ? 1 : e.grassDryFactor)) s.grass += 1;
  if (s.dry > 0 && r[3]! < e.dryAddRate) s.dry = raining ? 0 : s.dry + 1 + (s.grass > 0 ? 1 : 0);
  if (!raining && s.dry === 0 && r[4]! < e.dryStartRate + (s.grass > 0 ? e.dryStartGrassRate : 0)) s.dry = 1;
  if (s.worm === 0 && r[5]! < e.wormRate) s.worm = 1;
  if (raining && s.stage < 4 && s.worm === 0 && s.grass === 0 && canWater(s, now)) {
    s.stage += 1;
    s.stage_at = now;
    s.feed_min = 0;
  }
  return done();
}

/** 配方鉴定成功率（规格书 09 §9.3）：道具 formulaRate + 幸运率 × formulaAppraiseRatePerLuck + 星月密卷 */
export function formulaAppraiseRate(toolRate: number, luckRate: number, moonRate: number, t: YardTuning): number {
  return toolRate + luckRate * t.formulaAppraiseRatePerLuck + moonRate;
}

/** 鉴定成功后得主碎片还是辅碎片；有星月密卷且已有该配方辅碎片（或已学会）时辅碎片按 secToMain 转成主碎片 */
export function formulaPart(
  rng: Rng,
  moon: { secToMain: number } | null,
  hasSubOrLearned: boolean,
  t: YardTuning,
): { part: 'main' | 'sub'; upgraded: boolean } {
  if (rng.next() < t.formulaMainRate) return { part: 'main', upgraded: false };
  if (moon && hasSubOrLearned && rng.next() < moon.secToMain) return { part: 'main', upgraded: true };
  return { part: 'sub', upgraded: false };
}

/** 合成的额外产出：每份 rand < composeCritRate +1；rand < 幸运率/5 +1（计划裁定 13）；有星神之泪时 rand < tearRate +1 */
export function composeExtra(num: number, luckRate: number, tearRate: number | null, rng: Rng, t: YardTuning): number {
  let extra = 0;
  for (let i = 0; i < num; i++) {
    if (rng.next() < t.composeCritRate) extra += 1;
    if (rng.next() < luckRate / 5) extra += 1;
    if (tearRate !== null && rng.next() < tearRate) extra += 1;
  }
  return extra;
}

/** 种子商店单价（裁定 1，计划裁定 6） */
export function seedPrice(coin: number, t: YardTuning): number {
  return Math.ceil(coin * t.seedPriceRate);
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/rules.test.ts`
Expected: PASS

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/yard/rules.ts apps/server/src/modules/yard/rules.test.ts
git commit -m "feat(yard): pure rules for lands, crops, stealing, natural events and formulas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 服务骨架——概览、开垦、接口 DTO、路由、功能、主线第 28 步

**Files:**
- Create: `packages/shared/src/schemas/yard.ts`
- Create: `apps/server/src/modules/yard/common.ts`、`view.ts`、`land.ts`、`service.ts`、`routes.ts`、`land.test.ts`
- Modify: `packages/shared/src/index.ts`、`apps/server/src/core/features.ts`、`apps/server/src/game.ts`、`apps/server/src/modules/index.ts`、`apps/server/src/modules/task/service.ts`

**Interfaces:**
- Consumes: `landBonus`、`landExpNeed`、`landPrice`、`canWater`、`minutesLeft`、`stageMinutes`（Task 3）；`GameConfig.fertilizers`、`GameConfig.seeds`（Task 1）；表类型（Task 2）
- Produces:
  - `@dt/shared`：所有菜园 body（`yardPlantBody`、`yardPlantIdBody`、`yardFeedBody`、`basketStoreBody`、`formulaAppraiseBody`、`formulaIdBody`、`formulaDecomposeBody`、`formulaComposeBody`、`seedBuyBody`、`seedExchangeBody`）和 DTO（`PlantDto`、`LandDto`、`YardDto`、`StealBlock`、`FriendPlantDto`、`FriendYardDto`、`ReapResultDto`、`BasketDto`、`FormulaDto`、`FormulasDto`、`FormulaAppraiseResultDto`、`ComposeResultDto`、`SeedsDto`）
  - `modules/yard/common.ts`：`badInput(reason): AppError`
  - `modules/yard/view.ts`：`plantDto(p: YardPlantRow, config: GameConfig, now: Date): PlantDto`、`yardView(db, config, rest: RestaurantRow, t: YardTuning, now: Date): Promise<YardDto>`
  - `modules/yard/land.ts`：`expandLand(o: Op): Promise<{ no: number; coin: number }>`
  - `createYardService(d: GameDeps)` 返回 `{ overview(ctx), expand(ctx) }`（后续任务往里加方法）；`YardService` 类型；`Game.yard`
  - `yardRoutes(svc): FastifyPluginAsync`：`GET /yard`、`POST /yard/land/expand`
  - 任务状态键 `yard.lands` = 已开垦块数

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/land.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('菜园概览和开垦（规格书 08 §8.1）', () => {
  it('新店没有土地；下一块 100,000；体力、声望、种子、肥料持有', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 50, renown: 3 }, goods: { 427: 2 } });
    await t.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 1, num: 4 }).execute();
    const y = await t.game.yard.overview(ctx);
    expect(y).toMatchObject({
      lands: [],
      maxLands: 9,
      nextLandCoin: 100_000,
      coin: 50,
      strength: 100,
      renown: 3,
      seeds: [{ seedId: 1, num: 4 }],
    });
    expect(y.fertilizers).toEqual([
      { goodsId: 427, minutes: 20, num: 2 },
      { goodsId: 428, minutes: 60, num: 0 },
    ]);
  });

  it('开垦费用 50,000 × 2ⁿ 递增；新土地 1 级 0 经验；银币不够报 NOT_ENOUGH', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 300_000 } });
    expect((await t.game.yard.expand(ctx)).data).toEqual({ no: 1, coin: 100_000 });
    expect((await t.game.yard.expand(ctx)).data).toEqual({ no: 2, coin: 200_000 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(0);
    const y = await t.game.yard.overview(ctx);
    expect(y.lands).toEqual([
      { no: 1, level: 1, exp: 0, expNext: 1000, bonus: 0, plant: null },
      { no: 2, level: 1, exp: 0, expNext: 1000, bonus: 0, plant: null },
    ]);
    expect(y.nextLandCoin).toBe(400_000);
    await expect(t.game.yard.expand(ctx)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin', need: 400_000 },
    });
  });

  it('满 9 块报 LIMIT_REACHED lands；满级土地没有下一级、加成 72%', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000_000 } });
    for (let no = 1; no <= 9; no++) {
      await t.db
        .insertInto('yard_land')
        .values({ rest_id: ctx.restaurantId, no, level: no === 9 ? 10 : 1 })
        .execute();
    }
    await expect(t.game.yard.expand(ctx)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'lands', max: 9 },
    });
    const y = await t.game.yard.overview(ctx);
    expect(y.nextLandCoin).toBeNull();
    expect(y.lands[8]).toMatchObject({ no: 9, level: 10, expNext: null, bonus: 72 });
  });

  it('主线第 28 步「开垦一块菜园」不再跳过，开垦后完成', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000, main_task_step: 28 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 28, key: 'yard.lands', done: false });
    await t.game.yard.expand(ctx);
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 28, progress: 1, done: true });
  });

  it('区服关闭 yard：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { yard: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.yard.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.yard.expand(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/land.test.ts`
Expected: FAIL（`t.game.yard` 未定义）

- [ ] **Step 3: 共享的 body 和 DTO**

`packages/shared/src/schemas/yard.ts`：

```ts
import { z } from 'zod';

const id = z.number().int().positive();
const times = z.number().int().min(1).max(99);
export const yardPlantBody = z.object({ landNo: z.number().int().min(1).max(99), seedId: id });
export const yardPlantIdBody = z.object({ plantId: id });
export const yardFeedBody = z.object({ plantId: id, goodsId: id });
export const basketStoreBody = z.object({ foodsId: id, num: z.number().int().min(1).max(1_000_000) });
export const formulaAppraiseBody = z.object({ toolId: id, times });
export const formulaIdBody = z.object({ formulaId: id });
export const formulaDecomposeBody = z.object({
  formulaId: id,
  part: z.enum(['main', 'sub']),
  num: z.number().int().min(1).max(9999),
});
export const formulaComposeBody = z.object({ formulaId: id, num: times });
export const seedBuyBody = z.object({ seedId: id, num: times });
export const seedExchangeBody = z.object({ seedId: id, times });

export interface PlantDto {
  id: number;
  seedId: number;
  foodsId: number;
  /** 种子（食材）等级 */
  level: number;
  /** 1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期 */
  stage: number;
  canWater: boolean;
  /** 生长期：还要几分钟能浇水（0 = 现在就能）；收获期：还有几分钟枯萎；枯叶期 0 */
  minutes: number;
  /** 本阶段时长、本阶段已施肥抵扣（分钟） */
  stageMinutes: number;
  feedMin: number;
  worm: number;
  grass: number;
  dry: number;
  harvestNum: number;
  harvestMax: number;
  /** 种子原产量（偷菜门槛的基数） */
  baseNum: number;
}

export interface LandDto {
  no: number;
  level: number;
  exp: number;
  /** 升到下一级所需经验；满级 null */
  expNext: number | null;
  /** 产量加成（%） */
  bonus: number;
  plant: PlantDto | null;
}

export interface YardDto {
  lands: LandDto[];
  maxLands: number;
  /** 下一块地的开垦价；满了 null */
  nextLandCoin: number | null;
  coin: number;
  strength: number;
  renown: number;
  seeds: Array<{ seedId: number; num: number }>;
  fertilizers: Array<{ goodsId: number; minutes: number; num: number }>;
}

/** 偷菜被挡住的原因；null = 可以偷 */
export type StealBlock =
  | 'stolen'
  | 'withered'
  | 'not_ripe'
  | 'has_worm'
  | 'has_grass'
  | 'steal_left'
  | 'renown'
  | null;

export interface FriendPlantDto extends PlantDto {
  stolen: boolean;
  stealBlock: StealBlock;
}

export interface FriendYardDto {
  restId: number;
  name: string;
  lands: Array<{ no: number; level: number; plant: FriendPlantDto | null }>;
  /** 我的体力和声望 */
  strength: number;
  renown: number;
}

/** 收获或偷菜的结果：num 含 reapAddNum；punished = 被边牧扣掉的食材 id */
export interface ReapResultDto {
  foodsId: number;
  num: number;
  stolen: boolean;
  punished: number | null;
}

export interface BasketDto {
  items: Array<{ foodsId: number; num: number }>;
}

export interface FormulaDto {
  id: number;
  name: string;
  mainFoodsId: number;
  subFoodsId: number;
  addFoodsId: number;
  resFoodsId: number;
  mainNum: number;
  subNum: number;
  learned: boolean;
  /** 主料在菜篮、辅料和添加料在橱柜的持有 */
  have: { main: number; sub: number; add: number };
  /** 最多能合成几份（已学才有；受原料、体力和 99 限制） */
  maxCompose: number;
}

export interface FormulasDto {
  formulas: FormulaDto[];
  /** 配方鉴定道具（value 里有 formulaRate） */
  tools: Array<{ goodsId: number; num: number; rate: number }>;
  /** 玄奥配方持有 */
  scrolls: number;
  /** 配方精华持有 */
  essence: number;
  strength: number;
  composeStrength: number;
}

export interface FormulaAppraiseResultDto {
  results: Array<{ ok: boolean; formulaId?: number; part?: 'main' | 'sub'; upgraded?: boolean }>;
}

export interface ComposeResultDto {
  foodsId: number;
  num: number;
  extra: number;
}

export interface SeedsDto {
  stock: Array<{ seedId: number; num: number }>;
  shop: { open: boolean; items: Array<{ seedId: number; price: number }> };
  exchange: Array<{ seedId: number; seedNum: number; essence: number }>;
  essence: number;
  coin: number;
}
```

`packages/shared/src/index.ts` 末尾加 `export * from './schemas/yard';`。

- [ ] **Step 4: 服务骨架**

`apps/server/src/modules/yard/common.ts`：

```ts
import { ErrorCode } from '@dt/shared';
import { AppError } from '../../http/errors';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });
```

`apps/server/src/modules/yard/view.ts`：

```ts
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { PlantDto, YardDto } from '@dt/shared';
import type { DB, RestaurantRow, YardPlantRow } from '../../db/schema';
import {
  canWater,
  landBonus,
  landExpNeed,
  landPrice,
  minutesLeft,
  stageMinutes,
  type YardTuning,
} from './rules';

export function plantDto(p: YardPlantRow, config: GameConfig, now: Date): PlantDto {
  const seed = config.seeds.get(p.seed_id);
  return {
    id: p.id,
    seedId: p.seed_id,
    foodsId: p.foods_id,
    level: seed?.level ?? 0,
    stage: p.stage,
    canWater: canWater(p, now),
    minutes: minutesLeft(p, now),
    stageMinutes: stageMinutes(p),
    feedMin: p.feed_min,
    worm: p.worm,
    grass: p.grass,
    dry: p.dry,
    harvestNum: p.harvest_num,
    harvestMax: p.harvest_max,
    baseNum: seed?.harvestNum ?? p.harvest_max,
  };
}

/** 我的菜园（设计文档 §5） */
export async function yardView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: YardTuning,
  now: Date,
): Promise<YardDto> {
  const lands = await db
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', rest.id)
    .orderBy('no')
    .execute();
  const plants = await db.selectFrom('yard_plant').selectAll().where('rest_id', '=', rest.id).execute();
  const byLand = new Map(plants.map((p) => [p.land_id, p]));
  const seeds = await db
    .selectFrom('rest_seed')
    .select(['seed_id', 'num'])
    .where('rest_id', '=', rest.id)
    .where('num', '>', 0)
    .orderBy('seed_id')
    .execute();
  const fertIds = [...config.fertilizers.keys()];
  const held =
    fertIds.length === 0
      ? []
      : await db
          .selectFrom('store_item')
          .select(['goods_id', 'num'])
          .where('rest_id', '=', rest.id)
          .where('goods_id', 'in', fertIds)
          .execute();
  return {
    lands: lands.map((l) => {
      const p = byLand.get(l.id);
      return {
        no: l.no,
        level: l.level,
        exp: l.exp,
        expNext: l.level >= t.landMaxLevel ? null : landExpNeed(l.level),
        bonus: landBonus(l.level, t),
        plant: p ? plantDto(p, config, now) : null,
      };
    }),
    maxLands: t.maxLands,
    nextLandCoin: lands.length >= t.maxLands ? null : landPrice(lands.length + 1, t),
    coin: rest.coin,
    strength: rest.strength,
    renown: rest.renown,
    seeds: seeds.map((s) => ({ seedId: s.seed_id, num: s.num })),
    fertilizers: [...config.fertilizers].map(([goodsId, minutes]) => ({
      goodsId,
      minutes,
      num: held.find((h) => h.goods_id === goodsId)?.num ?? 0,
    })),
  };
}
```

`apps/server/src/modules/yard/land.ts`：

```ts
import { limitReached } from '../../core/errors';
import type { Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { landPrice } from './rules';

/** 开垦下一块地（规格书 08 §8.1）：第 n 块花 landBaseCoin × 2ⁿ */
export async function expandLand(o: Op): Promise<{ no: number; coin: number }> {
  const t = o.tuning.yard;
  const r = await o.tx
    .selectFrom('yard_land')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
  const have = Number(r.n);
  if (have >= t.maxLands) throw limitReached('lands', { max: t.maxLands });
  const no = have + 1;
  const coin = landPrice(no, t);
  spendCoin(o, coin);
  await o.tx.insertInto('yard_land').values({ rest_id: o.rest.id, no }).execute();
  return { no, coin };
}
```

`apps/server/src/modules/yard/service.ts`：

```ts
import type { YardDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { expandLand } from './land';
import { yardView } from './view';

export function createYardService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'yard', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return {
    async overview(ctx: RestCtx): Promise<YardDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      return yardView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.yard, d.now());
    },

    expand(ctx: RestCtx) {
      return op(ctx, 'yard.land', (o) => expandLand(o));
    },
  };
}

export type YardService = ReturnType<typeof createYardService>;
```

`apps/server/src/modules/yard/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import type { YardService } from './service';

export function yardRoutes(svc: YardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/yard', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/yard/land/expand', async (req) => okOp(await svc.expand(restCtxOf(req))));
  };
}
```

- [ ] **Step 5: 装配、功能、任务状态键**

`apps/server/src/core/features.ts` 的 `IMPLEMENTED_FEATURES` 里 `'temple',` 下面加 `'yard',`。

`apps/server/src/game.ts`：
- import 加 `import { createYardService, type YardService } from './modules/yard/service';`
- `Game` 接口 `temple: TempleService;` 下面加 `yard: YardService;`
- 返回对象 `temple: createTempleService(deps, world),` 下面加 `yard: createYardService(deps),`

`apps/server/src/modules/index.ts`：import 加 `import { yardRoutes } from './yard/routes';`，末尾加 `app.register(yardRoutes(game.yard), { prefix: '/api/v1' });`。

`apps/server/src/modules/task/service.ts` 的 `snapshot` 里 `const mcLearned = ...` 之后加：

```ts
    const lands = await db
      .selectFrom('yard_land')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirstOrThrow();
```

`extra` 里 `'mc.learned': Number(mcLearned.n),` 下面加 `'yard.lands': Number(lands.n),`。

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/land.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿（如果有测试断言"主线第 28 步被跳过"而失败，改成新行为并在 ledger 记一条 Ruling）

```bash
git add packages/shared apps/server/src
git commit -m "feat(yard): yard overview and land expansion; yard feature, routes and main step 28

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: 自己的作物——播种、浇水、施肥、除虫、除草、铲除、收获、菜篮

**Files:**
- Create: `apps/server/src/modules/yard/crop.ts`、`apps/server/src/modules/yard/basket.ts`、`apps/server/src/modules/yard/crop.test.ts`
- Modify: `apps/server/src/modules/yard/common.ts`、`service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 3 规则；Task 4 `badInput`、`createYardService`；`addSeeds(o, seedId, num)`（`modules/temple/common.ts`）；`addFoods`、`consumeGoods`、`opAgg`、`emitAction`、`spendStrength`、`gainExp`、`gainCoin`、`recordChange`
- Produces:
  - `common.ts`：`ACTION = { plant: 50, water: 51, weed: 52, deworm: 53, reap: 54, remove: 55, feed: 56 }`、`actionIncome(o, actionId, own, extraExp = 0): void`、`addLandExp(o, landId, actionId): Promise<void>`、`lockPlant(o, plantId, ownerId): Promise<YardPlantRow>`、`assertAlive(p)`、`assertRipe(p)`、`addBasket(o, foodsId, num)`、`subBasket(o, foodsId, num)`、`subSeed(o, seedId, num)`
  - `crop.ts`：`plantSeed(o, {landNo, seedId}): Promise<{ plantId }>`、`waterPlant(o, pair: PairOp | null, plantId): Promise<{ stage }>`、`weedPlant(o, pair, plantId)`、`dewormPlant(o, pair, plantId)`（都返回 `{ plantId }`）、`feedPlant(o, {plantId, goodsId}): Promise<{ feedMin }>`、`removePlant(o, plantId): Promise<{ seedBack: boolean }>`、`reapPlant(o, plantId): Promise<ReapResultDto>`
  - `basket.ts`：`basketView(db, restId): Promise<BasketDto>`、`storeBasket(o, {foodsId, num}): Promise<{ stored; dropped }>`
  - 服务方法 `plant`、`water`、`feed`、`weed`、`deworm`、`remove`、`reap`、`basket`、`storeBasket`；路由 `POST /yard/plant|water|feed|weed|deworm|remove|reap`、`GET /yard/basket`、`POST /yard/basket/store`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/crop.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay, gameTime, sequenceRng } from '@dt/shared';
import {
  createTestGame,
  foodNum,
  goodsNum,
  newRestaurant,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';

let t: TestGame;
/** 随机数固定 0：铲除必返还种子 */
let lucky: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  lucky = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await lucky.close();
});

const MIN = 60_000;
const noon = () => gameTime(gameDay(new Date()), 12);

/** 一家店 + 1 号地（等级 landLevel）+ 2 颗大米种子（1 号：幼年 24、育苗 36、成长 60 分钟，产量 20） */
async function withLand(g: TestGame, opts: NewRestaurantOptions = {}, landLevel = 1) {
  const ctx = await newRestaurant(g, opts);
  await g.db.insertInto('yard_land').values({ rest_id: ctx.restaurantId, no: 1, level: landLevel }).execute();
  await g.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 1, num: 2 }).execute();
  return ctx;
}
const plantOf = (g: TestGame, id: number) =>
  g.db.selectFrom('yard_plant').selectAll().where('id', '=', id).executeTakeFirst();
const landOf = (g: TestGame, restId: number) =>
  g.db.selectFrom('yard_land').selectAll().where('rest_id', '=', restId).where('no', '=', 1).executeTakeFirstOrThrow();
async function seedNum(g: TestGame, restId: number, seedId: number) {
  const r = await g.db
    .selectFrom('rest_seed')
    .select('num')
    .where('rest_id', '=', restId)
    .where('seed_id', '=', seedId)
    .executeTakeFirst();
  return r?.num ?? 0;
}
async function basketNum(g: TestGame, restId: number, foodsId: number) {
  const r = await g.db
    .selectFrom('yard_basket')
    .select('num')
    .where('rest_id', '=', restId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

describe('作物（规格书 08 §8.3）', () => {
  it('播种 → 浇水三次 → 收获进菜篮 → 存进橱柜；土地经验、收益、2 级地产量 +8%；主线第 29 步', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t, { patch: { main_task_step: 29 } }, 2);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    expect(await seedNum(t, ctx.restaurantId, 1)).toBe(1);
    expect(await plantOf(t, data.plantId)).toMatchObject({
      stage: 1,
      harvest_num: 21,
      harvest_max: 21,
      foods_id: 101,
      shard_id: ctx.shardId,
    });
    await expect(t.game.yard.water(ctx, { plantId: data.plantId })).rejects.toMatchObject({
      params: { reason: 'no_water' },
    });
    for (const minutes of [24, 36, 60]) {
      t.clock.advance(minutes * MIN);
      await t.game.yard.water(ctx, { plantId: data.plantId });
    }
    expect((await plantOf(t, data.plantId))!.stage).toBe(4);
    const r = await t.game.yard.reap(ctx, { plantId: data.plantId });
    expect(r.data).toEqual({ foodsId: 101, num: 21, stolen: false, punished: null });
    expect(await plantOf(t, data.plantId)).toBeUndefined();
    expect(await t.game.yard.basket(ctx)).toEqual({ items: [{ foodsId: 101, num: 21 }] });
    expect(r.events).toContainEqual({ type: 'gain', kind: 'basket', num: 21, id: 101 });
    // 土地经验：播种 10 + 浇水 5×3 + 收获 20
    expect(await landOf(t, ctx.restaurantId)).toMatchObject({ level: 2, exp: 45 });
    // 等级 1、自己的地：系数 5。播种 5 银币 10 经验；浇水各 5 / 5；收获 10 银币、15 + 食材等级 1 经验
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 95, coin: 30, exp: 41 });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 29, done: true });

    const s = await t.game.yard.storeBasket(ctx, { foodsId: 101, num: 21 });
    expect(s.data).toEqual({ stored: 21, dropped: 0 });
    expect(s.events).toContainEqual({ type: 'loss', kind: 'basket', num: 21, id: 101 });
    expect(await basketNum(t, ctx.restaurantId, 101)).toBe(0);
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(21);
  });

  it('播种检查：不是种子、没开垦、种子不够、地上已有作物；失败时种子不扣', async () => {
    const ctx = await withLand(t);
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 9999 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'no_seed' },
    });
    await expect(t.game.yard.plant(ctx, { landNo: 2, seedId: 1 })).rejects.toMatchObject({
      params: { reason: 'no_land' },
    });
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 5 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'seed', id: 5, need: 1, have: 0 },
    });
    await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 1 })).rejects.toMatchObject({
      params: { reason: 'land_busy' },
    });
    expect(await seedNum(t, ctx.restaurantId, 1)).toBe(1);
  });

  it('体力不够：报 NOT_ENOUGH strength，种子不扣', async () => {
    const ctx = await withLand(t, { patch: { strength: 0 } });
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength' },
    });
    expect(await seedNum(t, ctx.restaurantId, 1)).toBe(2);
  });

  it('有虫先除虫、有草先除草；除虫 −1、除草清零；没虫没草报错', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await t.db.updateTable('yard_plant').set({ worm: 2, grass: 3 }).where('id', '=', plantId).execute();
    t.clock.advance(24 * MIN);
    await expect(t.game.yard.water(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'has_worm' } });
    await t.game.yard.deworm(ctx, { plantId });
    expect((await plantOf(t, plantId))!.worm).toBe(1);
    await t.game.yard.deworm(ctx, { plantId });
    await expect(t.game.yard.deworm(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'no_worm' } });
    await expect(t.game.yard.water(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'has_grass' } });
    await t.game.yard.weed(ctx, { plantId });
    expect((await plantOf(t, plantId))!.grass).toBe(0);
    await expect(t.game.yard.weed(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'no_grass' } });
    await t.game.yard.water(ctx, { plantId });
    expect((await plantOf(t, plantId))!.stage).toBe(2);
    // 播种 10 + 除虫 5×2 + 除草 5 + 浇水 5
    expect((await landOf(t, ctx.restaurantId)).exp).toBe(30);
  });

  it('干涸时浇水：解除干涸、本阶段 −5 分钟，到原时长一半就不再减；收获期只解除干涸（计划裁定 4）', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await t.db.updateTable('yard_plant').set({ dry: 3 }).where('id', '=', plantId).execute();
    expect((await t.game.yard.water(ctx, { plantId })).data).toEqual({ stage: 1 });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 1, dry: 0, infancy: 19 });
    await t.db.updateTable('yard_plant').set({ dry: 1, infancy: 16 }).where('id', '=', plantId).execute();
    await t.game.yard.water(ctx, { plantId });
    expect(await plantOf(t, plantId)).toMatchObject({ dry: 0, infancy: 16 });
    await t.db
      .updateTable('yard_plant')
      .set({ dry: 2, stage: 4, stage_at: t.clock.now })
      .where('id', '=', plantId)
      .execute();
    await t.game.yard.water(ctx, { plantId });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 4, dry: 0, harvest: 1440 });
  });

  it('施肥：扣 1 个肥料抵扣本阶段时间；剩余时间不够报 feed_useless；不是肥料报 VALIDATION_FAILED', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t, { goods: { 427: 3, 428: 1 } });
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    expect((await t.game.yard.feed(ctx, { plantId, goodsId: 427 })).data).toEqual({ feedMin: 20 });
    expect(await goodsNum(t, ctx.restaurantId, 427)).toBe(2);
    t.clock.advance(4 * MIN);
    await t.game.yard.water(ctx, { plantId });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 2, feed_min: 0 });
    await expect(t.game.yard.feed(ctx, { plantId, goodsId: 428 })).rejects.toMatchObject({
      params: { reason: 'feed_useless' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 428)).toBe(1);
    await expect(t.game.yard.feed(ctx, { plantId, goodsId: 18 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_fertilizer' },
    });
  });

  it('铲除：任何阶段都能铲；随机数 0 时返还 1 颗种子；地空出来可以再种', async () => {
    const ctx = await withLand(lucky);
    const { data } = await lucky.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    expect((await lucky.game.yard.remove(ctx, { plantId: data.plantId })).data).toEqual({ seedBack: true });
    expect(await seedNum(lucky, ctx.restaurantId, 1)).toBe(2);
    expect(await plantOf(lucky, data.plantId)).toBeUndefined();
    await lucky.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
  });

  it('收获检查：不在收获期、有虫、有草；别人的作物 id 报 no_plant', async () => {
    const ctx = await withLand(t);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await expect(t.game.yard.reap(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'not_ripe' } });
    await t.db.updateTable('yard_plant').set({ stage: 4, worm: 1 }).where('id', '=', plantId).execute();
    await expect(t.game.yard.reap(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'has_worm' } });
    await t.db.updateTable('yard_plant').set({ worm: 0, grass: 1 }).where('id', '=', plantId).execute();
    await expect(t.game.yard.reap(ctx, { plantId })).rejects.toMatchObject({ params: { reason: 'has_grass' } });
    const other = await newRestaurant(t, { shardId: ctx.shardId });
    await expect(t.game.yard.remove(other, { plantId })).rejects.toMatchObject({ params: { reason: 'no_plant' } });
  });

  it('枯叶期只能铲除：浇水、施肥、除虫、除草、收获都报 withered，什么都不扣（Review Focus 1）', async () => {
    const ctx = await withLand(t, { goods: { 427: 1 } });
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await t.db.updateTable('yard_plant').set({ stage: 5, worm: 1, grass: 1 }).where('id', '=', plantId).execute();
    const calls = [
      () => t.game.yard.water(ctx, { plantId }),
      () => t.game.yard.feed(ctx, { plantId, goodsId: 427 }),
      () => t.game.yard.deworm(ctx, { plantId }),
      () => t.game.yard.weed(ctx, { plantId }),
      () => t.game.yard.reap(ctx, { plantId }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'withered' } });
    }
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(99);
    expect(await goodsNum(t, ctx.restaurantId, 427)).toBe(1);
    await t.game.yard.remove(ctx, { plantId });
    expect(await plantOf(t, plantId)).toBeUndefined();
  });
});

describe('菜篮（设计文档 §3.4）', () => {
  it('橱柜格子满时进冰箱，冰箱满了丢弃并记日志；菜篮照扣（Review Focus 3）；菜篮不够报 NOT_ENOUGH basket', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 1, foods_max_num: 10 }, foods: { 102: 1 } });
    await t.db.insertInto('yard_basket').values({ rest_id: ctx.restaurantId, foods_id: 101, num: 25 }).execute();
    await expect(t.game.yard.storeBasket(ctx, { foodsId: 101, num: 26 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'basket', id: 101, need: 26, have: 25 },
    });
    const r = await t.game.yard.storeBasket(ctx, { foodsId: 101, num: 25 });
    expect(r.data).toEqual({ stored: 10, dropped: 15 });
    expect(await foodNum(t, ctx.restaurantId, 101)).toEqual({ num: 0, fridge: 10 });
    expect(await basketNum(t, ctx.restaurantId, 101)).toBe(0);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(logs).toContainEqual({ type: 'fridge.drop', params: { foodsId: 101, num: 15 } });
    expect(await t.game.yard.basket(ctx)).toEqual({ items: [] });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/crop.test.ts`
Expected: FAIL（`t.game.yard.plant` 不是函数）

- [ ] **Step 3: 公共函数**

`apps/server/src/modules/yard/common.ts` 整个替换为：

```ts
import { sql } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { invalidState, notEnough } from '../../core/errors';
import type { Op } from '../../core/op';
import { gainCoin, gainExp, recordChange, spendStrength } from '../../core/resources';
import type { YardPlantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { actionRate, applyLandExp } from './rules';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** 菜园动作 id（income_action） */
export const ACTION = { plant: 50, water: 51, weed: 52, deworm: 53, reap: 54, remove: 55, feed: 56 } as const;

/** 每次菜园操作：扣 1 体力，按动作收益给经验和银币（规格书 20 §20.7）；收获 / 偷菜另加食材等级的经验 */
export function actionIncome(o: Op, actionId: number, own: boolean, extraExp = 0): void {
  spendStrength(o, 1);
  const a = o.config.incomeAction(actionId);
  const r = actionRate(o.rest.level, own);
  gainExp(o, Math.floor(r * a.exp) + extraExp);
  gainCoin(o, Math.floor(r * a.coin));
}

/** 只有自己地里的操作加土地经验 */
export async function addLandExp(o: Op, landId: number, actionId: number): Promise<void> {
  const gain = o.config.incomeAction(actionId).landExp;
  if (gain <= 0) return;
  const land = await o.tx
    .selectFrom('yard_land')
    .select(['level', 'exp'])
    .where('id', '=', landId)
    .executeTakeFirstOrThrow();
  const r = applyLandExp(land.level, land.exp, gain, o.tuning.yard.landMaxLevel);
  await o.tx.updateTable('yard_land').set({ level: r.level, exp: r.exp }).where('id', '=', landId).execute();
}

/** 锁住一株作物（裁定 7：先锁店再锁作物行）；不存在或主人不是 ownerId 时报 no_plant */
export async function lockPlant(o: Op, plantId: number, ownerId: number): Promise<YardPlantRow> {
  const p = await o.tx
    .selectFrom('yard_plant')
    .selectAll()
    .where('id', '=', plantId)
    .where('rest_id', '=', ownerId)
    .forUpdate()
    .executeTakeFirst();
  if (!p) throw invalidState('no_plant');
  return p;
}

/** 枯叶期只能铲除（计划裁定 3） */
export function assertAlive(p: YardPlantRow): void {
  if (p.stage === 5) throw invalidState('withered');
}

/** 收获 / 偷菜前：收获期、无虫、无草 */
export function assertRipe(p: YardPlantRow): void {
  assertAlive(p);
  if (p.stage !== 4) throw invalidState('not_ripe');
  if (p.worm > 0) throw invalidState('has_worm');
  if (p.grass > 0) throw invalidState('has_grass');
}

export async function addBasket(o: Op, foodsId: number, num: number): Promise<void> {
  if (num <= 0) return;
  await o.tx
    .insertInto('yard_basket')
    .values({ rest_id: o.rest.id, foods_id: foodsId, num })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'foods_id']).doUpdateSet({ num: sql<number>`yard_basket.num + ${num}` }),
    )
    .execute();
  recordChange(o, 'basket', num, {}, foodsId);
}

async function basketHave(o: Op, foodsId: number): Promise<number> {
  const r = await o.tx
    .selectFrom('yard_basket')
    .select('num')
    .where('rest_id', '=', o.rest.id)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

/** 从菜篮扣；扣到 0 删行 */
export async function subBasket(o: Op, foodsId: number, num: number): Promise<void> {
  if (num <= 0) return;
  const row = await o.tx
    .updateTable('yard_basket')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', o.rest.id)
    .where('foods_id', '=', foodsId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) throw notEnough('basket', num, await basketHave(o, foodsId), foodsId);
  if (row.num === 0) {
    await o.tx
      .deleteFrom('yard_basket')
      .where('rest_id', '=', o.rest.id)
      .where('foods_id', '=', foodsId)
      .execute();
  }
  recordChange(o, 'basket', -num, {}, foodsId);
}

/** 扣种子（rest_seed）；扣到 0 删行 */
export async function subSeed(o: Op, seedId: number, num: number): Promise<void> {
  if (num <= 0) return;
  const row = await o.tx
    .updateTable('rest_seed')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', o.rest.id)
    .where('seed_id', '=', seedId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) {
    const have = await o.tx
      .selectFrom('rest_seed')
      .select('num')
      .where('rest_id', '=', o.rest.id)
      .where('seed_id', '=', seedId)
      .executeTakeFirst();
    throw notEnough('seed', num, have?.num ?? 0, seedId);
  }
  if (row.num === 0) {
    await o.tx.deleteFrom('rest_seed').where('rest_id', '=', o.rest.id).where('seed_id', '=', seedId).execute();
  }
  recordChange(o, 'seed', -num, {}, seedId);
}
```

- [ ] **Step 4: 作物操作和菜篮**

`apps/server/src/modules/yard/crop.ts`：

```ts
import type { Updateable } from 'kysely';
import type { ReapResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState } from '../../core/errors';
import { opAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { feedLog, type PairOp } from '../../core/pair';
import type { YardPlantRow, YardPlantTable } from '../../db/schema';
import { consumeGoods } from '../store/goods';
import { addSeeds } from '../temple/common';
import {
  ACTION,
  actionIncome,
  addBasket,
  addLandExp,
  assertAlive,
  assertRipe,
  badInput,
  lockPlant,
  subSeed,
} from './common';
import { canWater, dryWaterMinutes, feedUseful, harvestNumOf, landBonus } from './rules';

type StageCol = 'infancy' | 'maturity' | 'autumn';
const STAGE_COL: Partial<Record<number, StageCol>> = { 1: 'infancy', 2: 'maturity', 3: 'autumn' };

/** 作物的主人：好友操作时是 pair.them，自己的地 pair = null */
const ownerOf = (o: Op, pair: PairOp | null): number => pair?.them.rest.id ?? o.rest.id;

/** 播种（规格书 08 §8.3）：产量 = ⌊种子产量 × (100 + 土地加成) / 100⌋ */
export async function plantSeed(o: Op, b: { landNo: number; seedId: number }): Promise<{ plantId: number }> {
  const seed = o.config.seeds.get(b.seedId);
  if (!seed) throw badInput('no_seed');
  const land = await o.tx
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('no', '=', b.landNo)
    .executeTakeFirst();
  if (!land) throw invalidState('no_land');
  const busy = await o.tx.selectFrom('yard_plant').select('id').where('land_id', '=', land.id).executeTakeFirst();
  if (busy) throw invalidState('land_busy');
  await subSeed(o, seed.id, 1);
  actionIncome(o, ACTION.plant, true);
  const num = harvestNumOf(seed.harvestNum, landBonus(land.level, o.tuning.yard));
  const row = await o.tx
    .insertInto('yard_plant')
    .values({
      rest_id: o.rest.id,
      shard_id: o.shardId,
      land_id: land.id,
      seed_id: seed.id,
      foods_id: seed.foodsId,
      stage: 1,
      stage_at: o.now,
      infancy: seed.infancy,
      maturity: seed.maturity,
      autumn: seed.autumn,
      harvest: seed.harvest,
      harvest_num: num,
      harvest_max: num,
      planted_at: o.now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await addLandExp(o, land.id, ACTION.plant);
  await emitAction(o, 'yard.plant');
  return { plantId: row.id };
}

/** 照料之后：自己的地加土地经验，好友的地写对方动态；活跃计数 */
async function afterCare(
  o: Op,
  pair: PairOp | null,
  p: YardPlantRow,
  actionId: number,
  what: 'water' | 'weed' | 'deworm',
): Promise<void> {
  if (pair) feedLog(pair, 'yard.helped', { what, foodsId: p.foods_id });
  else await addLandExp(o, p.land_id, actionId);
  await emitAction(o, `yard.${what}`);
}

/** 浇水（自己或好友）：干涸时只解除干涸并缩短本阶段（收获期不缩短，计划裁定 4）；否则进入下一阶段 */
export async function waterPlant(o: Op, pair: PairOp | null, plantId: number): Promise<{ stage: number }> {
  const p = await lockPlant(o, plantId, ownerOf(o, pair));
  assertAlive(p);
  let patch: Updateable<YardPlantTable>;
  if (p.dry > 0) {
    patch = { dry: 0 };
    const col = STAGE_COL[p.stage];
    if (col) {
      const seed = o.config.seeds.get(p.seed_id);
      if (seed) patch[col] = dryWaterMinutes(p[col], seed[col], o.tuning.yard);
    }
  } else {
    if (p.stage === 4) throw invalidState('no_water');
    if (p.worm > 0) throw invalidState('has_worm');
    if (p.grass > 0) throw invalidState('has_grass');
    if (!canWater(p, o.now)) throw invalidState('no_water');
    patch = { stage: p.stage + 1, stage_at: o.now, feed_min: 0 };
  }
  actionIncome(o, ACTION.water, pair === null);
  await o.tx.updateTable('yard_plant').set(patch).where('id', '=', p.id).execute();
  await afterCare(o, pair, p, ACTION.water, 'water');
  return { stage: typeof patch.stage === 'number' ? patch.stage : p.stage };
}

/** 除草：清零 */
export async function weedPlant(o: Op, pair: PairOp | null, plantId: number): Promise<{ plantId: number }> {
  const p = await lockPlant(o, plantId, ownerOf(o, pair));
  assertAlive(p);
  if (p.grass <= 0) throw invalidState('no_grass');
  actionIncome(o, ACTION.weed, pair === null);
  await o.tx.updateTable('yard_plant').set({ grass: 0 }).where('id', '=', p.id).execute();
  await afterCare(o, pair, p, ACTION.weed, 'weed');
  return { plantId: p.id };
}

/** 除虫：一次 −1 */
export async function dewormPlant(o: Op, pair: PairOp | null, plantId: number): Promise<{ plantId: number }> {
  const p = await lockPlant(o, plantId, ownerOf(o, pair));
  assertAlive(p);
  if (p.worm <= 0) throw invalidState('no_worm');
  actionIncome(o, ACTION.deworm, pair === null);
  await o.tx.updateTable('yard_plant').set({ worm: p.worm - 1 }).where('id', '=', p.id).execute();
  await afterCare(o, pair, p, ACTION.deworm, 'deworm');
  return { plantId: p.id };
}

/** 施肥（只能给自己的作物）：本阶段剩余时间要大于肥料分钟数 */
export async function feedPlant(o: Op, b: { plantId: number; goodsId: number }): Promise<{ feedMin: number }> {
  const minutes = o.config.fertilizers.get(b.goodsId);
  if (minutes === undefined) throw badInput('not_fertilizer');
  const p = await lockPlant(o, b.plantId, o.rest.id);
  assertAlive(p);
  if (!feedUseful(p, minutes)) throw invalidState('feed_useless');
  await consumeGoods(o, b.goodsId, 1);
  actionIncome(o, ACTION.feed, true);
  const feedMin = p.feed_min + minutes;
  await o.tx.updateTable('yard_plant').set({ feed_min: feedMin }).where('id', '=', p.id).execute();
  await addLandExp(o, p.land_id, ACTION.feed);
  return { feedMin };
}

/** 铲除（任何阶段）：removeSeedRate 概率返还 1 颗种子 */
export async function removePlant(o: Op, plantId: number): Promise<{ seedBack: boolean }> {
  const p = await lockPlant(o, plantId, o.rest.id);
  actionIncome(o, ACTION.remove, true);
  const seedBack = o.rng.chance(o.tuning.yard.removeSeedRate);
  if (seedBack) await addSeeds(o, p.seed_id, 1);
  await o.tx.deleteFrom('yard_plant').where('id', '=', p.id).execute();
  await addLandExp(o, p.land_id, ACTION.remove);
  return { seedBack };
}

/** 收获自己的作物：剩余产量 + reapAddNum 进菜篮，删除作物（裁定 6、10） */
export async function reapPlant(o: Op, plantId: number): Promise<ReapResultDto> {
  const p = await lockPlant(o, plantId, o.rest.id);
  assertRipe(p);
  actionIncome(o, ACTION.reap, true, o.config.requireFood(p.foods_id).level);
  const num = p.harvest_num + ((await opAgg(o)).reapAddNum ?? 0);
  await addBasket(o, p.foods_id, num);
  await o.tx.deleteFrom('yard_plant').where('id', '=', p.id).execute();
  await addLandExp(o, p.land_id, ACTION.reap);
  await emitAction(o, 'yard.harvest');
  return { foodsId: p.foods_id, num, stolen: false, punished: null };
}
```

`apps/server/src/modules/yard/basket.ts`：

```ts
import type { Kysely } from 'kysely';
import type { BasketDto } from '@dt/shared';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { addFoods } from '../cupboard/foods';
import { subBasket } from './common';

export async function basketView(db: Kysely<DB>, restId: number): Promise<BasketDto> {
  const rows = await db
    .selectFrom('yard_basket')
    .select(['foods_id', 'num'])
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .orderBy('foods_id')
    .execute();
  return { items: rows.map((r) => ({ foodsId: r.foods_id, num: r.num })) };
}

/** 存进橱柜（设计文档 §3.4）：格子满进冰箱，冰箱满丢弃（addFoods 记日志）；菜篮照扣 num */
export async function storeBasket(
  o: Op,
  b: { foodsId: number; num: number },
): Promise<{ stored: number; dropped: number }> {
  await subBasket(o, b.foodsId, b.num);
  const plan = await addFoods(o, b.foodsId, b.num);
  return { stored: plan.toCupboard + plan.toFridge, dropped: plan.dropped };
}
```

- [ ] **Step 5: 服务和路由**

`apps/server/src/modules/yard/service.ts`：
- import 加：

```ts
import type { BasketDto } from '@dt/shared';
import { basketView, storeBasket } from './basket';
import { dewormPlant, feedPlant, plantSeed, reapPlant, removePlant, waterPlant, weedPlant } from './crop';
```

- 返回对象里 `expand` 之后加：

```ts
    plant(ctx: RestCtx, b: { landNo: number; seedId: number }) {
      return op(ctx, 'yard.plant', (o) => plantSeed(o, b));
    },
    water(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.water', (o) => waterPlant(o, null, b.plantId));
    },
    weed(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.weed', (o) => weedPlant(o, null, b.plantId));
    },
    deworm(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.deworm', (o) => dewormPlant(o, null, b.plantId));
    },
    feed(ctx: RestCtx, b: { plantId: number; goodsId: number }) {
      return op(ctx, 'yard.feed', (o) => feedPlant(o, b));
    },
    remove(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.remove', (o) => removePlant(o, b.plantId));
    },
    reap(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.reap', (o) => reapPlant(o, b.plantId));
    },

    async basket(ctx: RestCtx): Promise<BasketDto> {
      await d.shards.ensureFeature(ctx.shardId, 'yard');
      return basketView(d.db, ctx.restaurantId);
    },
    storeBasket(ctx: RestCtx, b: { foodsId: number; num: number }) {
      return op(ctx, 'yard.basket', (o) => storeBasket(o, b));
    },
```

`apps/server/src/modules/yard/routes.ts` 整个替换为：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { basketStoreBody, yardFeedBody, yardPlantBody, yardPlantIdBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { YardService } from './service';

export function yardRoutes(svc: YardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/yard', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/yard/land/expand', async (req) => okOp(await svc.expand(restCtxOf(req))));
    r.post('/yard/plant', async (req) => okOp(await svc.plant(restCtxOf(req), parse(yardPlantBody, req.body))));
    r.post('/yard/water', async (req) =>
      okOp(await svc.water(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/weed', async (req) => okOp(await svc.weed(restCtxOf(req), parse(yardPlantIdBody, req.body))));
    r.post('/yard/deworm', async (req) =>
      okOp(await svc.deworm(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/feed', async (req) => okOp(await svc.feed(restCtxOf(req), parse(yardFeedBody, req.body))));
    r.post('/yard/remove', async (req) =>
      okOp(await svc.remove(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/reap', async (req) => okOp(await svc.reap(restCtxOf(req), parse(yardPlantIdBody, req.body))));
    r.get('/yard/basket', async (req) => ok(await svc.basket(restCtxOf(req))));
    r.post('/yard/basket/store', async (req) =>
      okOp(await svc.storeBasket(restCtxOf(req), parse(basketStoreBody, req.body))),
    );
  };
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard`
Expected: PASS

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/yard
git commit -m "feat(yard): planting, watering, fertilizing, weeding, deworming, removing and reaping; basket store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 好友菜园——帮忙照料、偷菜、边牧、好友视图

**Files:**
- Create: `apps/server/src/modules/yard/steal.ts`、`apps/server/src/modules/yard/friend.test.ts`
- Modify: `apps/server/src/modules/yard/view.ts`、`service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 5 `waterPlant`、`weedPlant`、`dewormPlant`、`reapPlant`、`lockPlant`、`assertRipe`、`actionIncome`、`addBasket`、`ACTION`；Task 3 `canStealLeft`、`stealNum`；`runPairOp`、`feedLog`、`isFriend`（`core/pair.ts`）；`hasValidHonor`、`subFoods`、`addFoods`、`gainRenown`
- Produces:
  - `steal.ts`：`stealPlant(p: PairOp, plantId): Promise<ReapResultDto>`
  - `view.ts`：`stealBlock(p: YardPlantRow, stolen: boolean, renown: number, baseNum: number, t: YardTuning): StealBlock`、`friendYardView(db, config, me: RestaurantRow, them: RestaurantRow, t, now): Promise<FriendYardDto>`
  - 服务：`friend(ctx, restId): Promise<FriendYardDto>`；`water` / `weed` / `deworm` / `reap` 按作物主人分流（计划裁定 10）
  - 路由 `GET /yard/friend/:restId`（参数用已有的 `restIdParam`）

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/friend.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  foodNum,
  newPair,
  newRestaurant,
  restRow,
  type TestGame,
} from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数 0.9：偷 2 个、边牧不触发 */
let hi: TestGame;
/** 随机数 0：偷 1 个、边牧必触发、选第一个食材 */
let lo: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  hi = await createTestGame({ rng: () => sequenceRng([0.9]) });
  lo = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await hi.close();
  await lo.close();
});

/** 在 restId 的 1 号地种一株大米（默认收获期、剩 20 个） */
async function cropOf(g: TestGame, restId: number, shardId: number, patch: Record<string, unknown> = {}) {
  const land = await g.db
    .insertInto('yard_land')
    .values({ rest_id: restId, no: 1 })
    .returning('id')
    .executeTakeFirstOrThrow();
  const p = await g.db
    .insertInto('yard_plant')
    .values({
      rest_id: restId,
      shard_id: shardId,
      land_id: land.id,
      seed_id: 1,
      foods_id: 101,
      stage: 4,
      stage_at: g.clock.now,
      infancy: 24,
      maturity: 36,
      autumn: 60,
      harvest: 1440,
      harvest_num: 20,
      harvest_max: 20,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return p.id;
}
/** 我（a，声望 5）和好友 b；b 的 1 号地上有作物 */
async function friends(g: TestGame, patch: Record<string, unknown> = {}) {
  const [a, b] = await newPair(g, { patch: { renown: 5 } });
  await befriend(g, a.restaurantId, b.restaurantId);
  const plantId = await cropOf(g, b.restaurantId, b.shardId, patch);
  return { a, b, plantId };
}
const plantOf = (g: TestGame, id: number) =>
  g.db.selectFrom('yard_plant').selectAll().where('id', '=', id).executeTakeFirst();
const logsOf = (g: TestGame, restId: number) =>
  g.db
    .selectFrom('rest_log')
    .select(['type', 'params'])
    .where('rest_id', '=', restId)
    .orderBy('id')
    .execute();
async function basketNum(g: TestGame, restId: number, foodsId: number) {
  const r = await g.db
    .selectFrom('yard_basket')
    .select('num')
    .where('rest_id', '=', restId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

describe('帮好友照料（规格书 08 §8.3）', () => {
  it('除虫、除草、浇水：系数不 ×2、不加对方土地经验；对方动态记 yard.helped', async () => {
    const { a, b, plantId } = await friends(t, {
      stage: 1,
      stage_at: new Date(t.clock.now.getTime() - 30 * 60_000),
      worm: 1,
      grass: 1,
    });
    await t.game.yard.deworm(a, { plantId });
    await t.game.yard.weed(a, { plantId });
    expect((await t.game.yard.water(a, { plantId })).data).toEqual({ stage: 2 });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 2, worm: 0, grass: 0 });
    // 等级 1、好友的地：系数 3。三次各 3 银币、3 经验、1 体力
    expect(await restRow(t, a.restaurantId)).toMatchObject({ strength: 97, coin: 3 * 3, exp: 3 * 3 });
    const land = await t.db
      .selectFrom('yard_land')
      .selectAll()
      .where('rest_id', '=', b.restaurantId)
      .executeTakeFirstOrThrow();
    expect(land.exp).toBe(0);
    const logs = (await logsOf(t, b.restaurantId)).filter((l) => l.type === 'yard.helped');
    expect(logs.map((l) => (l.params as { what: string }).what)).toEqual(['deworm', 'weed', 'water']);
    expect(logs[0]!.params).toMatchObject({ by: a.restaurantId, foodsId: 101 });
  });
});

describe('偷菜（规格书 08 §8.3，裁定 4、10）', () => {
  it('扣 1 声望，偷 1~2 个进我的菜篮，对方剩余减少；每人每株一次；对方动态 yard.stolen', async () => {
    const { a, b, plantId } = await friends(hi);
    const r = await hi.game.yard.reap(a, { plantId });
    expect(r.data).toEqual({ foodsId: 101, num: 2, stolen: true, punished: null });
    expect(await basketNum(hi, a.restaurantId, 101)).toBe(2);
    expect((await plantOf(hi, plantId))!.harvest_num).toBe(18);
    // 系数 3：银币 ⌊3×2⌋，经验 ⌊3×3⌋ + 食材等级 1
    expect(await restRow(hi, a.restaurantId)).toMatchObject({ renown: 4, strength: 99, coin: 6, exp: 10 });
    await expect(hi.game.yard.reap(a, { plantId })).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'steal' },
    });
    const logs = await logsOf(hi, b.restaurantId);
    expect(logs.find((l) => l.type === 'yard.stolen')!.params).toMatchObject({
      by: a.restaurantId,
      foodsId: 101,
      num: 2,
      punished: null,
    });
    const counter = await hi.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', a.restaurantId)
      .where('key', '=', 'yard.steal')
      .executeTakeFirst();
    expect(counter?.count).toBe(1);
  });

  it('门槛：剩余 < 种子原产量 × 0.7 报 steal_left（按原产量 20，不含土地加成）；声望不够报 renown；7 级只偷 1', async () => {
    const low = await friends(hi, { harvest_num: 13, harvest_max: 30 });
    await expect(hi.game.yard.reap(low.a, { plantId: low.plantId })).rejects.toMatchObject({
      params: { reason: 'steal_left' },
    });
    const ok = await friends(hi, { harvest_num: 14, harvest_max: 30 });
    await hi.game.yard.reap(ok.a, { plantId: ok.plantId });
    const poor = await friends(hi);
    await hi.db.updateTable('restaurant').set({ renown: 0 }).where('id', '=', poor.a.restaurantId).execute();
    await expect(hi.game.yard.reap(poor.a, { plantId: poor.plantId })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'renown', need: 1 },
    });
    const rare = await friends(hi, { seed_id: 95, foods_id: 460, harvest_num: 1, harvest_max: 1 });
    expect((await hi.game.yard.reap(rare.a, { plantId: rare.plantId })).data.num).toBe(1);
  });

  it('对方有边牧：随机数 0 → 从我的橱柜拿 1 个食材给对方（锁定的不拿）', async () => {
    const { a, b, plantId } = await friends(lo);
    await grantGoods(lo.db, config, b.restaurantId, 339, 1, lo.clock.now);
    await lo.db
      .insertInto('cupboard_food')
      .values([
        { rest_id: a.restaurantId, foods_id: 102, num: 3, locked: true },
        { rest_id: a.restaurantId, foods_id: 103, num: 2, locked: false },
      ])
      .execute();
    const r = await lo.game.yard.reap(a, { plantId });
    expect(r.data).toEqual({ foodsId: 101, num: 1, stolen: true, punished: 103 });
    expect((await foodNum(lo, a.restaurantId, 103)).num).toBe(1);
    expect((await foodNum(lo, b.restaurantId, 103)).num).toBe(1);
    expect((await foodNum(lo, a.restaurantId, 102)).num).toBe(3);
  });

  it('非好友报 NOT_FRIEND；不在收获期报 not_ripe；主人收获后再偷报 no_plant，什么都不扣（Review Focus 2）', async () => {
    const { a, b, plantId } = await friends(t);
    const stranger = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { renown: 5 } });
    await expect(t.game.yard.reap(stranger, { plantId })).rejects.toMatchObject({ code: 'NOT_FRIEND' });
    await t.db.updateTable('yard_plant').set({ stage: 3 }).where('id', '=', plantId).execute();
    await expect(t.game.yard.reap(a, { plantId })).rejects.toMatchObject({ params: { reason: 'not_ripe' } });
    await t.db.updateTable('yard_plant').set({ stage: 4 }).where('id', '=', plantId).execute();
    await t.game.yard.reap(b, { plantId });
    await expect(t.game.yard.reap(a, { plantId })).rejects.toMatchObject({ params: { reason: 'no_plant' } });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ renown: 5, strength: 100 });
  });
});

describe('好友菜园视图（设计文档 §5）', () => {
  it('只读字段、我偷过没有、能不能偷；非好友报 NOT_FRIEND', async () => {
    const { a, b, plantId } = await friends(hi);
    const before = await hi.game.yard.friend(a, b.restaurantId);
    expect(before).toMatchObject({ restId: b.restaurantId, strength: 100, renown: 5 });
    expect(before.lands).toHaveLength(1);
    expect(before.lands[0]).toMatchObject({
      no: 1,
      level: 1,
      plant: { id: plantId, stage: 4, harvestNum: 20, baseNum: 20, stolen: false, stealBlock: null },
    });
    await hi.game.yard.reap(a, { plantId });
    const after = await hi.game.yard.friend(a, b.restaurantId);
    expect(after.lands[0]!.plant).toMatchObject({ stolen: true, stealBlock: 'stolen', harvestNum: 18 });
    const stranger = await newRestaurant(hi, { shardId: a.shardId, verified: true });
    await expect(hi.game.yard.friend(stranger, b.restaurantId)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/friend.test.ts`
Expected: FAIL（好友作物走 `runOp` 报 `no_plant`；`t.game.yard.friend` 不是函数）

- [ ] **Step 3: 偷菜**

`apps/server/src/modules/yard/steal.ts`：

```ts
import { GOODS } from '@dt/config';
import { ErrorCode, type ReapResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { feedLog, type PairOp } from '../../core/pair';
import { gainRenown } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoods, subFoods } from '../cupboard/foods';
import { hasValidHonor } from '../store/goods';
import { ACTION, actionIncome, addBasket, assertRipe, lockPlant } from './common';
import { canStealLeft, stealNum } from './rules';

/** 边牧：从我的橱柜（数量 > 0、未锁定，按食材 id 排序）随机拿 1 个给对方；橱柜空时返回 null（计划裁定 12） */
async function punish(p: PairOp): Promise<number | null> {
  const rows = await p.me.tx
    .selectFrom('cupboard_food')
    .select('foods_id')
    .where('rest_id', '=', p.me.rest.id)
    .where('num', '>', 0)
    .where('locked', '=', false)
    .orderBy('foods_id')
    .execute();
  if (rows.length === 0) return null;
  const foodsId = rows[p.me.rng.int(rows.length)]!.foods_id;
  await subFoods(p.me, foodsId, 1);
  await addFoods(p.them, foodsId, 1);
  return foodsId;
}

/** 偷好友的菜（规格书 08 §8.3，裁定 4、10）：进我的菜篮；对方剩余产量减去偷走的（不含 reapAddNum） */
export async function stealPlant(p: PairOp, plantId: number): Promise<ReapResultDto> {
  const { me, them } = p;
  const t = me.tuning.yard;
  const plant = await lockPlant(me, plantId, them.rest.id);
  assertRipe(plant);
  const done = await me.tx
    .selectFrom('yard_steal')
    .select('plant_id')
    .where('plant_id', '=', plant.id)
    .where('rest_id', '=', me.rest.id)
    .executeTakeFirst();
  if (done) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'steal' });
  const seed = me.config.seeds.get(plant.seed_id);
  if (!canStealLeft(plant.harvest_num, seed?.harvestNum ?? plant.harvest_max, t)) throw invalidState('steal_left');
  if (me.rest.renown < 1) throw requirement('renown', { need: 1 });
  actionIncome(me, ACTION.reap, false, me.config.requireFood(plant.foods_id).level);
  gainRenown(me, -1);
  const num = stealNum(seed?.level ?? 1, plant.harvest_num, me.rng, t);
  await me.tx
    .updateTable('yard_plant')
    .set({ harvest_num: plant.harvest_num - num })
    .where('id', '=', plant.id)
    .execute();
  await me.tx.insertInto('yard_steal').values({ plant_id: plant.id, rest_id: me.rest.id }).execute();
  const total = num + ((await opAgg(me)).reapAddNum ?? 0);
  await addBasket(me, plant.foods_id, total);
  const collie = await hasValidHonor(them, GOODS.borderCollie);
  const punished = collie && me.rng.chance(t.reapPunishRate) ? await punish(p) : null;
  feedLog(p, 'yard.stolen', { foodsId: plant.foods_id, num, punished });
  await emitAction(me, 'yard.steal');
  return { foodsId: plant.foods_id, num: total, stolen: true, punished };
}
```

- [ ] **Step 4: 好友视图**

`apps/server/src/modules/yard/view.ts`：
- import 改为：

```ts
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { FriendYardDto, PlantDto, StealBlock, YardDto } from '@dt/shared';
import type { DB, RestaurantRow, YardPlantRow } from '../../db/schema';
import {
  canStealLeft,
  canWater,
  landBonus,
  landExpNeed,
  landPrice,
  minutesLeft,
  stageMinutes,
  type YardTuning,
} from './rules';
```

- 文件末尾加：

```ts
/** 偷菜被挡住的原因（顺序与 stealPlant 的检查一致，声望放最后） */
export function stealBlock(
  p: YardPlantRow,
  stolen: boolean,
  renown: number,
  baseNum: number,
  t: YardTuning,
): StealBlock {
  if (stolen) return 'stolen';
  if (p.stage === 5) return 'withered';
  if (p.stage !== 4) return 'not_ripe';
  if (p.worm > 0) return 'has_worm';
  if (p.grass > 0) return 'has_grass';
  if (!canStealLeft(p.harvest_num, baseNum, t)) return 'steal_left';
  if (renown < 1) return 'renown';
  return null;
}

/** 好友菜园（设计文档 §5）：me 是看的人，them 是菜园主人 */
export async function friendYardView(
  db: Kysely<DB>,
  config: GameConfig,
  me: RestaurantRow,
  them: RestaurantRow,
  t: YardTuning,
  now: Date,
): Promise<FriendYardDto> {
  const lands = await db
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', them.id)
    .orderBy('no')
    .execute();
  const plants = await db.selectFrom('yard_plant').selectAll().where('rest_id', '=', them.id).execute();
  const byLand = new Map(plants.map((p) => [p.land_id, p]));
  const stolen =
    plants.length === 0
      ? new Set<number>()
      : new Set(
          (
            await db
              .selectFrom('yard_steal')
              .select('plant_id')
              .where('rest_id', '=', me.id)
              .where(
                'plant_id',
                'in',
                plants.map((p) => p.id),
              )
              .execute()
          ).map((r) => r.plant_id),
        );
  return {
    restId: them.id,
    name: them.name,
    lands: lands.map((l) => {
      const p = byLand.get(l.id);
      if (!p) return { no: l.no, level: l.level, plant: null };
      const dto = plantDto(p, config, now);
      return {
        no: l.no,
        level: l.level,
        plant: {
          ...dto,
          stolen: stolen.has(p.id),
          stealBlock: stealBlock(p, stolen.has(p.id), me.renown, dto.baseNum, t),
        },
      };
    }),
    strength: me.strength,
    renown: me.renown,
  };
}
```

- [ ] **Step 5: 服务分流和路由**

`apps/server/src/modules/yard/service.ts`：
- import 加：

```ts
import { ErrorCode, type FriendYardDto } from '@dt/shared';
import { invalidState } from '../../core/errors';
import { isFriend, runPairOp, type PairOp } from '../../core/pair';
import { AppError } from '../../http/errors';
import { stealPlant } from './steal';
import { friendYardView } from './view';
```

（`yardView` 和 `friendYardView` 合并成一条 `import { friendYardView, yardView } from './view';`；`@dt/shared` 的类型 import 合并成一条）

- `createYardService` 里 `restOf` 之后加：

```ts
  const pair = <T>(ctx: RestCtx, target: number, source: string, fn: (p: PairOp) => Promise<T>) =>
    runPairOp(d, ctx, target, { feature: 'yard', source, friend: 'required' }, fn);
  /**
   * 按作物主人分流（计划裁定 10）：自己的 → runOp；好友的 → runPairOp（要求好友）。
   * 这里先不加锁地查主人，进事务后 lockPlant 会按主人再核对一次
   */
  async function care<T>(
    ctx: RestCtx,
    plantId: number,
    own: { source: string; run: (o: Op) => Promise<T> },
    friend: { source: string; run: (p: PairOp) => Promise<T> },
  ): Promise<OpResult<T>> {
    await d.shards.ensureFeature(ctx.shardId, 'yard');
    const r = await d.db.selectFrom('yard_plant').select('rest_id').where('id', '=', plantId).executeTakeFirst();
    if (!r) throw invalidState('no_plant');
    return r.rest_id === ctx.restaurantId
      ? op(ctx, own.source, own.run)
      : pair(ctx, r.rest_id, friend.source, friend.run);
  }
```

- 把 Task 5 的 `water`、`weed`、`deworm`、`reap` 四个方法替换为：

```ts
    water(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.water', run: (o) => waterPlant(o, null, b.plantId) },
        { source: 'yard.water', run: (p) => waterPlant(p.me, p, b.plantId) },
      );
    },
    weed(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.weed', run: (o) => weedPlant(o, null, b.plantId) },
        { source: 'yard.weed', run: (p) => weedPlant(p.me, p, b.plantId) },
      );
    },
    deworm(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.deworm', run: (o) => dewormPlant(o, null, b.plantId) },
        { source: 'yard.deworm', run: (p) => dewormPlant(p.me, p, b.plantId) },
      );
    },
    /** 自己的作物是收获，好友的作物是偷菜 */
    reap(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.reap', run: (o) => reapPlant(o, b.plantId) },
        { source: 'yard.steal', run: (p) => stealPlant(p, b.plantId) },
      );
    },
```

- `overview` 之后加：

```ts
    async friend(ctx: RestCtx, restId: number): Promise<FriendYardDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      const them = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
      if (!them || them.shard_id !== ctx.shardId)
        throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      if (!(await isFriend(d.db, ctx.restaurantId, restId))) throw new AppError(ErrorCode.NOT_FRIEND, 400);
      return friendYardView(d.db, d.config, await restOf(ctx.restaurantId), them, s.tuning.yard, d.now());
    },
```

`apps/server/src/modules/yard/routes.ts`：`@dt/shared` import 加 `restIdParam`，`r.get('/yard', ...)` 下面加：

```ts
    r.get('/yard/friend/:restId', async (req) =>
      ok(await svc.friend(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard`
Expected: PASS

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/yard
git commit -m "feat(yard): help friends water, weed and deworm; steal ripe crops with renown and border collie; friend yard view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: 自然事件定时任务

**Files:**
- Create: `apps/server/src/modules/yard/jobs.ts`、`apps/server/src/modules/yard/jobs.test.ts`
- Modify: `apps/server/src/game.ts`

**Interfaces:**
- Consumes: Task 3 `tickPlant`、`yardPeriod`、`EventTuning`；`WorldService.ensure(shardId, now)`；`PeriodicJob`、`JobContext`（`core/jobs.ts`）；`runDueJobs`（测试用）
- Produces:
  - `tickOne(db, plantId, raining, now, rng, e): Promise<boolean>`（true = 有变化并已写回）
  - `runYardEvents(d, world, shardId, now, log): Promise<{ plants: number; changed: number; failed: number }>`
  - `yardJobs(d, world): PeriodicJob[]`（一个任务 `yard-events`，功能 `yard`）

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/jobs.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, gameDay, gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { tickOne } from './jobs';

const MIN = 60_000;
const e = testConfig().tuning.yard.events;
const log = { error: vi.fn() };
/** 6 个随机数都是 0.99：什么都不发生 */
let calm: TestGame;
/** 只有"长草"那个随机数是 0.01：不下雨长草（< 0.024），下雨不长（≥ 0.008） */
let grassy: TestGame;
/** 只有"长虫"那个随机数是 0.001 */
let buggy: TestGame;
beforeAll(async () => {
  calm = await createTestGame({ rng: () => sequenceRng([0.99]) });
  grassy = await createTestGame({ rng: () => sequenceRng([0.99, 0.99, 0.01, 0.99, 0.99, 0.99]) });
  buggy = await createTestGame({ rng: () => sequenceRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.001]) });
});
afterAll(async () => {
  await calm.close();
  await grassy.close();
  await buggy.close();
});

const day = gameDay(new Date());
/** 天气 1 晴、10 小雨 */
async function shardWith(g: TestGame, weatherId: number) {
  const ctx = await newRestaurant(g);
  await g.db
    .insertInto('world_state')
    .values({
      shard_id: ctx.shardId,
      weather_id: weatherId,
      weather_until: new Date(g.clock.now.getTime() + 2 * 3600_000),
      krab_street: 1,
      updated_at: g.clock.now,
    })
    .execute();
  return ctx;
}
/** 在 restId 的 no 号地种大米；默认幼年期、30 分钟前播种（已经能浇水） */
async function cropOf(g: TestGame, restId: number, shardId: number, no: number, patch: Record<string, unknown> = {}) {
  const land = await g.db
    .insertInto('yard_land')
    .values({ rest_id: restId, no })
    .returning('id')
    .executeTakeFirstOrThrow();
  const p = await g.db
    .insertInto('yard_plant')
    .values({
      rest_id: restId,
      shard_id: shardId,
      land_id: land.id,
      seed_id: 1,
      foods_id: 101,
      stage: 1,
      stage_at: new Date(g.clock.now.getTime() - 30 * MIN),
      infancy: 24,
      maturity: 36,
      autumn: 60,
      harvest: 1440,
      harvest_num: 20,
      harvest_max: 20,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return p.id;
}
const run = (g: TestGame, shardId: number) =>
  runDueJobs(
    { db: g.db, shards: g.game.shards, now: () => g.clock.now, log },
    g.game.jobs.filter((j) => j.name === 'yard-events'),
    { shardIds: [shardId] },
  );
const runs = (g: TestGame, shardId: number) =>
  g.db
    .selectFrom('job_run')
    .select(['period', 'stats'])
    .where('shard_id', '=', shardId)
    .where('job', '=', 'yard-events')
    .orderBy('period')
    .execute();
const plantOf = (g: TestGame, id: number) =>
  g.db.selectFrom('yard_plant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('自然事件任务 yard-events（规格书 08 §8.4，裁定 3、7、11）', () => {
  it('不下雨：长草概率 ×3；统计写进 job_run', async () => {
    grassy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(grassy, 1);
    const id = await cropOf(grassy, ctx.restaurantId, ctx.shardId, 1);
    await run(grassy, ctx.shardId);
    expect(await plantOf(grassy, id)).toMatchObject({ grass: 1, stage: 1 });
    expect(await runs(grassy, ctx.shardId)).toEqual([
      { period: `${day}@13:27`, stats: { plants: 1, changed: 1, failed: 0 } },
    ]);
  });

  it('下雨：同样的随机数不长草；到时间、无虫无草的作物自动进入下一阶段', async () => {
    grassy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(grassy, 10);
    const id = await cropOf(grassy, ctx.restaurantId, ctx.shardId, 1);
    await run(grassy, ctx.shardId);
    expect(await plantOf(grassy, id)).toMatchObject({ grass: 0, stage: 2, stage_at: grassy.clock.now, feed_min: 0 });
  });

  it('长虫；有虫时下雨也不自动进阶', async () => {
    buggy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(buggy, 10);
    const id = await cropOf(buggy, ctx.restaurantId, ctx.shardId, 1);
    await run(buggy, ctx.shardId);
    expect(await plantOf(buggy, id)).toMatchObject({ worm: 1, stage: 1 });
  });

  it('收获期过了 → 枯叶期；不下雨干涸 ≥ 100 → 枯叶期；枯叶期的作物不再处理', async () => {
    calm.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(calm, 1);
    const old = await cropOf(calm, ctx.restaurantId, ctx.shardId, 1, {
      stage: 4,
      stage_at: new Date(calm.clock.now.getTime() - 1441 * MIN),
    });
    const dry = await cropOf(calm, ctx.restaurantId, ctx.shardId, 2, { dry: 100 });
    await cropOf(calm, ctx.restaurantId, ctx.shardId, 3, { stage: 5 });
    await run(calm, ctx.shardId);
    expect(await plantOf(calm, old)).toMatchObject({ stage: 5, dry: 0 });
    expect(await plantOf(calm, dry)).toMatchObject({ stage: 5, dry: 0 });
    expect((await runs(calm, ctx.shardId))[0]!.stats).toEqual({ plants: 2, changed: 2, failed: 0 });
  });

  it('同一周期只跑一次；夜里只在 27 分跑', async () => {
    calm.clock.set(gameTime(day, 23, 10));
    const ctx = await shardWith(calm, 1);
    await run(calm, ctx.shardId);
    calm.clock.set(gameTime(day, 23, 40));
    await run(calm, ctx.shardId);
    calm.clock.set(gameTime(addDays(day, 1), 0, 30));
    await run(calm, ctx.shardId);
    expect((await runs(calm, ctx.shardId)).map((r) => r.period)).toEqual([
      `${day}@22:27`,
      `${addDays(day, 1)}@00:27`,
    ]);
  });

  it('功能关闭的区服不跑，作物不变', async () => {
    grassy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(grassy, 1);
    const id = await cropOf(grassy, ctx.restaurantId, ctx.shardId, 1);
    await grassy.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { yard: false } }) })
      .execute();
    grassy.game.shards.invalidate(ctx.shardId);
    await run(grassy, ctx.shardId);
    expect(await runs(grassy, ctx.shardId)).toEqual([]);
    expect((await plantOf(grassy, id)).grass).toBe(0);
  });

  it('作物已被收获（行不在）时跳过、不报错（Review Focus 5）', async () => {
    expect(await tickOne(calm.db, 2_000_000_000, false, calm.clock.now, sequenceRng([0.01]), e)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/jobs.test.ts`
Expected: FAIL（`./jobs` 不存在）

- [ ] **Step 3: 实现**

`apps/server/src/modules/yard/jobs.ts`：

```ts
import type { Kysely } from 'kysely';
import type { Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { JobContext, PeriodicJob } from '../../core/jobs';
import type { DB } from '../../db/schema';
import type { WorldService } from '../world/service';
import { tickPlant, yardPeriod, type EventTuning } from './rules';

/** 一株作物一次自然事件：短事务里只锁作物行（裁定 7）；作物已不在（被收获 / 铲除）或已枯萎时跳过 */
export async function tickOne(
  db: Kysely<DB>,
  plantId: number,
  raining: boolean,
  now: Date,
  rng: Rng,
  e: EventTuning,
): Promise<boolean> {
  return db.transaction().execute(async (tx) => {
    const p = await tx
      .selectFrom('yard_plant')
      .selectAll()
      .where('id', '=', plantId)
      .where('stage', '<', 5)
      .forUpdate()
      .executeTakeFirst();
    if (!p) return false;
    const { next, changed } = tickPlant(p, raining, now, rng, e);
    if (!changed) return false;
    await tx
      .updateTable('yard_plant')
      .set({
        stage: next.stage,
        stage_at: next.stage_at,
        feed_min: next.feed_min,
        harvest_num: next.harvest_num,
        worm: next.worm,
        grass: next.grass,
        dry: next.dry,
      })
      .where('id', '=', plantId)
      .execute();
    return true;
  });
}

/** 一个区服的自然事件（规格书 08 §8.4）：下雨按运行时刻的当前天气（裁定 11）；单株出错记日志继续 */
export async function runYardEvents(
  d: GameDeps,
  world: WorldService,
  shardId: number,
  now: Date,
  log: JobContext['log'],
): Promise<{ plants: number; changed: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const raining = (await world.ensure(shardId, now)).weather.type === 2;
  const rng = d.rng();
  const ids = await d.db
    .selectFrom('yard_plant')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('stage', '<', 5)
    .orderBy('id')
    .execute();
  let changed = 0;
  let failed = 0;
  for (const { id } of ids) {
    try {
      if (await tickOne(d.db, id, raining, now, rng, tuning.yard.events)) changed += 1;
    } catch (err) {
      failed += 1;
      log.error({ err, shardId, plantId: id }, 'yard event failed');
    }
  }
  return { plants: ids.length, changed, failed };
}

/** 功能关闭的区服由调度器跳过（裁定 12） */
export function yardJobs(d: GameDeps, world: WorldService): PeriodicJob[] {
  return [
    {
      name: 'yard-events',
      feature: 'yard',
      period: (now, s) => yardPeriod(now, s.tuning.yard.events),
      run: ({ shardId, now, log }) => runYardEvents(d, world, shardId, now, log),
    },
  ];
}
```

`apps/server/src/game.ts`：import 加 `import { yardJobs } from './modules/yard/jobs';`，`jobs.push(...mysteriousJobs(deps));` 下面加 `jobs.push(...yardJobs(deps, world));`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/jobs.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/yard/jobs.ts apps/server/src/modules/yard/jobs.test.ts apps/server/src/game.ts
git commit -m "feat(yard): natural events job with worms, weeds, drought, withering and rain auto-watering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 配方——鉴定、学习、分解、合成、配方页

**Files:**
- Create: `apps/server/src/modules/yard/formula.ts`、`apps/server/src/modules/yard/formula.test.ts`
- Modify: `apps/server/src/modules/yard/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 3 `formulaAppraiseRate`、`formulaPart`、`composeExtra`；Task 5 `subBasket`、`badInput`；`GameConfig.formulas`、`formulaPool`（Task 1）；`GOODS.formulaScroll`、`moonScroll`、`starTear`、`formulaEssence`；`consumeGoods`、`grantGoodsOp`、`hasValidHonor`、`subFoods`、`addFoods`、`opLuck`、`spendStrength`、`emitAction`
- Produces:
  - `formula.ts`：`formulaTools(config): Array<{ goodsId: number; rate: number }>`、`formulasView(db, config, rest, t, now): Promise<FormulasDto>`、`appraiseFormula(o, {toolId, times}): Promise<FormulaAppraiseResultDto>`、`learnFormula(o, {formulaId}): Promise<{ formulaId }>`、`decomposeFormula(o, {formulaId, part, num}): Promise<{ essence }>`、`composeFormula(o, {formulaId, num}): Promise<ComposeResultDto>`
  - 服务方法 `formulas`、`appraiseFormula`、`learnFormula`、`decomposeFormula`、`composeFormula`；路由 `GET /yard/formulas`、`POST /yard/formula/appraise|learn|decompose|compose`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/formula.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  createTestGame,
  foodNum,
  goodsNum,
  newRestaurant,
  restRow,
  type TestGame,
} from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数 0：鉴定必成功、抽到 1 号配方、主碎片；合成每份暴击 +1 */
let win: TestGame;
/** 随机数 0.99：鉴定必失败 */
let lose: TestGame;
/** 成功、1 号配方、辅碎片（0.5），星月密卷转换用 0.1 */
let moon: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  lose = await createTestGame({ rng: () => sequenceRng([0.99]) });
  moon = await createTestGame({ rng: () => sequenceRng([0, 0, 0.5, 0.1]) });
});
afterAll(async () => {
  for (const g of [t, win, lose, moon]) await g.close();
});

const rowOf = (g: TestGame, restId: number, formulaId = 1) =>
  g.db
    .selectFrom('rest_formula')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('formula_id', '=', formulaId)
    .executeTakeFirst();
const setRow = (g: TestGame, restId: number, v: { main_num?: number; sub_num?: number; learned?: boolean }) =>
  g.db.insertInto('rest_formula').values({ rest_id: restId, formula_id: 1, ...v }).execute();
async function counter(g: TestGame, restId: number, key: string) {
  const r = await g.db
    .selectFrom('event_counter')
    .select('count')
    .where('rest_id', '=', restId)
    .where('key', '=', key)
    .executeTakeFirst();
  return r?.count ?? 0;
}

describe('配方鉴定（规格书 09 §9.3，裁定 8、9）', () => {
  it('扣厨神玉玺和玄奥配方各 times 个；成功时按 odds 抽配方，rand < 0.25 得主碎片；活跃按次数；支线 114 完成', async () => {
    const ctx = await newRestaurant(win, { patch: { main_task_step: 30 }, goods: { 164: 3, 464: 3 } });
    expect((await win.game.task.tasks(ctx)).side.find((x) => x.id === 114)).toMatchObject({
      href: '/yard',
      done: false,
    });
    const r = await win.game.yard.appraiseFormula(ctx, { toolId: 164, times: 2 });
    expect(r.data.results).toEqual([
      { ok: true, formulaId: 1, part: 'main', upgraded: false },
      { ok: true, formulaId: 1, part: 'main', upgraded: false },
    ]);
    expect(await rowOf(win, ctx.restaurantId)).toMatchObject({ main_num: 2, sub_num: 0, learned: false });
    expect(await goodsNum(win, ctx.restaurantId, 164)).toBe(1);
    expect(await goodsNum(win, ctx.restaurantId, 464)).toBe(1);
    expect(await counter(win, ctx.restaurantId, 'formula.appraise')).toBe(2);
    expect((await win.game.task.tasks(ctx)).side.find((x) => x.id === 114)).toMatchObject({ done: true });
  });

  it('失败时什么碎片也不得，道具照扣', async () => {
    const ctx = await newRestaurant(lose, { goods: { 164: 1, 464: 1 } });
    const r = await lose.game.yard.appraiseFormula(ctx, { toolId: 164, times: 1 });
    expect(r.data.results).toEqual([{ ok: false }]);
    expect(await rowOf(lose, ctx.restaurantId)).toBeUndefined();
    expect(await goodsNum(lose, ctx.restaurantId, 464)).toBe(0);
  });

  it('星月密卷：已有该配方辅碎片时，辅碎片 rand < 0.2 转成主碎片；没有辅碎片时不转', async () => {
    const has = await newRestaurant(moon, { goods: { 164: 1, 464: 1 } });
    await grantGoods(moon.db, config, has.restaurantId, 465, 1, moon.clock.now);
    await setRow(moon, has.restaurantId, { sub_num: 1 });
    const r1 = await moon.game.yard.appraiseFormula(has, { toolId: 164, times: 1 });
    expect(r1.data.results).toEqual([{ ok: true, formulaId: 1, part: 'main', upgraded: true }]);
    expect(await rowOf(moon, has.restaurantId)).toMatchObject({ main_num: 1, sub_num: 1 });
    const none = await newRestaurant(moon, { goods: { 164: 1, 464: 1 } });
    await grantGoods(moon.db, config, none.restaurantId, 465, 1, moon.clock.now);
    const r2 = await moon.game.yard.appraiseFormula(none, { toolId: 164, times: 1 });
    expect(r2.data.results).toEqual([{ ok: true, formulaId: 1, part: 'sub', upgraded: false }]);
  });

  it('不是配方鉴定道具（星月密卷也不算）报 VALIDATION_FAILED；玄奥配方不够报 NOT_ENOUGH，什么都不扣', async () => {
    const ctx = await newRestaurant(t, { goods: { 164: 2, 464: 1 } });
    for (const toolId of [18, 465]) {
      await expect(t.game.yard.appraiseFormula(ctx, { toolId, times: 1 })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        params: { reason: 'not_formula_tool' },
      });
    }
    await expect(t.game.yard.appraiseFormula(ctx, { toolId: 164, times: 2 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 464, need: 2, have: 1 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 164)).toBe(2);
  });
});

describe('配方学习和分解（规格书 08 §8.5）', () => {
  it('学习：主辅碎片各扣 1；缺辅碎片报 NOT_ENOUGH fragment；已学报 formula_learned', async () => {
    const ctx = await newRestaurant(t);
    await setRow(t, ctx.restaurantId, { main_num: 2 });
    await expect(t.game.yard.learnFormula(ctx, { formulaId: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'fragment', part: 'sub', id: 1, need: 1, have: 0 },
    });
    await t.db.updateTable('rest_formula').set({ sub_num: 1 }).where('rest_id', '=', ctx.restaurantId).execute();
    await t.game.yard.learnFormula(ctx, { formulaId: 1 });
    expect(await rowOf(t, ctx.restaurantId)).toMatchObject({ main_num: 1, sub_num: 0, learned: true });
    await expect(t.game.yard.learnFormula(ctx, { formulaId: 1 })).rejects.toMatchObject({
      params: { reason: 'formula_learned' },
    });
    await expect(t.game.yard.learnFormula(ctx, { formulaId: 999 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'no_formula' },
    });
  });

  it('分解：主碎片 ×3、辅碎片 ×1 换配方精华；不够报 NOT_ENOUGH fragment', async () => {
    const ctx = await newRestaurant(t);
    await setRow(t, ctx.restaurantId, { main_num: 2, sub_num: 3 });
    expect((await t.game.yard.decomposeFormula(ctx, { formulaId: 1, part: 'main', num: 2 })).data).toEqual({
      essence: 6,
    });
    expect((await t.game.yard.decomposeFormula(ctx, { formulaId: 1, part: 'sub', num: 3 })).data).toEqual({
      essence: 3,
    });
    expect(await goodsNum(t, ctx.restaurantId, 470)).toBe(9);
    expect(await rowOf(t, ctx.restaurantId)).toMatchObject({ main_num: 0, sub_num: 0 });
    await expect(
      t.game.yard.decomposeFormula(ctx, { formulaId: 1, part: 'sub', num: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'fragment', part: 'sub', have: 0 } });
  });
});

describe('配方合成（规格书 08 §8.5）', () => {
  /** 1 号配方：主料 438（菜篮）、辅料 431、添加料 551（橱柜），结果 447 */
  async function cook(g: TestGame, opts: { sub?: number; strength?: number } = {}) {
    const ctx = await newRestaurant(g, {
      patch: { strength: opts.strength ?? 100 },
      foods: { 431: opts.sub ?? 5, 551: 5 },
    });
    await setRow(g, ctx.restaurantId, { learned: true });
    await g.db.insertInto('yard_basket').values({ rest_id: ctx.restaurantId, foods_id: 438, num: 5 }).execute();
    return ctx;
  }
  const basketOf = async (g: TestGame, restId: number) =>
    (
      await g.db
        .selectFrom('yard_basket')
        .select('num')
        .where('rest_id', '=', restId)
        .where('foods_id', '=', 438)
        .executeTakeFirst()
    )?.num ?? 0;

  it('扣体力 3×份、菜篮主料、橱柜辅料和添加料；随机数 0 时每份暴击 +1；结果进橱柜；活跃按份数', async () => {
    const ctx = await cook(win);
    const r = await win.game.yard.composeFormula(ctx, { formulaId: 1, num: 2 });
    expect(r.data).toEqual({ foodsId: 447, num: 4, extra: 2 });
    expect((await restRow(win, ctx.restaurantId)).strength).toBe(94);
    expect(await basketOf(win, ctx.restaurantId)).toBe(3);
    expect((await foodNum(win, ctx.restaurantId, 431)).num).toBe(3);
    expect((await foodNum(win, ctx.restaurantId, 551)).num).toBe(3);
    expect((await foodNum(win, ctx.restaurantId, 447)).num).toBe(4);
    expect(await counter(win, ctx.restaurantId, 'formula.compose')).toBe(2);
  });

  it('没学会报 formula_unlearned；辅料不够报 NOT_ENOUGH foods，体力、菜篮、添加料都不扣（Review Focus 4）', async () => {
    const fresh = await newRestaurant(t);
    await expect(t.game.yard.composeFormula(fresh, { formulaId: 1, num: 1 })).rejects.toMatchObject({
      params: { reason: 'formula_unlearned' },
    });
    const ctx = await cook(t, { sub: 1 });
    await expect(t.game.yard.composeFormula(ctx, { formulaId: 1, num: 2 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods', id: 431, need: 2, have: 1 },
    });
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(100);
    expect(await basketOf(t, ctx.restaurantId)).toBe(5);
    expect((await foodNum(t, ctx.restaurantId, 551)).num).toBe(5);
  });

  it('配方页：碎片、已学、原料持有、最多能合成几份（受体力限制）、鉴定道具', async () => {
    const ctx = await cook(t, { strength: 12 });
    await t.db.insertInto('store_item').values({ rest_id: ctx.restaurantId, goods_id: 164, num: 3 }).execute();
    const v = await t.game.yard.formulas(ctx);
    expect(v.formulas).toHaveLength(56);
    expect(v.formulas.find((f) => f.id === 1)).toMatchObject({
      name: '牡丹籽油配方',
      mainNum: 0,
      subNum: 0,
      learned: true,
      have: { main: 5, sub: 5, add: 5 },
      maxCompose: 4,
    });
    expect(v.formulas.find((f) => f.id === 2)).toMatchObject({ learned: false, maxCompose: 0 });
    expect(v.tools).toEqual([{ goodsId: 164, num: 3, rate: 0.25 }]);
    expect(v).toMatchObject({ scrolls: 0, essence: 0, strength: 12, composeStrength: 3 });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/formula.test.ts`
Expected: FAIL（`appraiseFormula` 不是函数）

- [ ] **Step 3: 实现**

`apps/server/src/modules/yard/formula.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { GOODS, GOODS_TYPE, type Formula, type GameConfig } from '@dt/config';
import {
  ErrorCode,
  pickWeighted,
  type ComposeResultDto,
  type FormulaAppraiseResultDto,
  type FormulasDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState } from '../../core/errors';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { addFoods, subFoods } from '../cupboard/foods';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { badInput, subBasket } from './common';
import { composeExtra, formulaAppraiseRate, formulaPart, type YardTuning } from './rules';

/** 配方碎片不够（计划裁定 7） */
function fragmentShort(part: 'main' | 'sub', formulaId: number, need: number, have: number): AppError {
  return new AppError(ErrorCode.NOT_ENOUGH, 400, { kind: 'fragment', part, id: formulaId, need, have });
}

function formulaOf(o: Op, id: number): Formula {
  const f = o.config.formulas.get(id);
  if (!f) throw badInput('no_formula');
  return f;
}

const rowOf = (o: Op, formulaId: number) =>
  o.tx
    .selectFrom('rest_formula')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('formula_id', '=', formulaId)
    .executeTakeFirst();

/** 配方鉴定道具：value 里有 formulaRate 的道具，勋章（星月密卷）除外（裁定 9） */
export function formulaTools(config: GameConfig): Array<{ goodsId: number; rate: number }> {
  return config.bundle.goods
    .filter((g) => (g.effects.formulaRate ?? 0) > 0 && g.type !== GOODS_TYPE.honor)
    .map((g) => ({ goodsId: g.id, rate: g.effects.formulaRate! }));
}

/** 配方页（设计文档 §5） */
export async function formulasView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: YardTuning,
): Promise<FormulasDto> {
  const rows = await db.selectFrom('rest_formula').selectAll().where('rest_id', '=', rest.id).execute();
  const byId = new Map(rows.map((r) => [r.formula_id, r]));
  const basket = new Map(
    (
      await db.selectFrom('yard_basket').select(['foods_id', 'num']).where('rest_id', '=', rest.id).execute()
    ).map((r) => [r.foods_id, r.num]),
  );
  const cupboard = new Map(
    (
      await db.selectFrom('cupboard_food').select(['foods_id', 'num']).where('rest_id', '=', rest.id).execute()
    ).map((r) => [r.foods_id, r.num]),
  );
  const tools = formulaTools(config);
  const held = new Map(
    (
      await db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', rest.id)
        .where('goods_id', 'in', [...tools.map((x) => x.goodsId), GOODS.formulaScroll, GOODS.formulaEssence])
        .execute()
    ).map((r) => [r.goods_id, r.num]),
  );
  return {
    formulas: config.bundle.formulas.map((f) => {
      const r = byId.get(f.id);
      const have = {
        main: basket.get(f.mainFoodsId) ?? 0,
        sub: cupboard.get(f.subFoodsId) ?? 0,
        add: cupboard.get(f.addFoodsId) ?? 0,
      };
      return {
        id: f.id,
        name: f.name,
        mainFoodsId: f.mainFoodsId,
        subFoodsId: f.subFoodsId,
        addFoodsId: f.addFoodsId,
        resFoodsId: f.resFoodsId,
        mainNum: r?.main_num ?? 0,
        subNum: r?.sub_num ?? 0,
        learned: r?.learned ?? false,
        have,
        maxCompose: r?.learned
          ? Math.min(have.main, have.sub, have.add, Math.floor(rest.strength / t.composeStrength), 99)
          : 0,
      };
    }),
    tools: tools.map((x) => ({ ...x, num: held.get(x.goodsId) ?? 0 })),
    scrolls: held.get(GOODS.formulaScroll) ?? 0,
    essence: held.get(GOODS.formulaEssence) ?? 0,
    strength: rest.strength,
    composeStrength: t.composeStrength,
  };
}

/** 配方鉴定（规格书 09 §9.3，裁定 8、9）：每次扣道具 1 + 玄奥配方 1；同一配方的碎片合并写库 */
export async function appraiseFormula(
  o: Op,
  b: { toolId: number; times: number },
): Promise<FormulaAppraiseResultDto> {
  const tool = formulaTools(o.config).find((x) => x.goodsId === b.toolId);
  if (!tool) throw badInput('not_formula_tool');
  await consumeGoods(o, b.toolId, b.times);
  await consumeGoods(o, GOODS.formulaScroll, b.times);
  const t = o.tuning.yard;
  const { rate: luck } = await opLuck(o);
  const moonDef = o.config.requireGoods(GOODS.moonScroll).effects;
  const moon = (await hasValidHonor(o, GOODS.moonScroll))
    ? { rate: moonDef.formulaRate ?? 0, secToMain: moonDef.secToMain ?? 0 }
    : null;
  const rate = formulaAppraiseRate(tool.rate, luck, moon?.rate ?? 0, t);
  const rows = await o.tx.selectFrom('rest_formula').selectAll().where('rest_id', '=', o.rest.id).execute();
  const state = new Map(
    rows.map((r) => [r.formula_id, { main: 0, sub: 0, hasSub: r.sub_num > 0 || r.learned }]),
  );
  const results: FormulaAppraiseResultDto['results'] = [];
  for (let i = 0; i < b.times; i++) {
    if (!o.rng.chance(rate)) {
      results.push({ ok: false });
      continue;
    }
    const f = pickWeighted(o.config.formulaPool, o.rng);
    const s = state.get(f.id) ?? { main: 0, sub: 0, hasSub: false };
    const r = formulaPart(o.rng, moon, s.hasSub, t);
    if (r.part === 'main') s.main += 1;
    else {
      s.sub += 1;
      s.hasSub = true;
    }
    state.set(f.id, s);
    results.push({ ok: true, formulaId: f.id, part: r.part, upgraded: r.upgraded });
  }
  for (const [formulaId, s] of state) {
    if (s.main + s.sub === 0) continue;
    await o.tx
      .insertInto('rest_formula')
      .values({ rest_id: o.rest.id, formula_id: formulaId, main_num: s.main, sub_num: s.sub })
      .onConflict((oc) =>
        oc.columns(['rest_id', 'formula_id']).doUpdateSet({
          main_num: sql<number>`rest_formula.main_num + ${s.main}`,
          sub_num: sql<number>`rest_formula.sub_num + ${s.sub}`,
        }),
      )
      .execute();
  }
  await emitAction(o, 'formula.appraise', b.times);
  return { results };
}

/** 学习：主辅碎片各 1 */
export async function learnFormula(o: Op, b: { formulaId: number }): Promise<{ formulaId: number }> {
  const f = formulaOf(o, b.formulaId);
  const row = await rowOf(o, f.id);
  if (row?.learned) throw invalidState('formula_learned');
  const main = row?.main_num ?? 0;
  const sub = row?.sub_num ?? 0;
  if (main < 1) throw fragmentShort('main', f.id, 1, main);
  if (sub < 1) throw fragmentShort('sub', f.id, 1, sub);
  await o.tx
    .updateTable('rest_formula')
    .set({ main_num: main - 1, sub_num: sub - 1, learned: true })
    .where('rest_id', '=', o.rest.id)
    .where('formula_id', '=', f.id)
    .execute();
  return { formulaId: f.id };
}

/** 分解碎片换配方精华：主 ×essenceMain、辅 ×essenceSub */
export async function decomposeFormula(
  o: Op,
  b: { formulaId: number; part: 'main' | 'sub'; num: number },
): Promise<{ essence: number }> {
  const f = formulaOf(o, b.formulaId);
  const row = await rowOf(o, f.id);
  const have = b.part === 'main' ? (row?.main_num ?? 0) : (row?.sub_num ?? 0);
  if (have < b.num) throw fragmentShort(b.part, f.id, b.num, have);
  await o.tx
    .updateTable('rest_formula')
    .set(b.part === 'main' ? { main_num: have - b.num } : { sub_num: have - b.num })
    .where('rest_id', '=', o.rest.id)
    .where('formula_id', '=', f.id)
    .execute();
  const t = o.tuning.yard;
  const essence = b.num * (b.part === 'main' ? t.essenceMain : t.essenceSub);
  await grantGoodsOp(o, GOODS.formulaEssence, essence);
  return { essence };
}

/** 合成（规格书 08 §8.5）：体力 3×份、菜篮主料、橱柜辅料和添加料；额外产出见 composeExtra */
export async function composeFormula(o: Op, b: { formulaId: number; num: number }): Promise<ComposeResultDto> {
  const f = formulaOf(o, b.formulaId);
  const row = await rowOf(o, f.id);
  if (!row?.learned) throw invalidState('formula_unlearned');
  const t = o.tuning.yard;
  spendStrength(o, t.composeStrength * b.num);
  await subBasket(o, f.mainFoodsId, b.num);
  await subFoods(o, f.subFoodsId, b.num);
  await subFoods(o, f.addFoodsId, b.num);
  const { rate: luck } = await opLuck(o);
  const tear = (await hasValidHonor(o, GOODS.starTear))
    ? (o.config.requireGoods(GOODS.starTear).effects.formulaFoodsRate ?? 0)
    : null;
  const extra = composeExtra(b.num, luck, tear, o.rng, t);
  await addFoods(o, f.resFoodsId, b.num + extra);
  await emitAction(o, 'formula.compose', b.num);
  return { foodsId: f.resFoodsId, num: b.num + extra, extra };
}
```

- [ ] **Step 4: 服务和路由**

`apps/server/src/modules/yard/service.ts`：
- import 加 `import { appraiseFormula, composeFormula, decomposeFormula, formulasView, learnFormula } from './formula';`，`@dt/shared` 类型 import 加 `FormulasDto`
- 返回对象末尾加：

```ts
    async formulas(ctx: RestCtx): Promise<FormulasDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      return formulasView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.yard);
    },
    appraiseFormula(ctx: RestCtx, b: { toolId: number; times: number }) {
      return op(ctx, 'formula.appraise', (o) => appraiseFormula(o, b));
    },
    learnFormula(ctx: RestCtx, b: { formulaId: number }) {
      return op(ctx, 'formula.learn', (o) => learnFormula(o, b));
    },
    decomposeFormula(ctx: RestCtx, b: { formulaId: number; part: 'main' | 'sub'; num: number }) {
      return op(ctx, 'formula.decompose', (o) => decomposeFormula(o, b));
    },
    composeFormula(ctx: RestCtx, b: { formulaId: number; num: number }) {
      return op(ctx, 'formula.compose', (o) => composeFormula(o, b));
    },
```

`apps/server/src/modules/yard/routes.ts`：`@dt/shared` import 加 `formulaAppraiseBody`、`formulaComposeBody`、`formulaDecomposeBody`、`formulaIdBody`，末尾加：

```ts
    r.get('/yard/formulas', async (req) => ok(await svc.formulas(restCtxOf(req))));
    r.post('/yard/formula/appraise', async (req) =>
      okOp(await svc.appraiseFormula(restCtxOf(req), parse(formulaAppraiseBody, req.body))),
    );
    r.post('/yard/formula/learn', async (req) =>
      okOp(await svc.learnFormula(restCtxOf(req), parse(formulaIdBody, req.body))),
    );
    r.post('/yard/formula/decompose', async (req) =>
      okOp(await svc.decomposeFormula(restCtxOf(req), parse(formulaDecomposeBody, req.body))),
    );
    r.post('/yard/formula/compose', async (req) =>
      okOp(await svc.composeFormula(restCtxOf(req), parse(formulaComposeBody, req.body))),
    );
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/formula.test.ts`
Expected: PASS

- [ ] **Step 6: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/yard
git commit -m "feat(yard): formula appraisal with moon scroll, learning, fragment decomposition and composing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 种子——种子页、种子商店、精华兑换

**Files:**
- Create: `apps/server/src/modules/yard/seed.ts`、`apps/server/src/modules/yard/seed.test.ts`
- Modify: `apps/server/src/modules/yard/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: Task 3 `seedPrice`；`GameConfig.seeds`、`seedExchange`；`addSeeds`（`modules/temple/common.ts`）；`consumeGoods`、`spendCoin`；`GOODS.formulaEssence`
- Produces:
  - `seed.ts`：`seedsView(db, config, rest, t): Promise<SeedsDto>`、`buySeed(o, {seedId, num}): Promise<{ coin }>`、`exchangeSeed(o, {seedId, times}): Promise<{ seeds }>`
  - 服务方法 `seeds`、`buySeed`、`exchangeSeed`；路由 `GET /yard/seeds`、`POST /yard/seed/buy`、`POST /yard/seed/exchange`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/yard/seed.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function seedNum(restId: number, seedId: number) {
  const r = await t.db
    .selectFrom('rest_seed')
    .select('num')
    .where('rest_id', '=', restId)
    .where('seed_id', '=', seedId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

describe('种子（设计文档 §3.6，裁定 1、5）', () => {
  it('种子页：库存、商店（不卖 7 级）、兑换表、精华持有', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000 }, goods: { 470: 7 } });
    await t.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 3, num: 2 }).execute();
    const v = await t.game.yard.seeds(ctx);
    expect(v).toMatchObject({ stock: [{ seedId: 3, num: 2 }], essence: 7, coin: 5000 });
    expect(v.shop.open).toBe(true);
    expect(v.shop.items).toHaveLength(94);
    expect(v.shop.items[0]).toEqual({ seedId: 1, price: 1800 });
    expect(v.shop.items.some((x) => x.seedId === 95)).toBe(false);
    expect(v.exchange).toHaveLength(96);
    expect(v.exchange.find((x) => x.seedId === 95)).toEqual({ seedId: 95, seedNum: 1, essence: 30 });
  });

  it('买种子：花 单价 × 数量；7 级不卖；银币不够报错', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000 } });
    expect((await t.game.yard.buySeed(ctx, { seedId: 1, num: 2 })).data).toEqual({ coin: 3600 });
    expect(await seedNum(ctx.restaurantId, 1)).toBe(2);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1400);
    await expect(t.game.yard.buySeed(ctx, { seedId: 95, num: 1 })).rejects.toMatchObject({
      params: { reason: 'seed_not_sold' },
    });
    await expect(t.game.yard.buySeed(ctx, { seedId: 1, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
  });

  it('种子商店关闭报 seed_shop_closed；调价后单价 = ⌈coin × 倍率⌉', async () => {
    const closed = await newRestaurant(t, { patch: { coin: 5000 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: closed.shardId, override: JSON.stringify({ tuning: { yard: { seedShop: false } } }) })
      .execute();
    t.game.shards.invalidate(closed.shardId);
    await expect(t.game.yard.buySeed(closed, { seedId: 1, num: 1 })).rejects.toMatchObject({
      params: { reason: 'seed_shop_closed' },
    });
    expect((await t.game.yard.seeds(closed)).shop.open).toBe(false);
    const pricey = await newRestaurant(t, { patch: { coin: 5000 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: pricey.shardId, override: JSON.stringify({ tuning: { yard: { seedPriceRate: 1.5 } } }) })
      .execute();
    t.game.shards.invalidate(pricey.shardId);
    expect((await t.game.yard.buySeed(pricey, { seedId: 1, num: 1 })).data).toEqual({ coin: 2700 });
  });

  it('兑换：扣 精华 × 次数，种子 + 每次数量 × 次数；精华不足一律不能换（裁定 5）', async () => {
    const ctx = await newRestaurant(t, { goods: { 470: 5 } });
    expect((await t.game.yard.exchangeSeed(ctx, { seedId: 1, times: 2 })).data).toEqual({ seeds: 10 });
    expect(await seedNum(ctx.restaurantId, 1)).toBe(10);
    expect(await goodsNum(t, ctx.restaurantId, 470)).toBe(1);
    await expect(t.game.yard.exchangeSeed(ctx, { seedId: 1, times: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 470, need: 2, have: 1 },
    });
    const broke = await newRestaurant(t);
    await expect(t.game.yard.exchangeSeed(broke, { seedId: 95, times: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
    expect(await seedNum(broke.restaurantId, 95)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard/seed.test.ts`
Expected: FAIL（`t.game.yard.seeds` 不是函数）

- [ ] **Step 3: 实现**

`apps/server/src/modules/yard/seed.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import type { SeedsDto } from '@dt/shared';
import { invalidState } from '../../core/errors';
import type { Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { consumeGoods } from '../store/goods';
import { addSeeds } from '../temple/common';
import { badInput } from './common';
import { seedPrice, type YardTuning } from './rules';

/** 神秘种子（7 级）不在商店卖（裁定 1） */
const SHOP_MAX_LEVEL = 5;

/** 种子页（设计文档 §3.6） */
export async function seedsView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: YardTuning,
): Promise<SeedsDto> {
  const stock = await db
    .selectFrom('rest_seed')
    .select(['seed_id', 'num'])
    .where('rest_id', '=', rest.id)
    .where('num', '>', 0)
    .orderBy('seed_id')
    .execute();
  const essence = await db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', rest.id)
    .where('goods_id', '=', GOODS.formulaEssence)
    .executeTakeFirst();
  return {
    stock: stock.map((s) => ({ seedId: s.seed_id, num: s.num })),
    shop: {
      open: t.seedShop,
      items: config.bundle.seeds
        .filter((s) => s.level <= SHOP_MAX_LEVEL)
        .map((s) => ({ seedId: s.id, price: seedPrice(s.coin, t) })),
    },
    exchange: config.bundle.seedExchange.map((e) => ({ ...e })),
    essence: essence?.num ?? 0,
    coin: rest.coin,
  };
}

/** 种子商店（裁定 1）：单价 × 数量银币 */
export async function buySeed(o: Op, b: { seedId: number; num: number }): Promise<{ coin: number }> {
  const t = o.tuning.yard;
  if (!t.seedShop) throw invalidState('seed_shop_closed');
  const seed = o.config.seeds.get(b.seedId);
  if (!seed) throw badInput('no_seed');
  if (seed.level > SHOP_MAX_LEVEL) throw invalidState('seed_not_sold');
  const coin = seedPrice(seed.coin, t) * b.num;
  spendCoin(o, coin);
  await addSeeds(o, seed.id, b.num);
  return { coin };
}

/** 配方精华换种子（规格书 20 §20.8，裁定 5）：精华不足一律不能换 */
export async function exchangeSeed(o: Op, b: { seedId: number; times: number }): Promise<{ seeds: number }> {
  const e = o.config.seedExchange.get(b.seedId);
  if (!e) throw badInput('no_exchange');
  await consumeGoods(o, GOODS.formulaEssence, e.essence * b.times);
  const seeds = e.seedNum * b.times;
  await addSeeds(o, e.seedId, seeds);
  return { seeds };
}
```

- [ ] **Step 4: 服务和路由**

`apps/server/src/modules/yard/service.ts`：
- import 加 `import { buySeed, exchangeSeed, seedsView } from './seed';`，`@dt/shared` 类型 import 加 `SeedsDto`
- 返回对象末尾加：

```ts
    async seeds(ctx: RestCtx): Promise<SeedsDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      return seedsView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.yard);
    },
    buySeed(ctx: RestCtx, b: { seedId: number; num: number }) {
      return op(ctx, 'seed.buy', (o) => buySeed(o, b));
    },
    exchangeSeed(ctx: RestCtx, b: { seedId: number; times: number }) {
      return op(ctx, 'seed.exchange', (o) => exchangeSeed(o, b));
    },
```

`apps/server/src/modules/yard/routes.ts`：`@dt/shared` import 加 `seedBuyBody`、`seedExchangeBody`，末尾加：

```ts
    r.get('/yard/seeds', async (req) => ok(await svc.seeds(restCtxOf(req))));
    r.post('/yard/seed/buy', async (req) =>
      okOp(await svc.buySeed(restCtxOf(req), parse(seedBuyBody, req.body))),
    );
    r.post('/yard/seed/exchange', async (req) =>
      okOp(await svc.exchangeSeed(restCtxOf(req), parse(seedExchangeBody, req.body))),
    );
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/yard`
Expected: PASS

- [ ] **Step 6: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/yard
git commit -m "feat(yard): seed page, seed shop and essence exchange

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: 前端——接口、文案、菜篮 / 种子 / 配方面板

**Files:**
- Create: `apps/web/src/components/yard/testData.ts`
- Create: `apps/web/src/components/yard/BasketPanel.vue`、`BasketPanel.test.ts`、`SeedPanel.vue`、`SeedPanel.test.ts`、`FormulaPanel.vue`、`FormulaPanel.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`、`apps/web/src/i18n/zh-CN.ts`、`apps/web/src/i18n/zh-CN.test.ts`、`apps/web/src/stores/catalog.ts`、`apps/web/src/utils/events.ts`、`apps/web/src/utils/events.test.ts`、`apps/web/src/utils/feed.ts`

**Interfaces:**
- Consumes: `@dt/shared` 的菜园 DTO（Task 4）；服务端接口（Task 4~9）
- Produces:
  - `endpoints.yard()`、`yardFriend(restId)`、`yardExpand()`、`yardPlant(landNo, seedId)`、`yardWater(plantId)`、`yardFeed(plantId, goodsId)`、`yardWeed(plantId)`、`yardDeworm(plantId)`、`yardRemove(plantId)`、`yardReap(plantId)`、`basket()`、`basketStore(foodsId, num)`、`formulas()`、`formulaAppraise(toolId, times)`、`formulaLearn(formulaId)`、`formulaDecompose(formulaId, part, num)`、`formulaCompose(formulaId, num)`、`seeds()`、`seedBuy(seedId, num)`、`seedExchange(seedId, times)`
  - `NameResolver.seedName(id)`（必填）
  - `components/yard/testData.ts`：`plantData(patch)`、`landData(no, plant)`、`yardData(patch)`、`friendYardData(patch)`、`formulaData(patch)`、`formulasData(patch)`、`seedsData(patch)`
  - `BasketPanel`、`SeedPanel`、`FormulaPanel`（无 props，自己读接口）

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/yard/testData.ts`（测试共用数据，不是测试文件）：

```ts
import type { FormulaDto, FormulasDto, FriendYardDto, LandDto, PlantDto, SeedsDto, YardDto } from '@dt/shared';

export const plantData = (patch: Partial<PlantDto> = {}): PlantDto => ({
  id: 7,
  seedId: 1,
  foodsId: 101,
  level: 1,
  stage: 1,
  canWater: false,
  minutes: 12,
  stageMinutes: 24,
  feedMin: 0,
  worm: 0,
  grass: 0,
  dry: 0,
  harvestNum: 20,
  harvestMax: 20,
  baseNum: 20,
  ...patch,
});

export const landData = (no: number, plant: PlantDto | null = null): LandDto => ({
  no,
  level: 1,
  exp: 0,
  expNext: 1000,
  bonus: 0,
  plant,
});

export const yardData = (patch: Partial<YardDto> = {}): YardDto => ({
  lands: [landData(1)],
  maxLands: 9,
  nextLandCoin: 200_000,
  coin: 500_000,
  strength: 50,
  renown: 3,
  seeds: [{ seedId: 1, num: 2 }],
  fertilizers: [
    { goodsId: 427, minutes: 20, num: 1 },
    { goodsId: 428, minutes: 60, num: 0 },
  ],
  ...patch,
});

export const friendYardData = (patch: Partial<FriendYardDto> = {}): FriendYardDto => ({
  restId: 2,
  name: '乙店',
  lands: [{ no: 1, level: 1, plant: { ...plantData({ stage: 4, minutes: 600 }), stolen: false, stealBlock: null } }],
  strength: 50,
  renown: 3,
  ...patch,
});

export const formulaData = (patch: Partial<FormulaDto> = {}): FormulaDto => ({
  id: 1,
  name: '牡丹籽油配方',
  mainFoodsId: 438,
  subFoodsId: 431,
  addFoodsId: 551,
  resFoodsId: 447,
  mainNum: 1,
  subNum: 1,
  learned: false,
  have: { main: 0, sub: 0, add: 0 },
  maxCompose: 0,
  ...patch,
});

export const formulasData = (patch: Partial<FormulasDto> = {}): FormulasDto => ({
  formulas: [formulaData(), formulaData({ id: 2, name: '三文鱼配方', mainNum: 0, subNum: 0 })],
  tools: [{ goodsId: 164, num: 5, rate: 0.25 }],
  scrolls: 3,
  essence: 4,
  strength: 50,
  composeStrength: 3,
  ...patch,
});

export const seedsData = (patch: Partial<SeedsDto> = {}): SeedsDto => ({
  stock: [{ seedId: 3, num: 2 }],
  shop: {
    open: true,
    items: [
      { seedId: 1, price: 1800 },
      { seedId: 2, price: 1800 },
    ],
  },
  exchange: [
    { seedId: 1, seedNum: 5, essence: 2 },
    { seedId: 95, seedNum: 1, essence: 30 },
  ],
  essence: 4,
  coin: 5000,
  ...patch,
});
```

`apps/web/src/components/yard/BasketPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import BasketPanel from './BasketPanel.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { basket: vi.fn(), basketStore: vi.fn() } }));

describe('BasketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.basket).mockResolvedValue({ items: [{ foodsId: 101, num: 21 }] });
    vi.mocked(endpoints.basketStore).mockResolvedValue({ stored: 21, dropped: 0 });
  });

  it('列出菜篮；数量不超过持有；存进橱柜后重新读取', async () => {
    const w = mount(BasketPanel);
    await flushPromises();
    expect(w.find('[data-testid="basket-101"]').text()).toContain('× 21');
    await w.find('[data-testid="basket-num-101"]').setValue('99');
    await w.find('[data-testid="basket-store-101"]').trigger('click');
    await flushPromises();
    expect(endpoints.basketStore).toHaveBeenCalledWith(101, 21);
    expect(endpoints.basket).toHaveBeenCalledTimes(2);
  });

  it('空菜篮显示提示', async () => {
    vi.mocked(endpoints.basket).mockResolvedValue({ items: [] });
    const w = mount(BasketPanel);
    await flushPromises();
    expect(w.find('[data-testid="basket-empty"]').exists()).toBe(true);
  });
});
```

`apps/web/src/components/yard/SeedPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import SeedPanel from './SeedPanel.vue';
import { seedsData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { seeds: vi.fn(), seedBuy: vi.fn(), seedExchange: vi.fn() },
}));

describe('SeedPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.seeds).mockResolvedValue(seedsData());
    vi.mocked(endpoints.seedBuy).mockResolvedValue({ coin: 3600 });
    vi.mocked(endpoints.seedExchange).mockResolvedValue({ seeds: 10 });
  });

  it('买种子：数量不超过 银币÷单价 和 99', async () => {
    const w = mount(SeedPanel);
    await flushPromises();
    expect(w.find('[data-testid="seed-stock"]').text()).toContain('× 2');
    await w.find('[data-testid="shop-num"]').setValue('9');
    await w.find('[data-testid="shop-buy"]').trigger('click');
    await flushPromises();
    expect(endpoints.seedBuy).toHaveBeenCalledWith(1, 2);
  });

  it('兑换：次数不超过 精华÷每次精华；精华不够时灰掉并写明原因', async () => {
    const w = mount(SeedPanel);
    await flushPromises();
    await w.find('[data-testid="ex-times"]').setValue('5');
    await w.find('[data-testid="ex-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.seedExchange).toHaveBeenCalledWith(1, 2);
    await w.find('[data-testid="ex-seed"]').setValue('95');
    expect(w.find('[data-testid="ex-go"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-block"]').text()).toContain('配方精华不够');
  });

  it('商店关闭时写明原因', async () => {
    vi.mocked(endpoints.seeds).mockResolvedValue(seedsData({ shop: { open: false, items: [] } }));
    const w = mount(SeedPanel);
    await flushPromises();
    expect(w.find('[data-testid="shop-closed"]').exists()).toBe(true);
  });
});
```

`apps/web/src/components/yard/FormulaPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FormulaPanel from './FormulaPanel.vue';
import { formulaData, formulasData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    formulas: vi.fn(),
    formulaAppraise: vi.fn(),
    formulaLearn: vi.fn(),
    formulaDecompose: vi.fn(),
    formulaCompose: vi.fn(),
  },
}));

describe('FormulaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.formulas).mockResolvedValue(formulasData());
    vi.mocked(endpoints.formulaAppraise).mockResolvedValue({
      results: [{ ok: true, formulaId: 1, part: 'sub', upgraded: false }, { ok: false }],
    });
    vi.mocked(endpoints.formulaLearn).mockResolvedValue({ formulaId: 1 });
    vi.mocked(endpoints.formulaDecompose).mockResolvedValue({ essence: 3 });
    vi.mocked(endpoints.formulaCompose).mockResolvedValue({ foodsId: 447, num: 3, extra: 1 });
  });

  it('鉴定：次数不超过 道具、玄奥配方、99 取小；显示每次结果', async () => {
    const w = mount(FormulaPanel);
    await flushPromises();
    await w.find('[data-testid="appraise-times"]').setValue('9');
    await w.find('[data-testid="appraise-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaAppraise).toHaveBeenCalledWith(164, 3);
    const text = w.find('[data-testid="appraise-results"]').text();
    expect(text).toContain('牡丹籽油配方 辅碎片');
    expect(text).toContain('失败');
  });

  it('没有玄奥配方时灰掉并写明原因', async () => {
    vi.mocked(endpoints.formulas).mockResolvedValue(formulasData({ scrolls: 0 }));
    const w = mount(FormulaPanel);
    await flushPromises();
    expect(w.find('[data-testid="appraise-go"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="appraise-block"]').text()).toContain('玄奥配方');
  });

  it('只列有碎片或已学的配方；主辅各 1 可以学习；分解主碎片', async () => {
    const w = mount(FormulaPanel);
    await flushPromises();
    expect(w.find('[data-testid="formula-1"]').exists()).toBe(true);
    expect(w.find('[data-testid="formula-2"]').exists()).toBe(false);
    await w.find('[data-testid="learn-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaLearn).toHaveBeenCalledWith(1);
    await w.find('[data-testid="decompose-main-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaDecompose).toHaveBeenCalledWith(1, 'main', 1);
  });

  it('已学：合成份数不超过最多能合成的份数；原料不够时写明缺什么', async () => {
    vi.mocked(endpoints.formulas).mockResolvedValue(
      formulasData({
        formulas: [
          formulaData({ learned: true, mainNum: 0, subNum: 0, have: { main: 5, sub: 2, add: 4 }, maxCompose: 2 }),
          formulaData({ id: 2, name: '三文鱼配方', learned: true, have: { main: 0, sub: 3, add: 3 } }),
        ],
      }),
    );
    const w = mount(FormulaPanel);
    await flushPromises();
    await w.find('[data-testid="compose-num-1"]').setValue('9');
    await w.find('[data-testid="compose-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaCompose).toHaveBeenCalledWith(1, 2);
    expect(w.find('[data-testid="compose-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="compose-block-2"]').text()).toContain('菜篮里没有');
  });
});
```

`apps/web/src/i18n/zh-CN.test.ts`：
- `setNameResolver({ ... mcName: () => '秘·仿膳饽饽' })` 改为 `setNameResolver({ goodsName: () => '升星凭证', foodName: () => '大米', mcName: () => '秘·仿膳饽饽', seedName: () => '大米种子' })`
- `describe('错误文案'` 里加：

```ts
  it('菜园：种子、菜篮、碎片、声望、地块上限、状态', () => {
    setNameResolver({
      goodsName: () => '升星凭证',
      foodName: () => '大米',
      mcName: () => '秘·仿膳饽饽',
      seedName: () => '大米种子',
    });
    expect(errorText('NOT_ENOUGH', { kind: 'seed', id: 1, need: 1, have: 0 })).toBe('大米种子不够（需要 1，现有 0）');
    expect(errorText('NOT_ENOUGH', { kind: 'basket', id: 101, need: 3, have: 1 })).toBe(
      '菜篮里的大米不够（需要 3，现有 1）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'fragment', part: 'sub', id: 1, need: 1, have: 0 })).toBe(
      '配方辅碎片不够（需要 1，现有 0）',
    );
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown', need: 1 })).toBe('声望不够（偷菜要 1 点声望）');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown' })).toBe('声望为负时不能点赞');
    expect(errorText('LIMIT_REACHED', { what: 'lands', max: 9 })).toBe('最多开垦 9 块地');
    expect(errorText('INVALID_STATE', { reason: 'withered' })).toBe('作物已经枯萎，只能铲除');
    expect(errorText('ALREADY_DONE', { what: 'steal' })).toBe('这株你已经偷过了');
  });
```

`apps/web/src/utils/events.test.ts` 末尾加：

```ts
describe('菜园（子项目 4B-2）', () => {
  it('菜篮的得失提示和流水名称；好友动态', () => {
    expect(eventText({ type: 'gain', kind: 'basket', id: 101, num: 21 }, names)).toBe('获得 菜篮·大米×21');
    expect(recordLabel({ kind: 'basket', itemId: 101 }, names)).toBe('菜篮·大米');
    expect(
      logText({ type: 'yard.helped', params: { byName: '乙店', what: 'weed', foodsId: 101 }, at: '' }, names),
    ).toBe('乙店 帮你的大米除了草');
    expect(
      logText(
        { type: 'yard.stolen', params: { byName: '乙店', foodsId: 101, num: 2, punished: null }, at: '' },
        names,
      ),
    ).toBe('乙店 偷走了你的 大米×2');
    expect(
      logText({ type: 'yard.stolen', params: { byName: '乙店', foodsId: 101, num: 1, punished: 101 }, at: '' }, names),
    ).toBe('乙店 偷走了你的 大米×1，被边牧逮住，留下了 大米');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/yard src/i18n src/utils/events.test.ts`
Expected: FAIL（组件不存在；文案不对；`setNameResolver` 的参数多了 `seedName` 的类型报错可以忽略，运行时照跑）

- [ ] **Step 3: 接口和文案**

`apps/web/src/api/endpoints.ts`：
- `import type {` 列表里加 `BasketDto, ComposeResultDto, FormulaAppraiseResultDto, FormulasDto, FriendYardDto, ReapResultDto, SeedsDto, YardDto,`
- `endpoints` 对象末尾（`tentacleExchange` 之后）加：

```ts
  yard: () => api.get<YardDto>('/api/v1/yard'),
  yardFriend: (restId: number) => api.get<FriendYardDto>(`/api/v1/yard/friend/${restId}`),
  yardExpand: () => api.post<{ no: number; coin: number }>('/api/v1/yard/land/expand'),
  yardPlant: (landNo: number, seedId: number) =>
    api.post<{ plantId: number }>('/api/v1/yard/plant', { landNo, seedId }),
  yardWater: (plantId: number) => api.post<{ stage: number }>('/api/v1/yard/water', { plantId }),
  yardFeed: (plantId: number, goodsId: number) =>
    api.post<{ feedMin: number }>('/api/v1/yard/feed', { plantId, goodsId }),
  yardWeed: (plantId: number) => api.post<{ plantId: number }>('/api/v1/yard/weed', { plantId }),
  yardDeworm: (plantId: number) => api.post<{ plantId: number }>('/api/v1/yard/deworm', { plantId }),
  yardRemove: (plantId: number) => api.post<{ seedBack: boolean }>('/api/v1/yard/remove', { plantId }),
  yardReap: (plantId: number) => api.post<ReapResultDto>('/api/v1/yard/reap', { plantId }),
  basket: () => api.get<BasketDto>('/api/v1/yard/basket'),
  basketStore: (foodsId: number, num: number) =>
    api.post<{ stored: number; dropped: number }>('/api/v1/yard/basket/store', { foodsId, num }),
  formulas: () => api.get<FormulasDto>('/api/v1/yard/formulas'),
  formulaAppraise: (toolId: number, times: number) =>
    api.post<FormulaAppraiseResultDto>('/api/v1/yard/formula/appraise', { toolId, times }),
  formulaLearn: (formulaId: number) => api.post<{ formulaId: number }>('/api/v1/yard/formula/learn', { formulaId }),
  formulaDecompose: (formulaId: number, part: 'main' | 'sub', num: number) =>
    api.post<{ essence: number }>('/api/v1/yard/formula/decompose', { formulaId, part, num }),
  formulaCompose: (formulaId: number, num: number) =>
    api.post<ComposeResultDto>('/api/v1/yard/formula/compose', { formulaId, num }),
  seeds: () => api.get<SeedsDto>('/api/v1/yard/seeds'),
  seedBuy: (seedId: number, num: number) => api.post<{ coin: number }>('/api/v1/yard/seed/buy', { seedId, num }),
  seedExchange: (seedId: number, times: number) =>
    api.post<{ seeds: number }>('/api/v1/yard/seed/exchange', { seedId, times }),
```

`apps/web/src/i18n/zh-CN.ts`：
- `NameResolver` 加 `seedName(id: number): string;`，默认的 `names` 加 `seedName: (id) => \`种子${id}\`,`
- `REQUIREMENT` 的 `renown` 改为：

```ts
  renown: (p) => (p.need === undefined ? '声望为负时不能点赞' : `声望不够（偷菜要 ${String(p.need)} 点声望）`),
```

- `LIMIT` 末尾加 `lands: (p) => \`最多开垦 ${String(p.max)} 块地\`,`
- `STATE` 末尾加：

```ts
  no_land: '这块地还没开垦',
  land_busy: '这块地上已经有作物了',
  no_plant: '作物不存在（可能已经收获或铲除），请刷新',
  no_water: '现在还不能浇水',
  has_worm: '有虫，先除虫',
  has_grass: '有草，先除草',
  not_ripe: '还没到收获期',
  withered: '作物已经枯萎，只能铲除',
  no_worm: '没有虫',
  no_grass: '没有草',
  feed_useless: '这个阶段剩下的时间不够，肥料用不上了',
  steal_left: '剩得不多了，给主人留点吧',
  formula_unlearned: '还没学会这个配方',
  formula_learned: '已经学会这个配方了',
  seed_shop_closed: '种子商店暂未开放',
  seed_not_sold: '神秘种子不卖，只能兑换或投喂克拉肯得到',
```

- `ALREADY` 末尾加 `steal: '这株你已经偷过了',`
- `errorText` 的 `NOT_ENOUGH` 分支改为：

```ts
  if (code === 'NOT_ENOUGH') {
    const kind = String(params.kind ?? '');
    const id = Number(params.id);
    const what =
      kind === 'goods'
        ? names.goodsName(id)
        : kind === 'foods'
          ? names.foodName(id)
          : kind === 'remnant'
            ? `${names.mcName(id)}残卷`
            : kind === 'seed'
              ? names.seedName(id)
              : kind === 'basket'
                ? `菜篮里的${names.foodName(id)}`
                : kind === 'fragment'
                  ? `配方${params.part === 'main' ? '主' : '辅'}碎片`
                  : (KIND[kind] ?? '数量');
    return `${what}不够（需要 ${String(params.need)}，现有 ${String(params.have)}）`;
  }
```

`apps/web/src/stores/catalog.ts` 的 `setNameResolver({...})` 里加 `seedName: (id) => this.seedName(id),`。

`apps/web/src/utils/events.ts`：
- `eventText` 里 `else if (e.kind === 'seed') ...` 下面加：

```ts
  else if (e.kind === 'basket') what = `菜篮·${names.foodName(e.id ?? 0)}×${formatNum(e.num)}`;
```

- `recordLabel` 里 `if (r.kind === 'seed') ...` 下面加：

```ts
  if (r.kind === 'basket') return `菜篮·${names.foodName(r.itemId ?? 0)}`;
```

`apps/web/src/utils/feed.ts` 的 `switch` 里 `case 'friend.accept':` 之前加：

```ts
    case 'yard.helped': {
      const what = p.what === 'weed' ? '除了草' : p.what === 'deworm' ? '除了虫' : '浇了水';
      return `${who} 帮你的${foodName(Number(p.foodsId))}${what}`;
    }
    case 'yard.stolen': {
      const caught = p.punished ? `，被边牧逮住，留下了 ${foodName(Number(p.punished))}` : '';
      return `${who} 偷走了你的 ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
```

- [ ] **Step 4: 菜篮面板**

`apps/web/src/components/yard/BasketPanel.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BasketDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<BasketDto | null>(null);
const nums = ref<Record<number, number>>({});
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.basket();
    nums.value = Object.fromEntries(data.value.items.map((i) => [i.foodsId, i.num]));
  } catch (e) {
    toast.push(errorMessage(e, '读取菜篮失败'), 'danger');
  }
}
onMounted(load);

async function store(foodsId: number, max: number) {
  if (busy.value) return;
  const n = Math.max(1, Math.min(nums.value[foodsId] || 1, max));
  busy.value = true;
  try {
    const r = await endpoints.basketStore(foodsId, n);
    toast.push(r.dropped > 0 ? `存进了 ${r.stored} 个，冰箱满了丢掉 ${r.dropped} 个` : `存进了 ${r.stored} 个`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '存进橱柜失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-1">
      收获和偷来的作物先放在菜篮里。配方合成直接用菜篮里的主料；做菜要先存进橱柜（格子满了进冰箱）。
    </div>
    <div v-if="data && data.items.length === 0" class="text-muted" data-testid="basket-empty">菜篮是空的</div>
    <div
      v-for="i in data?.items ?? []"
      :key="i.foodsId"
      class="d-flex gap-1 align-items-center mb-1"
      :data-testid="`basket-${i.foodsId}`"
    >
      <span class="me-auto">{{ catalog.foodName(i.foodsId) }} × {{ i.num }}</span>
      <input
        v-model.number="nums[i.foodsId]"
        type="number"
        min="1"
        :max="i.num"
        class="form-control form-control-sm"
        style="width: 80px"
        :data-testid="`basket-num-${i.foodsId}`"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy"
        :data-testid="`basket-store-${i.foodsId}`"
        @click="store(i.foodsId, i.num)"
      >
        存进橱柜
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 种子面板**

`apps/web/src/components/yard/SeedPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { SeedsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<SeedsDto | null>(null);
const busy = ref(false);
const shopSeed = ref<number>(0);
const shopNum = ref(1);
const exSeed = ref<number>(0);
const exTimes = ref(1);

async function load() {
  try {
    data.value = await endpoints.seeds();
    if (!shopSeed.value) shopSeed.value = data.value.shop.items[0]?.seedId ?? 0;
    if (!exSeed.value) exSeed.value = data.value.exchange[0]?.seedId ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, '读取种子失败'), 'danger');
  }
}
onMounted(load);

const item = computed(() => data.value?.shop.items.find((x) => x.seedId === shopSeed.value));
const shopMax = computed(() =>
  item.value && data.value ? Math.min(99, Math.floor(data.value.coin / item.value.price)) : 0,
);
const shopN = computed(() => Math.max(1, Math.min(shopNum.value || 1, shopMax.value)));
const shopBlock = computed(() => (item.value && shopMax.value < 1 ? `银币不够（单价 ${item.value.price}）` : ''));

const ex = computed(() => data.value?.exchange.find((x) => x.seedId === exSeed.value));
const exMax = computed(() =>
  ex.value && data.value ? Math.min(99, Math.floor(data.value.essence / ex.value.essence)) : 0,
);
const exN = computed(() => Math.max(1, Math.min(exTimes.value || 1, exMax.value)));
const exBlock = computed(() =>
  ex.value && exMax.value < 1 ? `配方精华不够（每次 ${ex.value.essence}，现有 ${data.value?.essence ?? 0}）` : '',
);

async function run(fn: () => Promise<unknown>, ok: string, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}
const buy = () =>
  run(() => endpoints.seedBuy(shopSeed.value, shopN.value), `买了 ${shopN.value} 颗种子`, '购买失败');
const exchange = () => run(() => endpoints.seedExchange(exSeed.value, exN.value), '兑换成功', '兑换失败');
</script>

<template>
  <div v-if="data" class="small">
    <h6>我的种子</h6>
    <div data-testid="seed-stock" class="mb-2">
      <span v-if="data.stock.length === 0" class="text-muted">还没有种子</span>
      <span v-for="s in data.stock" :key="s.seedId" class="badge text-bg-light border me-1">
        {{ catalog.seedName(s.seedId) }} × {{ s.num }}
      </span>
    </div>

    <h6>种子商店</h6>
    <div v-if="!data.shop.open" class="text-muted mb-2" data-testid="shop-closed">种子商店暂未开放</div>
    <template v-else>
      <div class="d-flex gap-1 align-items-center mb-1">
        <select v-model.number="shopSeed" class="form-select form-select-sm" data-testid="shop-seed">
          <option v-for="s in data.shop.items" :key="s.seedId" :value="s.seedId">
            {{ catalog.seedName(s.seedId) }}（{{ s.price }} 银币）
          </option>
        </select>
        <input
          v-model.number="shopNum"
          type="number"
          min="1"
          :max="Math.max(1, shopMax)"
          class="form-control form-control-sm"
          style="width: 70px"
          data-testid="shop-num"
        />
        <button
          class="btn btn-sm btn-primary text-nowrap"
          :disabled="busy || !!shopBlock"
          data-testid="shop-buy"
          @click="buy"
        >
          买 ×{{ shopN }}
        </button>
      </div>
      <div class="text-muted mb-1">银币 {{ data.coin }}</div>
      <div v-if="shopBlock" class="text-danger mb-2" data-testid="shop-block">{{ shopBlock }}</div>
    </template>

    <h6>配方精华兑换</h6>
    <div class="text-muted mb-1">配方精华 {{ data.essence }}（分解配方碎片得到）</div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="exSeed" class="form-select form-select-sm" data-testid="ex-seed">
        <option v-for="e in data.exchange" :key="e.seedId" :value="e.seedId">
          {{ catalog.seedName(e.seedId) }} ×{{ e.seedNum }}（{{ e.essence }} 精华）
        </option>
      </select>
      <input
        v-model.number="exTimes"
        type="number"
        min="1"
        :max="Math.max(1, exMax)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="ex-times"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy || !!exBlock"
        data-testid="ex-go"
        @click="exchange"
      >
        兑换 ×{{ exN }}
      </button>
    </div>
    <div v-if="exBlock" class="text-danger" data-testid="ex-block">{{ exBlock }}</div>
  </div>
</template>
```

- [ ] **Step 6: 配方面板**

`apps/web/src/components/yard/FormulaPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { FormulaAppraiseResultDto, FormulaDto, FormulasDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<FormulasDto | null>(null);
const busy = ref(false);
const toolId = ref<number>(0);
const times = ref(1);
const results = ref<FormulaAppraiseResultDto['results']>([]);
const composeNums = ref<Record<number, number>>({});

async function load() {
  try {
    data.value = await endpoints.formulas();
    if (!toolId.value)
      toolId.value = data.value.tools.find((x) => x.num > 0)?.goodsId ?? data.value.tools[0]?.goodsId ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, '读取配方失败'), 'danger');
  }
}
onMounted(load);

const tool = computed(() => data.value?.tools.find((x) => x.goodsId === toolId.value));
const maxTimes = computed(() => Math.min(tool.value?.num ?? 0, data.value?.scrolls ?? 0, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, maxTimes.value)));
const appraiseBlock = computed(() => {
  if (!data.value) return '';
  if (data.value.scrolls < 1) return '没有玄奥配方：每次鉴定要 1 个玄奥配方和 1 个鉴定道具（厨神玉玺）';
  if ((tool.value?.num ?? 0) < 1) return '没有这个鉴定道具';
  return '';
});
const nameOf = (id: number) => data.value?.formulas.find((f) => f.id === id)?.name ?? `配方${id}`;
const owned = computed(() => (data.value?.formulas ?? []).filter((f) => f.learned || f.mainNum + f.subNum > 0));
const learned = computed(() => (data.value?.formulas ?? []).filter((f) => f.learned));

function learnBlock(f: FormulaDto): string {
  if (f.learned) return '已学会';
  if (f.mainNum < 1) return '缺主碎片';
  if (f.subNum < 1) return '缺辅碎片';
  return '';
}
function composeBlock(f: FormulaDto): string {
  if (f.maxCompose >= 1) return '';
  if (f.have.main < 1) return `菜篮里没有${catalog.foodName(f.mainFoodsId)}（主料）`;
  if (f.have.sub < 1) return `橱柜里没有${catalog.foodName(f.subFoodsId)}（辅料）`;
  if (f.have.add < 1) return `橱柜里没有${catalog.foodName(f.addFoodsId)}（添加料）`;
  return `体力不够（每份 ${data.value?.composeStrength ?? 3}）`;
}
const composeN = (f: FormulaDto) => Math.max(1, Math.min(composeNums.value[f.id] || 1, f.maxCompose));

async function run(fn: () => Promise<unknown>, ok: string | null, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (ok) toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}
const appraise = () =>
  run(
    async () => {
      const r = await endpoints.formulaAppraise(toolId.value, n.value);
      results.value = r.results;
      toast.push(`鉴定 ${r.results.length} 次，成功 ${r.results.filter((x) => x.ok).length} 次`);
    },
    null,
    '鉴定失败',
  );
</script>

<template>
  <div v-if="data" class="small">
    <h6>鉴定配方</h6>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="toolId" class="form-select form-select-sm" data-testid="appraise-tool">
        <option v-for="x in data.tools" :key="x.goodsId" :value="x.goodsId">
          {{ catalog.goodsName(x.goodsId) }}（{{ x.num }}，成功率 {{ Math.round(x.rate * 100) }}%）
        </option>
      </select>
      <input
        v-model.number="times"
        type="number"
        min="1"
        :max="Math.max(1, maxTimes)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="appraise-times"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy || !!appraiseBlock"
        data-testid="appraise-go"
        @click="appraise"
      >
        鉴定 ×{{ n }}
      </button>
    </div>
    <div class="text-muted mb-1">玄奥配方 {{ data.scrolls }}；成功时 25% 得主碎片，其余得辅碎片</div>
    <div v-if="appraiseBlock" class="text-danger mb-1" data-testid="appraise-block">{{ appraiseBlock }}</div>
    <ul v-if="results.length > 0" class="mb-2" data-testid="appraise-results">
      <li v-for="(r, i) in results" :key="i">
        <template v-if="r.ok">
          {{ nameOf(r.formulaId ?? 0) }} {{ r.part === 'main' ? '主' : '辅' }}碎片{{ r.upgraded ? '（星月密卷）' : '' }}
        </template>
        <template v-else>失败</template>
      </li>
    </ul>

    <h6>我的配方</h6>
    <div v-if="owned.length === 0" class="text-muted mb-2">还没有配方碎片，先鉴定</div>
    <div
      v-for="f in owned"
      :key="f.id"
      class="border rounded p-1 mb-1 d-flex flex-wrap gap-1 align-items-center"
      :data-testid="`formula-${f.id}`"
    >
      <span class="me-auto">
        {{ f.name }}
        <span v-if="f.learned" class="badge text-bg-success">已学会</span>
        <span class="text-muted">主碎片 {{ f.mainNum }} / 辅碎片 {{ f.subNum }}</span>
      </span>
      <button
        v-if="!f.learned"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!learnBlock(f)"
        :title="learnBlock(f)"
        :data-testid="`learn-${f.id}`"
        @click="run(() => endpoints.formulaLearn(f.id), `学会了${f.name}`, '学习失败')"
      >
        学习{{ learnBlock(f) ? `（${learnBlock(f)}）` : '' }}
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || f.mainNum < 1"
        :data-testid="`decompose-main-${f.id}`"
        @click="run(() => endpoints.formulaDecompose(f.id, 'main', 1), '分解了 1 个主碎片', '分解失败')"
      >
        分解主碎片
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || f.subNum < 1"
        :data-testid="`decompose-sub-${f.id}`"
        @click="run(() => endpoints.formulaDecompose(f.id, 'sub', 1), '分解了 1 个辅碎片', '分解失败')"
      >
        分解辅碎片
      </button>
    </div>

    <h6 class="mt-2">合成</h6>
    <div v-if="learned.length === 0" class="text-muted">学会配方后可以合成食材</div>
    <div v-for="f in learned" :key="f.id" class="border rounded p-1 mb-1">
      <div>
        {{ f.name }}：{{ catalog.foodName(f.mainFoodsId) }}（菜篮 {{ f.have.main }}）+
        {{ catalog.foodName(f.subFoodsId) }}（橱柜 {{ f.have.sub }}）+ {{ catalog.foodName(f.addFoodsId) }}（橱柜
        {{ f.have.add }}）→ {{ catalog.foodName(f.resFoodsId) }}
      </div>
      <div class="d-flex gap-1 align-items-center mt-1">
        <input
          v-model.number="composeNums[f.id]"
          type="number"
          min="1"
          :max="Math.max(1, f.maxCompose)"
          class="form-control form-control-sm"
          style="width: 70px"
          :data-testid="`compose-num-${f.id}`"
        />
        <button
          class="btn btn-sm btn-primary text-nowrap"
          :disabled="busy || !!composeBlock(f)"
          :data-testid="`compose-${f.id}`"
          @click="run(() => endpoints.formulaCompose(f.id, composeN(f)), '合成成功', '合成失败')"
        >
          合成 ×{{ composeN(f) }}（体力 {{ composeN(f) * data.composeStrength }}）
        </button>
      </div>
      <div v-if="composeBlock(f)" class="text-danger" :data-testid="`compose-block-${f.id}`">
        {{ composeBlock(f) }}
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 7: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/yard src/i18n src/utils/events.test.ts`
Expected: PASS

- [ ] **Step 8: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/web/src
git commit -m "feat(web): yard endpoints and messages; basket, seed and formula panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: 前端——菜园页、作物卡片、好友菜园、入口

**Files:**
- Create: `apps/web/src/components/yard/plant.ts`、`plant.test.ts`、`PlantCard.vue`、`LandPanel.vue`、`LandPanel.test.ts`、`FriendYard.vue`、`FriendYard.test.ts`
- Create: `apps/web/src/views/YardView.vue`、`apps/web/src/views/YardView.test.ts`
- Modify: `apps/web/src/router.ts`、`apps/web/src/views/MoreView.vue`、`MoreView.test.ts`、`FriendRestView.vue`、`FriendRestView.test.ts`

**Interfaces:**
- Consumes: Task 10 的 `endpoints.yard*`、`testData.ts`、`BasketPanel`、`SeedPanel`、`FormulaPanel`
- Produces:
  - `plant.ts`：`type PlantAction`、`stageName(stage)`、`statusText(p)`、`waterBlock(p, strength)`、`wormBlock(p, strength)`、`grassBlock(p, strength)`、`reapBlock(p, strength)`、`feedBlock(p, strength, minutes, have)`、`STEAL_TEXT`（返回 `''` = 可以点）
  - `PlantCard`：props `{ plant: PlantDto; strength: number; busy: boolean; friend?: boolean; stealBlock?: StealBlock; fert?: { minutes: number; num: number } | null }`，emit `act(action: PlantAction, plantId: number)`（`PlantAction` 从 `plant.ts` 导出）
  - `LandPanel`（我的菜园）、`FriendYard`（props `restId`）
  - 路由 `/yard`（`?friend=<restId>` 时只显示好友菜园）；"更多"页"菜园"入口；好友页"去它的菜园"链接（`data-testid="to-yard"`）
  - 菜园页 testid：`tab-land`、`tab-basket`、`tab-formula`、`tab-seed`；地块 `land-<no>`；开垦 `expand` / `expand-block`；播种 `sow-seed-<no>`、`sow-<no>`；作物卡片内 `plant-status`、`plant-water`、`plant-deworm`、`plant-weed`、`plant-feed`、`plant-remove`、`plant-reap`、`plant-block`；好友地块 `fland-<no>`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/yard/plant.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { feedBlock, reapBlock, stageName, statusText, waterBlock, wormBlock } from './plant';
import { plantData } from './testData';

describe('作物按钮的状态和灰掉原因', () => {
  it('阶段名和状态文字', () => {
    expect(stageName(2)).toBe('育苗期');
    expect(statusText(plantData())).toBe('还要 12 分钟才能浇水');
    expect(statusText(plantData({ canWater: true, minutes: 0 }))).toBe('可以浇水了');
    expect(statusText(plantData({ stage: 4, minutes: 600 }))).toBe('可以收获，600 分钟后枯萎');
    expect(statusText(plantData({ stage: 5 }))).toBe('已枯萎，只能铲除');
  });

  it('浇水：干涸时总能浇（解除干涸）；有虫先除虫、有草先除草；没到时间写还要几分钟', () => {
    expect(waterBlock(plantData({ dry: 2, worm: 1 }), 5)).toBe('');
    expect(waterBlock(plantData({ worm: 1, canWater: true }), 5)).toBe('有虫，先除虫');
    expect(waterBlock(plantData({ grass: 1, canWater: true }), 5)).toBe('有草，先除草');
    expect(waterBlock(plantData(), 5)).toBe('还要 12 分钟才能浇水');
    expect(waterBlock(plantData({ canWater: true }), 0)).toBe('体力不够');
    expect(waterBlock(plantData({ stage: 5 }), 5)).toBe('已枯萎，只能铲除');
    expect(wormBlock(plantData(), 5)).toBe('没有虫');
  });

  it('收获和施肥', () => {
    expect(reapBlock(plantData(), 5)).toBe('还没成熟');
    expect(reapBlock(plantData({ stage: 4, grass: 1 }), 5)).toBe('有草，先除草');
    expect(reapBlock(plantData({ stage: 4 }), 5)).toBe('');
    expect(feedBlock(plantData(), 5, 20, 1)).toBe('');
    expect(feedBlock(plantData(), 5, 60, 1)).toBe('这个阶段剩下的时间不够，肥料用不上');
    expect(feedBlock(plantData(), 5, 20, 0)).toBe('没有这种肥料');
    expect(feedBlock(plantData({ stage: 4 }), 5, 20, 1)).toBe('只有生长期能施肥');
  });
});
```

`apps/web/src/components/yard/LandPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import LandPanel from './LandPanel.vue';
import { landData, plantData, yardData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    yard: vi.fn(),
    yardExpand: vi.fn(),
    yardPlant: vi.fn(),
    yardWater: vi.fn(),
    yardFeed: vi.fn(),
    yardWeed: vi.fn(),
    yardDeworm: vi.fn(),
    yardRemove: vi.fn(),
    yardReap: vi.fn(),
  },
}));

async function mountWith(data = yardData()) {
  vi.mocked(endpoints.yard).mockResolvedValue(data);
  const w = mount(LandPanel);
  await flushPromises();
  return w;
}

describe('LandPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    for (const f of [
      endpoints.yardExpand,
      endpoints.yardPlant,
      endpoints.yardWater,
      endpoints.yardFeed,
      endpoints.yardWeed,
      endpoints.yardDeworm,
      endpoints.yardRemove,
      endpoints.yardReap,
    ]) {
      vi.mocked(f).mockResolvedValue({} as never);
    }
  });

  it('9 格：已开垦的地可以播种；下一块显示开垦价；其他未开垦', async () => {
    const w = await mountWith();
    expect(w.find('[data-testid="land-1"]').text()).toContain('1 号地');
    expect(w.find('[data-testid="expand"]').text()).toContain('200000');
    expect(w.find('[data-testid="land-3"]').text()).toContain('未开垦');
    await w.find('[data-testid="sow-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardPlant).toHaveBeenCalledWith(1, 1);
    await w.find('[data-testid="expand"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardExpand).toHaveBeenCalled();
  });

  it('银币不够时开垦灰掉并写明原因；没有种子时播种灰掉', async () => {
    const w = await mountWith(yardData({ coin: 100, seeds: [] }));
    expect(w.find('[data-testid="expand"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="expand-block"]').text()).toContain('银币不够');
    expect(w.find('[data-testid="sow-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="land-1"]').text()).toContain('没有种子');
  });

  it('有虫时浇水灰掉并写明"先除虫"；点除虫调接口', async () => {
    const w = await mountWith(yardData({ lands: [landData(1, plantData({ worm: 1, canWater: true, minutes: 0 }))] }));
    const land = w.find('[data-testid="land-1"]');
    expect(land.find('[data-testid="plant-water"]').attributes('disabled')).toBeDefined();
    expect(land.find('[data-testid="plant-block"]').text()).toBe('有虫，先除虫');
    await land.find('[data-testid="plant-deworm"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardDeworm).toHaveBeenCalledWith(7);
  });

  it('收获期点收获；生长期施肥用选中的肥料；铲除要确认', async () => {
    const w = await mountWith(
      yardData({
        lands: [landData(1, plantData({ stage: 4, minutes: 600 })), landData(2, plantData({ id: 8 }))],
      }),
    );
    await w.find('[data-testid="land-1"] [data-testid="plant-reap"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardReap).toHaveBeenCalledWith(7);
    await w.find('[data-testid="land-2"] [data-testid="plant-feed"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardFeed).toHaveBeenCalledWith(8, 427);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await w.find('[data-testid="land-2"] [data-testid="plant-remove"]').trigger('click');
    expect(endpoints.yardRemove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="land-2"] [data-testid="plant-remove"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardRemove).toHaveBeenCalledWith(8);
    confirm.mockRestore();
  });
});
```

`apps/web/src/components/yard/FriendYard.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import FriendYard from './FriendYard.vue';
import { friendYardData, plantData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { yardFriend: vi.fn(), yardWater: vi.fn(), yardWeed: vi.fn(), yardDeworm: vi.fn(), yardReap: vi.fn() },
}));

async function mountWith(data = friendYardData()) {
  vi.mocked(endpoints.yardFriend).mockResolvedValue(data);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(FriendYard, { props: { restId: 2 }, global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendYard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.yardReap).mockResolvedValue({ foodsId: 101, num: 2, stolen: true, punished: null });
    vi.mocked(endpoints.yardDeworm).mockResolvedValue({ plantId: 7 });
  });

  it('显示好友的菜园；可以偷时点偷菜，提示偷到多少', async () => {
    const w = await mountWith();
    expect(endpoints.yardFriend).toHaveBeenCalledWith(2);
    expect(w.text()).toContain('乙店的菜园');
    const btn = w.find('[data-testid="fland-1"] [data-testid="plant-reap"]');
    expect(btn.text()).toBe('偷菜');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.yardReap).toHaveBeenCalledWith(7);
    expect(useToastStore().items.at(-1)!.text).toContain('偷到');
  });

  it('偷过的显示"已偷"并灰掉；好友作物没有施肥和铲除', async () => {
    const w = await mountWith(
      friendYardData({
        lands: [
          { no: 1, level: 1, plant: { ...plantData({ stage: 4, minutes: 600 }), stolen: true, stealBlock: 'stolen' } },
        ],
      }),
    );
    const btn = w.find('[data-testid="fland-1"] [data-testid="plant-reap"]');
    expect(btn.text()).toBe('已偷');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="plant-feed"]').exists()).toBe(false);
    expect(w.find('[data-testid="plant-remove"]').exists()).toBe(false);
  });

  it('有虫时可以帮忙除虫；没开垦时提示', async () => {
    const w = await mountWith(
      friendYardData({
        lands: [{ no: 1, level: 1, plant: { ...plantData({ worm: 1 }), stolen: false, stealBlock: 'not_ripe' } }],
      }),
    );
    await w.find('[data-testid="fland-1"] [data-testid="plant-deworm"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardDeworm).toHaveBeenCalledWith(7);
    const empty = await mountWith(friendYardData({ lands: [] }));
    expect(empty.find('[data-testid="friend-empty"]').exists()).toBe(true);
  });
});
```

`apps/web/src/views/YardView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import YardView from './YardView.vue';

const stubs = {
  LandPanel: { template: '<p>land-panel</p>' },
  BasketPanel: { template: '<p>basket-panel</p>' },
  FormulaPanel: { template: '<p>formula-panel</p>' },
  SeedPanel: { template: '<p>seed-panel</p>' },
  FriendYard: { template: '<p>friend-yard {{ restId }}</p>', props: ['restId'] },
};

async function mountAt(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/yard', component: YardView }] });
  await router.push(path);
  const w = mount(YardView, { global: { plugins: [router], stubs } });
  await flushPromises();
  return w;
}

describe('YardView（标签页）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('默认是菜园；切到菜篮；记住上次的标签', async () => {
    const w = await mountAt('/yard');
    expect(w.text()).toContain('land-panel');
    await w.find('[data-testid="tab-basket"]').trigger('click');
    expect(w.text()).toContain('basket-panel');
    const w2 = await mountAt('/yard');
    expect(w2.text()).toContain('basket-panel');
  });

  it('?friend=2 时只显示好友菜园', async () => {
    const w = await mountAt('/yard?friend=2');
    expect(w.text()).toContain('friend-yard 2');
    expect(w.find('[data-testid="tab-land"]').exists()).toBe(false);
  });
});
```

`apps/web/src/views/MoreView.test.ts`：`'有特色菜、神殿、教室入口'` 用例里的列表改为 `['特色菜', '神殿', '教室', '菜园']`。

`apps/web/src/views/FriendRestView.test.ts` 的 `describe('FriendRestView'` 末尾加：

```ts
  it('好友页有"去它的菜园"链接', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="to-yard"]').attributes('href')).toBe('/yard?friend=2');
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/yard src/views/YardView.test.ts src/views/MoreView.test.ts src/views/FriendRestView.test.ts`
Expected: FAIL（`./plant`、`LandPanel.vue`、`FriendYard.vue`、`YardView.vue` 不存在；没有菜园入口）

- [ ] **Step 3: 作物规则和卡片**

`apps/web/src/components/yard/plant.ts`：

```ts
import type { PlantDto, StealBlock } from '@dt/shared';

export type PlantAction = 'water' | 'weed' | 'deworm' | 'reap' | 'feed' | 'remove';

const STAGES = ['', '幼年期', '育苗期', '成长期', '收获期', '枯叶期'];
export const stageName = (stage: number): string => STAGES[stage] ?? '';

/** 作物状态一句话 */
export function statusText(p: PlantDto): string {
  if (p.stage === 5) return '已枯萎，只能铲除';
  if (p.stage === 4) return `可以收获，${p.minutes} 分钟后枯萎`;
  if (p.canWater) return '可以浇水了';
  return `还要 ${p.minutes} 分钟才能浇水`;
}

/** 以下函数返回按钮灰掉的原因；'' = 可以点（和服务端的检查顺序一致） */
export function waterBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎，只能铲除';
  if (strength < 1) return '体力不够';
  if (p.dry > 0) return '';
  if (p.stage === 4) return '已经成熟，不用浇水';
  if (p.worm > 0) return '有虫，先除虫';
  if (p.grass > 0) return '有草，先除草';
  if (!p.canWater) return `还要 ${p.minutes} 分钟才能浇水`;
  return '';
}

export function wormBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎';
  if (strength < 1) return '体力不够';
  return p.worm > 0 ? '' : '没有虫';
}

export function grassBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎';
  if (strength < 1) return '体力不够';
  return p.grass > 0 ? '' : '没有草';
}

export function reapBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎，只能铲除';
  if (p.stage !== 4) return '还没成熟';
  if (p.worm > 0) return '有虫，先除虫';
  if (p.grass > 0) return '有草，先除草';
  if (strength < 1) return '体力不够';
  return '';
}

export function feedBlock(p: PlantDto, strength: number, minutes: number, have: number): string {
  if (p.stage === 5) return '已枯萎';
  if (p.stage > 3) return '只有生长期能施肥';
  if (have < 1) return '没有这种肥料';
  if (strength < 1) return '体力不够';
  if (p.stageMinutes - p.feedMin - minutes <= 0) return '这个阶段剩下的时间不够，肥料用不上';
  return '';
}

export const STEAL_TEXT: Record<Exclude<StealBlock, null>, string> = {
  stolen: '这株已经偷过了',
  withered: '已枯萎',
  not_ripe: '还没成熟',
  has_worm: '有虫，偷不了',
  has_grass: '有草，偷不了',
  steal_left: '剩得不多了，给主人留点吧',
  renown: '声望不够（偷菜要 1 点声望）',
};
```

`apps/web/src/components/yard/PlantCard.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { PlantDto, StealBlock } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import {
  STEAL_TEXT,
  feedBlock,
  grassBlock,
  reapBlock,
  stageName,
  statusText,
  waterBlock,
  wormBlock,
  type PlantAction,
} from './plant';

const props = defineProps<{
  plant: PlantDto;
  strength: number;
  busy: boolean;
  /** 好友的作物：没有施肥、铲除；收获按钮是偷菜 */
  friend?: boolean;
  stealBlock?: StealBlock;
  fert?: { minutes: number; num: number } | null;
}>();
const emit = defineEmits<{ act: [action: PlantAction, plantId: number] }>();
const catalog = useCatalogStore();

const ripe = computed(() => props.plant.stage === 4);
const water = computed(() => waterBlock(props.plant, props.strength));
const reap = computed(() => {
  if (!props.friend) return reapBlock(props.plant, props.strength);
  if (props.stealBlock) return STEAL_TEXT[props.stealBlock];
  return props.strength < 1 ? '体力不够' : '';
});
const feed = computed(() => feedBlock(props.plant, props.strength, props.fert?.minutes ?? 0, props.fert?.num ?? 0));
/** 主要动作（收获期是收获 / 偷菜，其他是浇水）灰掉的原因 */
const main = computed(() => (ripe.value ? reap.value : water.value));
const fire = (a: PlantAction) => emit('act', a, props.plant.id);
</script>

<template>
  <div class="fw-bold">{{ catalog.foodName(plant.foodsId) }} · {{ stageName(plant.stage) }}</div>
  <div>
    产量 {{ plant.harvestNum }}/{{ plant.harvestMax }}
    <span v-if="plant.worm > 0">🐛{{ plant.worm }}</span>
    <span v-if="plant.grass > 0">🌿{{ plant.grass }}</span>
    <span v-if="plant.dry > 0" class="text-danger">干涸 {{ plant.dry }}</span>
  </div>
  <div class="text-muted" data-testid="plant-status">{{ statusText(plant) }}</div>
  <div class="d-flex flex-wrap gap-1 mt-1">
    <button
      v-if="ripe"
      class="btn btn-sm btn-success"
      :disabled="busy || !!reap"
      data-testid="plant-reap"
      @click="fire('reap')"
    >
      {{ friend ? (stealBlock === 'stolen' ? '已偷' : '偷菜') : '收获' }}
    </button>
    <button
      v-if="!ripe || plant.dry > 0"
      class="btn btn-sm btn-primary"
      :disabled="busy || !!water"
      data-testid="plant-water"
      @click="fire('water')"
    >
      {{ plant.dry > 0 ? '解除干涸' : '浇水' }}
    </button>
    <button
      v-if="plant.worm > 0"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!wormBlock(plant, strength)"
      data-testid="plant-deworm"
      @click="fire('deworm')"
    >
      除虫
    </button>
    <button
      v-if="plant.grass > 0"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!grassBlock(plant, strength)"
      data-testid="plant-weed"
      @click="fire('weed')"
    >
      除草
    </button>
    <template v-if="!friend">
      <button
        v-if="plant.stage <= 3"
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || !!feed"
        :title="feed"
        data-testid="plant-feed"
        @click="fire('feed')"
      >
        施肥
      </button>
      <button class="btn btn-sm btn-outline-danger" :disabled="busy" data-testid="plant-remove" @click="fire('remove')">
        铲除
      </button>
    </template>
  </div>
  <div v-if="main" class="text-danger" data-testid="plant-block">{{ main }}</div>
</template>
```

- [ ] **Step 4: 我的菜园和好友菜园**

`apps/web/src/components/yard/LandPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { YardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import PlantCard from './PlantCard.vue';
import type { PlantAction } from './plant';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<YardDto | null>(null);
const busy = ref(false);
const picks = ref<Record<number, number>>({});
const fertId = ref<number>(0);

async function load() {
  try {
    data.value = await endpoints.yard();
    if (!fertId.value)
      fertId.value =
        data.value.fertilizers.find((f) => f.num > 0)?.goodsId ?? data.value.fertilizers[0]?.goodsId ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, '读取菜园失败'), 'danger');
  }
}
onMounted(load);

const cells = computed(() => {
  const d = data.value;
  if (!d) return [];
  return Array.from({ length: d.maxLands }, (_, i) => ({
    no: i + 1,
    land: d.lands.find((l) => l.no === i + 1) ?? null,
  }));
});
const nextNo = computed(() => (data.value?.lands.length ?? 0) + 1);
const expandBlock = computed(() => {
  const d = data.value;
  if (!d || d.nextLandCoin === null) return '';
  return d.coin < d.nextLandCoin ? `银币不够（要 ${d.nextLandCoin}，现有 ${d.coin}）` : '';
});
const fert = computed(() => data.value?.fertilizers.find((f) => f.goodsId === fertId.value) ?? null);
const sowBlock = computed(() => {
  if (!data.value) return '';
  if (data.value.seeds.length === 0) return '没有种子，去"种子"标签买或兑换';
  if (data.value.strength < 1) return '体力不够';
  return '';
});
const seedOf = (no: number) => picks.value[no] ?? data.value?.seeds[0]?.seedId ?? 0;

async function run(fn: () => Promise<unknown>, ok: string, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}

function onAct(a: PlantAction, plantId: number) {
  if (a === 'water') void run(() => endpoints.yardWater(plantId), '浇水成功', '浇水失败');
  else if (a === 'deworm') void run(() => endpoints.yardDeworm(plantId), '除了一只虫', '除虫失败');
  else if (a === 'weed') void run(() => endpoints.yardWeed(plantId), '除掉了杂草', '除草失败');
  else if (a === 'feed') void run(() => endpoints.yardFeed(plantId, fertId.value), '施肥成功', '施肥失败');
  else if (a === 'reap') void run(() => endpoints.yardReap(plantId), '收获了，放进了菜篮', '收获失败');
  else if (window.confirm('铲除这株作物？有 30% 概率返还 1 颗种子'))
    void run(() => endpoints.yardRemove(plantId), '铲除了', '铲除失败');
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
      <span>体力 {{ data.strength }}</span>
      <span>银币 {{ data.coin }}</span>
      <span class="ms-auto">肥料</span>
      <select v-model.number="fertId" class="form-select form-select-sm w-auto" data-testid="fert">
        <option v-for="f in data.fertilizers" :key="f.goodsId" :value="f.goodsId">
          {{ catalog.goodsName(f.goodsId) }}（{{ f.num }}，每次 −{{ f.minutes }} 分钟）
        </option>
      </select>
    </div>
    <div class="row g-1">
      <div v-for="c in cells" :key="c.no" class="col-4">
        <div class="border rounded p-1 h-100" :data-testid="`land-${c.no}`">
          <template v-if="c.land">
            <div class="text-muted">
              {{ c.no }} 号地 · {{ c.land.level }} 级<template v-if="c.land.bonus > 0"
                >（产量 +{{ c.land.bonus }}%）</template
              >
            </div>
            <div v-if="c.land.expNext !== null" class="text-muted">
              经验 {{ c.land.exp }}/{{ c.land.expNext }}
            </div>
            <PlantCard
              v-if="c.land.plant"
              :plant="c.land.plant"
              :strength="data.strength"
              :busy="busy"
              :fert="fert"
              @act="onAct"
            />
            <template v-else>
              <select v-model.number="picks[c.no]" class="form-select form-select-sm my-1" :data-testid="`sow-seed-${c.no}`">
                <option v-for="s in data.seeds" :key="s.seedId" :value="s.seedId">
                  {{ catalog.seedName(s.seedId) }} × {{ s.num }}
                </option>
              </select>
              <button
                class="btn btn-sm btn-primary"
                :disabled="busy || !!sowBlock"
                :data-testid="`sow-${c.no}`"
                @click="run(() => endpoints.yardPlant(c.no, seedOf(c.no)), '播种成功', '播种失败')"
              >
                播种
              </button>
              <div v-if="sowBlock" class="text-danger">{{ sowBlock }}</div>
            </template>
          </template>
          <template v-else-if="c.no === nextNo">
            <button
              class="btn btn-sm btn-outline-primary"
              :disabled="busy || !!expandBlock"
              data-testid="expand"
              @click="run(() => endpoints.yardExpand(), '开垦了一块地', '开垦失败')"
            >
              开垦（{{ data.nextLandCoin }} 银币）
            </button>
            <div v-if="expandBlock" class="text-danger" data-testid="expand-block">{{ expandBlock }}</div>
          </template>
          <div v-else class="text-muted">未开垦</div>
        </div>
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/components/yard/FriendYard.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendYardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import PlantCard from './PlantCard.vue';
import type { PlantAction } from './plant';

const props = defineProps<{ restId: number }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<FriendYardDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.yardFriend(props.restId);
  } catch (e) {
    toast.push(errorMessage(e, '读取好友菜园失败'), 'danger');
  }
}
onMounted(load);

async function run(fn: () => Promise<string>, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    toast.push(await fn());
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}

function onAct(a: PlantAction, plantId: number) {
  if (a === 'water')
    void run(async () => {
      await endpoints.yardWater(plantId);
      return '帮它浇了水';
    }, '浇水失败');
  else if (a === 'deworm')
    void run(async () => {
      await endpoints.yardDeworm(plantId);
      return '帮它除了一只虫';
    }, '除虫失败');
  else if (a === 'weed')
    void run(async () => {
      await endpoints.yardWeed(plantId);
      return '帮它除了草';
    }, '除草失败');
  else if (a === 'reap')
    void run(async () => {
      const r = await endpoints.yardReap(plantId);
      const caught = r.punished ? `，被边牧逮住，留下了 ${catalog.foodName(r.punished)}` : '';
      return `偷到 ${catalog.foodName(r.foodsId)}×${r.num}，放进了菜篮${caught}`;
    }, '偷菜失败');
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="d-flex align-items-center mb-1">
      <h5 class="mb-0 me-auto">{{ data.name }}的菜园</h5>
      <RouterLink :to="`/friends/${restId}`">回到它的餐厅</RouterLink>
    </div>
    <div class="text-muted mb-1">我的体力 {{ data.strength }}，声望 {{ data.renown }}（每次偷菜扣 1 点声望）</div>
    <div v-if="data.lands.length === 0" class="text-muted" data-testid="friend-empty">它还没有开垦菜园</div>
    <div class="row g-1">
      <div v-for="l in data.lands" :key="l.no" class="col-4">
        <div class="border rounded p-1 h-100" :data-testid="`fland-${l.no}`">
          <div class="text-muted">{{ l.no }} 号地 · {{ l.level }} 级</div>
          <PlantCard
            v-if="l.plant"
            :plant="l.plant"
            :strength="data.strength"
            :busy="busy"
            friend
            :steal-block="l.plant.stealBlock"
            @act="onAct"
          />
          <div v-else class="text-muted">空地</div>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 菜园页、路由、入口**

`apps/web/src/views/YardView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BasketPanel from '../components/yard/BasketPanel.vue';
import FormulaPanel from '../components/yard/FormulaPanel.vue';
import FriendYard from '../components/yard/FriendYard.vue';
import LandPanel from '../components/yard/LandPanel.vue';
import SeedPanel from '../components/yard/SeedPanel.vue';

type Tab = 'land' | 'basket' | 'formula' | 'seed';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'land', label: '菜园' },
  { key: 'basket', label: '菜篮' },
  { key: 'formula', label: '配方' },
  { key: 'seed', label: '种子' },
];
const KEY = 'dt_yard_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((x) => x.key === v) ? (v as Tab) : 'land';
  } catch {
    return 'land';
  }
}
const route = useRoute();
const tab = ref<Tab>(savedTab());
/** ?friend=<restId> 时只显示好友菜园 */
const friendId = computed(() => {
  const v = Number(route.query.friend);
  return Number.isInteger(v) && v > 0 ? v : null;
});
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
});
</script>

<template>
  <FriendYard v-if="friendId !== null" :key="friendId" :rest-id="friendId" />
  <template v-else>
    <h5>菜园</h5>
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
    <LandPanel v-if="tab === 'land'" />
    <BasketPanel v-else-if="tab === 'basket'" />
    <FormulaPanel v-else-if="tab === 'formula'" />
    <SeedPanel v-else />
  </template>
</template>
```

`apps/web/src/router.ts`：`/temple` 路由下面加：

```ts
  {
    path: '/yard',
    name: 'yard',
    component: () => import('./views/YardView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/views/MoreView.vue` 的 `base` 里 `{ to: '/temple', ... },` 下面加 `{ to: '/yard', icon: 'bi-flower1', label: '菜园' },`。

`apps/web/src/views/FriendRestView.vue` 的 `act-bar` 里，`换食材` 的 `RouterLink` 之后加：

```vue
      <RouterLink
        v-if="!rest.npc"
        class="btn btn-sm btn-outline-primary"
        :to="`/yard?friend=${restId}`"
        data-testid="to-yard"
        >去它的菜园</RouterLink
      >
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/yard src/views/YardView.test.ts src/views/MoreView.test.ts src/views/FriendRestView.test.ts`
Expected: PASS

- [ ] **Step 7: 全量并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/web/src
git commit -m "feat(web): yard page with lands and crop cards, friend yard view, entries from more and friend pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/yard.spec.ts`
- Modify: `docs/rules/收益与加成.md`、`docs/deploy.md`

- [ ] **Step 1: 写端到端测试**

`apps/web/e2e/yard.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('菜园：开地 → 买种子 → 播种 → 浇水到收获期 → 收获 → 存进橱柜', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set coin = 1000000, strength = 100 where id = $1', [restId]);

    await page.goto('/yard');
    await page.getByTestId('tab-land').click();
    await page.getByTestId('expand').click();
    await expect(page.getByTestId('land-1')).toContainText('1 号地');

    await page.getByTestId('tab-seed').click();
    await page.getByTestId('shop-seed').selectOption('1');
    await page.getByTestId('shop-buy').click();
    await expect(page.getByTestId('seed-stock')).toContainText('× 1');

    await page.getByTestId('tab-land').click();
    await page.getByTestId('sow-1').click();
    await expect(page.getByTestId('land-1')).toContainText('幼年期');

    for (const next of ['育苗期', '成长期', '收获期']) {
      // 把本阶段的开始时间往前拨一天，并清掉自然事件可能带来的虫、草、干涸
      await client.query(
        "update yard_plant set stage_at = now() - interval '1 day', worm = 0, grass = 0, dry = 0 where rest_id = $1",
        [restId],
      );
      await page.reload();
      await page.getByTestId('land-1').getByTestId('plant-water').click();
      await expect(page.getByTestId('land-1')).toContainText(next);
    }

    await page.getByTestId('land-1').getByTestId('plant-reap').click();
    await expect(page.getByTestId('sow-1')).toBeVisible();

    await page.getByTestId('tab-basket').click();
    await page.getByTestId('basket-store-101').click();
    await expect(page.getByTestId('basket-empty')).toBeVisible();
  } finally {
    await client.end();
  }
});
```

- [ ] **Step 2: 跑端到端**

先执行迁移（`pnpm --filter @dt/server migrate:dev`），再按进程树清理旧的 dev 进程后重启 `pnpm dev`（用户已允许随时重启开发服务器），确认 worker 日志有 "became leader"、API 日志有 "Server listening"。然后：

Run: `pnpm --filter @dt/web e2e`
Expected: 全部通过（原有 7 个 + 新增 1 个）

- [ ] **Step 3: 文档**

`docs/rules/收益与加成.md` 末尾加：

```markdown
## 8. 菜园（子项目 4B-2）

**土地**：最多 9 块，第 n 块开垦花 50,000 × 2ⁿ 银币。在自己地里操作加土地经验（播种 10、浇水 / 除草 / 除虫 / 施肥 5、收获 20、铲除 2）；升级要 (等级 − 1)² × 2000 + 1000，最高 10 级；每级产量 +8%。

**作物**：幼年期 → 育苗期 → 成长期 → 收获期 → 枯叶期。
- 本阶段时间到了（施肥可以抵扣）、没虫没草时浇水进入下一阶段；干涸时浇水只解除干涸，本阶段缩短 5 分钟（不低于原时长一半）。
- 收获期可以收获：剩余产量 + 加成的 reapAddNum 进菜篮；收获期过了就枯萎。
- 每次操作扣 1 体力，收益系数 = 餐厅等级 × 2 × (自己的地 2 : 1) + 1，银币 = 系数 × 动作银币，经验 = 系数 × 动作经验（收获 / 偷菜再加食材等级）。
- 铲除 30% 返还 1 颗种子。

**偷菜**：好友的作物在收获期、没虫没草、剩余 ≥ 种子原产量 × 70% 时能偷；每人每株一次，扣 1 声望，偷 1~2 个（7 级 1 个）。对方有边牧时 25% 从小偷橱柜里随机拿 1 个食材给对方。

**自然事件**（白天每小时 07、27、47 分，夜里 22 点到次日 6 点只在 27 分）：
- 有虫 20%、有草 3% × 草数 减产 1，减到 0 枯萎；不下雨时干涸 ≥ 100 枯萎。
- 长草 0.8%（不下雨 ×3）；干涸后每次 10% 加重（不下雨 +1，有草 +2；下雨清零）；不下雨时 0.2%（有草 1%）开始干涸；长虫 0.3%。
- 下雨时，生长期、没虫没草、到了浇水时间的作物自动进入下一阶段。

**配方**：用厨神玉玺 + 玄奥配方鉴定，成功率 = 25% + 幸运率 × 0.1（有星月密卷 +10%）；成功时 25% 得主碎片，否则辅碎片（有星月密卷且已有辅碎片时 20% 转成主碎片）。主辅碎片各 1 学会配方；碎片可以分解成配方精华（主 3、辅 1）换种子。合成每份扣 3 体力、菜篮主料、橱柜辅料和添加料各 1，每份 10% 多出 1 个，幸运率 / 5 再多 1 个，有星神之泪 25% 再多 1 个。

**种子**：种子商店按种子单价卖（不卖 7 级神秘种子），也可以用配方精华兑换。
```

`docs/deploy.md` 末尾加：

```markdown
## 菜园（子项目 4B-2）

- 迁移 0010 新建 `yard_land`、`yard_plant`、`yard_steal`、`yard_basket`、`rest_formula`
- 新功能开关 `features.yard`（默认开）。关闭后菜园、配方、种子接口返回"这个区服暂未开放该功能"，自然事件任务跳过该区服（作物停止变化），主线第 28、29 步跳过
- worker 新任务 `yard-events`：白天每小时 07、27、47 分，夜里（22 点到次日 6 点）只在 27 分，处理该区服所有未枯萎的作物
- 数值在 `tuning.yard`（土地、偷菜、种子商店开关和调价 `seedShop` / `seedPriceRate`、配方、自然事件概率）
- 配方、种子兑换、动作收益从配置包的 `extra` 挪到正式字段 `formulas`、`seedExchange`、`incomeActions`
- 主线第 28、29 步（开垦、收获）和配方支线不再跳过；支线"鉴定一次食材配方"链接改到菜园
```

- [ ] **Step 4: 验收**

Run: `npx prettier --check apps packages docs && pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿（`问题记录.md` 是用户的文件，不在检查范围、不格式化、不提交）

对照设计文档 §1 的完成标志：
- 土地、开垦、主线 28 步：land.test + LandPanel.test + E2E
- 播种到收获、菜篮存进橱柜、主线 29 步：crop.test + BasketPanel.test + E2E
- 好友照料、偷菜、边牧：friend.test + FriendYard.test
- 自然事件：rules.test + jobs.test
- 配方鉴定、学习、分解、合成、配方支线：formula.test + FormulaPanel.test
- 种子商店和兑换：seed.test + SeedPanel.test

- [ ] **Step 5: 提交**

```bash
git add apps/web/e2e/yard.spec.ts docs
git commit -m "test(e2e): expand, buy seeds, plant, water to harvest, reap and store; docs for the yard and deployment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
