# 限时活动 148-4 全服加成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增活动类型"全服加成"：活动期间把白名单里的区服数值乘倍数，所有系统通过区服设置自动生效。

**Architecture:** shared 定义白名单 `BOOSTS` 和 `boost` 定义校验；config 提供纯函数 `applyBoosts`；区服服务解析设置时套用当前生效的加成（30 秒缓存，后台改动通过现有的 `settings-bus` 通知所有进程）；新增 `settlement.coinMultiplier`、`market.priceFactor` 两个默认 1 的数值；前端加玩家卡片、后台编辑器和区服数值页提示。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Redis、Vue 3、Vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-activity-4-boost-design.md`

## Global Constraints

- 白名单 10 项（键、名称、路径、范围、cap、int）严格按规格书 §3 的表。
- 一个活动 1~10 项，同键不重复，倍数在 `[min, max]` 内、最多两位小数，至少一项不等于 1。
- 多个活动同时生效时连乘，再夹到 `[min, max]`；有 cap 取 `min(值, cap)`；int 取 `max(1, round(值))`。
- 新数值 `settlement.coinMultiplier`、`market.priceFactor` 默认 1。
- 后台"区服数值"页显示不含加成的数值，上方提示当前生效的全服加成。
- `boost` 活动没有奖励、不计数、不补发。
- 测试从仓库根目录跑；`packages/config/data/game/*.json` 不跑 prettier；不碰 `问题记录.md`。

## Review Focus

1. **一个区服的加成漏到别的区服**：区服 A 的加成活动不能让区服 B 的 `settings` 变化（缓存按区服分）。→ Task 4 测试。
2. **倍数正好在边界**：菜场价格 0.5 能保存，0.49 报 `out_of_range`；经验 5 能保存，5.01 报错。→ Task 1 测试。
3. **加成结束或提前结束后数值恢复**：提前结束后本进程立即恢复原值；窗口外（开始前、结束后）都是原值。→ Task 4 测试。
4. **worker 的定时任务也吃到加成**：体力恢复任务按加成后的 `strength.regen` 恢复。→ Task 4 测试。
5. **玩家页把全服加成当成战令渲染**：活动页对 `boost` 必须用加成卡片，不能落到其他布局的 `v-else`。→ Task 5 测试。

---

### Task 1: shared——白名单和 `boost` 定义校验

**Files:**
- Create: `packages/shared/src/boost.ts`
- Modify: `packages/shared/src/schemas/activity.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/activity.test.ts`（追加）

**Interfaces:**
- Produces: `BOOSTS`、`type BoostKey`、`interface BoostDef`、`interface BoostItem { key: string; factor: number }`、`boostText(items: BoostItem[]): string`；`boostDef`、`type BoostActivityDef = { items: BoostItem[] }`；`ACTIVITY_KINDS` 含 `'boost'`；`ActivitySpec` 含 `{ kind: 'boost'; def: BoostActivityDef }`。

- [ ] **Step 1: 写失败的测试**（追加到 `activity.test.ts` 末尾）

```ts
describe('全服加成定义（148-4 设计 §5）', () => {
  const boost = (items: Array<{ key: string; factor: number }>) => ({ ...base, kind: 'boost', def: { items } });
  it('合法的能过；边界值能过', () => {
    expect(paths(boost([{ key: 'exp', factor: 5 }]))).toEqual([]);
    expect(paths(boost([{ key: 'marketPrice', factor: 0.5 }]))).toEqual([]);
  });
  it('超出范围、未知键、重复键、多于两位小数、全部为 1 都报错并带路径', () => {
    expect(paths(boost([{ key: 'exp', factor: 5.01 }]))).toContain('def.items.0.factor:out_of_range');
    expect(paths(boost([{ key: 'marketPrice', factor: 0.49 }]))).toContain('def.items.0.factor:out_of_range');
    expect(paths(boost([{ key: 'nope', factor: 2 }]))).toContain('def.items.0.key:unknown_boost');
    expect(
      paths(
        boost([
          { key: 'exp', factor: 2 },
          { key: 'exp', factor: 3 },
        ]),
      ),
    ).toContain('def.items:duplicate_key');
    expect(paths(boost([{ key: 'exp', factor: 1.234 }]))).toContain('def.items.0.factor:two_decimals');
    expect(paths(boost([{ key: 'exp', factor: 1 }]))).toContain('def.items:no_effect');
  });
  it('boostText 用中文名和倍数', async () => {
    const { boostText } = await import('../boost');
    expect(
      boostText([
        { key: 'exp', factor: 2 },
        { key: 'marketPrice', factor: 0.8 },
      ]),
    ).toBe('经营经验 ×2、菜场价格 ×0.8');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/shared/src/schemas/activity.test.ts`
Expected: FAIL（新用例报错：kind 不接受 `boost`，`../boost` 不存在）

- [ ] **Step 3: 实现** `packages/shared/src/boost.ts`

```ts
/** 全服加成白名单（问题记录 148-4，设计 §3）：服务端和前端共用 */
export interface BoostDef {
  label: string;
  /** tuning 里的路径，倍数同时乘到这几项上 */
  paths: readonly string[];
  /** 单个活动可填的倍数范围，也是多个活动叠加后的夹取范围 */
  min: number;
  max: number;
  /** 结果的绝对上限（概率类为 1） */
  cap?: number;
  /** 结果四舍五入取整，至少 1 */
  int?: boolean;
}

