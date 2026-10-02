# 自由交易市场 156-1 交易所核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家之间用限价单买卖稀有食材：挂单冻结、价格时间优先撮合、卖方 5% 手续费、每日参考价 ×0.5~2 的涨跌幅限制、开通门槛、交易所账户、交易所页面。

**Architecture:** 新模块 `apps/server/src/modules/exchange`。

- 下单在锁店事务（`runOp`，功能 `exchange`）里进行，先锁店，再拿盘口的事务级 advisory 锁，然后撮合。
- 挂单方的所得先在内存里累计，最后按店 id 排序写进交易所账户表，避免死锁，也不锁对方的店。
- 吃单方当场到账。
- 参考价在每个游戏日第一次用到时计算并写入 `exchange_ref`。
- 过期由周期任务处理，挂在功能 `restaurant` 上，退回进交易所账户。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-exchange-1-core-design.md`

## Global Constraints

- **可交易**：食材 `odds < 100`。
- **区服数值** `tuning.exchange`：
  - `minLevel 20`、`minAccountDays 7`（现实时间）；
  - `feeRate 0.05`；`bandLow 0.5`、`bandHigh 2`；`refMinTrades 3`；
  - `maxOpenOrders 10`、`orderHours 24`、`maxQty 999`；
  - `refOverrides {}`（食材 id → 初始参考价）。
- **功能开关** `exchange`，默认开。撤单、取出在功能 `restaurant` 下运行；过期任务挂在 `restaurant` 上。
- **价格范围**：`min = max(1, ceil(ref × bandLow))`，`max = floor(ref × bandHigh)`。
- **成交价**取挂单方的价格。手续费 `floor(成交价 × 数量 × feeRate)`，从卖方所得里扣。
- **自己的挂单**跳过，不成交也不撤。过期的挂单（`expires_at ≤ now`）不参与撮合。
- **错误**：
  - `requirement('exchange_level' | 'exchange_age' | 'exchange_email')`；
  - `invalidState('not_tradable' | 'price_band' | 'cupboard_full' | 'order_closed')`；
  - `limitReached('exchange_orders', { max })`；
  - `notEnough('coin' | 'foods', …)`。
- **个人日志**：`exchange.order`、`exchange.fill`、`exchange.cancel`、`exchange.expire`、`exchange.withdraw`，前端要有文案。
- **测试约定**：测试从仓库根目录跑；不碰 `问题记录.md`；`packages/config/data/**/*.json` 不跑 prettier。

## Review Focus

1. **并发**：两个买单同时吃同一张卖单，总成交不能超过卖单数量，银币和食材要守恒。→ Task 3 测试。
2. **死锁**：两笔不同盘口的成交同时给同两家挂单方入账，不能互相卡死，账户写入按店 id 排序。→ Task 3 代码。
3. **买单退差价**：吃单方的买价高于成交价时，退回差价；挂单方是买单时不退。→ Task 3 测试。
4. **交易所关闭时**：撤单、取出、过期退回照常可用，冻结的东西不会卡住。→ Task 4 测试。
5. **取出时橱柜满了**：只取出放得下的部分，其余留在账户里，不能丢。→ Task 4 测试。

---

### Task 1: config 和 shared——区服数值、功能开关、接口类型

**Files:**
- Modify: `packages/config/data/game/tuning.json`、`packages/config/src/tuning.ts`、`packages/config/data/game/setting_docs.json`
- Create: `packages/shared/src/schemas/exchange.ts`；Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/exchange.test.ts`

**Interfaces:**
- Produces:
  - `Tuning['exchange']`；
  - `exchangeOrderBody`（zod：`{ foodsId, side, price, qty }`）；
  - 类型 `ExchangeSide`、`ExchangeOrderDto`、`ExchangeFoodDto`、`ExchangeBookDto`、`ExchangeMeDto`、`ExchangePlaceDto`、`ExchangeWithdrawDto`。

- [ ] **Step 1: 写失败的测试** `packages/shared/src/schemas/exchange.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { exchangeOrderBody } from './exchange';

describe('交易所下单请求（156-1 设计 §6.1）', () => {
  it('合法的能过；方向、单价、数量都要合法', () => {
    expect(exchangeOrderBody.parse({ foodsId: 3, side: 'buy', price: 100, qty: 2 })).toEqual({
      foodsId: 3,
      side: 'buy',
      price: 100,
      qty: 2,
    });
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'hold', price: 100, qty: 2 }).success).toBe(false);
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'buy', price: 0, qty: 2 }).success).toBe(false);
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'buy', price: 1.5, qty: 2 }).success).toBe(false);
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'sell', price: 10, qty: 1000 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/shared/src/schemas/exchange.test.ts`
Expected: FAIL（`./exchange` 不存在）

- [ ] **Step 3: shared** `schemas/exchange.ts`

```ts
import { z } from 'zod';

export type ExchangeSide = 'buy' | 'sell';

/** 下单请求（156-1 设计 §6.1）；价格范围、数量上限在服务端按区服数值再查 */
export const exchangeOrderBody = z.object({
  foodsId: z.number().int().positive(),
  side: z.enum(['buy', 'sell']),
  price: z.number().int().min(1).max(100_000_000),
  qty: z.number().int().min(1).max(999),
});

export interface ExchangeOrderDto {
  id: number;
  side: ExchangeSide;
  foodsId: number;
  price: number;
  qty: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface ExchangeFoodDto {
  foodsId: number;
  ref: number;
  last: number | null;
  /** 最新成交价相对参考价的涨跌（小数，0.1 = 涨 10%）；没有成交为 null */
  changePct: number | null;
}

export interface ExchangeLevelDto {
  price: number;
  qty: number;
}

export interface ExchangeBookDto {
  foodsId: number;
  ref: number;
  min: number;
  max: number;
  last: number | null;
  volume: number;
  bids: ExchangeLevelDto[];
  asks: ExchangeLevelDto[];
}

export interface ExchangeTradeDto {
  side: ExchangeSide;
  foodsId: number;
  price: number;
  qty: number;
  fee: number;
  createdAt: string;
}

export interface ExchangeMeDto {
  eligible: boolean;
  /** 不满足的那一项：exchange_level / exchange_age / exchange_email；满足为 null */
  reason: string | null;
  need: { level: number; days: number };
  orders: ExchangeOrderDto[];
  wallet: { coin: number; foods: Array<{ foodsId: number; num: number }> };
  trades: ExchangeTradeDto[];
  feeRate: number;
}

export interface ExchangePlaceDto {
  order: ExchangeOrderDto;
  fills: Array<{ price: number; qty: number }>;
}

export interface ExchangeWithdrawDto {
  coin: number;
  foods: Array<{ foodsId: number; num: number }>;
  left: Array<{ foodsId: number; num: number }>;
}
```

`packages/shared/src/index.ts` 末尾加 `export * from './schemas/exchange';`。

- [ ] **Step 4: config**

`tuning.json` 在 `"forum": {…}` 之前加（保持该文件现有的紧凑写法）：

```json
  "exchange": {
    "minLevel": 20, "minAccountDays": 7, "feeRate": 0.05, "bandLow": 0.5, "bandHigh": 2,
    "refMinTrades": 3, "maxOpenOrders": 10, "orderHours": 24, "maxQty": 999, "refOverrides": {}
  },
```

`tuning.ts` 在 `forum: z.object({` 之前加：

```ts
  /** 自由交易市场（156-1） */
  exchange: z.object({
    minLevel: int.min(1),
    minAccountDays: int.min(0),
    feeRate: z.number().min(0).max(0.5),
    bandLow: z.number().positive().max(1),
    bandHigh: z.number().min(1),
    refMinTrades: int.min(1),
    maxOpenOrders: int.min(1),
    orderHours: int.min(1),
    maxQty: int.min(1).max(999),
    refOverrides: z.record(z.string(), int.min(1)),
  }),
```

`setting_docs.json`：
- `features` 加 `"exchange": "交易所：玩家之间用限价单买卖稀有食材（关掉后不能下单；撤单、取出、过期退回照常）"`；
- `groups` 加 `"tuning.exchange": "交易所：开通门槛、手续费、涨跌幅、挂单数量和有效期"`；
- 叶子说明按现有的 `"tuning.forum.titleMax"` 格式，逐项加：

```json
    "tuning.exchange.minLevel": "交易所开通门槛：餐厅等级（级）",
    "tuning.exchange.minAccountDays": "交易所开通门槛：账号注册满几天（天）",
    "tuning.exchange.feeRate": "成交时从卖方所得里扣的手续费（比例）",
    "tuning.exchange.bandLow": "挂单价下限 = 当天参考价 × 这个数（倍）",
    "tuning.exchange.bandHigh": "挂单价上限 = 当天参考价 × 这个数（倍）",
    "tuning.exchange.refMinTrades": "前一天成交不少于几笔才更新参考价（笔）",
    "tuning.exchange.maxOpenOrders": "每人同时最多几张挂单（张）",
    "tuning.exchange.orderHours": "挂单有效期（小时）",
    "tuning.exchange.maxQty": "每张单最多几个（个）",
    "tuning.exchange.refOverrides": "按食材 id 指定初始参考价（没有成交前用它，代替系统定价）",
```

（叶子说明测试如果要求 record 类型写到更深一层，或者不需要这一条，按测试的要求调整，并记 Ruling。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @dt/config build && pnpm vitest run packages/shared packages/config`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(shared,config): 交易所的区服数值和接口类型"
```

---

### Task 2: 服务端——迁移 0025、价格规则、参考价

