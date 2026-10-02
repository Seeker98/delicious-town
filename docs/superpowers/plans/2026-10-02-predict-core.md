# 事件合约 238-1 合约引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个用银币买卖"是/否"份额的事件合约：系统按 LMSR 公式自动报价，管理员出题和判定，定时任务截止和结算。

**Architecture:** 报价纯函数放 `@dt/shared/predict.ts`，前后端共用。服务端新模块 `apps/server/src/modules/predict/`：`service.ts`（列表、详情、买卖；锁店 → 锁事件行）、`jobs.ts`（每分钟截止、结算；结算一家店一个事务、逐行标记）、`admin.ts`（出题、列表、判定、作废）、`routes.ts`。前端新页 `PredictView.vue`（玩家）和 `AdminPredictView.vue`（后台）。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Pinia、Bootstrap 5、Vitest、Playwright、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-predict-1-core-design.md`

## Global Constraints

- 文案中文；不改 `问题记录.md`；e2e 只动自己建的数据。
- `tuning.predict` = `{ "unit": 1000, "feeRate": 0.02, "maxHold": 200, "maxTrade": 100, "defaultB": 100, "minLevel": 20, "minAccountDays": 7 }`；`tuning.json`、zod、`setting_docs.json` 都要加。区服功能开关 `predict`（加进 `IMPLEMENTED_FEATURES` 和 features 说明）。
- 报价：`C(y,n) = b·ln(e^(y/b)+e^(n/b))`；买入成交额 `ceil(unit × ΔC)`，卖出 `floor(unit × ΔC)`；手续费 `ceil(成交额 × feeRate)`；买付 成交额+手续费，卖得 成交额−手续费。`unit` 用事件保存的值。
- 初始概率 5~95（整数百分比），`y − n = b·ln(p0/(1−p0))`，小的一边为 0；b 10~10000，默认 `defaultB`。
- 加锁顺序：买卖 店 → 事件行；判定/作废只锁事件行；结算只锁店（事件已是终态）。
- 买卖条件：门槛（复用交易所 `eligibility`，数值用 `tuning.predict`）、本区服、`status = 'open'` 且 `now < close_at`、`qty ≤ maxTrade`、买入后持有 `≤ maxHold`、卖出 ≤ 持有。
- 错误：`requirement('predict_level'|'predict_age'|'predict_email')`、404、`invalidState('predict_closed')`、`limitReached('predict_trade', {max})`、`limitReached('predict_hold', {max})`、`invalidState('predict_not_enough')`、`invalidState('predict_final')`、`invalidState('predict_close_at')`。
- 判定/作废只有 `admin`；出题和列表 `mod`；都写审计日志 `predict.create` / `predict.resolve` / `predict.void`；权限矩阵测试加上新路由。
- 结算：判定为是 发 `unit × yes`，为否 发 `unit × no`；作废 退 `max(net_cost, 0)`；发 0 的只标记不写日志。个人日志 `predict.trade`、`predict.settle`、`predict.refund`。
- 两个定时任务每分钟一次，挂在 `restaurant` 上：`predict-close`、`predict-settle`（每次最多 200 个持仓）。

## Review Focus

1. 截止时间到了但截止任务还没跑：买卖必须按 `now < close_at` 拒绝（Task 3 测试"截止时间已过、任务还没跑也不能买"）。
2. 结算任务重跑或两个 worker 同时跑：每个持仓只发一次钱（Task 4 测试"并发跑两次结算，每人只发一次"）。
3. 买了马上卖回、反复小额买卖不能从取整里赚钱（Task 1 测试"买了再卖回不赚钱"，含 1 份的小额循环）。
4. 改区服 `unit` 不影响已开的事件的报价和结算（Task 4 测试"改区服 unit 后结算仍按事件的 unit"）。
5. 冷门事件（初始 5%）被一边买满时价格和金额不溢出、不出现 NaN（Task 1 测试"大份数不溢出"）。

---

### Task 1: 报价纯函数和共享类型

**Files:**
- Create: `packages/shared/src/predict.ts`
- Create: `packages/shared/src/predict.test.ts`
- Create: `packages/shared/src/schemas/predict.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `lmsrCost(y: number, n: number, b: number): number`
  - `lmsrPrice(y: number, n: number, b: number): number`（"是"的价格 0~1）
  - `initialShares(p0: number, b: number): { y: number; n: number }`（p0 为 0~1）
  - `type PredictSide = 'yes' | 'no'`、`type PredictDir = 'buy' | 'sell'`
  - `interface PredictQuote { amount: number; fee: number; total: number; yAfter: number; nAfter: number; priceAfter: number }`
  - `predictQuote(s: { y: number; n: number; b: number }, side: PredictSide, dir: PredictDir, qty: number, t: { unit: number; feeRate: number }): PredictQuote`
  - `predictPercent(p: number): number`（1~99 的整数）
  - zod：`predictTradeBody`、`predictCreateBody`、`predictResolveBody`；DTO：`PredictStatus`、`PredictEventDto`、`PredictListDto`、`PredictDetailDto`、`PredictTradeDto`、`PredictAdminRow`

- [ ] **Step 1: 写失败的测试**

`packages/shared/src/predict.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { initialShares, lmsrCost, lmsrPrice, predictPercent, predictQuote } from './predict';
import { predictCreateBody, predictTradeBody } from './schemas/predict';

const T = { unit: 1000, feeRate: 0.02 };

describe('LMSR 报价（238-1 设计 §4）', () => {
  it('开局 50%：价格 0.5，两边相加为 1', () => {
    expect(lmsrPrice(0, 0, 100)).toBe(0.5);
    const p = lmsrPrice(30, 10, 100);
    expect(p + lmsrPrice(10, 30, 100)).toBeCloseTo(1, 12);
    expect(p).toBeGreaterThan(0.5);
  });

  it('初始概率：y − n = b·ln(p0/(1−p0))，小的一边为 0', () => {
    const a = initialShares(0.8, 100);
    expect(a.n).toBe(0);
    expect(lmsrPrice(a.y, a.n, 100)).toBeCloseTo(0.8, 12);
    const c = initialShares(0.05, 100);
    expect(c.y).toBe(0);
    expect(lmsrPrice(c.y, c.n, 100)).toBeCloseTo(0.05, 12);
    expect(initialShares(0.5, 100)).toEqual({ y: 0, n: 0 });
  });

  it('买 1 份"是"：成交额向上取整、手续费向上取整，价格变高', () => {
    const q = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 1, T);
    const exact = 1000 * (lmsrCost(1, 0, 100) - lmsrCost(0, 0, 100));
    expect(q.amount).toBe(Math.ceil(exact));
    expect(q.fee).toBe(Math.ceil(q.amount * 0.02));
    expect(q.total).toBe(q.amount + q.fee);
    expect(q).toMatchObject({ yAfter: 1, nAfter: 0 });
    expect(q.priceAfter).toBeGreaterThan(0.5);
  });

  it('卖出：成交额向下取整，所得扣手续费', () => {
    const q = predictQuote({ y: 10, n: 0, b: 100 }, 'yes', 'sell', 4, T);
    const exact = 1000 * (lmsrCost(10, 0, 100) - lmsrCost(6, 0, 100));
    expect(q.amount).toBe(Math.floor(exact));
    expect(q.total).toBe(q.amount - Math.ceil(q.amount * 0.02));
    expect(q).toMatchObject({ yAfter: 6, nAfter: 0 });
  });

  it('买了再卖回不赚钱，1 份的小额循环也一样（Review Focus 3）', () => {
    for (const b of [10, 100, 10000])
      for (const k of [1, 7, 100]) {
        const buy = predictQuote({ y: 3, n: 5, b }, 'no', 'buy', k, { unit: 1000, feeRate: 0 });
        const sell = predictQuote({ y: buy.yAfter, n: buy.nAfter, b }, 'no', 'sell', k, { unit: 1000, feeRate: 0 });
        expect(sell.amount).toBeLessThanOrEqual(buy.amount);
      }
  });

  it('系统最大亏损不超过 unit·b·ln(1/p0)（结果一边买满 200 份）', () => {
    for (const p0 of [0.05, 0.3, 0.5, 0.95]) {
      const b = 100;
      const s = initialShares(p0, b);
      const q = predictQuote({ y: s.y, n: s.n, b }, 'yes', 'buy', 200, { unit: 1000, feeRate: 0 });
      const loss = 1000 * 200 - q.amount; // 结果为"是"，系统付 200 份
      expect(loss).toBeLessThanOrEqual(1000 * b * Math.log(1 / p0) + 1);
    }
  });

  it('大份数不溢出、不出现 NaN（Review Focus 5）', () => {
    const s = initialShares(0.05, 10);
    const q = predictQuote({ y: s.y, n: s.n + 5000, b: 10 }, 'yes', 'buy', 999, T);
    expect(Number.isFinite(q.amount)).toBe(true);
    expect(Number.isFinite(q.priceAfter)).toBe(true);
    expect(lmsrPrice(0, 100000, 10)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(lmsrCost(100000, 0, 10))).toBe(true);
  });

  it('显示的百分比在 1~99', () => {
    expect(predictPercent(0.634)).toBe(63);
    expect(predictPercent(0.001)).toBe(1);
    expect(predictPercent(0.999)).toBe(99);
  });
});

describe('请求校验', () => {
  it('买卖：份数为正整数；方向和边只能取规定值', () => {
    expect(predictTradeBody.parse({ side: 'yes', dir: 'buy', qty: 3 })).toEqual({ side: 'yes', dir: 'buy', qty: 3 });
    expect(predictTradeBody.safeParse({ side: 'maybe', dir: 'buy', qty: 3 }).success).toBe(false);
    expect(predictTradeBody.safeParse({ side: 'yes', dir: 'buy', qty: 0 }).success).toBe(false);
  });

  it('出题：标题 1~60 字、初始概率 5~95、b 10~10000', () => {
    const ok = { shardId: 1, title: '明天会下雨吗', closeAt: '2026-10-03T12:00:00.000Z', p0: 50 };
    expect(predictCreateBody.parse(ok)).toMatchObject({ description: '' });
    expect(predictCreateBody.safeParse({ ...ok, title: '' }).success).toBe(false);
    expect(predictCreateBody.safeParse({ ...ok, p0: 96 }).success).toBe(false);
    expect(predictCreateBody.safeParse({ ...ok, b: 5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run packages/shared/src/predict.test.ts`
Expected: FAIL（`./predict` 不存在）。

- [ ] **Step 3: 写 `packages/shared/src/predict.ts`**

```ts
/** 事件合约的报价（238-1 设计 §4）：LMSR，前后端共用 */
export type PredictSide = 'yes' | 'no';
export type PredictDir = 'buy' | 'sell';

/** 成本函数 C(y, n) = b·ln(e^(y/b) + e^(n/b))，用 log-sum-exp 避免溢出 */
export function lmsrCost(y: number, n: number, b: number): number {
  const a = y / b;
  const c = n / b;
  const m = Math.max(a, c);
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
}

/** "是"的价格（0~1）；"否"是 1 − 它 */
export function lmsrPrice(y: number, n: number, b: number): number {
  return 1 / (1 + Math.exp((n - y) / b));
}

/** 初始概率 p0（0~1）对应的初始份额：y − n = b·ln(p0/(1−p0))，小的一边为 0 */
export function initialShares(p0: number, b: number): { y: number; n: number } {
  const d = b * Math.log(p0 / (1 - p0));
  return d >= 0 ? { y: d, n: 0 } : { y: 0, n: -d };
}

/** 显示用的百分比：四舍五入，夹在 1~99 */
export function predictPercent(p: number): number {
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

export interface PredictQuote {
  /** 成交额（不含手续费） */
  amount: number;
  fee: number;
  /** 买入付出（成交额 + 手续费）或卖出所得（成交额 − 手续费） */
  total: number;
  yAfter: number;
  nAfter: number;
  /** 成交后"是"的价格 */
  priceAfter: number;
}

/** 一笔买卖的报价：买入向上取整、卖出向下取整，取整都向着系统 */
export function predictQuote(
  s: { y: number; n: number; b: number },
  side: PredictSide,
  dir: PredictDir,
  qty: number,
  t: { unit: number; feeRate: number },
): PredictQuote {
  const d = dir === 'buy' ? qty : -qty;
  const yAfter = side === 'yes' ? s.y + d : s.y;
  const nAfter = side === 'no' ? s.n + d : s.n;
  const hi = dir === 'buy' ? lmsrCost(yAfter, nAfter, s.b) : lmsrCost(s.y, s.n, s.b);
  const lo = dir === 'buy' ? lmsrCost(s.y, s.n, s.b) : lmsrCost(yAfter, nAfter, s.b);
  const exact = t.unit * (hi - lo);
  const amount = dir === 'buy' ? Math.ceil(exact) : Math.floor(exact);
  const fee = Math.ceil(amount * t.feeRate);
  return {
    amount,
    fee,
    total: dir === 'buy' ? amount + fee : amount - fee,
    yAfter,
    nAfter,
    priceAfter: lmsrPrice(yAfter, nAfter, s.b),
  };
}
```