export const BOOSTS = {
  exp: { label: '经营经验', paths: ['settlement.expMultiplier'], min: 1, max: 5 },
  coin: { label: '经营银币', paths: ['settlement.coinMultiplier'], min: 1, max: 3 },
  marketPrice: { label: '菜场价格', paths: ['market.priceFactor'], min: 0.5, max: 1 },
  strength: { label: '体力恢复', paths: ['strength.regen', 'strength.luckyRegen'], min: 1, max: 3 },
  dtTicket: { label: '德拓券掉率', paths: ['settlement.dtTicketBaseRate'], min: 1, max: 5 },
  equipStress: { label: '强化成功率', paths: ['equip.baseRate'], min: 1, max: 1.25, cap: 1 },
  gemLevel: { label: '宝石升级成功率', paths: ['equip.gemBaseRate'], min: 1, max: 1.05, cap: 1 },
  yardYield: { label: '菜园土地等级加产', paths: ['yard.yieldPerLevel'], min: 1, max: 3, int: true },
  guardianRare: { label: '守护兽稀有掉落', paths: ['temple.guardianRareRate'], min: 1, max: 2, cap: 1 },
  sellRate: { label: '商店卖出价', paths: ['shop.sellRate'], min: 1, max: 1.3, cap: 1 },
} as const satisfies Record<string, BoostDef>;
export type BoostKey = keyof typeof BOOSTS;

export interface BoostItem {
  key: string;
  factor: number;
}

export const boostDefOf = (key: string): BoostDef | undefined =>
  Object.hasOwn(BOOSTS, key) ? (BOOSTS as Record<string, BoostDef>)[key] : undefined;

/** "经营经验 ×2、菜场价格 ×0.8" */
export const boostText = (items: BoostItem[]): string =>
  items.map((i) => `${boostDefOf(i.key)?.label ?? i.key} ×${i.factor}`).join('、');
```

- [ ] **Step 4: 定义校验** `schemas/activity.ts`

`import { boostDefOf, type BoostItem } from '../boost';`，然后：

```ts
export const ACTIVITY_KINDS = ['goals', 'grid', 'pass', 'boost'] as const;

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
export const boostDef = z
  .object({
    items: z
      .array(
        z.object({
          key: z.string().refine((k) => boostDefOf(k) !== undefined, { message: 'unknown_boost' }),
          factor: z.number().positive(),
        }),
      )
      .min(1)
      .max(10)
      .superRefine((items, ctx) => {
        if (new Set(items.map((i) => i.key)).size !== items.length)
          ctx.addIssue({ code: 'custom', message: 'duplicate_key' });
        items.forEach((it, i) => {
          const d = boostDefOf(it.key);
          if (!twoDecimals(it.factor))
            ctx.addIssue({ code: 'custom', path: [i, 'factor'], message: 'two_decimals' });
          else if (d && (it.factor < d.min || it.factor > d.max))
            ctx.addIssue({ code: 'custom', path: [i, 'factor'], message: 'out_of_range' });
        });
        if (items.every((i) => i.factor === 1)) ctx.addIssue({ code: 'custom', message: 'no_effect' });
      }),
  });