**Files:**
- Create: `apps/server/src/db/migrations/0025_exchange.ts`（+ `index.ts` 登记）
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/modules/exchange/rules.ts`、`rules.test.ts`
- Create: `apps/server/src/modules/exchange/ref.ts`、`ref.test.ts`
- Modify: `apps/server/src/core/features.ts`（`IMPLEMENTED_FEATURES` 加 `'exchange'`）

**Interfaces:**
- Produces:
  - `isTradable(food: Food | undefined): boolean`；
  - `priceBand(ref: number, t: ExchangeTuning): { min: number; max: number }`；
  - `weightedPrice(trades: Array<{ price: number; qty: number }>): number`；
  - `feeOf(price: number, qty: number, t): number`；
  - `refPrice(db, config, t, shardId, foodsId, day): Promise<number>`；
  - 类型 `ExchangeTuning = Tuning['exchange']`。

- [ ] **Step 1: 写失败的测试**

`rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { feeOf, isTradable, priceBand, weightedPrice } from './rules';

const config = testConfig();
const t = config.tuning.exchange;

describe('交易所规则（156-1 设计 §5、§6）', () => {
  it('只有稀有食材（odds < 100）可交易', () => {
    const rare = [...config.foods.values()].find((f) => f.odds < 100)!;
    const common = [...config.foods.values()].find((f) => f.odds >= 100)!;
    expect(isTradable(rare)).toBe(true);
    expect(isTradable(common)).toBe(false);
    expect(isTradable(undefined)).toBe(false);
  });
  it('价格范围：下限向上取整、上限向下取整，下限至少 1', () => {
    expect(priceBand(1001, t)).toEqual({ min: 501, max: 2002 });
    expect(priceBand(1, t)).toEqual({ min: 1, max: 2 });
  });
  it('加权均价四舍五入', () => {
    expect(
      weightedPrice([
        { price: 100, qty: 1 },
        { price: 200, qty: 2 },
      ]),
    ).toBe(167);
  });
  it('手续费向下取整', () => {
    expect(feeOf(333, 3, t)).toBe(49);
  });
});
```

`ref.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { refPrice } from './ref';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100)!;
const tune = () => t.deps.config.tuning.exchange;
async function trade(shardId: number, foodsId: number, price: number, qty: number, at: Date) {
  await t.db
    .insertInto('exchange_trade')
    .values({
      shard_id: shardId,
      foods_id: foodsId,
      price,
      qty,
      buy_order_id: null,
      sell_order_id: null,
      buyer_rest_id: 0,
      seller_rest_id: 0,
      fee: 0,
      created_at: at,
    })
    .execute();
}

describe('参考价（156-1 设计 §5）', () => {
  it('没有成交用系统定价；refOverrides 优先；算过的当天不变', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const day = gameDay(t.clock.now);
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, day)).toBe(f.coin);
    const other = [...t.deps.config.foods.values()].filter((x) => x.odds < 100)[1]!;
    expect(
      await refPrice(t.db, t.deps.config, { ...tune(), refOverrides: { [String(other.id)]: 777 } }, shardId, other.id, day),
    ).toBe(777);
  });

  it('前一天成交够笔数用加权均价，不够沿用前一天的参考价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const d0 = gameDay(t.clock.now);
    const d1 = addDays(d0, 1);
    const d2 = addDays(d0, 2);
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d0)).toBe(f.coin);
    const inD0 = new Date(t.clock.now.getTime());
    await trade(shardId, f.id, 100, 1, inD0);
    await trade(shardId, f.id, 200, 1, inD0);
    await trade(shardId, f.id, 300, 2, inD0);
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d1)).toBe(225);
    // d1 没有成交（不够 3 笔）：d2 沿用 225
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d2)).toBe(225);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 迁移** `0025_exchange.ts`

```ts
import { sql, type Kysely } from 'kysely';

/** 156-1：交易所的挂单、成交、参考价和交易所账户 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table exchange_order (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      side text not null check (side in ('buy', 'sell')),
      foods_id integer not null,
      price integer not null check (price > 0),
      qty integer not null check (qty between 1 and 999),
      filled integer not null default 0 check (filled >= 0 and filled <= qty),
      status text not null check (status in ('open', 'filled', 'cancelled', 'expired')),
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      closed_at timestamptz
    )`.execute(db);
  await sql`create index exchange_order_book on exchange_order (shard_id, foods_id, side, status, price, id)`.execute(db);
  await sql`create index exchange_order_rest on exchange_order (rest_id, status)`.execute(db);
  await sql`create index exchange_order_expire on exchange_order (status, expires_at)`.execute(db);
  await sql`
    create table exchange_trade (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      price integer not null,
      qty integer not null,
      buy_order_id bigint references exchange_order(id) on delete set null,
      sell_order_id bigint references exchange_order(id) on delete set null,
      buyer_rest_id integer not null,
      seller_rest_id integer not null,
      fee bigint not null,
      created_at timestamptz not null default now()
    )`.execute(db);
  await sql`create index exchange_trade_book on exchange_trade (shard_id, foods_id, created_at)`.execute(db);
  await sql`create index exchange_trade_buyer on exchange_trade (buyer_rest_id, created_at)`.execute(db);
  await sql`create index exchange_trade_seller on exchange_trade (seller_rest_id, created_at)`.execute(db);
  await sql`
    create table exchange_ref (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      day date not null,
      price integer not null,
      primary key (shard_id, foods_id, day)
    )`.execute(db);
  await sql`
    create table exchange_wallet (
      rest_id integer primary key references restaurant(id) on delete cascade,
      coin bigint not null default 0
    )`.execute(db);
  await sql`
    create table exchange_wallet_food (
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      num integer not null,
      primary key (rest_id, foods_id)
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table exchange_wallet_food`.execute(db);
  await sql`drop table exchange_wallet`.execute(db);
  await sql`drop table exchange_ref`.execute(db);
  await sql`drop table exchange_trade`.execute(db);
  await sql`drop table exchange_order`.execute(db);
}
```

`migrations/index.ts` 登记 `'0025_exchange': m0025`。`schema.ts` 加表类型，并在 `DB` 接口里登记：

```ts
export interface ExchangeOrderTable {
  id: Generated<string>;
  shard_id: number;
  rest_id: number;
  side: 'buy' | 'sell';
  foods_id: number;
  price: number;
  qty: number;
  filled: Default<number>;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  created_at: TsDefault;
  expires_at: Date;
  closed_at: TsNullable;
}
export interface ExchangeTradeTable {
  id: Generated<string>;
  shard_id: number;
  foods_id: number;
  price: number;
  qty: number;
  buy_order_id: string | null;
  sell_order_id: string | null;
  buyer_rest_id: number;
  seller_rest_id: number;
  /** bigint：pg 读出为字符串 */
  fee: ColumnType<string, number | string, number | string>;
  created_at: TsDefault;
}
export interface ExchangeRefTable {
  shard_id: number;
  foods_id: number;
  day: string;
  price: number;
}
export interface ExchangeWalletTable {
  rest_id: number;
  coin: ColumnType<string, number | string | undefined, number | string>;
}
export interface ExchangeWalletFoodTable {
  rest_id: number;
  foods_id: number;
  num: number;
}
```

（`DB` 里：`exchange_order: ExchangeOrderTable; exchange_trade: ExchangeTradeTable; exchange_ref: ExchangeRefTable; exchange_wallet: ExchangeWalletTable; exchange_wallet_food: ExchangeWalletFoodTable;`。`Default`、`TsDefault`、`TsNullable`、`ColumnType` 用 schema.ts 已有的别名；没有的按现有写法补。bigserial 在 pg 读出为字符串，所以 `id` 是 `Generated<string>`。）

`features.ts` 的 `IMPLEMENTED_FEATURES` 加 `'exchange'`。

- [ ] **Step 4: 规则** `rules.ts`

```ts
import type { Food, Tuning } from '@dt/config';

export type ExchangeTuning = Tuning['exchange'];

/** 可交易：稀有食材，和菜场判断稀有的口径一致（156-1 设计 §2） */
export function isTradable(food: Food | undefined): boolean {
  return food !== undefined && food.odds < 100;
}

/** 当天允许的挂单价（156-1 设计 §5） */
export function priceBand(ref: number, t: ExchangeTuning): { min: number; max: number } {
  return { min: Math.max(1, Math.ceil(ref * t.bandLow)), max: Math.floor(ref * t.bandHigh) };
}

/** 成交量加权均价，四舍五入 */
export function weightedPrice(trades: Array<{ price: number; qty: number }>): number {
  const qty = trades.reduce((s, x) => s + x.qty, 0);
  return Math.round(trades.reduce((s, x) => s + x.price * x.qty, 0) / qty);
}

/** 卖方手续费 */
export function feeOf(price: number, qty: number, t: ExchangeTuning): number {
  return Math.floor(price * qty * t.feeRate);
}
```

- [ ] **Step 5: 参考价** `ref.ts`

```ts
import type { Kysely } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { weightedPrice, type ExchangeTuning } from './rules';

/**
 * 某区服某食材某游戏日的参考价（156-1 设计 §5）：第一次用到时计算并保存，之后不变。
 * 前一天成交不少于 refMinTrades 笔用加权均价，否则沿用最近一天的；都没有用 refOverrides 或系统定价。
 */
export async function refPrice(
  db: Kysely<DB>,
  config: GameConfig,
  t: ExchangeTuning,
  shardId: number,
  foodsId: number,
  day: string,
): Promise<number> {
  const saved = await db
    .selectFrom('exchange_ref')
    .select('price')
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('day', '=', day)
    .executeTakeFirst();
  if (saved) return saved.price;
  const prev = addDays(day, -1);
  const trades = await db
    .selectFrom('exchange_trade')
    .select(['price', 'qty'])
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('created_at', '>=', gameTime(prev, 0))
    .where('created_at', '<', gameTime(day, 0))
    .execute();
  let price: number;
  if (trades.length >= t.refMinTrades) price = weightedPrice(trades);
  else {
    const last = await db
      .selectFrom('exchange_ref')
      .select('price')
      .where('shard_id', '=', shardId)
      .where('foods_id', '=', foodsId)
      .where('day', '<', day)
      .orderBy('day', 'desc')
      .executeTakeFirst();
    price = last?.price ?? t.refOverrides[String(foodsId)] ?? config.requireFood(foodsId).coin;
  }
  await db
    .insertInto('exchange_ref')
    .values({ shard_id: shardId, foods_id: foodsId, day, price })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const row = await db
    .selectFrom('exchange_ref')
    .select('price')
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('day', '=', day)
    .executeTakeFirstOrThrow();
  return row.price;
}
```

（`gameTime(day, hour)` 是 shared 现有函数：北京时间某天某点对应的时刻。签名以现有代码为准，不一致就按实际改，记 Ruling。）

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange apps/server/src/db && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): 交易所的表、价格规则和参考价；迁移 0025"
```