（买、卖用同一个 `hi − lo` 表达式：买 k 份后再卖 k 份，`exact` 完全相同，向上取整 ≥ 向下取整，所以卖回不赚钱。）

- [ ] **Step 4: 写 `packages/shared/src/schemas/predict.ts`**

```ts
import { z } from 'zod';
import type { PredictDir, PredictSide } from '../predict';

/** 买卖（238-1 设计 §6.1）；单笔上限在服务端按区服数值再查 */
export const predictTradeBody = z.object({
  side: z.enum(['yes', 'no']),
  dir: z.enum(['buy', 'sell']),
  qty: z.number().int().min(1).max(999),
});

/** 后台出题（238-1 设计 §7.3）；截止时间晚于现在在服务端检查 */
export const predictCreateBody = z.object({
  shardId: z.number().int().positive(),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(''),
  closeAt: z.string().datetime({ offset: true }),
  p0: z.number().int().min(5).max(95),
  b: z.number().int().min(10).max(10000).optional(),
});

export const predictResolveBody = z.object({ outcome: z.boolean() });

export type PredictStatus = 'open' | 'closed' | 'resolved' | 'void';

export interface PredictEventDto {
  id: number;
  title: string;
  /** "是"的价格（0~1） */
  price: number;
  closeAt: string;
  /** 截止时间已过但任务还没跑时也显示为 closed */
  status: PredictStatus;
  outcome: boolean | null;
  yes: number;
  no: number;
  netCost: number;
  /** 已判定：结算所得；已作废：退款；其他为 null */
  payout: number | null;
}

export interface PredictListDto {
  eligible: boolean;
  /** predict_level / predict_age / predict_email；满足为 null */
  reason: string | null;
  need: { level: number; days: number };
  feeRate: number;
  maxHold: number;
  maxTrade: number;
  events: PredictEventDto[];
}

export interface PredictDetailDto {
  event: PredictEventDto & {
    description: string;
    b: number;
    unit: number;
    qYes: number;
    qNo: number;
    openAt: string;
  };
  /** 最近 20 笔成交，最新在前，不显示是谁 */
  trades: Array<{ side: PredictSide; dir: PredictDir; qty: number; amount: number; createdAt: string }>;
  /** 价格走势："是"的价格，最早在前；第一个是开题时的初始价格 */
  points: number[];
}

export interface PredictTradeDto {
  side: PredictSide;
  dir: PredictDir;
  qty: number;
  amount: number;
  fee: number;
  total: number;
  /** 成交后"是"的价格 */
  price: number;
  yes: number;
  no: number;
}

export interface PredictAdminRow {
  id: number;
  title: string;
  status: PredictStatus;
  outcome: boolean | null;
  closeAt: string;
  price: number;
  trades: number;
  holders: number;
  fees: number;
  /** 结果为"是"/"否"时系统的收支（净成交额 − 要付的结算，不含手续费） */
  ifYes: number;
  ifNo: number;
  creator: string | null;
}
```

- [ ] **Step 5: 导出**

`packages/shared/src/index.ts` 里 `export * from './schemas/exchange';` 之后加：

```ts
export * from './predict';
export * from './schemas/predict';
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm vitest run packages/shared`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/predict.ts packages/shared/src/predict.test.ts packages/shared/src/schemas/predict.ts packages/shared/src/index.ts
git commit -m "feat: 事件合约 LMSR 报价和共享类型（238-1）"
```

---

### Task 2: 区服数值、功能开关、迁移 0029

**Files:**
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`、`packages/config/data/game/setting_docs.json`
- Modify: `apps/server/src/core/features.ts`
- Create: `apps/server/src/db/migrations/0029_predict.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`
- Test: `apps/server/src/modules/predict/schema.test.ts`