export type BoostActivityDef = { items: BoostItem[] };
```

`ActivitySpec` 加一支 `| { kind: 'boost'; def: BoostActivityDef }`；`DEF_SCHEMAS` 加 `boost: boostDef`。
`index.ts` 加 `export * from './boost';`（放在 `./activity` 之前）。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run packages/shared/src/schemas/activity.test.ts && pnpm --filter @dt/shared typecheck`
Expected: PASS（原 5 个 + 新 3 个）

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): 全服加成白名单和定义校验"
```

---

### Task 2: config——新数值和 `applyBoosts`

**Files:**
- Modify: `packages/config/src/tuning.ts`（`settlement.coinMultiplier`、`market.priceFactor`）
- Modify: `packages/config/data/game/tuning.json`（两个值都填 1）
- Create: `packages/config/src/boost.ts`
- Create: `packages/config/src/boost.test.ts`
- Modify: `packages/config/src/index.ts`（导出 `applyBoosts`）

**Interfaces:**
- Consumes: Task 1 `BOOSTS`、`boostDefOf`、`BoostItem`
- Produces: `applyBoosts(s: ShardSettings, active: BoostItem[][]): ShardSettings`

- [ ] **Step 1: 写失败的测试** `boost.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { applyBoosts } from './boost';
import { buildBundle } from './build';
import { createGameConfig } from './runtime';
import { resolveShardSettings } from './shard';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);
const base = resolveShardSettings(config, {});

describe('applyBoosts（148-4 设计 §6.1）', () => {
  it('没有加成时原样返回', () => {
    expect(applyBoosts(base, [])).toBe(base);
  });
  it('单项相乘；体力恢复两条路径一起乘；不改传入对象', () => {
    const s = applyBoosts(base, [[{ key: 'exp', factor: 2 }, { key: 'strength', factor: 2 }]]);
    expect(s.tuning.settlement.expMultiplier).toBe(base.tuning.settlement.expMultiplier * 2);
    expect(s.tuning.strength.regen).toBe(base.tuning.strength.regen * 2);
    expect(s.tuning.strength.luckyRegen).toBe(base.tuning.strength.luckyRegen * 2);
    expect(base.tuning.settlement.expMultiplier).toBe(config.tuning.settlement.expMultiplier);
  });
  it('多个活动连乘后夹到范围内', () => {
    const s = applyBoosts(base, [[{ key: 'exp', factor: 3 }], [{ key: 'exp', factor: 3 }]]);
    expect(s.tuning.settlement.expMultiplier).toBe(base.tuning.settlement.expMultiplier * 5);
    const p = applyBoosts(base, [[{ key: 'marketPrice', factor: 0.5 }], [{ key: 'marketPrice', factor: 0.5 }]]);
    expect(p.tuning.market.priceFactor).toBe(0.5);
  });
  it('概率类不超过 1；整数项四舍五入', () => {
    const s = applyBoosts(base, [[{ key: 'equipStress', factor: 1.25 }, { key: 'sellRate', factor: 1.3 }]]);
    expect(s.tuning.equip.baseRate).toBeLessThanOrEqual(1);
    expect(s.tuning.shop.sellRate).toBeCloseTo(Math.min(1, base.tuning.shop.sellRate * 1.3));
    const y = applyBoosts(base, [[{ key: 'yardYield', factor: 1.5 }]]);
    expect(y.tuning.yard.yieldPerLevel).toBe(Math.round(base.tuning.yard.yieldPerLevel * 1.5));
  });
  it('新数值默认 1', () => {
    expect(base.tuning.settlement.coinMultiplier).toBe(1);
    expect(base.tuning.market.priceFactor).toBe(1);
  });
});
```


- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/config/src/boost.test.ts`
Expected: FAIL（`./boost` 不存在）

- [ ] **Step 3: 新数值**

`tuning.ts`：`expMultiplier` 后面加

```ts
    /** 全服银币倍率：每桌付费顾客的银币乘它（148-4 全服加成用，默认 1） */
    coinMultiplier: z.number().positive(),
```

`premiumPriceFactor: num,` 后面加

```ts
    /** 菜场价格倍率：三个货架的单价在天气系数之后再乘它（148-4 全服加成用，默认 1） */
    priceFactor: z.number().positive(),
```

`tuning.json`：`"expMultiplier": 5,` 后加 `"coinMultiplier": 1,`；`"premiumPriceFactor": 2,` 后加 `"priceFactor": 1,`（手工编辑，不跑 prettier）。然后 `pnpm --filter @dt/config build`。

- [ ] **Step 4: 实现** `packages/config/src/boost.ts`