---

### Task 3: 服务端——下单和撮合

**Files:**
- Create: `apps/server/src/modules/exchange/wallet.ts`
- Create: `apps/server/src/modules/exchange/service.ts`（`place`）
- Create: `apps/server/src/modules/exchange/test.ts`（测试工具）、`place.test.ts`
- Modify: `apps/server/src/game.ts`（`exchange: ExchangeService`）

**Interfaces:**
- Consumes: Task 2 `isTradable`、`priceBand`、`feeOf`、`refPrice`
- Produces:
  - `creditWallets(db, credits: Map<number, { coin: number; foods: Map<number, number> }>)`；
  - `svc.place(ctx, body): Promise<OpResult<ExchangePlaceDto>>`；
  - `bookLock(tx, shardId, foodsId)`；
  - `orderDto(row)`。

- [ ] **Step 1: 测试工具** `test.ts`（只给测试用；文件名 `test.ts` 不会被当成测试跑）

```ts
import { sql } from 'kysely';
import type { TestGame } from '../../../test/game';
import { newRestaurant } from '../../../test/game';

/** 满足交易所门槛的店：等级 30、邮箱已验证、账号注册满 30 天，可指定银币和食材 */
export async function trader(
  t: TestGame,
  o: { shardId: number; coin?: number; foods?: Record<number, number> },
) {
  const r = await newRestaurant(t, {
    shardId: o.shardId,
    verified: true,
    patch: { level: 30, coin: o.coin ?? 1_000_000 },
    foods: o.foods,
  });
  await t.db
    .updateTable('account')
    .set({ created_at: sql`now() - interval '30 days'` })
    .where('id', '=', r.accountId)
    .execute();
  return r;
}

export async function wallet(t: TestGame, restId: number) {
  const c = await t.db.selectFrom('exchange_wallet').select('coin').where('rest_id', '=', restId).executeTakeFirst();
  const f = await t.db
    .selectFrom('exchange_wallet_food')
    .select(['foods_id', 'num'])
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .execute();
  return { coin: Number(c?.coin ?? 0), foods: Object.fromEntries(f.map((x) => [x.foods_id, x.num])) };
}
```

- [ ] **Step 2: 写失败的测试** `place.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const svc = () => t.game.exchange;
/** 系统定价为 coin 的稀有食材：参考价就是 coin，允许 0.5~2 倍 */
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;

describe('交易所下单（156-1 设计 §6.1）', () => {
  it('门槛：等级、注册天数、邮箱分别报错', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId });
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', r.restaurantId).execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      params: { reason: 'exchange_level' },
    });
    await t.db.updateTable('restaurant').set({ level: 30 }).where('id', '=', r.restaurantId).execute();
    await t.db.updateTable('account').set({ created_at: new Date() }).where('id', '=', r.accountId).execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      params: { reason: 'exchange_age' },
    });
    await t.db
      .updateTable('account')
      .set({ created_at: new Date('2020-01-01'), email_verified_at: null })
      .where('id', '=', r.accountId)
      .execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      params: { reason: 'exchange_email' },
    });
  });

  it('非稀有食材、价格越界、挂单数满都拒绝，什么都不扣', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const common = [...t.deps.config.foods.values()].find((x) => x.odds >= 100)!;
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await expect(svc().place(r, { foodsId: common.id, side: 'buy', price: 10, qty: 1 })).rejects.toMatchObject({
      params: { reason: 'not_tradable' },
    });
    await expect(
      svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin * 2 + 1, qty: 1 }),
    ).rejects.toMatchObject({ params: { reason: 'price_band', max: f.coin * 2 } });
    expect((await restRow(t, r.restaurantId)).coin).toBe(1_000_000);
    for (let i = 0; i < t.deps.config.tuning.exchange.maxOpenOrders; i++)
      await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      params: { what: 'exchange_orders' },
    });
  });

  it('挂卖单扣食材、挂买单扣银币；买单超过橱柜单种上限不让挂', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 3 });
    expect(await foodNum(t, s.restaurantId, f.id)).toBe(2);
    const b = await trader(t, { shardId, coin: 10_000_000 });
    const max = (await restRow(t, b.restaurantId)).foods_max_num;
    await expect(
      svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: Math.min(999, max + 1) }),
    ).rejects.toMatchObject({ params: { reason: 'cupboard_full' } });
  });
});

describe('撮合（156-1 设计 §6.2）', () => {
  it('价格优先、时间优先、部分成交；成交价取挂单方价格；买方退差价；卖方扣 5% 进账户', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s1 = await trader(t, { shardId, foods: { [f.id]: 10 } });
    const s2 = await trader(t, { shardId, foods: { [f.id]: 10 } });
    const s3 = await trader(t, { shardId, foods: { [f.id]: 10 } });
    await svc().place(s1, { foodsId: f.id, side: 'sell', price: p + 10, qty: 2 });
    await svc().place(s2, { foodsId: f.id, side: 'sell', price: p, qty: 2 });
    await svc().place(s3, { foodsId: f.id, side: 'sell', price: p + 10, qty: 2 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const res = await svc().place(b, { foodsId: f.id, side: 'buy', price: p + 20, qty: 3 });
    expect(res.data.fills).toEqual([
      { price: p, qty: 2 },
      { price: p + 10, qty: 1 },
    ]);
    expect(res.data.order.status).toBe('filled');
    // 冻结 (p+20)×3，实际花 p×2 + (p+10)×1，差价退回
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000 - (p * 2 + (p + 10)));
    expect(await foodNum(t, b.restaurantId, f.id)).toBe(3);
    const fee2 = Math.floor(p * 2 * 0.05);
    expect(await wallet(t, s2.restaurantId)).toEqual({ coin: p * 2 - fee2, foods: {} });
    const fee1 = Math.floor((p + 10) * 0.05);
    expect(await wallet(t, s1.restaurantId)).toEqual({ coin: p + 10 - fee1, foods: {} });
    expect(await wallet(t, s3.restaurantId)).toEqual({ coin: 0, foods: {} });
  });

  it('卖单吃买单：卖方当场到账（扣手续费），买方挂单的食材进账户、不退差价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: p + 50, qty: 2 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: p, qty: 3 });
    expect(res.data.fills).toEqual([{ price: p + 50, qty: 2 }]);
    expect(res.data.order).toMatchObject({ status: 'open', filled: 2 });
    expect((await restRow(t, s.restaurantId)).coin).toBe((p + 50) * 2 - Math.floor((p + 50) * 2 * 0.05));
    expect(await wallet(t, b.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 2 } });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000 - (p + 50) * 2);
  });

  it('不和自己的单成交；不吃过期的单；不吃别的区服的单', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const me = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await svc().place(me, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    const old = await trader(t, { shardId, foods: { [f.id]: 5 } });
    const o = await svc().place(old, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    await t.db.updateTable('exchange_order').set({ expires_at: new Date(t.clock.now.getTime() - 1000) }).where('id', '=', String(o.data.order.id)).execute();
    const far = await trader(t, { shardId: other, foods: { [f.id]: 5 } });
    await svc().place(far, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    const res = await svc().place(me, { foodsId: f.id, side: 'buy', price: p, qty: 1 });
    expect(res.data.fills).toEqual([]);
    expect(res.data.order.status).toBe('open');
  });

  it('并发：两个买单同时吃同一张卖单，总成交不超过卖单数量，银币和食材守恒', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 3 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p, qty: 3 });
    const b1 = await trader(t, { shardId, coin: 1_000_000 });
    const b2 = await trader(t, { shardId, coin: 1_000_000 });
    const rs = await Promise.all([
      svc().place(b1, { foodsId: f.id, side: 'buy', price: p, qty: 2 }),
      svc().place(b2, { foodsId: f.id, side: 'buy', price: p, qty: 2 }),
    ]);
    const filled = rs.reduce((n, r) => n + r.data.fills.reduce((m, x) => m + x.qty, 0), 0);
    expect(filled).toBe(3);
    const got = (await foodNum(t, b1.restaurantId, f.id)) + (await foodNum(t, b2.restaurantId, f.id));
    expect(got).toBe(3);
    const spent =
      2_000_000 - (await restRow(t, b1.restaurantId)).coin - (await restRow(t, b2.restaurantId)).coin;
    // 已成交 3 个 + 还挂着的 1 个买单的冻结
    expect(spent).toBe(p * 4);
    const trades = await t.db
      .selectFrom('exchange_trade')
      .select(['qty', 'fee'])
      .where('seller_rest_id', '=', s.restaurantId)
      .execute();
    expect(trades.reduce((n, x) => n + x.qty, 0)).toBe(3);
    const fees = trades.reduce((n, x) => n + Number(x.fee), 0);
    expect((await wallet(t, s.restaurantId)).coin + fees).toBe(p * 3);
  });
});
```

（手续费按每笔分别取整，所以守恒断言用 `exchange_trade` 里各笔的 `fee` 求和。）

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/place.test.ts`
Expected: FAIL（`t.game.exchange` 不存在）

- [ ] **Step 4: 账户** `wallet.ts`

```ts
import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export interface Credit {
  coin: number;
  foods: Map<number, number>;
}