**Interfaces:**
- Produces: `Tuning['predict']`；表 `predict_event`（含 `unit`）、`predict_position`、`predict_trade`；功能名 `predict`。

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/predict/schema.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { IMPLEMENTED_FEATURES } from '../../core/features';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('事件合约的数值和表（238-1 设计 §3、§5）', () => {
  it('区服数值默认值；功能开关已实现', () => {
    expect(t.deps.config.tuning.predict).toEqual({
      unit: 1000,
      feeRate: 0.02,
      maxHold: 200,
      maxTrade: 100,
      defaultB: 100,
      minLevel: 20,
      minAccountDays: 7,
    });
    expect(IMPLEMENTED_FEATURES.has('predict')).toBe(true);
  });

  it('事件、持仓、成交能写入；持仓份数不能为负；删事件级联删持仓和成交', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const e = await t.db
      .insertInto('predict_event')
      .values({
        shard_id: shardId,
        title: '测试',
        b: 100,
        unit: 1000,
        p0: 0.5,
        open_at: t.clock.now,
        close_at: new Date(t.clock.now.getTime() + 3_600_000),
        status: 'open',
      })
      .returning(['id', 'kind', 'q_yes', 'description'])
      .executeTakeFirstOrThrow();
    expect(e).toMatchObject({ kind: 'manual', q_yes: 0, description: '' });
    await t.db
      .insertInto('predict_position')
      .values({ event_id: e.id, rest_id: r.restaurantId, yes: 3 })
      .execute();
    const r2 = await newRestaurant(t, { shardId });
    await expect(
      t.db.insertInto('predict_position').values({ event_id: e.id, rest_id: r2.restaurantId, no: -1 }).execute(),
    ).rejects.toThrow(/check constraint/);
    await t.db
      .insertInto('predict_trade')
      .values({
        event_id: e.id,
        rest_id: r.restaurantId,
        side: 'yes',
        dir: 'buy',
        qty: 3,
        amount: 1500,
        fee: 30,
        price_after: 0.51,
        created_at: t.clock.now,
      })
      .execute();
    await t.db.deleteFrom('predict_event').where('id', '=', e.id).execute();
    const left = await t.db.selectFrom('predict_position').select('rest_id').where('event_id', '=', e.id).execute();
    expect(left).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict/schema.test.ts`
Expected: FAIL（`tuning.predict` 为 undefined；表不存在）。

- [ ] **Step 3: 区服数值**

`packages/config/src/tuning.ts` 的 `exchange: z.object({...}),` 之后加：

```ts
  /** 事件合约（238-1） */
  predict: z.object({
    unit: int.min(1),
    feeRate: z.number().min(0).max(0.5),
    maxHold: int.min(1),
    maxTrade: int.min(1).max(999),
    defaultB: int.min(10).max(10000),
    minLevel: int.min(1),
    minAccountDays: int.min(0),
  }),
```

`tuning.json` 的 `"exchange": {...},` 之后加：

```json
  "predict": { "unit": 1000, "feeRate": 0.02, "maxHold": 200, "maxTrade": 100, "defaultB": 100, "minLevel": 20, "minAccountDays": 7 },
```

`setting_docs.json`：

- `features` 里 `"activity"` 之前加 `"predict": "事件合约：玩家用银币买卖"是/否"份额（关掉后不能买卖；已有事件照常截止、判定、结算）",`
- `groups` 里 `"tuning.exchange"` 之后加 `"tuning.predict": "事件合约：每份结算银币、手续费、持有和单笔上限、默认流动性、开通门槛",`
- `fields` 里 `tuning.exchange.maker.playerDaily` 之后加：

```json
    "tuning.predict.unit": "每份结算多少银币；出题时复制到事件里，之后改这里不影响已开的事件（银币）",
    "tuning.predict.feeRate": "买卖手续费 = 成交额 × 这个数，向上取整（比例）",
    "tuning.predict.maxHold": "每人每个事件每一边最多持有几份（份）",
    "tuning.predict.maxTrade": "单笔最多买卖几份（份）",
    "tuning.predict.defaultB": "出题时流动性 b 的默认值，越大价格越难被推动、系统最大亏损越大（份）",
    "tuning.predict.minLevel": "事件合约开通门槛：餐厅等级（级）",
    "tuning.predict.minAccountDays": "事件合约开通门槛：账号注册满几天（天）",
```

`apps/server/src/core/features.ts` 的 `IMPLEMENTED_FEATURES` 里 `'activity',` 之后加 `'predict',`。

（JSON 的引号：features 说明里的"是/否"用中文引号，不要用英文双引号。）

- [ ] **Step 4: 迁移和类型**

`apps/server/src/db/migrations/0029_predict.ts`：

```ts
import { sql, type Kysely } from 'kysely';

/** 238-1：事件合约的事件、持仓、成交 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table predict_event (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      kind text not null default 'manual',
      title text not null,
      description text not null default '',
      params jsonb not null default '{}',
      b double precision not null check (b > 0),
      unit integer not null check (unit > 0),
      q_yes double precision not null default 0,
      q_no double precision not null default 0,
      p0 double precision not null,
      open_at timestamptz not null,
      close_at timestamptz not null,
      status text not null check (status in ('open', 'closed', 'resolved', 'void')),
      outcome boolean,
      created_by integer,
      resolved_at timestamptz,
      settled_at timestamptz,
      created_at timestamptz not null default now()
    )`.execute(db);
  await sql`create index predict_event_shard on predict_event (shard_id, status, close_at)`.execute(db);
  await sql`
    create table predict_position (
      event_id bigint not null references predict_event(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      yes integer not null default 0 check (yes >= 0),
      no integer not null default 0 check (no >= 0),
      net_cost bigint not null default 0,
      settled boolean not null default false,
      primary key (event_id, rest_id)
    )`.execute(db);
  await sql`create index predict_position_rest on predict_position (rest_id)`.execute(db);
  await sql`
    create table predict_trade (
      id bigserial primary key,
      event_id bigint not null references predict_event(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      side text not null check (side in ('yes', 'no')),
      dir text not null check (dir in ('buy', 'sell')),
      qty integer not null check (qty > 0),
      amount bigint not null,
      fee bigint not null,
      price_after double precision not null,
      created_at timestamptz not null
    )`.execute(db);
  await sql`create index predict_trade_event on predict_trade (event_id, id)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table predict_trade`.execute(db);
  await sql`drop table predict_position`.execute(db);
  await sql`drop table predict_event`.execute(db);
}
```

`index.ts`：加 `import * as m0029 from './0029_predict';` 和 `'0029_predict': m0029,`。

`schema.ts`（`ExchangeMakerDayTable` 之后）：

```ts
export interface PredictEventTable {
  id: Generated<string>;
  shard_id: number;
  kind: Default<string>;
  title: string;
  description: Default<string>;
  params: JsonDefault<Record<string, unknown>>;
  b: number;
  unit: number;
  q_yes: Default<number>;
  q_no: Default<number>;
  p0: number;
  open_at: Ts;
  close_at: Ts;
  status: 'open' | 'closed' | 'resolved' | 'void';
  outcome: Nullable<boolean>;
  created_by: Nullable<number>;
  resolved_at: TsNullable;
  settled_at: TsNullable;
  created_at: TsDefault;
}
export interface PredictPositionTable {
  event_id: string;
  rest_id: number;
  yes: Default<number>;
  no: Default<number>;
  /** bigint：pg 读出为 number（INT8 解析器） */
  net_cost: Default<number>;
  settled: Default<boolean>;
}
export interface PredictTradeTable {
  id: Generated<string>;
  event_id: string;
  rest_id: number;
  side: 'yes' | 'no';
  dir: 'buy' | 'sell';
  qty: number;
  amount: number;
  fee: number;
  price_after: number;
  created_at: Ts;
}
```

`DB` 接口里 `exchange_maker_day` 之后加 `predict_event: PredictEventTable;`、`predict_position: PredictPositionTable;`、`predict_trade: PredictTradeTable;`。

（执行时先看 `schema.ts` 里 exchange 表的 bigint 列怎么声明的，`net_cost`/`amount`/`fee` 照同样方式写；如果项目把 INT8 读成字符串，就改成 `ColumnType<string, number | string, number | string>` 并在读出处 `Number()`。）

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/predict/schema.test.ts packages/config apps/server/src/core/featureDocs.test.ts apps/server/src/db/migrate.test.ts && pnpm -F @dt/server typecheck`
Expected: PASS；tsc 没有错误。

- [ ] **Step 6: 提交**

```bash
git add packages/config apps/server/src/core/features.ts apps/server/src/db apps/server/src/modules/predict/schema.test.ts
git commit -m "feat: 事件合约的区服数值、功能开关和数据表（238-1）"
```

---

### Task 3: 买卖、列表、详情

**Files:**
- Create: `apps/server/src/modules/predict/service.ts`
- Create: `apps/server/src/modules/predict/routes.ts`
- Create: `apps/server/src/modules/predict/test.ts`（测试工具）
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`
- Test: `apps/server/src/modules/predict/trade.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `predictQuote`、`lmsrPrice`、DTO；`eligibility`（`../exchange/service`）；`trader`（`../exchange/test`）。
- Produces:
  - `payoutOf(e: { status: string; outcome: boolean | null; unit: number }, p: { yes: number; no: number; net_cost: number }): number | null`
  - `createPredictService(d: GameDeps)` → `{ list(ctx), detail(ctx, id), trade(ctx, id, body) }`；`type PredictService`
  - `game.predict: PredictService`
  - 测试工具 `newEvent(t, shardId, o?: { p0?: number; b?: number; unit?: number; closeInMs?: number; status?: string }): Promise<number>`
  - 路由 `GET /api/v1/predict/events`、`GET /api/v1/predict/events/:id`、`POST /api/v1/predict/events/:id/trade`

- [ ] **Step 1: 测试工具**

`apps/server/src/modules/predict/test.ts`：

```ts
import { initialShares } from '@dt/shared';
import type { TestGame } from '../../../test/game';

/** 直接插一个事件（不走后台），返回 id */
export async function newEvent(
  t: TestGame,
  shardId: number,
  o: { p0?: number; b?: number; unit?: number; closeInMs?: number; status?: 'open' | 'closed' | 'resolved' | 'void'; title?: string } = {},
): Promise<number> {
  const p0 = o.p0 ?? 0.5;
  const b = o.b ?? 100;
  const s = initialShares(p0, b);
  const r = await t.db
    .insertInto('predict_event')
    .values({
      shard_id: shardId,
      title: o.title ?? '测试事件',
      b,
      unit: o.unit ?? 1000,
      q_yes: s.y,
      q_no: s.n,
      p0,
      open_at: t.clock.now,
      close_at: new Date(t.clock.now.getTime() + (o.closeInMs ?? 3_600_000)),
      status: o.status ?? 'open',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return Number(r.id);
}
```

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/predict/trade.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { predictQuote } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { trader } from '../exchange/test';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.predict;
const T = { unit: 1000, feeRate: 0.02 };
const coin = async (restId: number) => Number((await restRow(t, restId)).coin);
const ev = (id: number) =>
  t.db.selectFrom('predict_event').selectAll().where('id', '=', String(id)).executeTakeFirstOrThrow();

describe('买卖（238-1 设计 §6.1）', () => {
  it('买"是"：按报价扣银币（含手续费），份额、持仓、成交记录、个人日志都更新', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const q = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 10, T);
    const res = await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 10 });
    expect(res.data).toEqual({
      side: 'yes',
      dir: 'buy',
      qty: 10,
      amount: q.amount,
      fee: q.fee,
      total: q.total,
      price: q.priceAfter,
      yes: 10,
      no: 0,
    });
    expect(await coin(r.restaurantId)).toBe(1_000_000 - q.total);
    expect(await ev(id)).toMatchObject({ q_yes: 10, q_no: 0 });
    const pos = await t.db.selectFrom('predict_position').selectAll().where('event_id', '=', String(id)).executeTakeFirstOrThrow();
    expect(pos).toMatchObject({ rest_id: r.restaurantId, yes: 10, no: 0, settled: false });
    expect(Number(pos.net_cost)).toBe(q.total);
    const logs = await t.db.selectFrom('rest_log').select('type').where('rest_id', '=', r.restaurantId).where('type', '=', 'predict.trade').execute();
    expect(logs).toHaveLength(1);
  });

  it('卖出：得到成交额减手续费，净投入相应减少', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const buy = (await svc().trade(r, id, { side: 'no', dir: 'buy', qty: 20 })).data;
    const q = predictQuote({ y: 0, n: 20, b: 100 }, 'no', 'sell', 5, T);
    const sell = (await svc().trade(r, id, { side: 'no', dir: 'sell', qty: 5 })).data;
    expect(sell).toMatchObject({ total: q.total, yes: 0, no: 15 });
    expect(await coin(r.restaurantId)).toBe(1_000_000 - buy.total + q.total);
    const pos = await t.db.selectFrom('predict_position').select('net_cost').where('event_id', '=', String(id)).executeTakeFirstOrThrow();
    expect(Number(pos.net_cost)).toBe(buy.total - q.total);
  });

  it('单笔上限、持有上限、卖出超过持有都拒绝，银币不变', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 50_000_000 });
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 101 })).rejects.toMatchObject({
      params: { what: 'predict_trade', max: 100 },
    });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 100 });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 100 });
    const before = await coin(r.restaurantId);
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { what: 'predict_hold', max: 200 },
    });
    await expect(svc().trade(r, id, { side: 'no', dir: 'sell', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_not_enough' },
    });
    expect(await coin(r.restaurantId)).toBe(before);
  });

  it('截止时间已过、任务还没跑也不能买；已判定的不能买（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { closeInMs: 60_000 });
    const r = await trader(t, { shardId });
    t.clock.advance(60_000);
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_closed' },
    });
    const done = await newEvent(t, shardId, { status: 'resolved' });
    await expect(svc().trade(r, done, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_closed' },
    });
  });

  it('别的区服的事件 404；门槛不够报 predict_level；区服关掉报 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const id = await newEvent(t, other);
    const r = await trader(t, { shardId });
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({ status: 404 });
    const mine = await newEvent(t, shardId);
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', r.restaurantId).execute();
    await expect(svc().trade(r, mine, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_level', need: 20 },
    });
    await t.db.updateTable('restaurant').set({ level: 30 }).where('id', '=', r.restaurantId).execute();
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { predict: false } }) })
      .execute();
    t.game.deps.shards.invalidate(shardId);
    await expect(svc().trade(r, mine, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('事件按自己的 unit 报价，不看区服数值（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { predict: { unit: 5000 } });
    const id = await newEvent(t, shardId, { unit: 1000 });
    const r = await trader(t, { shardId });
    const res = await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 });
    expect(res.data.amount).toBe(predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 1, T).amount);
  });

  it('并发：两人同时各买 50 份"是"，份额合计 100，成交额合计和依次买一致（误差不超过取整）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 10_000_000 });
    const b = await trader(t, { shardId, coin: 10_000_000 });
    const [x, y] = await Promise.all([
      svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 50 }),
      svc().trade(b, id, { side: 'yes', dir: 'buy', qty: 50 }),
    ]);
    expect((await ev(id)).q_yes).toBe(100);
    const all = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 100, T).amount;
    const sum = x.data.amount + y.data.amount;
    expect(sum).toBeGreaterThanOrEqual(all);
    expect(sum).toBeLessThanOrEqual(all + 1);
  });
});