```ts
import { boostDefOf, type BoostItem } from '@dt/shared';
import type { ShardSettings } from './shard';

/**
 * 把正在生效的全服加成套到区服设置上（148-4 设计 §6.1）：同一项连乘后夹到范围内，
 * 有 cap 取上限，int 取整；返回新对象，不改传入的设置
 */
export function applyBoosts(s: ShardSettings, active: BoostItem[][]): ShardSettings {
  const total = new Map<string, number>();
  for (const items of active) for (const it of items) total.set(it.key, (total.get(it.key) ?? 1) * it.factor);
  if (total.size === 0) return s;
  const tuning = structuredClone(s.tuning) as unknown as Record<string, Record<string, number>>;
  for (const [key, f] of total) {
    const def = boostDefOf(key);
    if (!def) continue;
    const k = Math.min(def.max, Math.max(def.min, f));
    for (const path of def.paths) {
      const [sec, name] = path.split('.') as [string, string];
      let v = tuning[sec]![name]! * k;
      if (def.cap !== undefined) v = Math.min(v, def.cap);
      if (def.int) v = Math.max(1, Math.round(v));
      tuning[sec]![name] = v;
    }
  }
  return { ...s, tuning: tuning as unknown as ShardSettings['tuning'] };
}
```

`index.ts` 加 `export { applyBoosts } from './boost';`。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @dt/config build && pnpm vitest run packages/config`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/config
git commit -m "feat(config): 新增银币、菜场价格倍率；applyBoosts 套用全服加成"
```

---

### Task 3: 结算银币倍率、菜场价格倍率

**Files:**
- Modify: `apps/server/src/modules/settlement/tables.ts:315`
- Modify: `apps/server/src/modules/market/rules.ts:79-89`
- Test: `apps/server/src/modules/settlement/settle.test.ts`、`apps/server/src/modules/market/rules.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 的 `coinMultiplier`、`priceFactor`

- [ ] **Step 1: 写失败的测试**

`settle.test.ts` 的"逐桌分配"里，"经验倍率"用例后面加：

```ts
  it('银币倍率（148-4）：每桌银币乘倍率，挑剔满足的额外银币一起变', () => {
    const tuning = { ...rules, settlement: { ...rules.settlement, coinMultiplier: 2 } };
    const r = settle({}, { tuning }, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ coin: 20 });
    expect(r.coin).toBe(20);
  });
```

`market/rules.test.ts` 末尾加：

```ts
describe('菜场价格倍率（148-4）', () => {
  it('三个货架的单价都乘 priceFactor（在天气系数之后）', () => {
    const food = [...config.foods.values()][0]!;
    const t = config.tuning.market;
    const half = { ...t, priceFactor: 0.5 };
    const w = { marketCoin: 0.2 };
    for (const shelf of [0, 1, 2] as const)
      expect(unitPrice(shelf, food, half, w)).toBeCloseTo(unitPrice(shelf, food, t, w) * 0.5);
  });
});
```

（`config`、`unitPrice` 的 import 按该测试文件现有写法补齐。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/settlement/settle.test.ts apps/server/src/modules/market/rules.test.ts`
Expected: FAIL（银币是 10 不是 20；价格没减半）

- [ ] **Step 3: 实现**

`tables.ts`：

```ts
      coinT = (coin + rates.coinValue.total + mcCoin) * t.coinMultiplier;
```

`market/rules.ts` 的 `unitPrice`：

```ts
  const w = (1 + (weather.marketCoin ?? 0)) * t.priceFactor;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/settlement apps/server/src/modules/market apps/server/src/sim`
Expected: PASS（快速模拟的一致性测试也要过，倍率默认 1 不改变结果）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/settlement apps/server/src/modules/market
git commit -m "feat(server): 结算银币倍率、菜场价格倍率"
```

---

### Task 4: 区服设置套用加成、迁移 0022、活动规则

**Files:**
- Create: `apps/server/src/db/migrations/0022_activity_boost.ts`（+ `index.ts` 登记）
- Modify: `apps/server/src/db/schema.ts`（`ActivityTable.kind` 加 `'boost'`）
- Modify: `apps/server/src/modules/shard/service.ts`
- Modify: `apps/server/src/modules/activity/rules.ts`（`rewardsOf` 对 boost 返回 `[]`）
- Modify: `apps/server/src/modules/activity/handler.ts`（boost 不计数）
- Modify: `apps/server/src/modules/activity/admin.ts`（写操作后清区服设置缓存并广播）
- Create: `apps/server/src/modules/activity/boost.test.ts`

**Interfaces:**
- Consumes: Task 2 `applyBoosts`；148-1 的 `createAdminActivity`、`insertActivity`（`apps/server/test/activity.ts`）
- Produces: `createShardService(d: { db; sessions; config; now?: () => Date })`；`shards.invalidateAll(): void`

- [ ] **Step 1: 写失败的测试** `boost.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import type { AdminActor } from '../admin/access';
import { regenStrength } from '../settlement/strength';
import { createAdminActivity } from './admin';
import { rewardsOf } from './rules';