export const newCredits = () => new Map<number, Credit>();

export function addCredit(c: Map<number, Credit>, restId: number, coin: number, foodsId?: number, num = 0) {
  const cur = c.get(restId) ?? { coin: 0, foods: new Map<number, number>() };
  cur.coin += coin;
  if (foodsId !== undefined && num > 0) cur.foods.set(foodsId, (cur.foods.get(foodsId) ?? 0) + num);
  c.set(restId, cur);
}

/** 记进交易所账户：按店 id 从小到大写，两笔成交同时给同两家店入账也不会互相等锁（Review Focus 2） */
export async function creditWallets(db: Kysely<DB>, c: Map<number, Credit>): Promise<void> {
  for (const restId of [...c.keys()].sort((a, b) => a - b)) {
    const x = c.get(restId)!;
    if (x.coin > 0)
      await db
        .insertInto('exchange_wallet')
        .values({ rest_id: restId, coin: x.coin })
        .onConflict((oc) =>
          oc.column('rest_id').doUpdateSet({ coin: sql<string>`exchange_wallet.coin + ${x.coin}` }),
        )
        .execute();
    for (const [foodsId, num] of [...x.foods].sort((a, b) => a[0] - b[0]))
      await db
        .insertInto('exchange_wallet_food')
        .values({ rest_id: restId, foods_id: foodsId, num })
        .onConflict((oc) =>
          oc
            .columns(['rest_id', 'foods_id'])
            .doUpdateSet({ num: sql<number>`exchange_wallet_food.num + ${num}` }),
        )
        .execute();
  }
}
```

- [ ] **Step 5: 下单和撮合** `service.ts`

```ts
import { sql, type Kysely } from 'kysely';
import { gameDay, type ExchangeOrderDto, type ExchangePlaceDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import type { DB } from '../../db/schema';
import { addFoods, cupboardSlotsUsed, planAddFoods, subFoods } from '../cupboard/foods';
import { refPrice } from './ref';
import { feeOf, isTradable, priceBand } from './rules';
import { addCredit, creditWallets, newCredits } from './wallet';

type OrderRow = {
  id: string;
  rest_id: number;
  side: 'buy' | 'sell';
  foods_id: number;
  price: number;
  qty: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  created_at: Date;
  expires_at: Date;
};

export const orderDto = (r: OrderRow): ExchangeOrderDto => ({
  id: Number(r.id),
  side: r.side,
  foodsId: r.foods_id,
  price: r.price,
  qty: r.qty,
  filled: r.filled,
  status: r.status,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
});

/** 同一区服同一食材的盘口串行处理：事务级锁，事务结束自动释放 */
export async function bookLock(tx: Kysely<DB>, shardId: number, foodsId: number): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`exchange:${shardId}:${foodsId}`}))`.execute(tx);
}

const ORDER_COLS = [
  'id',
  'rest_id',
  'side',
  'foods_id',
  'price',
  'qty',
  'filled',
  'status',
  'created_at',
  'expires_at',
] as const;

/** 开通门槛（156-1 设计 §6.1）：等级、注册天数、邮箱；满足返回 null */
export async function eligibility(o: { db: Kysely<DB>; level: number; accountId: number; now: Date; t: { minLevel: number; minAccountDays: number } }) {
  if (o.level < o.t.minLevel) return 'exchange_level';
  const acc = await o.db
    .selectFrom('account')
    .select(['created_at', 'email_verified_at'])
    .where('id', '=', o.accountId)
    .executeTakeFirstOrThrow();
  if (o.now.getTime() - acc.created_at.getTime() < o.t.minAccountDays * 86_400_000) return 'exchange_age';
  if (!acc.email_verified_at) return 'exchange_email';
  return null;
}

export function createExchangeService(d: GameDeps) {
  async function place(o: Op, b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number }): Promise<ExchangePlaceDto> {
    const t = o.tuning.exchange;
    const reason = await eligibility({ db: o.tx, level: o.rest.level, accountId: o.rest.account_id, now: o.now, t });
    if (reason === 'exchange_level') throw requirement(reason, { need: t.minLevel });
    if (reason === 'exchange_age') throw requirement(reason, { days: t.minAccountDays });
    if (reason) throw requirement(reason);
    if (!isTradable(o.config.foods.get(b.foodsId))) throw invalidState('not_tradable');
    if (b.qty > t.maxQty) throw limitReached('exchange_qty', { max: t.maxQty });
    const ref = await refPrice(o.tx, o.config, t, o.shardId, b.foodsId, gameDay(o.now));
    const band = priceBand(ref, t);
    if (b.price < band.min || b.price > band.max) throw invalidState('price_band', band);
    const open = await o.tx
      .selectFrom('exchange_order')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('rest_id', '=', o.rest.id)
      .where('status', '=', 'open')
      .executeTakeFirstOrThrow();
    if (Number(open.n) >= t.maxOpenOrders) throw limitReached('exchange_orders', { max: t.maxOpenOrders });

    if (b.side === 'sell') await subFoods(o, b.foodsId, b.qty, { source: 'exchange' });
    else {
      spendCoin(o, b.price * b.qty, { source: 'exchange' });
      // 橱柜检查：现有 + 未成交买单的剩余 + 本单都要放得下（156-1 设计 §6.1）
      const pending = await o.tx
        .selectFrom('exchange_order')
        .select(sql<string>`coalesce(sum(qty - filled), 0)`.as('n'))
        .where('rest_id', '=', o.rest.id)
        .where('foods_id', '=', b.foodsId)
        .where('side', '=', 'buy')
        .where('status', '=', 'open')
        .executeTakeFirstOrThrow();
      const row = await o.tx
        .selectFrom('cupboard_food')
        .select(['num', 'fridge_num'])
        .where('rest_id', '=', o.rest.id)
        .where('foods_id', '=', b.foodsId)
        .executeTakeFirst();
      const plan = planAddFoods(
        {
          have: row?.num ?? 0,
          fridge: row?.fridge_num ?? 0,
          slotsUsed: await cupboardSlotsUsed(o.tx, o.rest.id),
          slots: o.rest.cupboard_num,
          max: o.rest.foods_max_num,
        },
        Number(pending.n) + b.qty,
      );
      if (plan.dropped > 0) throw invalidState('cupboard_full');
    }

    await bookLock(o.tx, o.shardId, b.foodsId);
    const order = (await o.tx
      .insertInto('exchange_order')
      .values({
        shard_id: o.shardId,
        rest_id: o.rest.id,
        side: b.side,
        foods_id: b.foodsId,
        price: b.price,
        qty: b.qty,
        status: 'open',
        created_at: o.now,
        expires_at: new Date(o.now.getTime() + t.orderHours * 3_600_000),
      })
      .returning(ORDER_COLS)
      .executeTakeFirstOrThrow()) as OrderRow;

    // 撮合（156-1 设计 §6.2）：对面的挂单按价格优先、时间优先；跳过自己的、过期的
    const opposite = b.side === 'buy' ? 'sell' : 'buy';
    let q = o.tx
      .selectFrom('exchange_order')
      .select(ORDER_COLS)
      .where('shard_id', '=', o.shardId)
      .where('foods_id', '=', b.foodsId)
      .where('side', '=', opposite)
      .where('status', '=', 'open')
      .where('expires_at', '>', o.now)
      .where('rest_id', '!=', o.rest.id);
    q =
      b.side === 'buy'
        ? q.where('price', '<=', b.price).orderBy('price', 'asc')
        : q.where('price', '>=', b.price).orderBy('price', 'desc');
    const book = (await q.orderBy('id', 'asc').execute()) as OrderRow[];

    const credits = newCredits();
    const fills: Array<{ price: number; qty: number }> = [];
    let left = b.qty;
    for (const m of book) {
      if (left === 0) break;
      const n = Math.min(left, m.qty - m.filled);
      const price = m.price;
      const fee = feeOf(price, n, t);
      const buy = b.side === 'buy' ? order : m;
      const sell = b.side === 'sell' ? order : m;
      await o.tx
        .insertInto('exchange_trade')
        .values({
          shard_id: o.shardId,
          foods_id: b.foodsId,
          price,
          qty: n,
          buy_order_id: buy.id,
          sell_order_id: sell.id,
          buyer_rest_id: buy.rest_id,
          seller_rest_id: sell.rest_id,
          fee,
          created_at: o.now,
        })
        .execute();
      const mFilled = m.filled + n;
      await o.tx
        .updateTable('exchange_order')
        .set({ filled: mFilled, ...(mFilled === m.qty ? { status: 'filled' as const, closed_at: o.now } : {}) })
        .where('id', '=', m.id)
        .execute();
      // 挂单方：所得进交易所账户，不锁他的店；被动成交写一条个人日志
      if (m.side === 'sell') addCredit(credits, m.rest_id, price * n - fee);
      else addCredit(credits, m.rest_id, 0, b.foodsId, n);
      await o.tx
        .insertInto('rest_log')
        .values({
          rest_id: m.rest_id,
          type: 'exchange.fill',
          params: JSON.stringify({ side: m.side, foodsId: b.foodsId, price, qty: n, fee: m.side === 'sell' ? fee : 0 }),
          created_at: o.now,
        })
        .execute();
      // 吃单方：当场到账
      if (b.side === 'buy') {
        const plan = await addFoods(o, b.foodsId, n, { source: 'exchange' });
        if (plan.dropped > 0) addCredit(credits, o.rest.id, 0, b.foodsId, plan.dropped);
        if (b.price > price) gainCoin(o, (b.price - price) * n, { source: 'exchange' });
      } else gainCoin(o, price * n - fee, { source: 'exchange' });
      fills.push({ price, qty: n });
      left -= n;
    }
    await creditWallets(o.tx, credits);
    const filled = b.qty - left;
    const done = (await o.tx
      .updateTable('exchange_order')
      .set({ filled, ...(left === 0 ? { status: 'filled' as const, closed_at: o.now } : {}) })
      .where('id', '=', order.id)
      .returning(ORDER_COLS)
      .executeTakeFirstOrThrow()) as OrderRow;
    restLog(o, 'exchange.order', { side: b.side, foodsId: b.foodsId, price: b.price, qty: b.qty, filled });
    return { order: orderDto(done), fills };
  }

  const op = <T>(ctx: RestCtx, feature: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature, source: 'exchange' }, fn);

  return {
    place: (ctx: RestCtx, b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number }) =>
      op(ctx, 'exchange', (o) => place(o, b)),
  };
}
export type ExchangeService = ReturnType<typeof createExchangeService>;
```