describe('列表和详情（238-1 设计 §7.1）', () => {
  it('列表：进行中的事件 + 我有持仓的已结束事件；带门槛、价格、持仓、结算所得', async () => {
    const shardId = await createShard(t.db);
    const open = await newEvent(t, shardId, { p0: 0.8, title: '进行中' });
    const done = await newEvent(t, shardId, { title: '已判定' });
    const other = await newEvent(t, shardId, { status: 'resolved', title: '别人的' });
    const r = await trader(t, { shardId });
    await svc().trade(r, done, { side: 'yes', dir: 'buy', qty: 3 });
    await t.db
      .updateTable('predict_event')
      .set({ status: 'resolved', outcome: true, resolved_at: t.clock.now })
      .where('id', '=', String(done))
      .execute();
    const l = await svc().list(r);
    expect(l).toMatchObject({ eligible: true, reason: null, feeRate: 0.02, maxHold: 200, maxTrade: 100 });
    const ids = l.events.map((e) => e.id);
    expect(ids).toContain(open);
    expect(ids).toContain(done);
    expect(ids).not.toContain(other);
    expect(l.events.find((e) => e.id === open)!.price).toBeCloseTo(0.8, 9);
    expect(l.events.find((e) => e.id === done)).toMatchObject({ status: 'resolved', outcome: true, yes: 3, payout: 3000 });
  });

  it('详情：说明、份额、我的持仓、最近成交、价格走势从初始价格开始', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { p0: 0.3 });
    const r = await trader(t, { shardId });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 5 });
    await svc().trade(r, id, { side: 'no', dir: 'buy', qty: 2 });
    const d = await svc().detail(r, id);
    expect(d.event).toMatchObject({ id, yes: 5, no: 2, unit: 1000, b: 100, status: 'open' });
    expect(d.points).toHaveLength(3);
    expect(d.points[0]).toBeCloseTo(0.3, 9);
    expect(d.trades.map((x) => x.side)).toEqual(['no', 'yes']);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict/trade.test.ts`
Expected: FAIL（`t.game.predict` 为 undefined）。

- [ ] **Step 4: `service.ts`**

```ts
import { sql } from 'kysely';
import {
  ErrorCode,
  lmsrPrice,
  predictQuote,
  type PredictDetailDto,
  type PredictEventDto,
  type PredictListDto,
  type PredictSide,
  type PredictDir,
  type PredictStatus,
  type PredictTradeDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { eligibility } from '../exchange/service';

const KEEP_DAYS = 7;

/** 结算所得：已判定按押对的份数，已作废退净投入（负数不退）；其他为 null */
export function payoutOf(
  e: { status: string; outcome: boolean | null; unit: number },
  p: { yes: number; no: number; net_cost: number },
): number | null {
  if (e.status === 'resolved') return e.unit * (e.outcome ? p.yes : p.no);
  if (e.status === 'void') return Math.max(Number(p.net_cost), 0);
  return null;
}

/** 截止时间已过但任务还没跑时也显示为 closed */
const shownStatus = (status: PredictStatus, closeAt: Date, now: Date): PredictStatus =>
  status === 'open' && closeAt <= now ? 'closed' : status;

const REASON: Record<string, string> = {
  exchange_level: 'predict_level',
  exchange_age: 'predict_age',
  exchange_email: 'predict_email',
};

export function createPredictService(d: GameDeps) {
  async function trade(
    o: Op,
    id: number,
    b: { side: PredictSide; dir: PredictDir; qty: number },
  ): Promise<PredictTradeDto> {
    const t = o.tuning.predict;
    const reason = await eligibility({
      db: o.tx,
      level: o.rest.level,
      accountId: o.rest.account_id,
      now: o.now,
      t,
    });
    if (reason === 'exchange_level') throw requirement('predict_level', { need: t.minLevel });
    if (reason === 'exchange_age') throw requirement('predict_age', { days: t.minAccountDays });
    if (reason) throw requirement('predict_email');
    // 加锁顺序：店（runOp）→ 事件行
    const e = await o.tx
      .selectFrom('predict_event')
      .select(['id', 'title', 'b', 'unit', 'q_yes', 'q_no', 'status', 'close_at'])
      .where('id', '=', String(id))
      .where('shard_id', '=', o.shardId)
      .forUpdate()
      .executeTakeFirst();
    if (!e) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'predict_event', id });
    if (e.status !== 'open' || o.now >= e.close_at) throw invalidState('predict_closed');
    if (b.qty > t.maxTrade) throw limitReached('predict_trade', { max: t.maxTrade });
    const pos = await o.tx
      .selectFrom('predict_position')
      .select(['yes', 'no'])
      .where('event_id', '=', e.id)
      .where('rest_id', '=', o.rest.id)
      .executeTakeFirst();
    const held = { yes: pos?.yes ?? 0, no: pos?.no ?? 0 };
    if (b.dir === 'buy' && held[b.side] + b.qty > t.maxHold) throw limitReached('predict_hold', { max: t.maxHold });
    if (b.dir === 'sell' && b.qty > held[b.side]) throw invalidState('predict_not_enough');

    const q = predictQuote({ y: e.q_yes, n: e.q_no, b: e.b }, b.side, b.dir, b.qty, {
      unit: e.unit,
      feeRate: t.feeRate,
    });
    if (b.dir === 'buy') spendCoin(o, q.total, { source: 'predict' });
    else gainCoin(o, q.total, { source: 'predict' });
    const next = { ...held, [b.side]: held[b.side] + (b.dir === 'buy' ? b.qty : -b.qty) };
    const net = b.dir === 'buy' ? q.total : -q.total;
    await o.tx.updateTable('predict_event').set({ q_yes: q.yAfter, q_no: q.nAfter }).where('id', '=', e.id).execute();
    await o.tx
      .insertInto('predict_position')
      .values({ event_id: e.id, rest_id: o.rest.id, yes: next.yes, no: next.no, net_cost: net })
      .onConflict((oc) =>
        oc.columns(['event_id', 'rest_id']).doUpdateSet({
          yes: next.yes,
          no: next.no,
          net_cost: sql<number>`predict_position.net_cost + ${net}`,
        }),
      )
      .execute();
    await o.tx
      .insertInto('predict_trade')
      .values({
        event_id: e.id,
        rest_id: o.rest.id,
        side: b.side,
        dir: b.dir,
        qty: b.qty,
        amount: q.amount,
        fee: q.fee,
        price_after: q.priceAfter,
        created_at: o.now,
      })
      .execute();
    restLog(o, 'predict.trade', {
      title: e.title,
      side: b.side,
      dir: b.dir,
      qty: b.qty,
      amount: q.amount,
      fee: q.fee,
    });
    return {
      side: b.side,
      dir: b.dir,
      qty: b.qty,
      amount: q.amount,
      fee: q.fee,
      total: q.total,
      price: q.priceAfter,
      yes: next.yes,
      no: next.no,
    };
  }

  const EVENT_COLS = [
    'e.id',
    'e.title',
    'e.description',
    'e.b',
    'e.unit',
    'e.q_yes',
    'e.q_no',
    'e.p0',
    'e.open_at',
    'e.close_at',
    'e.status',
    'e.outcome',
    'p.yes',
    'p.no',
    'p.net_cost',
  ] as const;

  type Row = {
    id: string;
    title: string;
    b: number;
    unit: number;
    q_yes: number;
    q_no: number;
    close_at: Date;
    status: PredictStatus;
    outcome: boolean | null;
    yes: number | null;
    no: number | null;
    net_cost: number | null;
  };

  const toDto = (r: Row, now: Date): PredictEventDto => {
    const p = { yes: r.yes ?? 0, no: r.no ?? 0, net_cost: Number(r.net_cost ?? 0) };
    return {
      id: Number(r.id),
      title: r.title,
      price: lmsrPrice(r.q_yes, r.q_no, r.b),
      closeAt: r.close_at.toISOString(),
      status: shownStatus(r.status, r.close_at, now),
      outcome: r.outcome,
      yes: p.yes,
      no: p.no,
      netCost: p.net_cost,
      payout: payoutOf(r, p),
    };
  };

  const withPosition = (restId: number) =>
    d.db
      .selectFrom('predict_event as e')
      .leftJoin('predict_position as p', (j) => j.onRef('p.event_id', '=', 'e.id').on('p.rest_id', '=', restId));

  async function list(ctx: RestCtx): Promise<PredictListDto> {
    const s = await d.shards.ensureFeature(ctx.shardId, 'predict');
    const t = s.tuning.predict;
    const now = d.now();
    const rest = await d.db
      .selectFrom('restaurant')
      .select('level')
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const r = await eligibility({ db: d.db, level: rest.level, accountId: ctx.accountId, now, t });
    const since = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
    const rows = (await withPosition(ctx.restaurantId)
      .select(EVENT_COLS)
      .where('e.shard_id', '=', ctx.shardId)
      .where((eb) =>
        eb.or([
          eb('e.status', '=', 'open'),
          eb.and([
            eb('p.rest_id', 'is not', null),
            eb.or([eb('e.status', '=', 'closed'), eb(sql`coalesce(e.resolved_at, e.close_at)`, '>=', since)]),
          ]),
        ]),
      )
      .orderBy('e.close_at', 'asc')
      .orderBy('e.id', 'asc')
      .execute()) as Row[];
    return {
      eligible: r === null,
      reason: r === null ? null : REASON[r]!,
      need: { level: t.minLevel, days: t.minAccountDays },
      feeRate: t.feeRate,
      maxHold: t.maxHold,
      maxTrade: t.maxTrade,
      events: rows.map((x) => toDto(x, now)),
    };
  }

  async function detail(ctx: RestCtx, id: number): Promise<PredictDetailDto> {
    await d.shards.ensureFeature(ctx.shardId, 'predict');
    const now = d.now();
    const r = (await withPosition(ctx.restaurantId)
      .select(EVENT_COLS)
      .where('e.id', '=', String(id))
      .where('e.shard_id', '=', ctx.shardId)
      .executeTakeFirst()) as (Row & { description: string; p0: number; open_at: Date }) | undefined;
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'predict_event', id });
    const trades = await d.db
      .selectFrom('predict_trade')
      .select(['side', 'dir', 'qty', 'amount', 'created_at'])
      .where('event_id', '=', r.id)
      .orderBy('id', 'desc')
      .limit(20)
      .execute();
    const points = await d.db
      .selectFrom('predict_trade')
      .select('price_after')
      .where('event_id', '=', r.id)
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    return {
      event: {
        ...toDto(r, now),
        description: r.description,
        b: r.b,
        unit: r.unit,
        qYes: r.q_yes,
        qNo: r.q_no,
        openAt: r.open_at.toISOString(),
      },
      trades: trades.map((x) => ({
        side: x.side,
        dir: x.dir,
        qty: x.qty,
        amount: Number(x.amount),
        createdAt: x.created_at.toISOString(),
      })),
      points: [r.p0, ...points.map((x) => x.price_after).reverse()],
    };
  }

  return {
    list,
    detail,
    trade: (ctx: RestCtx, id: number, b: { side: PredictSide; dir: PredictDir; qty: number }) =>
      runOp(d, ctx, { feature: 'predict', source: 'predict' }, (o) => trade(o, id, b)),
  };
}
export type PredictService = ReturnType<typeof createPredictService>;
```

（价格走势超过 100 笔时，第一个点仍是初始价格，后面是最近 100 笔。）

- [ ] **Step 5: 路由和接线**

`apps/server/src/modules/predict/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { predictTradeBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { PredictService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function predictRoutes(svc: PredictService): FastifyPluginAsync {
  return async (r) => {
    r.get('/predict/events', async (req) => ok(await svc.list(restCtxOf(req))));
    r.get('/predict/events/:id', async (req) =>
      ok(await svc.detail(restCtxOf(req), parse(idParam, req.params).id)),
    );
    r.post('/predict/events/:id/trade', async (req) =>
      okOp(await svc.trade(restCtxOf(req), parse(idParam, req.params).id, parse(predictTradeBody, req.body))),
    );
  };
}
```

`apps/server/src/game.ts`：仿照 `exchange`——import `createPredictService, type PredictService`；`Game` 接口加 `predict: PredictService;`；创建处加 `predict: createPredictService(deps),`。

`apps/server/src/modules/index.ts`：import `predictRoutes`，在 exchange 那一行之后加 `app.register(predictRoutes(game.predict), { prefix: '/api/v1' });`。

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/predict && pnpm -F @dt/server typecheck`
Expected: PASS（schema 2 + trade 9）；tsc 没有错误。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/modules/predict apps/server/src/game.ts apps/server/src/modules/index.ts
git commit -m "feat: 事件合约买卖、列表、详情（238-1）"
```

---

### Task 4: 截止、结算任务和后台

**Files:**
- Create: `apps/server/src/modules/predict/jobs.ts`
- Create: `apps/server/src/modules/predict/admin.ts`
- Modify: `apps/server/src/game.ts`（jobs）
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `apps/server/src/modules/admin/permissions.test.ts`
- Test: `apps/server/src/modules/predict/settle.test.ts`、`apps/server/src/modules/predict/admin.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `payoutOf`、`newEvent`、`game.predict`；`writeAudit`、`runSystemOp`、`gainCoin`、`restLog`。
- Produces:
  - `closeEvents(d: GameDeps, shardId: number, now: Date): Promise<{ closed: number }>`
  - `settleEvents(d: GameDeps, shardId: number, now: Date): Promise<{ settled: number }>`
  - `predictJobs(d: GameDeps): PeriodicJob[]`
  - `createPredictAdmin(game: Game)` → `{ create(actor, body), list(shardId), resolve(actor, id, outcome), voidEvent(actor, id) }`
  - 后台路由 `GET /admin/predict?shardId`（mod）、`POST /admin/predict`（mod）、`POST /admin/predict/:id/resolve`（admin）、`POST /admin/predict/:id/void`（admin）

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/predict/settle.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { trader } from '../exchange/test';
import { createPredictAdmin } from './admin';
import { closeEvents, settleEvents } from './jobs';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.predict;
const admin = () => createPredictAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'admin' as const, ip: '127.0.0.1' };
const coin = async (restId: number) => Number((await restRow(t, restId)).coin);
const ev = (id: number) =>
  t.db.selectFrom('predict_event').selectAll().where('id', '=', String(id)).executeTakeFirstOrThrow();

describe('截止（238-1 设计 §6.2）', () => {
  it('到时间的 open 事件改为 closed，没到的不动', async () => {
    const shardId = await createShard(t.db);
    const due = await newEvent(t, shardId, { closeInMs: 1_000 });
    const later = await newEvent(t, shardId, { closeInMs: 3_600_000 });
    t.clock.advance(2_000);
    expect(await closeEvents(t.deps, shardId, t.clock.now)).toEqual({ closed: 1 });
    expect((await ev(due)).status).toBe('closed');
    expect((await ev(later)).status).toBe('open');
  });
});

describe('判定和结算（238-1 设计 §6.3、§6.4）', () => {
  it('判定为是：押"是"的按 unit × 份数到账，押"否"的没有；写日志；全部结算完写 settled_at', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 7 });
    await svc().trade(b, id, { side: 'no', dir: 'buy', qty: 4 });
    const [ca, cb] = [await coin(a.restaurantId), await coin(b.restaurantId)];
    await admin().resolve(actor, id, true);
    expect(await settleEvents(t.deps, shardId, t.clock.now)).toEqual({ settled: 2 });
    expect(await coin(a.restaurantId)).toBe(ca + 7000);
    expect(await coin(b.restaurantId)).toBe(cb);
    const logs = await t.db.selectFrom('rest_log').select(['rest_id', 'type']).where('type', '=', 'predict.settle').where('rest_id', 'in', [a.restaurantId, b.restaurantId]).execute();
    expect(logs).toEqual([{ rest_id: a.restaurantId, type: 'predict.settle' }]);
    expect((await ev(id)).settled_at).not.toBeNull();
    expect(await settleEvents(t.deps, shardId, t.clock.now)).toEqual({ settled: 0 });
    expect(await coin(a.restaurantId)).toBe(ca + 7000);
  });

  it('作废：退净投入，净投入为负的不退', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const bought = (await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 10 })).data.total;
    await svc().trade(b, id, { side: 'no', dir: 'buy', qty: 1 });
    await t.db.updateTable('predict_position').set({ net_cost: -500 }).where('rest_id', '=', b.restaurantId).execute();
    const [ca, cb] = [await coin(a.restaurantId), await coin(b.restaurantId)];
    await admin().voidEvent(actor, id);
    await settleEvents(t.deps, shardId, t.clock.now);
    expect(await coin(a.restaurantId)).toBe(ca + bought);
    expect(await coin(b.restaurantId)).toBe(cb);
    const refund = await t.db.selectFrom('rest_log').select('type').where('rest_id', '=', a.restaurantId).where('type', '=', 'predict.refund').execute();
    expect(refund).toHaveLength(1);
  });

  it('并发跑两次结算，每人只发一次（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const ts = [];
    for (let i = 0; i < 4; i++) ts.push(await trader(t, { shardId, coin: 1_000_000 }));
    for (const x of ts) await svc().trade(x, id, { side: 'no', dir: 'buy', qty: 2 });
    const before = await Promise.all(ts.map((x) => coin(x.restaurantId)));
    await admin().resolve(actor, id, false);
    await Promise.all([settleEvents(t.deps, shardId, t.clock.now), settleEvents(t.deps, shardId, t.clock.now)]);
    const after = await Promise.all(ts.map((x) => coin(x.restaurantId)));
    expect(after.map((c, i) => c - before[i]!)).toEqual([2000, 2000, 2000, 2000]);
  });

  it('改区服 unit 后结算仍按事件的 unit（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { unit: 1000 });
    const a = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 3 });
    await setTuning(t, shardId, { predict: { unit: 9999 } });
    const c = await coin(a.restaurantId);
    await admin().resolve(actor, id, true);
    await settleEvents(t.deps, shardId, t.clock.now);
    expect(await coin(a.restaurantId)).toBe(c + 3000);
  });

  it('判定后再判定、作废都报 predict_final；判定可以在截止前做', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    await admin().resolve(actor, id, true);
    await expect(admin().resolve(actor, id, false)).rejects.toMatchObject({ params: { reason: 'predict_final' } });
    await expect(admin().voidEvent(actor, id)).rejects.toMatchObject({ params: { reason: 'predict_final' } });
    const audit = await t.db.selectFrom('audit_log').select('action').where('target', '=', `predict_event:${id}`).execute();
    expect(audit.map((x) => x.action)).toEqual(['predict.resolve']);
  });

  it('守恒：随机买卖后判定结算，玩家银币变化合计 = −(净成交额 + 手续费 − 结算支出)', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { p0: 0.4 });
    const ts = [];
    for (let i = 0; i < 3; i++) ts.push(await trader(t, { shardId, coin: 20_000_000 }));
    const before = (await Promise.all(ts.map((x) => coin(x.restaurantId)))).reduce((s, c) => s + c, 0);
    const rng = seededRng(7);
    for (let i = 0; i < 30; i++) {
      const who = ts[Math.floor(rng.next() * ts.length)]!;
      const side = rng.next() < 0.5 ? 'yes' : 'no';
      const dir = rng.next() < 0.7 ? 'buy' : 'sell';
      const qty = 1 + Math.floor(rng.next() * 20);
      try {
        await svc().trade(who, id, { side, dir, qty });
      } catch (e) {
        // 卖出超过持有、买到持有上限都算正常的随机失败
        const x = (e as { params?: { reason?: string; what?: string } }).params;
        if (x?.reason !== 'predict_not_enough' && x?.what !== 'predict_hold') throw e;
      }
    }
    const tr = await t.db.selectFrom('predict_trade').select(['dir', 'amount', 'fee']).where('event_id', '=', String(id)).execute();
    const net = tr.reduce((s, x) => s + (x.dir === 'buy' ? 1 : -1) * Number(x.amount), 0);
    const fees = tr.reduce((s, x) => s + Number(x.fee), 0);
    const pos = await t.db.selectFrom('predict_position').select('yes').where('event_id', '=', String(id)).execute();
    const payout = 1000 * pos.reduce((s, x) => s + x.yes, 0);
    await admin().resolve(actor, id, true);
    await settleEvents(t.deps, shardId, t.clock.now);
    const after = (await Promise.all(ts.map((x) => coin(x.restaurantId)))).reduce((s, c) => s + c, 0);
    expect(after - before).toBe(-(net + fees - payout));
  });
});
```

`apps/server/src/modules/predict/admin.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { trader } from '../exchange/test';
import { createPredictAdmin } from './admin';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const admin = () => createPredictAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'mod' as const, ip: '127.0.0.1' };
const inHour = () => new Date(t.clock.now.getTime() + 3_600_000).toISOString();