let t: TestGame;
let actor: AdminActor;
beforeAll(async () => {
  t = await createTestGame();
  actor = { accountId: await createAccountRow(t.db), username: 'boss', role: 'admin', ip: '127.0.0.1' };
});
afterAll(() => t.close());

const H = 3_600_000;
const boost = (factor = 2, key = 'exp') => ({ kind: 'boost' as const, def: { items: [{ key, factor }] } });
const exp = async (shardId: number) => (await t.game.shards.settings(shardId)).tuning.settlement.expMultiplier;
const base = () => t.game.deps.config.tuning.settlement.expMultiplier;

describe('全服加成生效（148-4 设计 §6.2）', () => {
  it('窗口内加成，开始前和结束后都是原值', async () => {
    const shardId = await createShard(t.db);
    const now = t.clock.now.getTime();
    await insertActivity(t, { shardId, spec: boost(), startsAt: new Date(now + H), endsAt: new Date(now + 2 * H) });
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base());
    t.clock.set(new Date(now + H));
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base() * 2);
    t.clock.set(new Date(now + 2 * H));
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base());
    t.clock.set(new Date(now));
  });

  it('区服 A 的加成不影响区服 B；全服加成两边都生效', async () => {
    const a = await createShard(t.db);
    const b = await createShard(t.db);
    await insertActivity(t, { shardId: a, spec: boost(2) });
    t.game.shards.invalidate(a);
    t.game.shards.invalidate(b);
    expect(await exp(a)).toBe(base() * 2);
    expect(await exp(b)).toBe(base());
    await insertActivity(t, { shardId: null, spec: boost(1.5) });
    t.game.shards.invalidateAll();
    expect(await exp(a)).toBe(base() * 3);
    expect(await exp(b)).toBe(base() * 1.5);
  });

  it('后台建加成后本进程立即生效；提前结束后立即恢复', async () => {
    const svc = createAdminActivity(t.game);
    const shardId = await createShard(t.db);
    expect(await exp(shardId)).toBe(base());
    const now = t.clock.now.getTime();
    const a = await svc.create(actor, {
      shardId,
      kind: 'boost',
      title: '双倍经验',
      body: '周末',
      startsAt: new Date(now - H).toISOString(),
      endsAt: new Date(now + H).toISOString(),
      minLevel: 1,
      def: { items: [{ key: 'exp', factor: 2 }] },
    });
    expect(await exp(shardId)).toBe(base() * 2);
    await svc.end(actor, a.id);
    expect(await exp(shardId)).toBe(base());
  });

  it('体力恢复任务按加成后的数值恢复', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { strength: 0, strength_max: 100, luck: 0 } });
    await insertActivity(t, { shardId, spec: boost(3, 'strength') });
    t.game.shards.invalidate(shardId);
    await regenStrength(t.game.deps, shardId, 'p1', t.clock.now);
    const row = await t.db.selectFrom('restaurant').select('strength').where('id', '=', r.restaurantId).executeTakeFirstOrThrow();
    const tn = t.game.deps.config.tuning.strength;
    expect([tn.regen * 3, tn.luckyRegen * 3]).toContain(row.strength);
  });

  it('boost 活动没有奖励，也不计数', async () => {
    expect(rewardsOf(boost(), {}, false)).toEqual([]);
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: boost() });
    await runSystemOp(t.game.deps, shardId, r.restaurantId, { source: 'test' }, (o) => emitAction(o, 'signin'));
    expect(await counters(t, id, r.restaurantId)).toEqual({});
  });
});
```

（`regenStrength` 的参数和体力加成来源以 `settlement/strength.ts` 为准；新店的 `effect_agg` 里如果有体力倍率，断言改成按 `strengthGain` 算期望值，记 Ruling。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/activity/boost.test.ts`
Expected: FAIL（插入 `kind='boost'` 违反检查约束）

- [ ] **Step 3: 迁移** `0022_activity_boost.ts`