（`RestaurantRow` 里 `account_id`、`cupboard_num`、`foods_max_num` 的字段名以 schema.ts 为准。`limitReached('exchange_qty')` 是兜底：zod 已经限制 999，区服把 `maxQty` 调小时才会走到。）

`game.ts`：import `createExchangeService`、`ExchangeService`，`Game` 类型加 `exchange: ExchangeService;`，构造处加 `exchange: createExchangeService(deps),`。

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): 交易所下单和撮合"
```

---

### Task 4: 服务端——撤单、取出、过期、查询、路由

**Files:**
- Modify: `apps/server/src/modules/exchange/service.ts`（`cancel`、`withdraw`、`foods`、`book`、`me`）
- Create: `apps/server/src/modules/exchange/jobs.ts`（`exchangeJobs`）、`routes.ts`
- Modify: `apps/server/src/game.ts`（`jobs.push(...exchangeJobs(deps))`）、`apps/server/src/modules/index.ts`（注册路由）
- Test: `apps/server/src/modules/exchange/manage.test.ts`

**Interfaces:**
- Consumes: Task 3 `bookLock`、`orderDto`、`creditWallets`、`eligibility`
- Produces: 路由
  - `GET /api/v1/exchange/foods`、`GET /api/v1/exchange/book/:foodsId`、`GET /api/v1/exchange/me`；
  - `POST /api/v1/exchange/orders`、`POST /api/v1/exchange/orders/:id/cancel`、`POST /api/v1/exchange/withdraw`。

- [ ] **Step 1: 写失败的测试** `manage.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { expireOrders } from './jobs';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;
const H = 3_600_000;

describe('撤单、过期、取出（156-1 设计 §6.3~§6.5）', () => {
  it('撤单：卖单剩余食材回橱柜，买单剩余银币回店；不是自己的单报 NOT_FOUND；撤过的报 order_closed', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 5 } });
    const sell = await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 3 });
    const buy = await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 2 });
    await svc().cancel(r, sell.data.order.id);
    await svc().cancel(r, buy.data.order.id);
    expect(await foodNum(t, r.restaurantId, f.id)).toBe(5);
    expect((await restRow(t, r.restaurantId)).coin).toBe(1_000_000);
    await expect(svc().cancel(r, sell.data.order.id)).rejects.toMatchObject({ params: { reason: 'order_closed' } });
    const other = await trader(t, { shardId });
    await expect(svc().cancel(other, buy.data.order.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('过期：剩余部分退回交易所账户；交易所关闭时撤单、取出、过期照常', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 5 } });
    await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 2 });
    const keep = await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { exchange: false } }) })
      .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify({ features: { exchange: false } }) }))
      .execute();
    t.game.deps.shards.invalidate(shardId);
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await svc().cancel(r, keep.data.order.id);
    const res = await expireOrders(t.game.deps, shardId, new Date(t.clock.now.getTime() + 25 * H));
    expect(res.expired).toBe(1);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 2 } });
    const w = await svc().withdraw(r);
    expect(w.data.foods).toEqual([{ foodsId: f.id, num: 2 }]);
    expect(await foodNum(t, r.restaurantId, f.id)).toBe(5);
  });

  it('取出：银币全部取出；橱柜放不下的食材留在账户里', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 0 });
    await t.db.updateTable('restaurant').set({ foods_max_num: 10, cupboard_num: 1 }).where('id', '=', r.restaurantId).execute();
    await t.db.insertInto('exchange_wallet').values({ rest_id: r.restaurantId, coin: 500 }).execute();
    await t.db.insertInto('exchange_wallet_food').values({ rest_id: r.restaurantId, foods_id: f.id, num: 25 }).execute();
    const w = await svc().withdraw(r);
    expect((await restRow(t, r.restaurantId)).coin).toBe(500);
    const got = w.data.foods.find((x) => x.foodsId === f.id)?.num ?? 0;
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThan(25);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 25 - got } });
  });
});

describe('查询（156-1 设计 §7）', () => {
  it('盘口按价格合并、各 5 档；参考价和允许范围；我的挂单、账户、成交、开通状态', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s = await trader(t, { shardId, foods: { [f.id]: 20 } });
    const s2 = await trader(t, { shardId, foods: { [f.id]: 20 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p + 1, qty: 2 });
    await svc().place(s2, { foodsId: f.id, side: 'sell', price: p + 1, qty: 3 });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p + 2, qty: 1 });
    const b = await trader(t, { shardId });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: p, qty: 4 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: p + 1, qty: 1 });
    const book = await svc().book(b, f.id);
    expect(book).toMatchObject({ ref: p, min: Math.ceil(p * 0.5), max: p * 2, last: p + 1, volume: 1 });
    expect(book.asks).toEqual([
      { price: p + 1, qty: 4 },
      { price: p + 2, qty: 1 },
    ]);
    expect(book.bids).toEqual([{ price: p, qty: 4 }]);
    const me = await svc().me(b);
    expect(me.eligible).toBe(true);
    expect(me.orders.map((o) => o.price)).toEqual([p]);
    expect(me.trades).toEqual([expect.objectContaining({ side: 'buy', price: p + 1, qty: 1, fee: 0 })]);
    const foods = await svc().foods(b);
    expect(foods.find((x) => x.foodsId === f.id)).toMatchObject({ ref: p, last: p + 1 });
    expect(foods.every((x) => t.deps.config.requireFood(x.foodsId).odds < 100)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/manage.test.ts`
Expected: FAIL（`./jobs` 不存在）

- [ ] **Step 3: 实现**

`service.ts` 里加内部函数和方法：

```ts
  /** 退回挂单剩余部分（撤单退回店里；过期由任务退进账户，见 jobs.ts） */
  async function refundToRest(o: Op, r: OrderRow): Promise<void> {
    const left = r.qty - r.filled;
    if (left <= 0) return;
    if (r.side === 'buy') gainCoin(o, r.price * left, { source: 'exchange' });
    else {
      const plan = await addFoods(o, r.foods_id, left, { source: 'exchange' });
      if (plan.dropped > 0) {
        const c = newCredits();
        addCredit(c, o.rest.id, 0, r.foods_id, plan.dropped);
        await creditWallets(o.tx, c);
      }
    }
  }

  async function cancel(o: Op, id: number) {
    const r = (await o.tx
      .selectFrom('exchange_order')
      .select(ORDER_COLS)
      .where('id', '=', String(id))
      .where('rest_id', '=', o.rest.id)
      .executeTakeFirst()) as OrderRow | undefined;
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'exchange_order', id });
    await bookLock(o.tx, o.shardId, r.foods_id);
    const cur = await o.tx
      .updateTable('exchange_order')
      .set({ status: 'cancelled', closed_at: o.now })
      .where('id', '=', r.id)
      .where('status', '=', 'open')
      .returning(ORDER_COLS)
      .executeTakeFirst();
    if (!cur) throw invalidState('order_closed');
    await refundToRest(o, cur as OrderRow);
    restLog(o, 'exchange.cancel', { side: r.side, foodsId: r.foods_id, price: r.price, left: cur.qty - cur.filled });
    return orderDto(cur as OrderRow);
  }

```

取出：

```ts
  async function withdraw(o: Op): Promise<ExchangeWithdrawDto> {
    const w = await o.tx
      .selectFrom('exchange_wallet')
      .select('coin')
      .where('rest_id', '=', o.rest.id)
      .forUpdate()
      .executeTakeFirst();
    const coin = Number(w?.coin ?? 0);
    if (coin > 0) {
      await o.tx.updateTable('exchange_wallet').set({ coin: 0 }).where('rest_id', '=', o.rest.id).execute();
      gainCoin(o, coin, { source: 'exchange' });
    }
    const foods = await o.tx
      .selectFrom('exchange_wallet_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', o.rest.id)
      .where('num', '>', 0)
      .orderBy('foods_id')
      .forUpdate()
      .execute();
    const got: Array<{ foodsId: number; num: number }> = [];
    const left: Array<{ foodsId: number; num: number }> = [];
    for (const f of foods) {
      const plan = await addFoods(o, f.foods_id, f.num, { source: 'exchange' });
      const n = f.num - plan.dropped;
      if (n > 0) got.push({ foodsId: f.foods_id, num: n });
      if (plan.dropped > 0) left.push({ foodsId: f.foods_id, num: plan.dropped });
      await o.tx
        .updateTable('exchange_wallet_food')
        .set({ num: plan.dropped })
        .where('rest_id', '=', o.rest.id)
        .where('foods_id', '=', f.foods_id)
        .execute();
    }
    restLog(o, 'exchange.withdraw', { coin, foods: got });
    return { coin, foods: got, left };
  }