describe('后台出题和列表（238-1 设计 §7.3）', () => {
  it('出题：开始时间为现在，b 默认 defaultB，unit 复制区服数值，初始概率生效；写审计日志', async () => {
    const shardId = await createShard(t.db);
    const { id } = await admin().create(actor, { shardId, title: '会下雨吗', description: '', closeAt: inHour(), p0: 80 });
    const e = await t.db.selectFrom('predict_event').selectAll().where('id', '=', String(id)).executeTakeFirstOrThrow();
    expect(e).toMatchObject({ shard_id: shardId, title: '会下雨吗', b: 100, unit: 1000, p0: 0.8, status: 'open', created_by: 1 });
    expect(e.open_at.getTime()).toBe(t.clock.now.getTime());
    expect(e.q_yes - e.q_no).toBeCloseTo(100 * Math.log(4), 9);
    const audit = await t.db.selectFrom('audit_log').select('action').where('target', '=', `predict_event:${id}`).execute();
    expect(audit).toEqual([{ action: 'predict.create' }]);
  });

  it('截止时间不晚于现在报 predict_close_at', async () => {
    const shardId = await createShard(t.db);
    await expect(
      admin().create(actor, { shardId, title: 'x', description: '', closeAt: t.clock.now.toISOString(), p0: 50 }),
    ).rejects.toMatchObject({ params: { reason: 'predict_close_at' } });
  });

  it('列表：最新在前；成交笔数、持仓人数、手续费、结果为是/否时系统收支', async () => {
    const shardId = await createShard(t.db);
    const { id } = await admin().create(actor, { shardId, title: 'A', description: '', closeAt: inHour(), p0: 50, b: 50 });
    const { id: id2 } = await admin().create(actor, { shardId, title: 'B', description: '', closeAt: inHour(), p0: 50 });
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const r1 = (await t.game.predict.trade(a, id, { side: 'yes', dir: 'buy', qty: 5 })).data;
    const r2 = (await t.game.predict.trade(a, id, { side: 'no', dir: 'buy', qty: 2 })).data;
    const rows = await admin().list(shardId);
    expect(rows.map((r) => r.id)).toEqual([id2, id]);
    expect(rows[1]).toMatchObject({
      title: 'A',
      status: 'open',
      trades: 2,
      holders: 1,
      fees: r1.fee + r2.fee,
      ifYes: r1.amount + r2.amount - 5000,
      ifNo: r1.amount + r2.amount - 2000,
    });
  });
});
```


`permissions.test.ts`：

1. `ids` 类型加 `predictId: number;`；在 `beforeAll` 里建好活动之后插一个事件：

```ts
  // 事件合约：判定、作废都能走到业务逻辑（管理员判定后，作废报 predict_final，也不是 404）
  const predict = await ctx.deps.db
    .insertInto('predict_event')
    .values({
      shard_id: shardId,
      title: '权限测试',
      b: 100,
      unit: 1000,
      p0: 0.5,
      open_at: new Date(),
      close_at: new Date(Date.now() + 3_600_000),
      status: 'open',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
```

   并在给 `ids` 赋值的地方加 `predictId: Number(predict.id),`。

2. `CASES` 在 `/api/v1/admin/exchange/maker` 一项之后加：

```ts
  {
    method: 'GET',
    route: '/api/v1/admin/predict',
    url: () => `/api/v1/admin/predict?shardId=${ids.shardId}`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/predict',
    url: () => '/api/v1/admin/predict',
    body: () => ({
      shardId: ids.shardId,
      title: '权限测试出题',
      closeAt: new Date(Date.now() + 3_600_000).toISOString(),
      p0: 50,
    }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/predict/:id/resolve',
    url: () => `/api/v1/admin/predict/${ids.predictId}/resolve`,
    body: () => ({ outcome: true }),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/predict/:id/void',
    url: () => `/api/v1/admin/predict/${ids.predictId}/void`,
    body: () => ({}),
    min: 'admin',
  },
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict apps/server/src/modules/admin/permissions.test.ts`
Expected: FAIL（`./admin`、`./jobs` 不存在；矩阵缺路由）。

- [ ] **Step 3: `jobs.ts`**

```ts
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { payoutOf } from './service';

const BATCH = 200;

/** 截止（238-1 设计 §6.2）：到时间的 open 事件改为 closed */
export async function closeEvents(d: GameDeps, shardId: number, now: Date): Promise<{ closed: number }> {
  const r = await d.db
    .updateTable('predict_event')
    .set({ status: 'closed' })
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('close_at', '<=', now)
    .executeTakeFirst();
  return { closed: Number(r.numUpdatedRows) };
}

/**
 * 结算（238-1 设计 §6.4）：已判定、已作废的事件，每个持仓单独一个事务（锁这家店），
 * 条件带 settled = false，重跑或并发也只发一次；不锁事件行（已是终态）。每次最多 200 个持仓
 */
export async function settleEvents(d: GameDeps, shardId: number, now: Date): Promise<{ settled: number }> {
  const events = await d.db
    .selectFrom('predict_event')
    .select(['id', 'title', 'status', 'outcome', 'unit'])
    .where('shard_id', '=', shardId)
    .where('status', 'in', ['resolved', 'void'])
    .where('settled_at', 'is', null)
    .orderBy('id')
    .execute();
  let settled = 0;
  for (const e of events) {
    if (settled >= BATCH) break;
    const todo = await d.db
      .selectFrom('predict_position')
      .select('rest_id')
      .where('event_id', '=', e.id)
      .where('settled', '=', false)
      .orderBy('rest_id')
      .limit(BATCH - settled)
      .execute();
    for (const { rest_id } of todo) {
      const done = await runSystemOp(d, shardId, rest_id, { source: 'predict.settle', now }, async (o) => {
        const p = await o.tx
          .updateTable('predict_position')
          .set({ settled: true })
          .where('event_id', '=', e.id)
          .where('rest_id', '=', rest_id)
          .where('settled', '=', false)
          .returning(['yes', 'no', 'net_cost'])
          .executeTakeFirst();
        if (!p) return false;
        const got = payoutOf(e, { yes: p.yes, no: p.no, net_cost: Number(p.net_cost) }) ?? 0;
        if (got > 0) {
          gainCoin(o, got, { source: 'predict' });
          if (e.status === 'void') restLog(o, 'predict.refund', { title: e.title, coin: got });
          else restLog(o, 'predict.settle', { title: e.title, outcome: e.outcome, coin: got });
        }
        return true;
      });
      if (done) settled++;
    }
    const left = await d.db
      .selectFrom('predict_position')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('event_id', '=', e.id)
      .where('settled', '=', false)
      .executeTakeFirstOrThrow();
    if (Number(left.n) === 0)
      await d.db
        .updateTable('predict_event')
        .set({ settled_at: now })
        .where('id', '=', e.id)
        .where('settled_at', 'is', null)
        .execute();
  }
  return { settled };
}

/** 每分钟一次；挂在 restaurant 上，区服关掉事件合约时也照常截止、结算 */
export function predictJobs(d: GameDeps): PeriodicJob[] {
  const minute = (now: Date) => now.toISOString().slice(0, 16);
  return [
    { name: 'predict-close', feature: 'restaurant', period: minute, run: ({ shardId, now }) => closeEvents(d, shardId, now) },
    { name: 'predict-settle', feature: 'restaurant', period: minute, run: ({ shardId, now }) => settleEvents(d, shardId, now) },
  ];
}
```

`game.ts`：import `predictJobs`，在 `jobs.push(...exchangeJobs(deps));` 之后加 `jobs.push(...predictJobs(deps));`。

- [ ] **Step 4: `admin.ts`**

```ts
import { sql } from 'kysely';
import { initialShares, lmsrPrice, type PredictAdminRow, type PredictStatus } from '@dt/shared';
import { invalidState } from '../../core/errors';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { ErrorCode } from '@dt/shared';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';

const LIMIT = 100;

/** 事件合约后台（238-1 设计 §6.3、§7.3）：出题、列表、判定、作废 */
export function createPredictAdmin(game: Game) {
  const db = game.app.db;

  async function create(
    actor: AdminActor,
    b: { shardId: number; title: string; description: string; closeAt: string; p0: number; b?: number },
  ): Promise<{ id: number }> {
    const now = game.deps.now();
    const closeAt = new Date(b.closeAt);
    if (closeAt <= now) throw invalidState('predict_close_at');
    const t = (await game.deps.shards.settings(b.shardId)).tuning.predict;
    const liq = b.b ?? t.defaultB;
    const p0 = b.p0 / 100;
    const s = initialShares(p0, liq);
    return db.transaction().execute(async (tx) => {
      const r = await tx
        .insertInto('predict_event')
        .values({
          shard_id: b.shardId,
          title: b.title,
          description: b.description,
          b: liq,
          unit: t.unit,
          q_yes: s.y,
          q_no: s.n,
          p0,
          open_at: now,
          close_at: closeAt,
          status: 'open',
          created_by: actor.accountId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await writeAudit(tx, {
        actor,
        action: 'predict.create',
        target: `predict_event:${r.id}`,
        detail: { shardId: b.shardId, title: b.title, p0: b.p0, b: liq, closeAt: b.closeAt },
      });
      return { id: Number(r.id) };
    });
  }

  async function list(shardId: number): Promise<PredictAdminRow[]> {
    const rows = await db
      .selectFrom('predict_event as e')
      .leftJoin('account as a', 'a.id', 'e.created_by')
      .select([
        'e.id',
        'e.title',
        'e.status',
        'e.outcome',
        'e.close_at',
        'e.q_yes',
        'e.q_no',
        'e.b',
        'e.unit',
        'a.username as creator',
        sql<string>`(select count(*) from predict_trade t where t.event_id = e.id)`.as('trades'),
        sql<string>`(select count(*) from predict_position p where p.event_id = e.id and (p.yes > 0 or p.no > 0))`.as('holders'),
        sql<string>`(select coalesce(sum(t.fee), 0) from predict_trade t where t.event_id = e.id)`.as('fees'),
        sql<string>`(select coalesce(sum(case when t.dir = 'buy' then t.amount else -t.amount end), 0) from predict_trade t where t.event_id = e.id)`.as('net'),
        sql<string>`(select coalesce(sum(p.yes), 0) from predict_position p where p.event_id = e.id)`.as('yes'),
        sql<string>`(select coalesce(sum(p.no), 0) from predict_position p where p.event_id = e.id)`.as('no'),
      ])
      .where('e.shard_id', '=', shardId)
      .orderBy('e.id', 'desc')
      .limit(LIMIT)
      .execute();
    const now = game.deps.now();
    return rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      status: (r.status === 'open' && r.close_at <= now ? 'closed' : r.status) as PredictStatus,
      outcome: r.outcome,
      closeAt: r.close_at.toISOString(),
      price: lmsrPrice(r.q_yes, r.q_no, r.b),
      trades: Number(r.trades),
      holders: Number(r.holders),
      fees: Number(r.fees),
      ifYes: Number(r.net) - r.unit * Number(r.yes),
      ifNo: Number(r.net) - r.unit * Number(r.no),
      creator: r.creator ?? null,
    }));
  }

  /** 判定 / 作废：只在短事务里锁事件行改状态；发钱由结算任务做 */
  async function finish(actor: AdminActor, id: number, set: { status: 'resolved' | 'void'; outcome: boolean | null }) {
    const now = game.deps.now();
    await db.transaction().execute(async (tx) => {
      const e = await tx
        .selectFrom('predict_event')
        .select(['status', 'title'])
        .where('id', '=', String(id))
        .forUpdate()
        .executeTakeFirst();
      if (!e) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'predict_event', id });
      if (e.status !== 'open' && e.status !== 'closed') throw invalidState('predict_final');
      await tx
        .updateTable('predict_event')
        .set({ status: set.status, outcome: set.outcome, resolved_at: now })
        .where('id', '=', String(id))
        .execute();
      await writeAudit(tx, {
        actor,
        action: set.status === 'resolved' ? 'predict.resolve' : 'predict.void',
        target: `predict_event:${id}`,
        detail: { title: e.title, ...(set.status === 'resolved' ? { outcome: set.outcome } : {}) },
      });
    });
    return { ok: true as const };
  }

  return {
    create,
    list,
    resolve: (actor: AdminActor, id: number, outcome: boolean) => finish(actor, id, { status: 'resolved', outcome }),
    voidEvent: (actor: AdminActor, id: number) => finish(actor, id, { status: 'void', outcome: null }),
  };
}
```

（`@dt/shared` 的两条 import 合并成一条。）

- [ ] **Step 5: 后台路由**

`apps/server/src/modules/admin/routes.ts`：import `predictCreateBody, predictResolveBody`（`@dt/shared`）和 `createPredictAdmin`（`../predict/admin`）；在交易所那一段之后加：

```ts
    const predictAdmin = createPredictAdmin(game);
    const predictId = z.object({ id: z.coerce.number().int().positive() });
    r.get('/predict', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await predictAdmin.list(parse(suspiciousQuery, req.query).shardId));
    });
    r.post('/predict', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await predictAdmin.create(a, parse(predictCreateBody, req.body)));
    });
    r.post('/predict/:id/resolve', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const { id } = parse(predictId, req.params);
      return ok(await predictAdmin.resolve(a, id, parse(predictResolveBody, req.body).outcome));
    });
    r.post('/predict/:id/void', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await predictAdmin.voidEvent(a, parse(predictId, req.params).id));
    });