```ts
import { sql, type Kysely } from 'kysely';

/** 148-4：活动类型加上全服加成 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost'))`.execute(
    db,
  );
  await sql`create index activity_boost_window on activity (starts_at, ends_at) where kind = 'boost' and deleted_at is null`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index activity_boost_window`.execute(db);
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass'))`.execute(db);
}
```

（约束名 `activity_kind_check` 已在 dev 库确认。）
`index.ts` 登记 `'0022_activity_boost': m0022`；`schema.ts` 的 `kind` 类型加 `'boost'`。

- [ ] **Step 4: 区服服务** `shard/service.ts`

```ts
import { applyBoosts, isFeatureEnabled, resolveShardSettings, type GameConfig, type ShardSettings } from '@dt/config';
import type { BoostItem } from '@dt/shared';
...
export function createShardService(d: {
  db: Kysely<DB>;
  sessions: SessionStore;
  config: GameConfig;
  /** 游戏时钟：判断全服加成是否生效（dev 的测试时钟也要生效） */
  now?: () => Date;
}) {
  const now = d.now ?? (() => new Date());
  ...
  async function settings(shardId: number): Promise<ShardSettings> {
    const hit = cache.get(shardId);
    const nowMs = Date.now();
    if (hit && hit.expires > nowMs) return hit.settings;
    const row = await d.db.selectFrom('shard_config').select('override').where('shard_id', '=', shardId).executeTakeFirst();
    const t = now();
    // 正在生效的全服加成（148-4 设计 §6.2）
    const boosts = await d.db
      .selectFrom('activity')
      .select('def')
      .where('kind', '=', 'boost')
      .where('deleted_at', 'is', null)
      .where('starts_at', '<=', t)
      .where('ends_at', '>', t)
      .where((eb) => eb.or([eb('shard_id', '=', shardId), eb('shard_id', 'is', null)]))
      .execute();
    const resolved = applyBoosts(
      resolveShardSettings(d.config, row?.override ?? {}),
      boosts.map((b) => (b.def as { items: BoostItem[] }).items),
    );
    cache.set(shardId, { expires: nowMs + SETTINGS_CACHE_MS, settings: resolved });
    return resolved;
  }
```

返回对象里 `invalidate` 旁边加：

```ts
    /** 全服加成（不分区服）改动后清掉全部区服的缓存 */
    invalidateAll(): void {
      cache.clear();
    },
```

`game.ts` 不用改（`createShardService(app)` 的 `app` 本来就有 `now`）。

- [ ] **Step 5: 活动规则**

`rules.ts` 的 `rewardsOf` 开头加 `if (spec.kind === 'boost') return [];`。
`handler.ts` 的 `count` 开头加 `if (a.spec.kind === 'boost') return;`。
`settle.ts`、`service.ts` 不用改（没有奖励就不会发邮件、`claimable` 为 0），但 TypeScript 的穷尽检查报错的地方都按"boost 没有奖励"处理。

- [ ] **Step 6: 后台写操作清缓存并广播** `activity/admin.ts`

```ts
import { publishSettingsChanged } from '../../infra/settingsBus';
...
  /** 全服加成改动后：本进程立即清区服设置缓存，其他进程通过 settings-bus 清（148-4 设计 §6.2） */
  async function boostChanged(shardId: number | null) {
    if (shardId === null) {
      game.shards.invalidateAll();
      const shards = await db.selectFrom('shard').select('id').execute();
      for (const s of shards) await publishSettingsChanged(game.app.redis, s.id);
    } else {
      game.shards.invalidate(shardId);
      await publishSettingsChanged(game.app.redis, shardId);
    }
  }
```

`create`、`update`、`end`、`remove` 在 `cache().invalidate()` 后面加：新旧任一 `kind === 'boost'` 时调用 `boostChanged`（update 时新旧区服不同就两个都清）。

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/activity apps/server/src/modules/shard apps/server/src/core/pool.test.ts apps/server/src/db`
Expected: PASS（连接池测试也要过：`settings` 未命中时新增的查询在事务外）

- [ ] **Step 8: Commit**

```bash
git add apps/server
git commit -m "feat(server): 区服设置套用全服加成；迁移 0022；后台改动立即生效"
```

---

### Task 5: 前端——玩家卡片、后台编辑器、区服数值页提示

**Files:**
- Create: `apps/web/src/components/activity/ActivityBoost.vue`
- Modify: `apps/web/src/views/ActivitiesView.vue`
- Create: `apps/web/src/components/admin/activity/BoostEditor.vue`
- Modify: `apps/web/src/utils/activityForm.ts`（`defaultDef('boost')`、错误文案）
- Modify: `apps/web/src/views/admin/AdminActivitiesView.vue`
- Modify: `apps/web/src/views/admin/AdminShardView.vue`
- Test: `ActivitiesView.test.ts`、`AdminActivitiesView.test.ts`、`AdminShardView.test.ts`、`utils/activityForm.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 `BOOSTS`、`boostText`、`BoostActivityDef`

- [ ] **Step 1: 写失败的测试**

`ActivitiesView.test.ts` 追加：

```ts
describe('ActivitiesView 全服加成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
  });
  it('列出加成项和剩余时间，没有领取按钮', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [
        {
          ...base,
          id: 8,
          kind: 'boost',
          def: { items: [{ key: 'exp', factor: 2 }, { key: 'marketPrice', factor: 0.8 }] },
          counters: {},
          rewards: [],
          claimable: 0,
        },
      ],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    const card = w.find('[data-testid="activity-8"]');
    expect(card.find('[data-testid="boost-8"]').text()).toContain('经营经验 ×2、菜场价格 ×0.8');
    expect(card.text()).toContain('还剩 2 天');
    expect(card.find('button').exists()).toBe(false);
    expect(card.find('table').exists()).toBe(false);
  });
});
```

`AdminActivitiesView.test.ts` 追加：

```ts
describe('AdminActivitiesView 全服加成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });
  it('选全服加成：每行项目 + 倍数，提示范围；提交 items', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('boost');
    expect(w.find('[data-testid="boost-range-0"]').text()).toBe('1~5');
    await w.find('[data-testid="boost-add"]').trigger('click');
    await w.find('[data-testid="boost-key-1"]').setValue('marketPrice');
    expect(w.find('[data-testid="boost-range-1"]').text()).toBe('0.5~1');
    await w.find('[data-testid="boost-factor-1"]').setValue('0.8');
    await w.find('[data-testid="ac-title"]').setValue('国庆');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('boost');
    expect(b.def).toEqual({ items: [{ key: 'exp', factor: 2 }, { key: 'marketPrice', factor: 0.8 }] });
  });
});
```

`AdminShardView.test.ts`：mock 里加 `activities: vi.fn()`，`beforeEach` 里默认 `mockResolvedValue([])`；追加：

```ts
  it('有生效的全服加成时，页面上方提示（显示的数值不含加成）', async () => {
    vi.mocked(adminApi.activities).mockResolvedValue([
      {
        id: 3,
        shardId: null,
        kind: 'boost',
        def: { items: [{ key: 'exp', factor: 2 }] },
        title: '双倍经验',
        body: '',
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2099-10-08T00:00:00.000Z',
        minLevel: 1,
        state: 'running',
        participants: 0,
        createdAt: '',
        updatedAt: '',
        actor: null,
      },
    ] as never);
    const w = await mountView();
    expect(w.find('[data-testid="boost-hint"]').text()).toContain('经营经验 ×2');
  });