```

查询：

```ts
  async function foods(ctx: RestCtx): Promise<ExchangeFoodDto[]> {
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.exchange;
    const day = gameDay(d.now());
    const list = [...d.config.foods.values()].filter((f) => isTradable(f)).sort((a, b) => a.level - b.level || a.id - b.id);
    const lasts = await d.db
      .selectFrom('exchange_trade')
      .select(['foods_id', 'price'])
      .distinctOn('foods_id')
      .where('shard_id', '=', ctx.shardId)
      .orderBy('foods_id')
      .orderBy('id', 'desc')
      .execute();
    const lastBy = new Map(lasts.map((x) => [x.foods_id, x.price]));
    const out: ExchangeFoodDto[] = [];
    for (const f of list) {
      const ref = await refPrice(d.db, d.config, t, ctx.shardId, f.id, day);
      const last = lastBy.get(f.id) ?? null;
      out.push({ foodsId: f.id, ref, last, changePct: last === null ? null : Math.round(((last - ref) / ref) * 1000) / 1000 });
    }
    return out;
  }

  async function book(ctx: RestCtx, foodsId: number): Promise<ExchangeBookDto> {
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.exchange;
    if (!isTradable(d.config.foods.get(foodsId))) throw invalidState('not_tradable');
    const now = d.now();
    const ref = await refPrice(d.db, d.config, t, ctx.shardId, foodsId, gameDay(now));
    const side = async (sd: 'buy' | 'sell') =>
      (
        await d.db
          .selectFrom('exchange_order')
          .select(['price', sql<string>`sum(qty - filled)`.as('qty')])
          .where('shard_id', '=', ctx.shardId)
          .where('foods_id', '=', foodsId)
          .where('side', '=', sd)
          .where('status', '=', 'open')
          .where('expires_at', '>', now)
          .groupBy('price')
          .orderBy('price', sd === 'buy' ? 'desc' : 'asc')
          .limit(5)
          .execute()
      ).map((x) => ({ price: x.price, qty: Number(x.qty) }));
    const last = await d.db
      .selectFrom('exchange_trade')
      .select('price')
      .where('shard_id', '=', ctx.shardId)
      .where('foods_id', '=', foodsId)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    const vol = await d.db
      .selectFrom('exchange_trade')
      .select(sql<string>`coalesce(sum(qty), 0)`.as('n'))
      .where('shard_id', '=', ctx.shardId)
      .where('foods_id', '=', foodsId)
      .where('created_at', '>=', gameTime(gameDay(now), 0))
      .executeTakeFirstOrThrow();
    return { foodsId, ref, ...priceBand(ref, t), last: last?.price ?? null, volume: Number(vol.n), bids: await side('buy'), asks: await side('sell') };
  }

  async function me(ctx: RestCtx): Promise<ExchangeMeDto> {
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.exchange;
    const now = d.now();
    const rest = await d.db.selectFrom('restaurant').select('level').where('id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
    const reason = await eligibility({ db: d.db, level: rest.level, accountId: ctx.accountId, now, t });
    const orders = (await d.db
      .selectFrom('exchange_order')
      .select(ORDER_COLS)
      .where('rest_id', '=', ctx.restaurantId)
      .where('status', '=', 'open')
      .orderBy('id', 'desc')
      .execute()) as OrderRow[];
    const w = await d.db.selectFrom('exchange_wallet').select('coin').where('rest_id', '=', ctx.restaurantId).executeTakeFirst();
    const wf = await d.db
      .selectFrom('exchange_wallet_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', ctx.restaurantId)
      .where('num', '>', 0)
      .orderBy('foods_id')
      .execute();
    const since = new Date(now.getTime() - 7 * 86_400_000);
    const trades = await d.db
      .selectFrom('exchange_trade')
      .select(['buyer_rest_id', 'foods_id', 'price', 'qty', 'fee', 'created_at'])
      .where((eb) => eb.or([eb('buyer_rest_id', '=', ctx.restaurantId), eb('seller_rest_id', '=', ctx.restaurantId)]))
      .where('created_at', '>=', since)
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    return {
      eligible: reason === null,
      reason,
      need: { level: t.minLevel, days: t.minAccountDays },
      orders: orders.map(orderDto),
      wallet: { coin: Number(w?.coin ?? 0), foods: wf.map((x) => ({ foodsId: x.foods_id, num: x.num })) },
      trades: trades.map((x) => {
        const side = x.buyer_rest_id === ctx.restaurantId ? ('buy' as const) : ('sell' as const);
        return { side, foodsId: x.foods_id, price: x.price, qty: x.qty, fee: side === 'sell' ? Number(x.fee) : 0, createdAt: x.created_at.toISOString() };
      }),
      feeRate: t.feeRate,
    };
  }
```

返回对象加：

```ts
    cancel: (ctx: RestCtx, id: number) => op(ctx, 'restaurant', (o) => cancel(o, id)),
    withdraw: (ctx: RestCtx) => op(ctx, 'restaurant', (o) => withdraw(o)),
    foods,
    book,
    me,
```

（import 补齐 `AppError`、`ErrorCode`、`gameTime` 和各 DTO 类型；`RestCtx.accountId` 以 core/deps 为准。查询接口要求功能开关：`foods`、`book`、`me` 开头调用 `await d.shards.ensureFeature(ctx.shardId, 'exchange')`，`me` 例外：关掉时也要能看自己的挂单和账户，所以 `me` 不检查。）

`jobs.ts`：

```ts
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { bookLock } from './service';
import { addCredit, creditWallets, newCredits } from './wallet';

const BATCH = 500;

/** 过期（156-1 设计 §6.4）：剩余部分退回交易所账户，不锁店；一批最多 500 张 */
export async function expireOrders(d: GameDeps, shardId: number, now: Date): Promise<{ expired: number }> {
  return d.db.transaction().execute(async (tx) => {
    const due = await tx
      .selectFrom('exchange_order')
      .select(['id', 'foods_id'])
      .where('shard_id', '=', shardId)
      .where('status', '=', 'open')
      .where('expires_at', '<=', now)
      .orderBy('foods_id')
      .orderBy('id')
      .limit(BATCH)
      .execute();
    const credits = newCredits();
    let n = 0;
    for (const foodsId of [...new Set(due.map((x) => x.foods_id))]) {
      await bookLock(tx, shardId, foodsId);
      const rows = await tx
        .updateTable('exchange_order')
        .set({ status: 'expired', closed_at: now })
        .where('id', 'in', due.filter((x) => x.foods_id === foodsId).map((x) => x.id))
        .where('status', '=', 'open')
        .returning(['rest_id', 'side', 'foods_id', 'price', 'qty', 'filled'])
        .execute();
      for (const r of rows) {
        const left = r.qty - r.filled;
        if (r.side === 'buy') addCredit(credits, r.rest_id, r.price * left);
        else addCredit(credits, r.rest_id, 0, r.foods_id, left);
        await tx
          .insertInto('rest_log')
          .values({
            rest_id: r.rest_id,
            type: 'exchange.expire',
            params: JSON.stringify({ side: r.side, foodsId: r.foods_id, price: r.price, left }),
            created_at: now,
          })
          .execute();
        n++;
      }
    }
    await creditWallets(tx, credits);
    return { expired: n };
  });
}

/** 每分钟一次；挂在 restaurant 上，区服关掉交易所时也照常退回 */
export function exchangeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'exchange-expire',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: ({ shardId, now }) => expireOrders(d, shardId, now),
    },
  ];
}
```

`routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exchangeOrderBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ExchangeService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const foodParam = z.object({ foodsId: z.coerce.number().int().positive() });

export function exchangeRoutes(svc: ExchangeService): FastifyPluginAsync {
  return async (r) => {
    r.get('/exchange/foods', async (req) => ok(await svc.foods(restCtxOf(req))));
    r.get('/exchange/book/:foodsId', async (req) =>
      ok(await svc.book(restCtxOf(req), parse(foodParam, req.params).foodsId)),
    );
    r.get('/exchange/me', async (req) => ok(await svc.me(restCtxOf(req))));
    r.post('/exchange/orders', async (req) =>
      okOp(await svc.place(restCtxOf(req), parse(exchangeOrderBody, req.body))),
    );
    r.post('/exchange/orders/:id/cancel', async (req) =>
      okOp(await svc.cancel(restCtxOf(req), parse(idParam, req.params).id)),
    );
    r.post('/exchange/withdraw', async (req) => okOp(await svc.withdraw(restCtxOf(req))));
  };
}
```

`modules/index.ts` 登记 `app.register(exchangeRoutes(game.exchange), { prefix: '/api/v1' });`。`game.ts` 加 `jobs.push(...exchangeJobs(deps));`。如果有"所有路由都要登录"或"接口清单"类的测试（例如权限矩阵只管后台路由，可以不动），按测试要求补。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange apps/server/src/http apps/server/src/core && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): 交易所撤单、取出、过期任务、查询和路由"
```

---