```

（如果 `routes.ts` 还没有 import `z`，从 `zod` 引入。）

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/predict apps/server/src/modules/admin/permissions.test.ts && pnpm -F @dt/server typecheck`
Expected: PASS；tsc 没有错误。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/modules/predict apps/server/src/game.ts apps/server/src/modules/admin
git commit -m "feat: 事件合约截止、结算任务和后台出题判定（238-1）"
```

---

### Task 5: 玩家"预测"页

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`
- Create: `apps/web/src/views/PredictView.vue`
- Create: `apps/web/src/views/PredictView.test.ts`
- Modify: `apps/web/src/router.ts`、`apps/web/src/components/MoreLinks.vue`
- Modify: `apps/web/src/i18n/zh-CN.ts`、`apps/web/src/utils/events.ts`、`apps/web/src/utils/events.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `predictQuote`、`predictPercent`、DTO；Task 3 的接口。
- Produces: `endpoints.predictList()`、`endpoints.predictDetail(id)`、`endpoints.predictTrade(id, body)`；testid `pd-event-<id>`、`pd-ended-<id>`、`pd-detail`、`pd-side-yes|no`、`pd-dir-buy|sell`、`pd-qty`、`pd-quote`、`pd-submit`、`pd-reason`、`pd-chart`、`pd-hold`。

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/PredictView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import PredictView from './PredictView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { predictList: vi.fn(), predictDetail: vi.fn(), predictTrade: vi.fn() },
}));

const ev = (p: Partial<PredictListDto['events'][number]> = {}) => ({
  id: 1,
  title: '明天会下雨吗',
  price: 0.634,
  closeAt: '2026-10-03T12:00:00.000Z',
  status: 'open' as const,
  outcome: null,
  yes: 0,
  no: 0,
  netCost: 0,
  payout: null,
  ...p,
});
const list = (p: Partial<PredictListDto> = {}): PredictListDto => ({
  eligible: true,
  reason: null,
  need: { level: 20, days: 7 },
  feeRate: 0.02,
  maxHold: 200,
  maxTrade: 100,
  events: [ev(), ev({ id: 2, title: '已结束的', status: 'resolved', outcome: true, yes: 3, netCost: 1600, payout: 3000 })],
  ...p,
});
const detail: PredictDetailDto = {
  event: { ...ev({ yes: 4 }), description: '以 12 点天气为准', b: 100, unit: 1000, qYes: 55, qNo: 0, openAt: '2026-10-02T00:00:00.000Z' },
  trades: [{ side: 'yes', dir: 'buy', qty: 2, amount: 1100, createdAt: '2026-10-02T01:00:00.000Z' }],
  points: [0.5, 0.55, 0.634],
};

describe('PredictView（238-1 设计 §7.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictList).mockResolvedValue(list());
    vi.mocked(endpoints.predictDetail).mockResolvedValue(detail);
  });

  it('列表：进行中显示概率；已结束显示结果和盈亏', async () => {
    const w = mount(PredictView);
    await flushPromises();
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('明天会下雨吗');
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('63%');
    const ended = w.get('[data-testid="pd-ended-2"]').text();
    expect(ended).toContain('结果：是');
    expect(ended).toContain('+1,400');
  });

  it('详情：说明、走势、持仓；输入份数显示预估花费', async () => {
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.predictDetail).toHaveBeenCalledWith(1);
    expect(w.get('[data-testid="pd-detail"]').text()).toContain('以 12 点天气为准');
    expect(w.find('[data-testid="pd-chart"] polyline').exists()).toBe(true);
    expect(w.get('[data-testid="pd-hold"]').text()).toContain('是 4 份');
    await w.get('[data-testid="pd-qty"]').setValue('10');
    const q = predictQuote({ y: 55, n: 0, b: 100 }, 'yes', 'buy', 10, { unit: 1000, feeRate: 0.02 });
    expect(w.get('[data-testid="pd-quote"]').text()).toContain(q.total.toLocaleString('en-US'));
  });

  it('提交：调用接口、提示、刷新', async () => {
    vi.mocked(endpoints.predictTrade).mockResolvedValue({
      side: 'no',
      dir: 'buy',
      qty: 3,
      amount: 1200,
      fee: 24,
      total: 1224,
      price: 0.6,
      yes: 4,
      no: 3,
    });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pd-side-no"]').trigger('click');
    await w.get('[data-testid="pd-qty"]').setValue('3');
    await w.get('[data-testid="pd-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.predictTrade).toHaveBeenCalledWith(1, { side: 'no', dir: 'buy', qty: 3 });
    expect(useToastStore().items.at(-1)?.text).toContain('买入否 3 份，花费 1,224 银币');
    expect(endpoints.predictList).toHaveBeenCalledTimes(2);
  });

  it('门槛不满足：显示原因，提交禁用', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ eligible: false, reason: 'predict_level' }));
    const w = mount(PredictView);
    await flushPromises();
    expect(w.get('[data-testid="pd-reason"]').text()).toContain('餐厅 20 级');
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
  });
});
```


`apps/web/src/utils/events.test.ts` 的交易所日志用例之后加：

```ts
  it('事件合约日志（238-1）', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) => logText({ type, params, at: '' }, names);
    expect(log('predict.trade', { title: '会下雨吗', side: 'yes', dir: 'buy', qty: 3, amount: 1500, fee: 30 })).toBe(
      '预测「会下雨吗」买入是 3 份，成交额 1,500，手续费 30',
    );
    expect(log('predict.settle', { title: '会下雨吗', outcome: true, coin: 3000 })).toBe(
      '预测「会下雨吗」结果为是，结算得到 3,000 银币',
    );
    expect(log('predict.refund', { title: '会下雨吗', coin: 1530 })).toBe('预测「会下雨吗」已作废，退回 1,530 银币');
  });
```