```

（`mountView` 以该测试文件现有的挂载方式为准。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/ActivitiesView.test.ts apps/web/src/views/admin`
Expected: FAIL

- [ ] **Step 3: 玩家卡片** `components/activity/ActivityBoost.vue`

```vue
<script setup lang="ts">
import { boostText, type ActivityDto, type BoostActivityDef } from '@dt/shared';

/** 全服加成卡片（148-4）：只显示加成项，没有领取 */
defineProps<{ a: ActivityDto & { kind: 'boost'; def: BoostActivityDef } }>();
</script>

<template>
  <div class="d-flex align-items-center gap-2" :data-testid="`boost-${a.id}`">
    <i class="bi bi-lightning-charge text-warning"></i>
    <span>{{ boostText(a.def.items) }}</span>
  </div>
</template>
```

`ActivitiesView.vue`：`<ActivityPass v-else ...>` 改成 `v-else-if="a.kind === 'pass'"`，后面加 `<ActivityBoost v-else-if="a.kind === 'boost'" :a="a" />`，import 组件。

- [ ] **Step 4: 后台编辑器** `components/admin/activity/BoostEditor.vue`

```vue
<script setup lang="ts">
import { BOOSTS, boostDefOf, type BoostActivityDef } from '@dt/shared';

const props = defineProps<{ modelValue: BoostActivityDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [BoostActivityDef] }>();
type Item = BoostActivityDef['items'][number];
const set = (items: Item[]) => emit('update:modelValue', { items });
const setItem = (i: number, p: Partial<Item>) => set(props.modelValue.items.map((x, j) => (j === i ? { ...x, ...p } : x)));
const range = (key: string) => {
  const d = boostDefOf(key);
  return d ? `${d.min}~${d.max}` : '';
};
const unused = () => Object.keys(BOOSTS).find((k) => !props.modelValue.items.some((i) => i.key === k)) ?? 'exp';
</script>

<template>
  <div v-if="errors['def.items']" class="text-danger small">{{ errors['def.items'] }}</div>
  <div v-for="(it, i) in modelValue.items" :key="i" class="d-flex gap-2 align-items-center py-1">
    <select
      class="form-select form-select-sm w-auto"
      :value="it.key"
      :data-testid="`boost-key-${i}`"
      @change="setItem(i, { key: ($event.target as HTMLSelectElement).value, factor: 1 })"
    >
      <option v-for="(d, k) in BOOSTS" :key="k" :value="k">{{ d.label }}</option>
    </select>
    ×
    <input
      type="number"
      step="0.01"
      class="form-control form-control-sm"
      style="width: 6rem"
      :value="it.factor"
      :data-testid="`boost-factor-${i}`"
      @input="setItem(i, { factor: Number(($event.target as HTMLInputElement).value) })"
    />
    <span class="small text-muted" :data-testid="`boost-range-${i}`">{{ range(it.key) }}</span>
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.items.length <= 1"
      @click="set(modelValue.items.filter((_, j) => j !== i))"
    >
      删除
    </button>
    <span v-if="errors[`def.items.${i}.factor`]" class="text-danger small">{{ errors[`def.items.${i}.factor`] }}</span>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mt-1"
    data-testid="boost-add"
    :disabled="modelValue.items.length >= 10"
    @click="set([...modelValue.items, { key: unused(), factor: 1 }])"
  >
    加一项
  </button>
</template>
```