### Task 5: 前端——交易所页

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`
- Create: `apps/web/src/views/ExchangeView.vue`、`ExchangeView.test.ts`
- Modify: `apps/web/src/router.ts`（`/exchange`，`needRestaurant`）、`apps/web/src/components/MoreLinks.vue`、`apps/web/src/views/MarketView.vue`（入口）
- Modify: `apps/web/src/utils/events.ts`（日志文案）、`apps/web/src/i18n/zh-CN.ts`（错误文案）

**Interfaces:**
- Consumes: Task 4 路由；Task 1 DTO

- [ ] **Step 1: 写失败的测试** `ExchangeView.test.ts`

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExchangeBookDto, ExchangeMeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import ExchangeView from './ExchangeView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    exchangeFoods: vi.fn(),
    exchangeBook: vi.fn(),
    exchangeMe: vi.fn(),
    exchangePlace: vi.fn(),
    exchangeCancel: vi.fn(),
    exchangeWithdraw: vi.fn(),
  },
}));

const book: ExchangeBookDto = {
  foodsId: 11,
  ref: 1000,
  min: 500,
  max: 2000,
  last: 1100,
  volume: 7,
  bids: [{ price: 990, qty: 3 }],
  asks: [
    { price: 1010, qty: 2 },
    { price: 1020, qty: 5 },
  ],
};
const me = (p: Partial<ExchangeMeDto> = {}): ExchangeMeDto => ({
  eligible: true,
  reason: null,
  need: { level: 20, days: 7 },
  orders: [
    {
      id: 5,
      side: 'sell',
      foodsId: 11,
      price: 1500,
      qty: 3,
      filled: 1,
      status: 'open',
      createdAt: '2026-10-02T00:00:00Z',
      expiresAt: '2026-10-03T00:00:00Z',
    },
  ],
  wallet: { coin: 950, foods: [{ foodsId: 11, num: 2 }] },
  trades: [],
  feeRate: 0.05,
  ...p,
});

describe('ExchangeView（156-1 设计 §8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 11, name: '松露', level: 6 },
        { id: 12, name: '藏红花', level: 3 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue([
      { foodsId: 12, ref: 4000, last: null, changePct: null },
      { foodsId: 11, ref: 1000, last: 1100, changePct: 0.1 },
    ]);
    vi.mocked(endpoints.exchangeBook).mockResolvedValue(book);
    vi.mocked(endpoints.exchangeMe).mockResolvedValue(me());
    vi.mocked(endpoints.exchangePlace).mockResolvedValue({ order: me().orders[0]!, fills: [{ price: 1010, qty: 2 }] } as never);
  });

  it('食材按等级分组；选中后显示盘口、参考价和允许范围', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    expect(w.find('[data-testid="ex-food-12"]').text()).toContain('藏红花');
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchangeBook).toHaveBeenCalledWith(11);
    expect(w.find('[data-testid="ex-book"]').text()).toContain('1,010');
    expect(w.find('[data-testid="ex-book"]').text()).toContain('参考价 1,000');
    expect(w.find('[data-testid="ex-band"]').text()).toContain('500 ~ 2,000');
  });

  it('点盘口的价格填进表单；下单显示预计花费；提交后刷新并提示成交', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-ask-1010"]').trigger('click');
    expect((w.find('[data-testid="ex-price"]').element as HTMLInputElement).value).toBe('1010');
    await w.find('[data-testid="ex-qty"]').setValue('2');
    expect(w.find('[data-testid="ex-estimate"]').text()).toContain('2,020');
    await w.find('[data-testid="ex-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchangePlace).toHaveBeenCalledWith({ foodsId: 11, side: 'buy', price: 1010, qty: 2 });
    expect(endpoints.exchangeMe).toHaveBeenCalledTimes(2);
  });

  it('卖出时显示扣手续费后的所得', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-side-sell"]').trigger('click');
    await w.find('[data-testid="ex-price"]').setValue('1000');
    await w.find('[data-testid="ex-qty"]').setValue('3');
    expect(w.find('[data-testid="ex-estimate"]').text()).toContain('2,850');
  });

  it('不满足门槛时表单禁用并写明原因', async () => {
    vi.mocked(endpoints.exchangeMe).mockResolvedValue(me({ eligible: false, reason: 'exchange_level' }));
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="ex-submit"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('餐厅 20 级才能交易');
  });

  it('撤单和全部取出', async () => {
    vi.mocked(endpoints.exchangeCancel).mockResolvedValue({} as never);
    vi.mocked(endpoints.exchangeWithdraw).mockResolvedValue({ coin: 950, foods: [], left: [] } as never);
    const w = mount(ExchangeView);
    await flushPromises();
    expect(w.find('[data-testid="ex-wallet"]').text()).toContain('950');
    await w.find('[data-testid="ex-cancel-5"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchangeCancel).toHaveBeenCalledWith(5);
    await w.find('[data-testid="ex-withdraw"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchangeWithdraw).toHaveBeenCalled();
  });
});
```

`events.test.ts` 追加：

```ts
describe('交易所日志（156-1）', () => {
  it('挂单、被动成交、撤单、过期、取出都有文案', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) =>
      logText({ id: 1, type, params, createdAt: '2026-10-02T00:00:00Z' } as never, names);
    expect(log('exchange.order', { side: 'buy', foodsId: 3, price: 100, qty: 5, filled: 2 })).toBe(
      '在交易所挂买单：食材3 ×5，单价 100（当场成交 2 个）',
    );
    expect(log('exchange.fill', { side: 'sell', foodsId: 3, price: 100, qty: 2, fee: 10 })).toBe(
      '交易所卖单成交：食材3 ×2，单价 100，手续费 10（所得在交易所账户）',
    );
    expect(log('exchange.cancel', { side: 'sell', foodsId: 3, price: 100, left: 1 })).toBe(
      '撤销交易所卖单：食材3，退回 1 个',
    );
    expect(log('exchange.expire', { side: 'buy', foodsId: 3, price: 100, left: 1 })).toBe(
      '交易所买单过期：食材3，剩余 1 个的冻结退回交易所账户',
    );
    expect(log('exchange.withdraw', { coin: 950, foods: [{ foodsId: 3, num: 2 }] })).toBe(
      '从交易所账户取出：银币 950、食材3×2',
    );
  });
});
```

（`logText` 的入参以 events.ts 现有签名为准；`RestLogDto` 的字段名不一致就按实际改。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/ExchangeView.test.ts apps/web/src/utils/events.test.ts`
Expected: FAIL

- [ ] **Step 3: 接口**（`endpoints.ts`，类型 import 补齐）

```ts
  exchangeFoods: () => api.get<ExchangeFoodDto[]>('/api/v1/exchange/foods'),
  exchangeBook: (foodsId: number) => api.get<ExchangeBookDto>(`/api/v1/exchange/book/${foodsId}`),
  exchangeMe: () => api.get<ExchangeMeDto>('/api/v1/exchange/me'),
  exchangePlace: (b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number }) =>
    api.post<ExchangePlaceDto>('/api/v1/exchange/orders', b),
  exchangeCancel: (id: number) => api.post<ExchangeOrderDto>(`/api/v1/exchange/orders/${id}/cancel`, {}),
  exchangeWithdraw: () => api.post<ExchangeWithdrawDto>('/api/v1/exchange/withdraw', {}),