（`logText` 已在这个测试文件顶部 import。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/views/PredictView.test.ts apps/web/src/utils/events.test.ts`
Expected: FAIL（`PredictView.vue` 不存在；日志文案缺失）。

- [ ] **Step 3: 接口、路由、入口、文案**

`endpoints.ts`（`tradeWithdraw` 之后；type import 补 `PredictDetailDto, PredictListDto, PredictTradeDto`）：

```ts
  predictList: () => api.get<PredictListDto>('/api/v1/predict/events'),
  predictDetail: (id: number) => api.get<PredictDetailDto>(`/api/v1/predict/events/${id}`),
  predictTrade: (id: number, b: { side: 'yes' | 'no'; dir: 'buy' | 'sell'; qty: number }) =>
    api.post<PredictTradeDto>(`/api/v1/predict/events/${id}/trade`, b),
```

`router.ts` 的 `/exchange` 之后：

```ts
  {
    path: '/predict',
    name: 'predict',
    component: () => import('./views/PredictView.vue'),
    meta: { needRestaurant: true },
  },
```

`MoreLinks.vue` 交易所之后：`{ to: '/predict', icon: 'bi-bar-chart-steps', label: '事件预测' },`

`zh-CN.ts`：

- `REQUIREMENT` 加：
  ```ts
  predict_level: (p) => `餐厅 ${String(p.need)} 级才能参与预测`,
  predict_age: (p) => `账号注册满 ${String(p.days)} 天才能参与预测`,
  predict_email: () => '验证邮箱后才能参与预测',
  ```
- `LIMIT` 加：
  ```ts
  predict_trade: (p) => `每笔最多 ${String(p.max)} 份`,
  predict_hold: (p) => `每个事件每一边最多持有 ${String(p.max)} 份`,
  ```
- `STATE` 加：
  ```ts
  predict_closed: '这个事件已经停止交易',
  predict_not_enough: '持有的份数不够',
  predict_final: '这个事件已经判定或作废了',
  predict_close_at: '截止时间要晚于现在',
  ```

`events.ts` 的 `LOGS` 里 `'exchange.withdraw'` 之后加：

```ts
  'predict.trade': (p) =>
    `预测「${String(p.title ?? '')}」${p.dir === 'sell' ? '卖出' : '买入'}${p.side === 'no' ? '否' : '是'} ${n(p, 'qty')} 份，成交额 ${formatNum(n(p, 'amount'))}，手续费 ${formatNum(n(p, 'fee'))}`,
  'predict.settle': (p) =>
    `预测「${String(p.title ?? '')}」结果为${p.outcome ? '是' : '否'}，结算得到 ${formatNum(n(p, 'coin'))} 银币`,
  'predict.refund': (p) => `预测「${String(p.title ?? '')}」已作废，退回 ${formatNum(n(p, 'coin'))} 银币`,
```

- [ ] **Step 4: `PredictView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  predictPercent,
  predictQuote,
  type PredictDetailDto,
  type PredictEventDto,
  type PredictListDto,
} from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/** 事件预测（238-1 设计 §7.2）：用银币买卖"是/否"份额，系统按公式报价 */
const toast = useToastStore();
const list = ref<PredictListDto | null>(null);
const detail = ref<PredictDetailDto | null>(null);
const selected = ref<number | null>(null);
const side = ref<'yes' | 'no'>('yes');
const dir = ref<'buy' | 'sell'>('buy');
const qty = ref<number | ''>(1);
const busy = ref(false);

const open = computed(() => list.value?.events.filter((e) => e.status === 'open') ?? []);
const ended = computed(() => list.value?.events.filter((e) => e.status !== 'open') ?? []);
const REASON: Record<string, (n: { level: number; days: number }) => string> = {
  predict_level: (n) => `餐厅 ${n.level} 级才能参与预测`,
  predict_age: (n) => `账号注册满 ${n.days} 天才能参与预测`,
  predict_email: () => '验证邮箱后才能参与预测',
};
const reasonText = computed(() => {
  const l = list.value;
  return l && l.reason ? (REASON[l.reason]?.(l.need) ?? l.reason) : '';
});
const STATUS = { open: '进行中', closed: '等待判定', resolved: '已判定', void: '已作废' } as const;
const resultText = (e: PredictEventDto) =>
  e.status === 'resolved' ? `结果：${e.outcome ? '是' : '否'}` : STATUS[e.status];
const profit = (e: PredictEventDto) => (e.payout === null ? null : e.payout - e.netCost);
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const leftText = (closeAt: string) => {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return '已截止';
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? `还剩 ${Math.floor(m / 60)} 小时 ${m % 60} 分` : `还剩 ${m} 分`;
};

const quote = computed(() => {
  const d = detail.value;
  const l = list.value;
  const k = Number(qty.value);
  if (!d || !l || !Number.isInteger(k) || k < 1) return null;
  const held = side.value === 'yes' ? d.event.yes : d.event.no;
  if (dir.value === 'sell' && k > held) return null;
  return predictQuote({ y: d.event.qYes, n: d.event.qNo, b: d.event.b }, side.value, dir.value, k, {
    unit: d.event.unit,
    feeRate: l.feeRate,
  });
});
/** 按当前价把持仓全部卖出约能拿回多少（两边分别按当前状态算） */
const sellAll = computed(() => {
  const d = detail.value;
  const l = list.value;
  if (!d || !l) return 0;
  const s = { y: d.event.qYes, n: d.event.qNo, b: d.event.b };
  const t = { unit: d.event.unit, feeRate: l.feeRate };
  return (
    (d.event.yes > 0 ? predictQuote(s, 'yes', 'sell', d.event.yes, t).total : 0) +
    (d.event.no > 0 ? predictQuote(s, 'no', 'sell', d.event.no, t).total : 0)
  );
});
const chart = computed(() => {
  const pts = detail.value?.points ?? [];
  if (pts.length === 0) return '';
  const w = 300;
  const h = 60;
  const step = pts.length > 1 ? w / (pts.length - 1) : 0;
  return pts.map((p, i) => `${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`).join(' ');
});