（编辑器里没有奖励编辑器，用下标做 key 没有 148-1 终审 I1 的问题。）

`utils/activityForm.ts`：`defaultDef` 加重载和分支 `if (kind === 'boost') return { items: [{ key: 'exp', factor: 2 }] };`；`TEXT` 加 `out_of_range: '倍数超出范围'`、`unknown_boost: '请选择加成项目'`、`two_decimals: '倍数最多两位小数'`、`no_effect: '至少有一项倍数不等于 1'`。

`AdminActivitiesView.vue`：`defs` 加 `boost: defaultDef('boost')`（`fill()` 里重置时也加），`KIND` 加 `boost: '全服加成'`，类型下拉加 `<option value="boost">全服加成</option>`，编辑器分支加 `<BoostEditor v-else-if="kind === 'boost'" v-model="defs.boost" :errors="errors" />`（`PassEditor` 的 `v-else` 改成 `v-else-if="kind === 'pass'"`）。

- [ ] **Step 5: 区服数值页提示** `AdminShardView.vue`

```ts
import { boostText, type AdminActivityDto, type BoostActivityDef } from '@dt/shared';
const boosts = ref<AdminActivityDto[]>([]);
async function loadBoosts() {
  try {
    boosts.value = (await adminApi.activities()).filter(
      (a) => a.kind === 'boost' && a.state === 'running' && (a.shardId === null || a.shardId === shardId.value),
    );
  } catch {
    boosts.value = [];
  }
}
```

（`shardId` 以该页面现有的区服 id 变量为准；在现有的 `load()` 里一起调用 `loadBoosts()`。）模板顶部：

```vue
<div v-if="boosts.length" class="alert alert-warning py-1 small" data-testid="boost-hint">
  当前有全服加成生效（下面显示的是不含加成的数值）：
  <span v-for="b in boosts" :key="b.id" class="me-2">
    {{ boostText((b.def as BoostActivityDef).items) }}（至 {{ new Date(b.endsAt).toLocaleString() }}）
  </span>
</div>
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run apps/web`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 全服加成的玩家卡片、后台编辑器和区服数值页提示"
```

---

### Task 6: 全量检查

- [ ] **Step 1:** `pnpm vitest run`（输出写到工作区文件，读尾部）→ 全部通过
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → 通过
- [ ] **Step 3:** `pnpm format:check` → 只允许 `问题记录.md` 报警
- [ ] **Step 4:** 如有格式修正，提交 `chore: 格式`