```

- [ ] **Step 4: 页面** `ExchangeView.vue`

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ExchangeBookDto, ExchangeFoodDto, ExchangeMeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/** 交易所（问题记录 156，156-1 设计 §8）：选食材 → 盘口 → 下单；我的挂单、账户、成交 */
const catalog = useCatalogStore();
const toast = useToastStore();
const foods = ref<ExchangeFoodDto[]>([]);
const me = ref<ExchangeMeDto | null>(null);
const book = ref<ExchangeBookDto | null>(null);
const selected = ref<number | null>(null);
const search = ref('');
const side = ref<'buy' | 'sell'>('buy');
const price = ref<number | ''>('');
const qty = ref<number | ''>(1);
const busy = ref(false);

const levelOf = (id: number) => catalog.foodsMap.get(id)?.level ?? 0;
const groups = computed(() => {
  const q = search.value.trim();
  const list = foods.value.filter((f) => !q || catalog.foodName(f.foodsId).includes(q));
  const by = new Map<number, ExchangeFoodDto[]>();
  for (const f of list) by.set(levelOf(f.foodsId), [...(by.get(levelOf(f.foodsId)) ?? []), f]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
});
const pct = (x: number | null) => (x === null ? '' : `${x >= 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`);
const REASON: Record<string, (m: ExchangeMeDto) => string> = {
  exchange_level: (m) => `餐厅 ${m.need.level} 级才能交易`,
  exchange_age: (m) => `账号注册满 ${m.need.days} 天才能交易`,
  exchange_email: () => '验证邮箱后才能交易',
};
const blocked = computed(() => (me.value && !me.value.eligible ? REASON[me.value.reason ?? '']?.(me.value) ?? '暂时不能交易' : ''));
const valid = computed(
  () =>
    book.value !== null &&
    typeof price.value === 'number' &&
    typeof qty.value === 'number' &&
    Number.isInteger(price.value) &&
    Number.isInteger(qty.value) &&
    price.value >= book.value.min &&
    price.value <= book.value.max &&
    qty.value >= 1 &&
    qty.value <= 999,
);
const estimate = computed(() => {
  if (!valid.value || !me.value) return '';
  const total = (price.value as number) * (qty.value as number);
  return side.value === 'buy'
    ? `预计最多花费 ${formatNum(total)} 银币`
    : `全部成交后约得 ${formatNum(total - Math.floor(total * me.value.feeRate))} 银币（已扣手续费）`;
});

async function loadMe() {
  me.value = await endpoints.exchangeMe();
}
async function pick(id: number) {
  selected.value = id;
  book.value = await endpoints.exchangeBook(id);
}
async function run(fn: () => Promise<unknown>, ok: (r: unknown) => string, fallback: string) {
  busy.value = true;
  try {
    const r = await fn();
    toast.push(ok(r));
    await loadMe();
    if (selected.value !== null) book.value = await endpoints.exchangeBook(selected.value);
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function submit() {
  if (!valid.value || selected.value === null) return;
  const b = { foodsId: selected.value, side: side.value, price: price.value as number, qty: qty.value as number };
  void run(
    () => endpoints.exchangePlace(b),
    (r) => {
      const n = (r as { fills: Array<{ qty: number }> }).fills.reduce((s, x) => s + x.qty, 0);
      return n > 0 ? `已成交 ${n} 个${n < b.qty ? '，其余挂单中' : ''}` : '已挂单';
    },
    '下单失败',
  );
}
const cancel = (id: number) => run(() => endpoints.exchangeCancel(id), () => '已撤单', '撤单失败');
const withdraw = () => run(() => endpoints.exchangeWithdraw(), () => '已取出', '取出失败');

onMounted(async () => {
  try {
    [foods.value] = await Promise.all([endpoints.exchangeFoods(), loadMe()]);
  } catch (e) {
    toast.push(errorMessage(e, '读取交易所失败'), 'danger');
  }
});
</script>

<template>
  <h5>交易所</h5>
  <div class="small text-muted mb-2">玩家之间买卖稀有食材。挂单价要在当天参考价的一半到两倍之间；卖方成交时扣手续费。</div>
  <input v-model="search" class="form-control form-control-sm mb-2" placeholder="搜索食材" />
  <div class="dt-card mb-3" style="max-height: 14rem; overflow-y: auto">
    <div v-for="[lv, list] in groups" :key="lv" class="mb-1">
      <div class="dt-group-label">{{ lv }} 级</div>
      <button
        v-for="f in list"
        :key="f.foodsId"
        type="button"
        :class="['btn btn-sm me-1 mb-1', f.foodsId === selected ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`ex-food-${f.foodsId}`"
        @click="pick(f.foodsId)"
      >
        {{ catalog.foodName(f.foodsId) }}
        <span class="small opacity-75">{{ formatNum(f.last ?? f.ref) }} {{ pct(f.changePct) }}</span>
      </button>
    </div>
  </div>

  <div v-if="book" class="dt-card mb-3" data-testid="ex-book">
    <div class="d-flex flex-wrap gap-2 small mb-1">
      <b>{{ catalog.foodName(book.foodsId) }}</b>
      <span>参考价 {{ formatNum(book.ref) }}</span>
      <span v-if="book.last !== null">最新 {{ formatNum(book.last) }}</span>
      <span>今日成交 {{ formatNum(book.volume) }}</span>
      <span class="text-muted" data-testid="ex-band">可挂 {{ formatNum(book.min) }} ~ {{ formatNum(book.max) }}</span>
    </div>
    <table class="table table-sm small mb-2">
      <tbody>
        <tr
          v-for="a in [...book.asks].reverse()"
          :key="`a${a.price}`"
          class="text-danger"
          role="button"
          :data-testid="`ex-ask-${a.price}`"
          @click="price = a.price"
        >
          <td>卖</td>
          <td>{{ formatNum(a.price) }}</td>
          <td class="text-end">{{ formatNum(a.qty) }}</td>
        </tr>
        <tr
          v-for="b in book.bids"
          :key="`b${b.price}`"
          class="text-success"
          role="button"
          :data-testid="`ex-bid-${b.price}`"
          @click="price = b.price"
        >
          <td>买</td>
          <td>{{ formatNum(b.price) }}</td>
          <td class="text-end">{{ formatNum(b.qty) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="btn-group btn-group-sm mb-2">
      <button type="button" :class="['btn', side === 'buy' ? 'btn-success' : 'btn-outline-success']" data-testid="ex-side-buy" @click="side = 'buy'">买入</button>
      <button type="button" :class="['btn', side === 'sell' ? 'btn-danger' : 'btn-outline-danger']" data-testid="ex-side-sell" @click="side = 'sell'">卖出</button>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center small">
      单价
      <input v-model.number="price" type="number" :min="book.min" :max="book.max" class="form-control form-control-sm" style="width: 7rem" data-testid="ex-price" />
      数量
      <input v-model.number="qty" type="number" min="1" max="999" class="form-control form-control-sm" style="width: 5rem" data-testid="ex-qty" />
      <button type="button" class="btn btn-sm btn-primary" :disabled="busy || !valid || !!blocked" data-testid="ex-submit" @click="submit">
        {{ side === 'buy' ? '挂买单' : '挂卖单' }}
      </button>
    </div>
    <div class="small text-muted mt-1" data-testid="ex-estimate">{{ estimate }}</div>
    <div v-if="blocked" class="small text-danger mt-1">{{ blocked }}</div>
  </div>

  <template v-if="me">
    <h6 class="dt-section">交易所账户</h6>
    <div class="dt-card mb-3 d-flex flex-wrap align-items-center gap-2 small" data-testid="ex-wallet">
      <span>银币 {{ formatNum(me.wallet.coin) }}</span>
      <span v-for="f in me.wallet.foods" :key="f.foodsId">{{ catalog.foodName(f.foodsId) }}×{{ f.num }}</span>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary ms-auto"
        :disabled="busy || (me.wallet.coin === 0 && me.wallet.foods.length === 0)"
        data-testid="ex-withdraw"
        @click="withdraw"
      >
        全部取出
      </button>
    </div>
    <h6 class="dt-section">我的挂单</h6>
    <div v-if="me.orders.length === 0" class="small text-muted mb-3">没有挂单</div>
    <div v-for="o in me.orders" :key="o.id" class="d-flex align-items-center gap-2 small border-bottom py-1">
      <span :class="o.side === 'buy' ? 'text-success' : 'text-danger'">{{ o.side === 'buy' ? '买' : '卖' }}</span>
      <span class="flex-fill">{{ catalog.foodName(o.foodsId) }} {{ formatNum(o.price) }} × {{ o.qty }}（已成交 {{ o.filled }}）</span>
      <button type="button" class="btn btn-sm btn-link text-danger" :disabled="busy" :data-testid="`ex-cancel-${o.id}`" @click="cancel(o.id)">撤单</button>
    </div>
    <h6 class="dt-section mt-3">近 7 天成交</h6>
    <div v-if="me.trades.length === 0" class="small text-muted">没有成交</div>
    <div v-for="(x, i) in me.trades" :key="i" class="small border-bottom py-1">
      {{ x.side === 'buy' ? '买入' : '卖出' }} {{ catalog.foodName(x.foodsId) }} {{ formatNum(x.price) }} × {{ x.qty }}
      <span v-if="x.fee > 0" class="text-muted">（手续费 {{ formatNum(x.fee) }}）</span>
    </div>
  </template>
</template>
```

（`catalog.foodsMap`、`catalog.foodName` 的名字以 stores/catalog.ts 为准。）

路由：`router.ts` 在 `/market` 后加：

```ts
  {
    path: '/exchange',
    name: 'exchange',
    component: () => import('./views/ExchangeView.vue'),
    meta: { needRestaurant: true },
  },
```

`MoreLinks.vue` 在"限时活动"后加 `{ to: '/exchange', icon: 'bi-graph-up-arrow', label: '交易所' },`。`MarketView.vue` 模板最上面加：

```vue
  <div class="d-flex justify-content-end mb-2">
    <RouterLink to="/exchange" class="btn btn-sm btn-outline-primary" data-testid="market-exchange">
      <i class="bi bi-graph-up-arrow"></i> 交易所
    </RouterLink>
  </div>
```

（`RouterLink` 没有 import 就补上。）

`events.ts` 的 `LOGS` 加：

```ts
  'exchange.order': (p, names) =>
    `在交易所挂${p.side === 'buy' ? '买' : '卖'}单：${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}，单价 ${formatNum(n(p, 'price'))}${n(p, 'filled') > 0 ? `（当场成交 ${n(p, 'filled')} 个）` : ''}`,
  'exchange.fill': (p, names) =>
    p.side === 'sell'
      ? `交易所卖单成交：${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}，单价 ${formatNum(n(p, 'price'))}，手续费 ${formatNum(n(p, 'fee'))}（所得在交易所账户）`
      : `交易所买单成交：${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}，单价 ${formatNum(n(p, 'price'))}（食材在交易所账户）`,
  'exchange.cancel': (p, names) =>
    `撤销交易所${p.side === 'buy' ? '买' : '卖'}单：${names.foodName(n(p, 'foodsId'))}，退回 ${n(p, 'left')} 个`,
  'exchange.expire': (p, names) =>
    `交易所${p.side === 'buy' ? '买' : '卖'}单过期：${names.foodName(n(p, 'foodsId'))}，剩余 ${n(p, 'left')} 个的冻结退回交易所账户`,
  'exchange.withdraw': (p, names) =>
    `从交易所账户取出：${[
      ...(n(p, 'coin') > 0 ? [`银币 ${formatNum(n(p, 'coin'))}`] : []),
      ...(Array.isArray(p.foods) ? p.foods : []).map(
        (f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`,
      ),
    ].join('、')}`,
```

`zh-CN.ts`：
- `STATE` 加：
  - `not_tradable: '这种食材不能在交易所交易'`；
  - `price_band: '价格超出今天允许的范围'`（带 min/max 时用专门分支：``价格要在 ${min} ~ ${max} 之间``）；
  - `cupboard_full: '橱柜放不下这么多，先腾出位置再挂买单'`；
  - `order_closed: '这张单已经成交、撤销或过期了'`。
- `LIMIT` 加：
  - `exchange_orders: (p) => ``最多同时挂 ${String(p.max)} 张单```；
  - `exchange_qty: (p) => ``每张单最多 ${String(p.max)} 个```。
- `REQUIREMENT` 加：
  - `exchange_level: (p) => ``餐厅 ${String(p.need)} 级才能交易```；
  - `exchange_age: (p) => ``账号注册满 ${String(p.days)} 天才能交易```；
  - `exchange_email: () => '验证邮箱后才能交易'`。

`price_band` 的专门分支放在 `errorText` 里已有的 `INVALID_STATE` 专门分支旁边：

```ts
  if (code === 'INVALID_STATE' && params.reason === 'price_band' && params.min !== undefined)
    return `价格要在 ${String(params.min)} ~ ${String(params.max)} 之间`;
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm --filter @dt/web lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 交易所页"
```

---

### Task 6: 全量检查

- [ ] **Step 1:** `pnpm vitest run`（输出写到工作区文件，读尾部）→ 全部通过
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → 通过
- [ ] **Step 3:** `pnpm format:check` → 只允许 `问题记录.md` 报警
- [ ] **Step 4:** 开发服务重启后，用 e2e 的注册流程手动走一遍：新号门槛不满足时页面提示；把账号改成满足门槛后挂卖单、另一个号吃单（只改自己新注册的 e2e 账号）。能写成 `apps/web/e2e/exchange.spec.ts` 就写，结束时删掉自己的挂单和账号数据。