async function loadList() {
  try {
    list.value = await endpoints.predictList();
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function pick(id: number) {
  selected.value = id;
  try {
    const d = await endpoints.predictDetail(id);
    if (selected.value === id) detail.value = d;
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function submit() {
  if (selected.value === null || quote.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.predictTrade(selected.value, {
      side: side.value,
      dir: dir.value,
      qty: Number(qty.value),
    });
    toast.push(
      `${r.dir === 'buy' ? '买入' : '卖出'}${r.side === 'yes' ? '是' : '否'} ${r.qty} 份，${r.dir === 'buy' ? '花费' : '得到'} ${formatNum(r.total)} 银币`,
    );
    await loadList();
    await pick(selected.value);
  } catch (e) {
    toast.push(errorMessage(e, '交易失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => void loadList());
</script>

<template>
  <h5>事件预测</h5>
  <div class="small text-muted mb-2">
    买"是"或"否"，结算时押对的一边每份得 1,000 银币；价格就是大家认为发生的概率，随买卖涨跌，截止前随时可以卖出。
  </div>
  <div v-if="reasonText" class="alert alert-warning py-1 small" data-testid="pd-reason">{{ reasonText }}</div>

  <h6 class="dt-section">进行中</h6>
  <div v-if="list && open.length === 0" class="small text-muted mb-3">现在没有进行中的事件</div>
  <button
    v-for="e in open"
    :key="e.id"
    type="button"
    :class="['dt-card w-100 text-start mb-2', e.id === selected ? 'border-primary' : '']"
    :data-testid="`pd-event-${e.id}`"
    @click="pick(e.id)"
  >
    <div class="d-flex align-items-center gap-2">
      <b class="flex-fill">{{ e.title }}</b>
      <span class="text-success">是 {{ predictPercent(e.price) }}%</span>
    </div>
    <div class="small text-muted">
      {{ leftText(e.closeAt) }}
      <span v-if="e.yes > 0 || e.no > 0"> · 我持有 是 {{ e.yes }} / 否 {{ e.no }}</span>
    </div>
  </button>

  <div v-if="detail && selected !== null" class="dt-card mb-3" data-testid="pd-detail">
    <b>{{ detail.event.title }}</b>
    <div v-if="detail.event.description" class="small text-muted">{{ detail.event.description }}</div>
    <div class="d-flex gap-3 my-1">
      <span class="text-success">是 {{ predictPercent(detail.event.price) }}%</span>
      <span class="text-danger">否 {{ 100 - predictPercent(detail.event.price) }}%</span>
      <span class="small text-muted ms-auto">截止 {{ new Date(detail.event.closeAt).toLocaleString('zh-CN') }}</span>
    </div>
    <svg data-testid="pd-chart" viewBox="0 0 300 60" class="w-100 mb-2" style="height: 60px">
      <polyline :points="chart" fill="none" stroke="currentColor" stroke-width="1.5" class="text-success" />
    </svg>
    <div class="small mb-2" data-testid="pd-hold">
      我持有：是 {{ detail.event.yes }} 份、否 {{ detail.event.no }} 份
      <span v-if="sellAll > 0" class="text-muted">（按当前价全部卖出约 {{ formatNum(sellAll) }} 银币）</span>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center small">
      <div class="btn-group btn-group-sm">
        <button
          type="button"
          :class="['btn', side === 'yes' ? 'btn-success' : 'btn-outline-success']"
          data-testid="pd-side-yes"
          @click="side = 'yes'"
        >
          是
        </button>
        <button
          type="button"
          :class="['btn', side === 'no' ? 'btn-danger' : 'btn-outline-danger']"
          data-testid="pd-side-no"
          @click="side = 'no'"
        >
          否
        </button>
      </div>
      <div class="btn-group btn-group-sm">
        <button
          type="button"
          :class="['btn', dir === 'buy' ? 'btn-primary' : 'btn-outline-primary']"
          data-testid="pd-dir-buy"
          @click="dir = 'buy'"
        >
          买入
        </button>
        <button
          type="button"
          :class="['btn', dir === 'sell' ? 'btn-primary' : 'btn-outline-primary']"
          data-testid="pd-dir-sell"
          @click="dir = 'sell'"
        >
          卖出
        </button>
      </div>
      <input
        v-model.number="qty"
        type="number"
        min="1"
        :max="list?.maxTrade"
        class="form-control form-control-sm"
        style="width: 6rem"
        data-testid="pd-qty"
      />
      份
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="busy || !list?.eligible || quote === null"
        data-testid="pd-submit"
        @click="submit"
      >
        确定
      </button>
    </div>
    <div class="small text-muted mt-1" data-testid="pd-quote">
      <template v-if="quote">
        {{ dir === 'buy' ? '预计花费' : '预计得到' }} {{ formatNum(quote.total) }} 银币（含手续费
        {{ formatNum(quote.fee) }}），成交后"是" {{ predictPercent(quote.priceAfter) }}%
      </template>
      <template v-else>输入份数（卖出不能超过持有）</template>
    </div>
    <h6 class="dt-section mt-2">最近成交</h6>
    <div v-if="detail.trades.length === 0" class="small text-muted">还没有成交</div>
    <div v-for="(x, i) in detail.trades" :key="i" class="small border-bottom py-1">
      {{ x.dir === 'buy' ? '买入' : '卖出' }}{{ x.side === 'yes' ? '是' : '否' }} {{ x.qty }} 份，成交额
      {{ formatNum(x.amount) }}
    </div>
  </div>

  <template v-if="ended.length > 0">
    <h6 class="dt-section">已结束</h6>
    <div v-for="e in ended" :key="e.id" class="small border-bottom py-1" :data-testid="`pd-ended-${e.id}`">
      <b>{{ e.title }}</b> · {{ resultText(e) }} · 持有 是 {{ e.yes }} / 否 {{ e.no }}
      <span v-if="profit(e) !== null" :class="profit(e)! >= 0 ? 'text-success' : 'text-danger'">
        · 盈亏 {{ signed(profit(e)!) }}</span
      >
    </div>
  </template>
</template>
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/web/src/views/PredictView.test.ts apps/web/src/utils/events.test.ts apps/web/src/components && pnpm -F @dt/web typecheck`
Expected: PASS（`MoreLinks` 若有快照或数量断言，按新入口更新）。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src
git commit -m "feat: 事件预测页（238-1）"
```

---

### Task 6: 后台"预测"页和端到端

**Files:**
- Modify: `apps/web/src/api/admin.ts`
- Create: `apps/web/src/views/admin/AdminPredictView.vue`
- Create: `apps/web/src/views/admin/AdminPredictView.test.ts`
- Modify: `apps/web/src/views/admin/AdminLayout.vue`、`apps/web/src/router.ts`
- Create: `apps/web/e2e/predict.spec.ts`

**Interfaces:**
- Consumes: Task 4 的后台路由和 `PredictAdminRow`。
- Produces: `adminApi.predictList(shardId)`、`adminApi.predictCreate(body)`、`adminApi.predictResolve(id, outcome)`、`adminApi.predictVoid(id)`；testid `apd-title`、`apd-desc`、`apd-close`、`apd-p0`、`apd-b`、`apd-create`、`apd-row-<id>`、`apd-yes-<id>`、`apd-no-<id>`、`apd-void-<id>`。

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/admin/AdminPredictView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredictAdminRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminPredictView from './AdminPredictView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { predictList: vi.fn(), predictCreate: vi.fn(), predictResolve: vi.fn(), predictVoid: vi.fn() },
}));

const row: PredictAdminRow = {
  id: 7,
  title: '明天会下雨吗',
  status: 'closed',
  outcome: null,
  closeAt: '2026-10-03T12:00:00.000Z',
  price: 0.63,
  trades: 12,
  holders: 5,
  fees: 820,
  ifYes: -15000,
  ifNo: 23000,
  creator: 'boss',
};

async function mountAs(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  useAdminStore().shardId = 3;
  const w = mount(AdminPredictView);
  await flushPromises();
  return w;
}

describe('后台预测页（238-1 设计 §7.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.predictList).mockResolvedValue([row]);
    vi.mocked(adminApi.predictCreate).mockResolvedValue({ id: 8 });
    vi.mocked(adminApi.predictResolve).mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('按区服读取；显示概率、成交、系统收支', async () => {
    const w = await mountAs('mod');
    expect(adminApi.predictList).toHaveBeenCalledWith(3);
    const t = w.get('[data-testid="apd-row-7"]').text();
    expect(t).toContain('明天会下雨吗');
    expect(t).toContain('63%');
    expect(t).toContain('-15,000');
    expect(t).toContain('23,000');
  });

  it('协管看不到判定和作废按钮；管理员能判定', async () => {
    const m = await mountAs('mod');
    expect(m.find('[data-testid="apd-yes-7"]').exists()).toBe(false);
    const a = await mountAs('admin');
    await a.get('[data-testid="apd-yes-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictResolve).toHaveBeenCalledWith(7, true);
    expect(adminApi.predictList).toHaveBeenCalledTimes(3);
  });

  it('出题：提交区服、标题、截止时间、初始概率', async () => {
    const w = await mountAs('mod');
    await w.get('[data-testid="apd-title"]').setValue('蟹老板明天在 1~6 号街吗');
    await w.get('[data-testid="apd-close"]').setValue('2026-10-03T12:00');
    await w.get('[data-testid="apd-p0"]').setValue('40');
    await w.get('[data-testid="apd-create"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictCreate).toHaveBeenCalledWith({
      shardId: 3,
      title: '蟹老板明天在 1~6 号街吗',
      description: '',
      closeAt: new Date('2026-10-03T12:00').toISOString(),
      p0: 40,
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/views/admin/AdminPredictView.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 后台接口、页面、导航**

`apps/web/src/api/admin.ts`（type import 补 `PredictAdminRow`）：

```ts
  predictList: (shardId: number) => api.get<PredictAdminRow[]>(`${A}/predict${qs({ shardId })}`),
  predictCreate: (b: { shardId: number; title: string; description: string; closeAt: string; p0: number; b?: number }) =>
    api.post<{ id: number }>(`${A}/predict`, b),
  predictResolve: (id: number, outcome: boolean) =>
    api.post<{ ok: true }>(`${A}/predict/${id}/resolve`, { outcome }),
  predictVoid: (id: number) => api.post<{ ok: true }>(`${A}/predict/${id}/void`, {}),
```

`apps/web/src/views/admin/AdminPredictView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { predictPercent, type PredictAdminRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 后台事件预测（238-1 设计 §7.3）：协管出题和查看，管理员判定和作废 */
const admin = useAdminStore();
const toast = useToastStore();
const rows = ref<PredictAdminRow[]>([]);
const busy = ref(false);
const isAdmin = computed(() => admin.me?.role === 'admin');
const title = ref('');
const description = ref('');
const closeAt = ref('');
const p0 = ref(50);
const b = ref<number | ''>('');
const STATUS = { open: '进行中', closed: '等待判定', resolved: '已判定', void: '已作废' } as const;

async function load() {
  if (admin.shardId === null) return;
  try {
    rows.value = await adminApi.predictList(admin.shardId);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function run(fn: () => Promise<unknown>, ok: string) {
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
function create() {
  if (admin.shardId === null || !title.value.trim() || !closeAt.value) return;
  const shardId = admin.shardId;
  void run(
    () =>
      adminApi.predictCreate({
        shardId,
        title: title.value.trim(),
        description: description.value.trim(),
        closeAt: new Date(closeAt.value).toISOString(),
        p0: Number(p0.value),
        ...(b.value === '' ? {} : { b: Number(b.value) }),
      }),
    '已出题',
  );
}
function resolve(r: PredictAdminRow, outcome: boolean) {
  if (!window.confirm(`判定「${r.title}」结果为${outcome ? '是' : '否'}？判定后不能修改。`)) return;
  void run(() => adminApi.predictResolve(r.id, outcome), '已判定');
}
function voidEvent(r: PredictAdminRow) {
  if (!window.confirm(`作废「${r.title}」？会按净投入退款，不能恢复。`)) return;
  void run(() => adminApi.predictVoid(r.id), '已作废');
}
watch(
  () => admin.shardId,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <h6 class="dt-section">出题</h6>
  <div class="d-flex flex-wrap gap-2 align-items-center small mb-3">
    <input v-model="title" class="form-control form-control-sm" style="max-width: 20rem" maxlength="60" placeholder="问题（是/否）" data-testid="apd-title" />
    <input v-model="description" class="form-control form-control-sm" style="max-width: 20rem" maxlength="500" placeholder="说明、判定依据（选填）" data-testid="apd-desc" />
    截止 <input v-model="closeAt" type="datetime-local" class="form-control form-control-sm w-auto" data-testid="apd-close" />
    初始概率 <input v-model.number="p0" type="number" min="5" max="95" class="form-control form-control-sm" style="width: 5rem" data-testid="apd-p0" />%
    b <input v-model.number="b" type="number" min="10" max="10000" placeholder="默认" class="form-control form-control-sm" style="width: 6rem" data-testid="apd-b" />
    <button type="button" class="btn btn-sm btn-primary" :disabled="busy" data-testid="apd-create" @click="create">出题</button>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>事件</th>
        <th>状态</th>
        <th>截止</th>
        <th class="text-end">是</th>
        <th class="text-end">成交 / 持仓人</th>
        <th class="text-end">手续费</th>
        <th class="text-end">结果为是 / 否时系统收支</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id" :data-testid="`apd-row-${r.id}`">
        <td>{{ r.title }}<span class="text-muted">（{{ r.creator ?? '?' }}）</span></td>
        <td>{{ r.status === 'resolved' ? `结果：${r.outcome ? '是' : '否'}` : STATUS[r.status] }}</td>
        <td>{{ new Date(r.closeAt).toLocaleString('zh-CN') }}</td>
        <td class="text-end">{{ predictPercent(r.price) }}%</td>
        <td class="text-end">{{ r.trades }} / {{ r.holders }}</td>
        <td class="text-end">{{ formatNum(r.fees) }}</td>
        <td class="text-end">{{ formatNum(r.ifYes) }} / {{ formatNum(r.ifNo) }}</td>
        <td class="text-nowrap">
          <template v-if="isAdmin && (r.status === 'open' || r.status === 'closed')">
            <button type="button" class="btn btn-sm btn-link p-0 me-2" :disabled="busy" :data-testid="`apd-yes-${r.id}`" @click="resolve(r, true)">判定为是</button>
            <button type="button" class="btn btn-sm btn-link p-0 me-2" :disabled="busy" :data-testid="`apd-no-${r.id}`" @click="resolve(r, false)">判定为否</button>
            <button type="button" class="btn btn-sm btn-link text-danger p-0" :disabled="busy" :data-testid="`apd-void-${r.id}`" @click="voidEvent(r)">作废</button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-if="rows.length === 0" class="text-muted small">这个区服还没有事件</div>
</template>
```

`AdminLayout.vue` 的 links 里 `活动` 之后加 `{ to: '/admin/predict', label: '预测' },`；`router.ts` 后台 children 里 `activities` 之后加 `{ path: 'predict', component: () => import('./views/admin/AdminPredictView.vue') },`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/web/src/views/admin && pnpm -F @dt/web typecheck`
Expected: PASS（`AdminLayout` 若有导航数量断言，按新链接更新）。

- [ ] **Step 5: 端到端**

`apps/web/e2e/predict.spec.ts`：

```ts
import pg from 'pg';
import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/**
 * 事件预测（238-1）：管理员出题 → 玩家买"是" → 管理员判定为是 → 结算任务发银币。
 * 只改本用例新注册的号（角色、等级、注册时间）和自己建的事件；结束时删掉事件（持仓、成交级联）
 */
test('事件预测：出题、买入、判定、结算到账', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  let eventId: number | null = null;
  try {
    await client.query(`update account set role = 'admin', created_at = now() - interval '30 days' where lower(username) = lower($1)`, [username]);
    await client.query(
      `update restaurant set level = 30, coin = 1000000 where account_id = (select id from account where lower(username) = lower($1))`,
      [username],
    );
    const overview = async () =>
      ((await (await page.request.get('/api/v1/restaurant/overview')).json()) as { data: { shardId: number; coin: number } }).data;
    const me = await overview();
    // 游戏时钟可能被别的用例拨快过：截止时间按服务器时钟定
    const tick = await page.request.post('/api/v1/test/tick', { data: { minutes: 0, shardIds: [] } });
    const now = new Date(((await tick.json()) as { data: { now: string } }).data.now).getTime();
    const created = await page.request.post('/api/v1/admin/predict', {
      data: { shardId: me.shardId, title: 'e2e 预测', closeAt: new Date(now + 3_600_000).toISOString(), p0: 50 },
    });
    expect(created.ok()).toBe(true);
    eventId = ((await created.json()) as { data: { id: number } }).data.id;

    await page.goto('/predict');
    await page.getByTestId(`pd-event-${eventId}`).click();
    await page.getByTestId('pd-qty').fill('10');
    await page.getByTestId('pd-submit').click();
    await expect(page.getByText('买入是 10 份')).toBeVisible();
    const afterBuy = (await overview()).coin;
    expect(afterBuy).toBeLessThan(1_000_000);

    const resolved = await page.request.post(`/api/v1/admin/predict/${eventId}/resolve`, { data: { outcome: true } });
    expect(resolved.ok()).toBe(true);
    await page.request.post('/api/v1/test/tick', { data: { minutes: 1, shardIds: [me.shardId] } });
    expect((await overview()).coin).toBe(afterBuy + 10_000);
  } finally {
    if (eventId !== null) await client.query('delete from predict_event where id = $1', [eventId]);
    await client.end();
  }
});
```

Run（需要开发服务器在跑，迁移已执行）：`pnpm -F @dt/web exec playwright test e2e/predict.spec.ts`
Expected: PASS。

- [ ] **Step 6: 全量测试、lint、typecheck**

Run: `pnpm vitest run > .superpowers/sdd/2026-10-02-predict-core/full.log 2>&1; grep -E "Test Files|      Tests" .superpowers/sdd/2026-10-02-predict-core/full.log; pnpm lint; pnpm typecheck`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add apps/web
git commit -m "feat: 后台事件预测页和端到端测试（238-1）"
```
