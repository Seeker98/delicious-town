# 交易所 156-3 系统做市 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交易所加一个系统做市商：按参考价 × 0.7 收（封顶到菜场最低价 × 0.9），按参考价 × 1.3 卖自己的库存，差价回收银币。

**Architecture:** 新文件 `exchange/maker.ts` 放纯函数（菜场最低价、系统买卖价、能收的数量）和库存读写；`service.ts` 的撮合循环把系统报价当作盘口里的一档插进队列（同价玩家优先）；系统成交写 `exchange_trade.system = true`、系统一方的店和账号为空，不进参考价、不标记、不冻结。后台加只读汇总 `GET /admin/exchange/maker`。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Pinia、Bootstrap 5、Vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-exchange-3-maker-design.md`

## Global Constraints

- 回复和文案都用中文；不改 `问题记录.md`。
- 区服数值 `tuning.exchange.maker` = `{ "enabled": true, "bidRate": 0.7, "askRate": 1.3, "marketCapRate": 0.9, "dailyBuy": 100, "stockMax": 500, "playerDaily": 20 }`，`tuning.json`、zod、`setting_docs.json` 都要加。
- 买价：`floor(ref × bidRate)`，菜场最低价不为空时再取 `min(买价, floor(菜场最低价 × marketCapRate))`；高于 `max` 取 `max`；**低于 `min` 就没有买这一档**。
- 卖价：`ceil(ref × askRate)`，夹到 `[min, max]`。
- 能收的数量：`min(dailyBuy − 今天已收, stockMax − 库存, playerDaily − 这个玩家今天已卖给系统)`；能卖的数量：库存。
- 同价时玩家的单先成交，系统排最后；系统价格更好时系统先成交。
- 卖给系统照常扣 5% 手续费；系统成交没有可疑标记、不进冷静期、不算参考价、不算反复对倒。
- 玩家每天卖给系统的数量记在 `daily_counter`，键 `exchange.toSystem`，在玩家自己的锁店事务里更新；系统库存和每日收购在盘口锁里更新。
- 最新成交价（列表 `last`/`changePct`、盘口 `last`）只看玩家之间的成交；盘口今日成交量包括系统成交。
- 迁移 0028：`exchange_trade` 的 `buyer_rest_id`、`seller_rest_id` 改可空，加 `system boolean not null default false`；新表 `exchange_stock`、`exchange_maker_day`。
- 后台 `GET /admin/exchange/maker?shardId`（`mod`），权限矩阵测试要加。
- 测试只动自己建的区服和店；全服数据不碰。

## Review Focus

1. 一次下单的数量超过系统能收的：系统吃满额度，剩下的照常挂在盘口（Task 3 测试"玩家每天卖给系统的上限……剩下的挂着"）。
2. 被冻结的店不能和系统成交（Task 3 测试"被冻结的店不能卖给系统"）。
3. 封顶后低于挂单下限不报买价；系统买价永远不高于卖价（Task 1 测试"低于挂单下限没有买价"）。
4. 盘口里系统买档的数量按看的人自己的剩余额度；系统库存卖完后没有卖档（Task 4 测试）。
5. 全服加成让菜场打折（`market.priceFactor` < 1）时封顶跟着降（Task 1 测试"priceFactor 打折"）。

---

### Task 1: 区服数值和报价纯函数

**Files:**
- Modify: `packages/config/src/tuning.ts`（`exchange` 段）
- Modify: `packages/config/data/game/tuning.json`（`exchange` 段）
- Modify: `packages/config/data/game/setting_docs.json`
- Create: `apps/server/src/modules/exchange/maker.ts`
- Test: `apps/server/src/modules/exchange/maker.test.ts`

**Interfaces:**
- Produces:
  - `type MakerTuning = ExchangeTuning['maker']`
  - `marketFloor(food: Food, config: GameConfig, mt: Tuning['market']): number | null`
  - `makerPrices(ref: number, floor: number | null, band: { min: number; max: number }, m: MakerTuning): { bid: number | null; ask: number }`
  - `makerBuyQty(m: MakerTuning, s: { bought: number; stock: number; playerToday: number }): number`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/exchange/maker.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { Food } from '@dt/config';
import { testConfig } from '../../../test/config';
import { makerBuyQty, makerPrices, marketFloor } from './maker';
import { priceBand } from './rules';

const config = testConfig();
const mt = config.tuning.market;
const ex = config.tuning.exchange;
const m = ex.maker;
const rareAt = (level: number) =>
  [...config.foods.values()].find((f) => f.level === level && f.odds < 100 && f.odds > 0)!;
/** 现有天气数据里菜场最便宜是七折（marketCoin −0.3） */
const CHEAPEST = 0.7;

describe('菜场最低价（156-3 设计 §4.1）', () => {
  it('日常货架的等级按系统定价 × 最便宜天气', () => {
    const f = rareAt(1);
    expect(marketFloor(f, config, mt)).toBeCloseTo(f.coin * CHEAPEST, 6);
  });

  it('特价货架的等级按 specialPrice；高级货架等级取两者便宜的', () => {
    const f3 = rareAt(3);
    expect(marketFloor(f3, config, mt)).toBeCloseTo(mt.specialPrice * CHEAPEST, 6);
    const f4 = rareAt(4);
    expect(marketFloor(f4, config, mt)).toBeCloseTo(
      Math.min(mt.specialPrice, f4.coin * mt.premiumPriceFactor) * CHEAPEST,
      6,
    );
  });

  it('热门稀缺池里的食材也算特价货架', () => {
    const f6 = rareAt(6);
    const hot = { ...config, hotFoodPool: { items: [f6], prefix: [1], total: 1 } } as typeof config;
    expect(marketFloor(f6, hot, mt)).toBeCloseTo(mt.specialPrice * CHEAPEST, 6);
  });

  it('菜场不卖的返回 null', () => {
    expect(marketFloor(rareAt(6), config, mt)).toBeNull();
    expect(marketFloor({ ...rareAt(1), level: 8 } as Food, config, mt)).toBeNull();
  });

  it('priceFactor 打折时封顶跟着降（Review Focus 5）', () => {
    const f = rareAt(1);
    expect(marketFloor(f, config, { ...mt, priceFactor: 0.5 })).toBeCloseTo(f.coin * CHEAPEST * 0.5, 6);
  });
});

describe('系统买卖价（156-3 设计 §4.2）', () => {
  const band = priceBand(1000, ex);

  it('买价 = 参考价 × 0.7，卖价 = 参考价 × 1.3', () => {
    expect(makerPrices(1000, null, band, m)).toEqual({ bid: 700, ask: 1300 });
    expect(makerPrices(1001, null, priceBand(1001, ex), m)).toEqual({ bid: 700, ask: 1302 });
  });

  it('被菜场价封顶', () => {
    expect(makerPrices(1000, 1000, band, m).bid).toBe(700);
    expect(makerPrices(1000, 700, band, m).bid).toBe(630);
  });

  it('低于挂单下限没有买价，不往上抬；买价永远不高于卖价（Review Focus 3）', () => {
    expect(makerPrices(1000, 550, band, m)).toEqual({ bid: null, ask: 1300 });
    // 特价货架封顶 2999 × 0.7 × 0.9 = 1889，3 级参考价最低 3800 时下限 1900
    expect(makerPrices(3800, 2999 * CHEAPEST, priceBand(3800, ex), m).bid).toBeNull();
    for (const ref of [1, 7, 999, 3800, 62000])
      for (const floor of [null, ref * 0.3, ref * 2]) {
        const p = makerPrices(ref, floor, priceBand(ref, ex), m);
        if (p.bid !== null) expect(p.bid).toBeLessThan(p.ask);
      }
  });

  it('夹在允许范围内', () => {
    expect(makerPrices(1000, null, band, { ...m, bidRate: 3, askRate: 3 })).toEqual({ bid: 2000, ask: 2000 });
    expect(makerPrices(1000, null, band, { ...m, askRate: 0.3 }).ask).toBe(500);
  });
});

describe('系统能收的数量', () => {
  it('取每日收购、库存上限、个人每日三者剩余的最小值，不小于 0', () => {
    expect(makerBuyQty(m, { bought: 0, stock: 0, playerToday: 0 })).toBe(20);
    expect(makerBuyQty(m, { bought: 95, stock: 0, playerToday: 0 })).toBe(5);
    expect(makerBuyQty(m, { bought: 0, stock: 497, playerToday: 0 })).toBe(3);
    expect(makerBuyQty(m, { bought: 0, stock: 0, playerToday: 18 })).toBe(2);
    expect(makerBuyQty(m, { bought: 120, stock: 0, playerToday: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/maker.test.ts`
Expected: FAIL，`Cannot find module './maker'` 或 `ex.maker` 为 undefined。

- [ ] **Step 3: 加区服数值**

`packages/config/src/tuning.ts` 的 `exchange` 段，在 `suspicious` 之后、`refOverrides` 之前加：

```ts
    /** 系统做市（156-3） */
    maker: z.object({
      enabled: z.boolean(),
      bidRate: z.number().positive(),
      askRate: z.number().positive(),
      marketCapRate: z.number().positive(),
      dailyBuy: int.min(0),
      stockMax: int.min(0),
      playerDaily: int.min(0),
    }),
```

`packages/config/data/game/tuning.json` 的 `exchange` 段，`suspicious` 一行之后加：

```json
    "maker": { "enabled": true, "bidRate": 0.7, "askRate": 1.3, "marketCapRate": 0.9, "dailyBuy": 100, "stockMax": 500, "playerDaily": 20 },
```

`packages/config/data/game/setting_docs.json` 的 fields 里，`tuning.exchange.suspicious.holdHours` 之后加：

```json
    "tuning.exchange.maker.enabled": "系统做市开关：关掉后系统不收也不卖（库存保留）",
    "tuning.exchange.maker.bidRate": "系统收购价 = 当天参考价 × 这个数（倍，向下取整）",
    "tuning.exchange.maker.askRate": "系统卖出价 = 当天参考价 × 这个数（倍，向上取整）",
    "tuning.exchange.maker.marketCapRate": "系统收购价不超过 菜场能买到的最低价 × 这个数，防止从菜场买来卖给系统（倍）",
    "tuning.exchange.maker.dailyBuy": "每个区服每种食材每天系统最多收几个（个）",
    "tuning.exchange.maker.stockMax": "每个区服每种食材系统库存上限（个）",
    "tuning.exchange.maker.playerDaily": "每个玩家每天最多卖给系统几个，所有食材合计（个）",
```

`tuning.exchange` 的分组说明末尾加"；maker 是系统做市（低价收、高价卖，差价回收银币）"。

- [ ] **Step 4: 写 `maker.ts` 的纯函数**

```ts
import type { Food, GameConfig, Tuning } from '@dt/config';
import type { WeightedPool } from '@dt/shared';
import type { ExchangeTuning } from './rules';

export type MakerTuning = ExchangeTuning['maker'];

/** 浮点误差：0.7 × 1800 = 1259.999…，取整前加减一点 */
const EPS = 1e-6;
const down = (x: number) => Math.floor(x + EPS);
const up = (x: number) => Math.ceil(x - EPS);

const cheapestCache = new WeakMap<GameConfig, number>();
/** 最便宜天气的菜场价格系数：1 + min(marketCoin)，没有降价天气时为 1 */
function cheapestWeather(config: GameConfig): number {
  const hit = cheapestCache.get(config);
  if (hit !== undefined) return hit;
  let lo = 0;
  for (const w of config.weather.values()) lo = Math.min(lo, w.effects.marketCoin ?? 0);
  cheapestCache.set(config, 1 + lo);
  return 1 + lo;
}

const inPool = (pool: WeightedPool<Food> | undefined, food: Food) =>
  pool?.items.some((x) => x.id === food.id) ?? false;
const hasLevel = (weights: Array<[number, number]>, level: number) =>
  weights.some(([lv, w]) => lv === level && w > 0);

/**
 * 菜场里能买到这种食材的最低单价（156-3 设计 §4.1）；菜场不卖返回 null。
 * 按进货用的食材池判断能上哪些货架，取最便宜的货架价，再乘最便宜天气和菜场价格倍率
 */
export function marketFloor(food: Food, config: GameConfig, mt: Tuning['market']): number | null {
  const pool = config.foodPools.get(food.level);
  const inLevel = inPool(pool, food);
  const prices: number[] = [];
  if (inLevel && hasLevel(mt.dailyLevelWeights, food.level)) prices.push(food.coin);
  if ((inLevel && hasLevel(mt.specialLevelWeights, food.level)) || inPool(config.hotFoodPool, food))
    prices.push(mt.specialPrice);
  if (inLevel && food.level === mt.premiumLevel) prices.push(food.coin * mt.premiumPriceFactor);
  if (prices.length === 0) return null;
  return Math.min(...prices) * cheapestWeather(config) * mt.priceFactor;
}

/** 系统的买价和卖价（156-3 设计 §4.2）：买价低于挂单下限时没有买这一档 */
export function makerPrices(
  ref: number,
  floor: number | null,
  band: { min: number; max: number },
  m: MakerTuning,
): { bid: number | null; ask: number } {
  let bid = down(ref * m.bidRate);
  if (floor !== null) bid = Math.min(bid, down(floor * m.marketCapRate));
  bid = Math.min(bid, band.max);
  const ask = Math.min(Math.max(up(ref * m.askRate), band.min), band.max);
  return { bid: bid >= band.min ? bid : null, ask };
}

/** 系统这次最多能收几个 */
export function makerBuyQty(m: MakerTuning, s: { bought: number; stock: number; playerToday: number }): number {
  return Math.max(0, Math.min(m.dailyBuy - s.bought, m.stockMax - s.stock, m.playerDaily - s.playerToday));
}
```

注意：`makerPrices(1000, null, band, { ...m, bidRate: 3, askRate: 3 })` 时买价 = 卖价 = 2000，Review Focus 3 的"买价低于卖价"只对默认数值成立，测试循环用的是默认 `m`。

- [ ] **Step 5: 运行，确认通过；配置包测试也通过**

Run: `pnpm vitest run apps/server/src/modules/exchange/maker.test.ts packages/config`
Expected: PASS（`settingDocs.test.ts` 也通过：新叶子都有说明）。

- [ ] **Step 6: 提交**

```bash
git add packages/config/src/tuning.ts packages/config/data/game/tuning.json packages/config/data/game/setting_docs.json apps/server/src/modules/exchange/maker.ts apps/server/src/modules/exchange/maker.test.ts
git commit -m "feat: 交易所系统做市的区服数值和报价（156-3）"
```

---

### Task 2: 迁移 0028、库存读写、参考价排除系统成交

**Files:**
- Create: `apps/server/src/db/migrations/0028_exchange_maker.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Modify: `apps/server/src/db/schema.ts`（`ExchangeTradeTable`，新表类型，`DB` 接口）
- Modify: `apps/server/src/modules/exchange/maker.ts`（库存读写、`makerQuote`）
- Modify: `apps/server/src/modules/exchange/ref.ts`（两处加 `system = false`）
- Modify: `apps/server/src/modules/exchange/admin.ts`（可疑列表排除系统成交，类型收窄）
- Test: `apps/server/src/modules/exchange/ref.test.ts`、`apps/server/src/modules/exchange/maker-state.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `marketFloor`、`makerPrices`、`makerBuyQty`。
- Produces:
  - `TO_SYSTEM = 'exchange.toSystem'`
  - `makerState(db: Kysely<DB>, shardId: number, foodsId: number, day: string): Promise<{ stock: number; bought: number }>`
  - `addStock(db: Kysely<DB>, shardId: number, foodsId: number, delta: number): Promise<void>`
  - `addBought(db: Kysely<DB>, shardId: number, foodsId: number, day: string, n: number): Promise<void>`
  - `interface MakerLevel { price: number; qty: number }`
  - `makerQuote(db: Kysely<DB>, x: { config: GameConfig; tuning: Tuning; shardId: number; foodsId: number; day: string; restId: number; ref: number }): Promise<{ bid: MakerLevel | null; ask: MakerLevel | null }>`
  - 表 `exchange_stock(shard_id, foods_id, num)`、`exchange_maker_day(shard_id, foods_id, day, bought)`；`exchange_trade.system`。

- [ ] **Step 1: 写失败的测试**

`ref.test.ts` 末尾加：

```ts
describe('系统成交不算参考价（156-3 设计 §2.4）', () => {
  it('前一天只有系统成交时，单个算和批量算都沿用原来的参考价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const d0 = gameDay(t.clock.now);
    const d1 = addDays(d0, 1);
    const base = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d0);
    for (let i = 0; i < 5; i++)
      await t.db
        .insertInto('exchange_trade')
        .values({
          shard_id: shardId,
          foods_id: f.id,
          price: 1,
          qty: 10,
          buy_order_id: null,
          sell_order_id: null,
          buyer_rest_id: null,
          seller_rest_id: 0,
          fee: 0,
          created_at: t.clock.now,
          system: true,
        })
        .execute();
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d1)).toBe(base);
    const other = await createShard(t.db);
    await refPrice(t.db, t.deps.config, tune(), other, f.id, d0);
    await t.db.updateTable('exchange_trade').set({ shard_id: other }).where('shard_id', '=', shardId).execute();
    expect((await refPrices(t.db, t.deps.config, tune(), other, [f.id], d1)).get(f.id)).toBe(base);
  });
});
```

（`rare()` 在本文件是第一种稀有食材，第一个用例已断言它没有成交时参考价就是 `f.coin`，所以两个区服的 `base` 相同。）

`apps/server/src/modules/exchange/maker-state.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { addBought, addStock, makerQuote, makerState, TO_SYSTEM } from './maker';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;

describe('系统库存和每日收购（156-3 设计 §5）', () => {
  it('没有记录为 0；加减累计；库存不能减成负数', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const day = gameDay(t.clock.now);
    expect(await makerState(t.db, shardId, f.id, day)).toEqual({ stock: 0, bought: 0 });
    await addStock(t.db, shardId, f.id, 5);
    await addStock(t.db, shardId, f.id, -2);
    await addBought(t.db, shardId, f.id, day, 5);
    expect(await makerState(t.db, shardId, f.id, day)).toEqual({ stock: 3, bought: 5 });
    await expect(addStock(t.db, shardId, f.id, -4)).rejects.toThrow();
  });

  it('报价：买档数量扣掉这个玩家今天已卖的；没有库存没有卖档；关掉没有报价', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const day = gameDay(t.clock.now);
    const r = await trader(t, { shardId });
    const x = { config: t.deps.config, tuning: t.deps.config.tuning, shardId, foodsId: f.id, day, restId: r.restaurantId, ref: 1000 };
    expect(await makerQuote(t.db, x)).toEqual({ bid: { price: 700, qty: 20 }, ask: null });
    await incrementDaily(t.db, r.restaurantId, TO_SYSTEM, 15, day);
    await addStock(t.db, shardId, f.id, 4);
    expect(await makerQuote(t.db, x)).toEqual({ bid: { price: 700, qty: 5 }, ask: { price: 1300, qty: 4 } });
    const off = { ...x.tuning, exchange: { ...x.tuning.exchange, maker: { ...x.tuning.exchange.maker, enabled: false } } };
    expect(await makerQuote(t.db, { ...x, tuning: off })).toEqual({ bid: null, ask: null });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/ref.test.ts apps/server/src/modules/exchange/maker-state.test.ts`
Expected: FAIL（`system` 列不存在 / `makerState` 未导出）。

- [ ] **Step 3: 迁移 0028**

`apps/server/src/db/migrations/0028_exchange_maker.ts`：

```ts
import { sql, type Kysely } from 'kysely';

/** 156-3：系统做市。成交记录的系统一方店为空、加 system 标记；系统库存；系统每日收购 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table exchange_trade
    alter column buyer_rest_id drop not null,
    alter column seller_rest_id drop not null,
    add column system boolean not null default false`.execute(db);
  await sql`create index exchange_trade_system on exchange_trade (shard_id, created_at) where system`.execute(db);
  await sql`
    create table exchange_stock (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      num integer not null default 0 check (num >= 0),
      primary key (shard_id, foods_id)
    )`.execute(db);
  await sql`
    create table exchange_maker_day (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      day date not null,
      bought integer not null default 0,
      primary key (shard_id, foods_id, day)
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table exchange_maker_day`.execute(db);
  await sql`drop table exchange_stock`.execute(db);
  await sql`drop index exchange_trade_system`.execute(db);
  await sql`delete from exchange_trade where system`.execute(db);
  await sql`alter table exchange_trade
    drop column system,
    alter column buyer_rest_id set not null,
    alter column seller_rest_id set not null`.execute(db);
}
```

`index.ts`：加 `import * as m0028 from './0028_exchange_maker';` 和 `'0028_exchange_maker': m0028,`。

- [ ] **Step 4: schema 类型**

`schema.ts` 的 `ExchangeTradeTable`：

```ts
  /** 系统做市的成交里系统一方为空（156-3） */
  buyer_rest_id: number | null;
  seller_rest_id: number | null;
```

并在 `flags` 之后加 `system: Default<boolean>;`。新增：

```ts
export interface ExchangeStockTable {
  shard_id: number;
  foods_id: number;
  num: Default<number>;
}
export interface ExchangeMakerDayTable {
  shard_id: number;
  foods_id: number;
  day: string;
  bought: Default<number>;
}
```

`DB` 接口里 `exchange_freeze` 之后加 `exchange_stock: ExchangeStockTable;`、`exchange_maker_day: ExchangeMakerDayTable;`。

- [ ] **Step 5: `maker.ts` 加库存读写和报价**

文件顶部 import 改为：

```ts
import { sql, type Kysely } from 'kysely';
import type { Food, GameConfig, Tuning } from '@dt/config';
import type { WeightedPool } from '@dt/shared';
import type { DB } from '../../db/schema';
import { getDaily } from '../counter/dailyCounter';
import { priceBand, type ExchangeTuning } from './rules';
```

文件末尾加：

```ts
/** 玩家每天卖给系统的数量（daily_counter 的键） */
export const TO_SYSTEM = 'exchange.toSystem';

export async function makerState(
  db: Kysely<DB>,
  shardId: number,
  foodsId: number,
  day: string,
): Promise<{ stock: number; bought: number }> {
  const s = await db
    .selectFrom('exchange_stock')
    .select('num')
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  const b = await db
    .selectFrom('exchange_maker_day')
    .select('bought')
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('day', '=', day)
    .executeTakeFirst();
  return { stock: s?.num ?? 0, bought: b?.bought ?? 0 };
}

/** 系统库存加减（调用方已持有这个盘口的锁）；减成负数时违反约束报错 */
export async function addStock(db: Kysely<DB>, shardId: number, foodsId: number, delta: number): Promise<void> {
  await db
    .insertInto('exchange_stock')
    .values({ shard_id: shardId, foods_id: foodsId, num: delta })
    .onConflict((oc) =>
      oc.columns(['shard_id', 'foods_id']).doUpdateSet({ num: sql<number>`exchange_stock.num + ${delta}` }),
    )
    .execute();
}

export async function addBought(
  db: Kysely<DB>,
  shardId: number,
  foodsId: number,
  day: string,
  n: number,
): Promise<void> {
  await db
    .insertInto('exchange_maker_day')
    .values({ shard_id: shardId, foods_id: foodsId, day, bought: n })
    .onConflict((oc) =>
      oc
        .columns(['shard_id', 'foods_id', 'day'])
        .doUpdateSet({ bought: sql<number>`exchange_maker_day.bought + ${n}` }),
    )
    .execute();
}

export interface MakerLevel {
  price: number;
  qty: number;
}

/**
 * 系统在这个盘口的报价（156-3 设计 §4.2）：买档数量按 restId 这家店今天的剩余额度。
 * 下单时在盘口锁里调用；看盘口时不加锁，只用于显示
 */
export async function makerQuote(
  db: Kysely<DB>,
  x: {
    config: GameConfig;
    tuning: Tuning;
    shardId: number;
    foodsId: number;
    day: string;
    restId: number;
    ref: number;
  },
): Promise<{ bid: MakerLevel | null; ask: MakerLevel | null }> {
  const m = x.tuning.exchange.maker;
  if (!m.enabled) return { bid: null, ask: null };
  const food = x.config.requireFood(x.foodsId);
  const p = makerPrices(
    x.ref,
    marketFloor(food, x.config, x.tuning.market),
    priceBand(x.ref, x.tuning.exchange),
    m,
  );
  const st = await makerState(db, x.shardId, x.foodsId, x.day);
  const mine = await getDaily(db, x.restId, TO_SYSTEM, x.day);
  const n = makerBuyQty(m, { ...st, playerToday: mine });
  return {
    bid: p.bid !== null && n > 0 ? { price: p.bid, qty: n } : null,
    ask: st.stock > 0 ? { price: p.ask, qty: st.stock } : null,
  };
}
```

（`maker-state.test.ts` 的报价用例：第一种 6 级稀有食材菜场不卖，`floor = null`，参考价给定 1000，所以买价 700、卖价 1300。）

- [ ] **Step 6: 参考价排除系统成交**

`ref.ts` 的 `refPrice` 里取前一天成交的查询、`refPrices` 里分组汇总的查询，各在 `.where('foods_id', …)` 之后加：

```ts
    .where('system', '=', false)
```

函数注释第一行末尾补"（和系统的成交不算，156-3）"。

- [ ] **Step 7: 可疑列表的类型收窄**

`admin.ts` 的 `suspicious`：查询加 `.where('t.system', '=', false)`（放在 `.where('t.created_at', …)` 之后），映射里两处改成 `r.buyer_rest_id!`、`r.seller_rest_id!`，注释："系统成交没有标记，也不进这个列表（156-3）"。

- [ ] **Step 8: 运行，确认通过；类型检查**

Run: `pnpm vitest run apps/server/src/modules/exchange apps/server/src/db/migrate.test.ts && pnpm -F @dt/server typecheck`
Expected: PASS；tsc 没有错误（`service.ts` 里 `me` 的 `buyer_rest_id === ctx.restaurantId` 对可空类型照常成立）。

- [ ] **Step 9: 提交**

```bash
git add apps/server/src/db apps/server/src/modules/exchange
git commit -m "feat: 交易所系统库存表、系统成交标记，参考价不算系统成交（156-3）"
```

---

### Task 3: 撮合里加入系统报价

**Files:**
- Modify: `apps/server/src/modules/exchange/service.ts`（`place`）
- Test: `apps/server/src/modules/exchange/maker-place.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `makerQuote`、`addStock`、`addBought`、`TO_SYSTEM`；`incrementDaily(db, restId, key, by, day)`（`../counter/dailyCounter`）。
- Produces: 系统成交行：`system = true`，玩家卖给系统时 `buyer_rest_id`/`buyer_account_id`/`buy_order_id` 为 null，玩家从系统买时 `seller_*`/`sell_order_id` 为 null；`flags = '{}'`；不写 `exchange_hold`。

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/exchange/maker-place.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { getDaily } from '../counter/dailyCounter';
import { makerPrices, makerState, TO_SYSTEM } from './maker';
import { refPrice } from './ref';
import { priceBand } from './rules';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
/** 6 级稀有食材：菜场不卖，系统买价 = floor(参考价 × 0.7) */
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;
const day = () => gameDay(t.clock.now);
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};

async function setup(o: { maker?: Record<string, unknown>; suspicious?: Record<string, unknown> } = {}) {
  const shardId = await createShard(t.db);
  if (o.maker || o.suspicious)
    await setTuning(t, shardId, { exchange: { ...(o.maker ? { maker: o.maker } : {}), ...(o.suspicious ? { suspicious: o.suspicious } : {}) } });
  const f = lv6();
  const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, day());
  const band = priceBand(ref, tune());
  // 期望值用同一个纯函数算（Task 1 已单独测过），避免浮点取整和实现不一致
  const p = makerPrices(ref, null, band, tune().maker);
  return { shardId, f, ref, band, bid: p.bid!, ask: p.ask };
}
const trades = (shardId: number) =>
  t.db.selectFrom('exchange_trade').selectAll().where('shard_id', '=', shardId).orderBy('id').execute();

describe('卖给系统（156-3 设计 §4.3）', () => {
  it('按系统买价成交，扣手续费；库存、今天已收、玩家今天已卖各自增加', async () => {
    const { shardId, f, band, bid } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(res.data.fills).toEqual([{ price: bid, qty: 3, held: false }]);
    expect(res.data.order.status).toBe('filled');
    const fee = Math.floor(bid * 3 * 0.05);
    expect(Number((await restRow(t, s.restaurantId)).coin)).toBe(bid * 3 - fee);
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 3, bought: 3 });
    expect(await getDaily(t.db, s.restaurantId, TO_SYSTEM, day())).toBe(3);
    const [tr] = await trades(shardId);
    expect(tr).toMatchObject({
      system: true,
      price: bid,
      qty: 3,
      buyer_rest_id: null,
      buyer_account_id: null,
      buy_order_id: null,
      seller_rest_id: s.restaurantId,
      flags: [],
    });
    expect(Number(tr!.fee)).toBe(fee);
  });

  it('系统成交不标记、不冻结（大额门槛调到 1 也一样）', async () => {
    const { shardId, f, band } = await setup({ suspicious: { largeAmount: 1 } });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 2 });
    expect(res.data.fills[0]!.held).toBe(false);
    expect((await trades(shardId))[0]!.flags).toEqual([]);
    const holds = await t.db.selectFrom('exchange_hold').select('id').where('rest_id', '=', s.restaurantId).execute();
    expect(holds).toHaveLength(0);
  });

  it('玩家每天卖给系统的上限；一次下单超过时系统吃满额度，剩下的挂着（Review Focus 1）', async () => {
    const { shardId, f, band } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 30 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 25 });
    expect(res.data.order).toMatchObject({ filled: 20, status: 'open' });
    const again = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 1 });
    expect(again.data.fills).toEqual([]);
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 20, bought: 20 });
  });

  it('每日收购上限是全区服的；库存上限也生效', async () => {
    const a = await setup({ maker: { dailyBuy: 3 } });
    const s1 = await trader(t, { shardId: a.shardId, coin: 0, foods: { [a.f.id]: 5 } });
    const s2 = await trader(t, { shardId: a.shardId, coin: 0, foods: { [a.f.id]: 5 } });
    await svc().place(s1, { foodsId: a.f.id, side: 'sell', price: a.band.min, qty: 2 });
    const r2 = await svc().place(s2, { foodsId: a.f.id, side: 'sell', price: a.band.min, qty: 2 });
    expect(r2.data.order.filled).toBe(1);
    const b = await setup({ maker: { stockMax: 4 } });
    const s3 = await trader(t, { shardId: b.shardId, coin: 0, foods: { [b.f.id]: 6 } });
    const r3 = await svc().place(s3, { foodsId: b.f.id, side: 'sell', price: b.band.min, qty: 6 });
    expect(r3.data.order.filled).toBe(4);
  });

  it('卖价高于系统买价不成交；关掉做市不成交', async () => {
    const { shardId, f, bid } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const r = await svc().place(s, { foodsId: f.id, side: 'sell', price: bid + 1, qty: 1 });
    expect(r.data.fills).toEqual([]);
    const off = await setup({ maker: { enabled: false } });
    const s2 = await trader(t, { shardId: off.shardId, coin: 0, foods: { [off.f.id]: 5 } });
    const r2 = await svc().place(s2, { foodsId: off.f.id, side: 'sell', price: off.band.min, qty: 1 });
    expect(r2.data.fills).toEqual([]);
  });

  it('被冻结的店不能卖给系统（Review Focus 2）', async () => {
    const { shardId, f, band } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await t.db.insertInto('exchange_freeze').values({ rest_id: s.restaurantId, reason: '测试' }).execute();
    await expect(
      svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 1 }),
    ).rejects.toMatchObject({ params: { reason: 'exchange_frozen' } });
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 0, bought: 0 });
  });

  it('并发：两个玩家同时卖给系统，合计不超过今天的收购上限', async () => {
    const { shardId, f, band } = await setup({ maker: { dailyBuy: 5 } });
    const s1 = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const s2 = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const [r1, r2] = await Promise.all([
      svc().place(s1, { foodsId: f.id, side: 'sell', price: band.min, qty: 4 }),
      svc().place(s2, { foodsId: f.id, side: 'sell', price: band.min, qty: 4 }),
    ]);
    expect(r1.data.order.filled + r2.data.order.filled).toBe(5);
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 5, bought: 5 });
  });
});

describe('从系统买（156-3 设计 §4.3）', () => {
  it('按系统卖价成交，多冻结的银币退回；只卖库存，卖完就没有这一档', async () => {
    const { shardId, f, band, ask } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    const res = await svc().place(b, { foodsId: f.id, side: 'buy', price: band.max, qty: 5 });
    expect(res.data.fills).toEqual([{ price: ask, qty: 3, held: false }]);
    expect(res.data.order).toMatchObject({ filled: 3, status: 'open' });
    expect(Number((await restRow(t, b.restaurantId)).coin)).toBe(50_000_000 - ask * 3 - band.max * 2);
    expect(await have(b.restaurantId, f.id)).toBe(3);
    expect(await makerState(t.db, shardId, f.id, day())).toMatchObject({ stock: 0 });
    const last = (await trades(shardId)).at(-1)!;
    expect(last).toMatchObject({ system: true, seller_rest_id: null, sell_order_id: null, buyer_rest_id: b.restaurantId });
    expect(Number(last.fee)).toBe(0);
  });

  it('守恒：玩家食材 + 系统库存不变；玩家银币变化合计 = −(卖出收回 − 收购花出) − 手续费', async () => {
    const { shardId, f, band, bid, ask } = await setup();
    const s = await trader(t, { shardId, coin: 1_000, foods: { [f.id]: 10 } });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 10 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: band.max, qty: 4 });
    const st = await makerState(t.db, shardId, f.id, day());
    expect((await have(s.restaurantId, f.id)) + (await have(b.restaurantId, f.id)) + st.stock).toBe(10);
    const coins = Number((await restRow(t, s.restaurantId)).coin) + Number((await restRow(t, b.restaurantId)).coin);
    const fee = Math.floor(bid * 10 * 0.05);
    expect(coins - (1_000 + 50_000_000)).toBe(-(ask * 4 - bid * 10) - fee);
  });
});

describe('系统和玩家挂单的先后（156-3 设计 §4.3）', () => {
  it('卖单：同价时玩家买单先成交，系统排后', async () => {
    const { shardId, f, band, bid } = await setup();
    const p = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(p, { foodsId: f.id, side: 'buy', price: bid, qty: 2 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(res.data.fills).toEqual([
      { price: bid, qty: 2, held: false },
      { price: bid, qty: 1, held: false },
    ]);
    expect((await trades(shardId)).map((x) => x.system)).toEqual([false, true]);
  });

  it('卖单：系统买价更高时系统先成交，玩家低价买单不动', async () => {
    const { shardId, f, band, bid } = await setup();
    const p = await trader(t, { shardId, coin: 50_000_000 });
    const po = await svc().place(p, { foodsId: f.id, side: 'buy', price: bid - 1, qty: 2 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(res.data.fills).toEqual([{ price: bid, qty: 3, held: false }]);
    const mine = await svc().me(p);
    expect(mine.orders.find((o) => o.id === po.data.order.id)!.filled).toBe(0);
  });

  it('买单：同价时玩家卖单先成交；系统卖价更低时系统先成交', async () => {
    const { shardId, f, band, ask } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 5 }); // 系统库存 5
    const p = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(p, { foodsId: f.id, side: 'sell', price: ask, qty: 2 });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    const r1 = await svc().place(b, { foodsId: f.id, side: 'buy', price: ask, qty: 3 });
    expect(r1.data.fills).toEqual([
      { price: ask, qty: 2, held: false },
      { price: ask, qty: 1, held: false },
    ]);
    await svc().place(p, { foodsId: f.id, side: 'sell', price: ask + 1, qty: 2 });
    const r2 = await svc().place(b, { foodsId: f.id, side: 'buy', price: ask + 1, qty: 2 });
    expect(r2.data.fills).toEqual([{ price: ask, qty: 2, held: false }]);
  });
});
```

注：`trader` 默认的同 IP 判定用随机 IP；本文件里玩家之间的成交价都在参考价 0.6~1.8 倍以内（`bid` = 0.7 倍、`ask` = 1.3 倍），所以不会被标成贴边；如果某条用例里玩家间成交被标记，`held` 会是 true，先查 IP 和 `tradeFlags`，不要改断言。

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/maker-place.test.ts`
Expected: FAIL（卖给系统的单没有成交：`fills` 是 `[]`）。

- [ ] **Step 3: 在 `place` 里加入系统报价**

`service.ts` 顶部 import 加：

```ts
import { incrementDaily } from '../counter/dailyCounter';
import { addBought, addStock, makerQuote, TO_SYSTEM, type MakerLevel } from './maker';
```

`place` 里把 `const ref = await refPrice(o.tx, o.config, t, o.shardId, b.foodsId, gameDay(o.now));` 改成：

```ts
    const day = gameDay(o.now);
    const ref = await refPrice(o.tx, o.config, t, o.shardId, b.foodsId, day);
```

在 `const book = (await q.orderBy('id', 'asc').execute()) as OrderRow[];` 之后加：

```ts
    // 系统做市（156-3 设计 §4.3）：系统报价是盘口里的一档，价格更好时排在玩家挂单前面，同价排在后面。
    // 已持有盘口锁，库存和今天已收不会被别人同时改；玩家今天已卖的在锁店事务里
    const quote = await makerQuote(o.tx, {
      config: o.config,
      tuning: o.tuning,
      shardId: o.shardId,
      foodsId: b.foodsId,
      day,
      restId: o.rest.id,
      ref,
    });
    const sys: MakerLevel | null =
      b.side === 'sell'
        ? quote.bid && quote.bid.price >= b.price
          ? quote.bid
          : null
        : quote.ask && quote.ask.price <= b.price
          ? quote.ask
          : null;
    type Level = { kind: 'player'; m: OrderRow } | { kind: 'system'; s: MakerLevel };
    const queue: Level[] = book.map((m) => ({ kind: 'player' as const, m }));
    if (sys) {
      const at = queue.findIndex(
        (x) => x.kind === 'player' && (b.side === 'sell' ? sys.price > x.m.price : sys.price < x.m.price),
      );
      queue.splice(at === -1 ? queue.length : at, 0, { kind: 'system', s: sys });
    }
```

把撮合循环的开头

```ts
    for (const m of book) {
      if (left === 0) break;
      const makerAcc = accOf.get(m.rest_id)!;
```

改成：

```ts
    for (const lv of queue) {
      if (left === 0) break;
      if (lv.kind === 'system') {
        const n = Math.min(left, lv.s.qty);
        const price = lv.s.price;
        const fee = b.side === 'sell' ? feeOf(price, n, t) : 0;
        const mine = b.side === 'buy';
        await o.tx
          .insertInto('exchange_trade')
          .values({
            shard_id: o.shardId,
            foods_id: b.foodsId,
            price,
            qty: n,
            buy_order_id: mine ? order.id : null,
            sell_order_id: mine ? null : order.id,
            buyer_rest_id: mine ? o.rest.id : null,
            seller_rest_id: mine ? null : o.rest.id,
            fee,
            created_at: o.now,
            buyer_account_id: mine ? o.rest.account_id : null,
            seller_account_id: mine ? null : o.rest.account_id,
            flags: [],
            system: true,
          })
          .execute();
        if (b.side === 'sell') {
          gainCoin(o, price * n - fee, { source: 'exchange' });
          await addStock(o.tx, o.shardId, b.foodsId, n);
          await addBought(o.tx, o.shardId, b.foodsId, day, n);
          await incrementDaily(o.tx, o.rest.id, TO_SYSTEM, n, day);
        } else {
          if (b.price > price) gainCoin(o, (b.price - price) * n, { source: 'exchange' });
          await addStock(o.tx, o.shardId, b.foodsId, -n);
          const plan = await addFoods(o, b.foodsId, n, { source: 'exchange', keepDropped: true });
          if (plan.dropped > 0) addCredit(credits, o.rest.id, 0, b.foodsId, plan.dropped);
        }
        fills.push({ price, qty: n, held: false });
        left -= n;
        continue;
      }
      const m = lv.m;
      const makerAcc = accOf.get(m.rest_id)!;
```

循环其余部分不变。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange/maker-place.test.ts`
Expected: PASS（12 个用例）。

- [ ] **Step 5: 交易所全部测试仍通过**

Run: `pnpm vitest run apps/server/src/modules/exchange`
Expected: PASS。现有用例的卖价都在参考价附近或以上，高于系统买价（0.7 倍），新区服系统库存为 0，所以不会撞上系统报价。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/exchange/service.ts apps/server/src/modules/exchange/maker-place.test.ts
git commit -m "feat: 交易所撮合加入系统做市报价（156-3）"
```

---

### Task 4: 盘口、列表、我的成交里的系统档

**Files:**
- Modify: `packages/shared/src/schemas/exchange.ts`（`ExchangeLevelDto.system`、`ExchangeTradeDto.system`）
- Modify: `apps/server/src/modules/exchange/service.ts`（`foods`、`book`、`me`）
- Test: `apps/server/src/modules/exchange/maker-query.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `makerQuote`。
- Produces: `ExchangeLevelDto = { price: number; qty: number; system: boolean }`；`ExchangeTradeDto` 加 `system: boolean`。

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/exchange/maker-query.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { makerPrices } from './maker';
import { refPrice } from './ref';
import { priceBand } from './rules';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;

describe('盘口和查询里的系统档（156-3 设计 §6）', () => {
  it('系统买档数量按看的人自己的剩余额度；有库存才有卖档（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, gameDay(t.clock.now));
    const band = priceBand(ref, tune());
    const { bid: b0, ask } = makerPrices(ref, null, band, tune().maker);
    const bid = b0!;
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 30 } });
    const viewer = await trader(t, { shardId });
    let bk = await svc().book(viewer, f.id);
    expect(bk.bids).toEqual([{ price: bid, qty: 20, system: true }]);
    expect(bk.asks).toEqual([]);
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 20 });
    expect((await svc().book(s, f.id)).bids).toEqual([]);
    bk = await svc().book(viewer, f.id);
    expect(bk.bids).toEqual([{ price: bid, qty: 20, system: true }]);
    expect(bk.asks).toEqual([{ price: ask, qty: 20, system: true }]);
    expect(bk.volume).toBe(20);
    expect(bk.last).toBeNull();
    // 玩家挂单和系统同价时分成两档，系统在后
    const p = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(p, { foodsId: f.id, side: 'buy', price: bid, qty: 2 });
    await svc().place(p, { foodsId: f.id, side: 'buy', price: bid + 5, qty: 1 });
    expect((await svc().book(viewer, f.id)).bids).toEqual([
      { price: bid + 5, qty: 1, system: false },
      { price: bid, qty: 2, system: false },
      { price: bid, qty: 20, system: true },
    ]);
  });

  it('我的成交里系统成交标 system；列表的最新成交价不看系统成交', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, gameDay(t.clock.now));
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: priceBand(ref, tune()).min, qty: 2 });
    const me = await svc().me(s);
    expect(me.trades).toEqual([
      expect.objectContaining({ side: 'sell', qty: 2, system: true, fee: expect.any(Number) }),
    ]);
    const row = (await svc().foods(s)).find((x) => x.foodsId === f.id)!;
    expect(row).toMatchObject({ last: null, changePct: null });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/maker-query.test.ts`
Expected: FAIL（盘口没有系统档、`system` 字段不存在）。

- [ ] **Step 3: 共享类型**

`packages/shared/src/schemas/exchange.ts`：

```ts
export interface ExchangeLevelDto {
  price: number;
  qty: number;
  /** 系统做市的一档（156-3） */
  system: boolean;
}
```

`ExchangeTradeDto` 在 `fee` 之后加：

```ts
  /** 和系统成交（156-3） */
  system: boolean;
```

- [ ] **Step 4: 服务端**

`foods()` 里取最新成交价的 lateral 子查询改为：

```ts
        select price from exchange_trade
        where shard_id = ${ctx.shardId} and foods_id = f.id and not system
        order by id desc limit 1
```

`book()`：

1. `side` 的 map 改成 `.map((x) => ({ price: x.price, qty: Number(x.qty), system: false }))`。
2. `last` 查询加 `.where('system', '=', false)`。
3. `return` 之前加：

```ts
    // 系统做市的一档（156-3 设计 §6）：同价排在玩家后面；买档数量按看的人自己的剩余额度
    const quote = await makerQuote(d.db, {
      config: d.config,
      tuning: s.tuning,
      shardId: ctx.shardId,
      foodsId,
      day: gameDay(now),
      restId: ctx.restaurantId,
      ref,
    });
    const merge = (levels: ExchangeLevelDto[], sys: MakerLevel | null, sd: 'buy' | 'sell') => {
      if (!sys) return levels;
      const at = levels.findIndex((l) => (sd === 'buy' ? l.price < sys.price : l.price > sys.price));
      const out = [...levels];
      out.splice(at === -1 ? out.length : at, 0, { ...sys, system: true });
      return out;
    };
```

   `return` 里改成 `bids: merge(await side('buy'), quote.bid, 'buy'), asks: merge(await side('sell'), quote.ask, 'sell'),`。`ExchangeLevelDto` 加进顶部 `@dt/shared` 的 import。

`me()`：成交查询的 select 加 `'system'`，映射里加 `system: x.system,`。

- [ ] **Step 5: 运行，确认通过；交易所全部测试和类型检查**

Run: `pnpm vitest run apps/server/src/modules/exchange && pnpm -F @dt/server typecheck`
Expected: PASS；如果旧用例对 `bids`/`asks` 用 `toEqual` 断言没有 `system` 字段，按新字段补上 `system: false`（这是接口变化，不是行为变化）。

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/schemas/exchange.ts apps/server/src/modules/exchange
git commit -m "feat: 交易所盘口和成交记录显示系统档（156-3）"
```

---

### Task 5: 后台"系统做市"汇总

**Files:**
- Modify: `packages/shared/src/schemas/exchange.ts`（`ExchangeMakerDto`）
- Modify: `apps/server/src/modules/exchange/admin.ts`（`maker`）
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `apps/server/src/modules/admin/permissions.test.ts`
- Test: `apps/server/src/modules/exchange/admin.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `makerPrices`、`marketFloor`；`refPrices`。
- Produces:
  - `interface ExchangeMakerRow { foodsId: number; stock: number; bought: number; bid: number | null; ask: number }`
  - `interface ExchangeMakerDto { foods: ExchangeMakerRow[]; today: { spent: number; earned: number; fee: number; net: number } }`
  - `createExchangeAdmin(game).maker(shardId: number): Promise<ExchangeMakerDto>`
  - 路由 `GET /api/v1/admin/exchange/maker?shardId`（`mod`）

- [ ] **Step 1: 写失败的测试**

`admin.test.ts` 末尾加（import 补 `gameDay`（@dt/shared）、`refPrice`（./ref）、`priceBand`（./rules）、`makerPrices`（./maker））：

```ts
describe('后台系统做市汇总（156-3 设计 §7）', () => {
  it('有库存或今天有收购的食材；今天花出、收回、手续费、净回收', async () => {
    const shardId = await createShard(t.db);
    const f = [...t.deps.config.foods.values()].find((x) => x.level === 6 && x.odds < 100 && x.odds > 0)!;
    const ref = await refPrice(t.db, t.deps.config, t.deps.config.tuning.exchange, shardId, f.id, gameDay(t.clock.now));
    const band = priceBand(ref, t.deps.config.tuning.exchange);
    const { bid: b0, ask } = makerPrices(ref, null, band, t.deps.config.tuning.exchange.maker);
    const bid = b0!;
    expect(await admin().maker(shardId)).toEqual({ foods: [], today: { spent: 0, earned: 0, fee: 0, net: 0 } });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 10 });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: band.max, qty: 4 });
    const fee = Math.floor(bid * 10 * 0.05);
    expect(await admin().maker(shardId)).toEqual({
      foods: [{ foodsId: f.id, stock: 6, bought: 10, bid, ask }],
      today: { spent: bid * 10, earned: ask * 4, fee, net: ask * 4 - bid * 10 + fee },
    });
  });
});
```

`permissions.test.ts` 在 `/api/v1/admin/exchange/frozen` 那一项之后加：

```ts
  {
    method: 'GET',
    route: '/api/v1/admin/exchange/maker',
    url: () => `/api/v1/admin/exchange/maker?shardId=${ids.shardId}`,
    min: 'mod',
  },
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/admin.test.ts apps/server/src/modules/admin/permissions.test.ts`
Expected: FAIL（`admin().maker` 不是函数；权限矩阵里新路由 404 / 不存在）。

- [ ] **Step 3: 共享类型**

`packages/shared/src/schemas/exchange.ts` 末尾：

```ts
/** 后台"系统做市"（156-3 设计 §7） */
export interface ExchangeMakerRow {
  foodsId: number;
  stock: number;
  /** 今天已收 */
  bought: number;
  /** 当前系统买价；低于挂单下限不收为 null */
  bid: number | null;
  ask: number;
}

export interface ExchangeMakerDto {
  foods: ExchangeMakerRow[];
  /** 今天：收购花出（成交额）、卖出收回、卖给系统那一侧的手续费、净回收 = 收回 − 花出 + 手续费 */
  today: { spent: number; earned: number; fee: number; net: number };
}
```

- [ ] **Step 4: `admin.ts` 加 `maker`**

import 补：

```ts
import { gameDay, gameTime, type ExchangeMakerDto } from '@dt/shared';
import { makerPrices, marketFloor } from './maker';
import { refPrices } from './ref';
import { priceBand } from './rules';
```

（`@dt/shared` 已有的 type import 合并进同一条。）在 `confiscate` 之后加：

```ts
  /** 系统做市汇总（只读）：有库存或今天有收购的食材，和今天的银币收支 */
  async function maker(shardId: number): Promise<ExchangeMakerDto> {
    const now = game.deps.now();
    const day = gameDay(now);
    const s = await game.deps.shards.settings(shardId);
    const t = s.tuning.exchange;
    const stock = await db
      .selectFrom('exchange_stock')
      .select(['foods_id', 'num'])
      .where('shard_id', '=', shardId)
      .where('num', '>', 0)
      .execute();
    const bought = await db
      .selectFrom('exchange_maker_day')
      .select(['foods_id', 'bought'])
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .where('bought', '>', 0)
      .execute();
    const stockBy = new Map(stock.map((x) => [x.foods_id, x.num]));
    const boughtBy = new Map(bought.map((x) => [x.foods_id, x.bought]));
    const ids = [...new Set([...stockBy.keys(), ...boughtBy.keys()])].sort((a, b) => a - b);
    const refs = await refPrices(db, game.deps.config, t, shardId, ids, day);
    const foods = ids.map((id) => {
      const ref = refs.get(id)!;
      const p = makerPrices(
        ref,
        marketFloor(game.deps.config.requireFood(id), game.deps.config, s.tuning.market),
        priceBand(ref, t),
        t.maker,
      );
      return { foodsId: id, stock: stockBy.get(id) ?? 0, bought: boughtBy.get(id) ?? 0, bid: p.bid, ask: p.ask };
    });
    const agg = await db
      .selectFrom('exchange_trade')
      .select([
        sql<string>`coalesce(sum(case when buyer_rest_id is null then price::bigint * qty else 0 end), 0)`.as('spent'),
        sql<string>`coalesce(sum(case when seller_rest_id is null then price::bigint * qty else 0 end), 0)`.as('earned'),
        sql<string>`coalesce(sum(case when buyer_rest_id is null then fee else 0 end), 0)`.as('fee'),
      ])
      .where('shard_id', '=', shardId)
      .where('system', '=', true)
      .where('created_at', '>=', gameTime(day, 0))
      .executeTakeFirstOrThrow();
    const spent = Number(agg.spent);
    const earned = Number(agg.earned);
    const fee = Number(agg.fee);
    return { foods, today: { spent, earned, fee, net: earned - spent + fee } };
  }
```

`return` 改成 `return { suspicious, frozen, freeze, unfreeze, confiscate, maker };`。

- [ ] **Step 5: 路由**

`apps/server/src/modules/admin/routes.ts` 在 `/exchange/frozen` 之后加：

```ts
    r.get('/exchange/maker', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.maker(parse(suspiciousQuery, req.query).shardId));
    });
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange/admin.test.ts apps/server/src/modules/admin/permissions.test.ts && pnpm -F @dt/server typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/schemas/exchange.ts apps/server/src/modules/exchange/admin.ts apps/server/src/modules/exchange/admin.test.ts apps/server/src/modules/admin
git commit -m "feat: 后台交易所系统做市汇总（156-3）"
```

---

### Task 6: 前端

**Files:**
- Modify: `apps/web/src/views/ExchangeView.vue`（盘口、成交记录）
- Modify: `apps/web/src/views/ExchangeView.test.ts`
- Modify: `apps/web/src/api/admin.ts`（`exchangeMaker`）
- Create: `apps/web/src/components/admin/ExchangeMakerPanel.vue`
- Create: `apps/web/src/components/admin/ExchangeMakerPanel.test.ts`
- Modify: `apps/web/src/views/admin/AdminSuspiciousView.vue`

**Interfaces:**
- Consumes: Task 4 的 `ExchangeLevelDto.system`、`ExchangeTradeDto.system`；Task 5 的 `ExchangeMakerDto` 和路由。
- Produces: `adminApi.exchangeMaker(shardId: number): Promise<ExchangeMakerDto>`；testid `ex-ask-sys-<price>`、`ex-bid-sys-<price>`、`exm-today`、`exm-row-<foodsId>`。

- [ ] **Step 1: 写失败的测试**

`ExchangeView.test.ts`：顶部 `book` 夹具每一档加 `system: false`。加用例（放在现有 describe 里）：

```ts
  it('盘口的系统档写"系统"、换颜色；成交记录标"（系统）"', async () => {
    vi.mocked(endpoints.tradeBook).mockResolvedValue({
      ...book,
      bids: [
        { price: 990, qty: 3, system: false },
        { price: 700, qty: 20, system: true },
      ],
      asks: [
        { price: 1010, qty: 2, system: false },
        { price: 1300, qty: 6, system: true },
      ],
    });
    vi.mocked(endpoints.tradeMe).mockResolvedValue(
      me({
        trades: [
          { side: 'sell', foodsId: 11, price: 700, qty: 2, fee: 70, system: true, createdAt: '2026-10-02T00:00:00Z' },
        ],
      }),
    );
    const w = mount(ExchangeView);
    await flushPromises();
    await w.get('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    const sysAsk = w.get('[data-testid="ex-ask-sys-1300"]');
    expect(sysAsk.text()).toContain('系统');
    expect(sysAsk.classes()).toContain('text-primary');
    expect(w.get('[data-testid="ex-bid-sys-700"]').text()).toContain('系统');
    expect(w.get('[data-testid="ex-ask-1010"]').text()).not.toContain('系统');
    await w.get('[data-testid="ex-bid-sys-700"]').trigger('click');
    expect((w.get('[data-testid="ex-price"]').element as HTMLInputElement).value).toBe('700');
    expect(w.text()).toContain('（系统）');
  });
```

（如果这个文件里打开食材的方式不是点 `ex-food-11`，照文件里已有用例的写法打开；盘口 testid、断言不变。）

`apps/web/src/components/admin/ExchangeMakerPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import ExchangeMakerPanel from './ExchangeMakerPanel.vue';

vi.mock('../../api/admin', () => ({ adminApi: { exchangeMaker: vi.fn() } }));

describe('后台系统做市（156-3 设计 §7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 11, name: '松露', level: 6 },
        { id: 12, name: '大米', level: 1 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
  });

  it('按区服读取，显示今天的收支和每种食材', async () => {
    vi.mocked(adminApi.exchangeMaker).mockResolvedValue({
      foods: [
        { foodsId: 11, stock: 6, bought: 10, bid: 35000, ask: 65000 },
        { foodsId: 12, stock: 0, bought: 3, bid: null, ask: 2340 },
      ],
      today: { spent: 350000, earned: 260000, fee: 17500, net: -72500 },
    });
    const w = mount(ExchangeMakerPanel);
    await flushPromises();
    expect(adminApi.exchangeMaker).toHaveBeenCalledWith(1);
    expect(w.get('[data-testid="exm-today"]').text()).toContain('净回收 -72,500');
    expect(w.get('[data-testid="exm-row-11"]').text()).toContain('松露');
    expect(w.get('[data-testid="exm-row-11"]').text()).toContain('35,000');
    expect(w.get('[data-testid="exm-row-12"]').text()).toContain('不收');
  });

  it('没有数据时提示', async () => {
    vi.mocked(adminApi.exchangeMaker).mockResolvedValue({
      foods: [],
      today: { spent: 0, earned: 0, fee: 0, net: 0 },
    });
    const w = mount(ExchangeMakerPanel);
    await flushPromises();
    expect(w.text()).toContain('系统还没有库存，今天也没有收购');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/views/ExchangeView.test.ts apps/web/src/components/admin/ExchangeMakerPanel.test.ts`
Expected: FAIL（没有 `ex-ask-sys-1300`；`ExchangeMakerPanel.vue` 不存在）。

- [ ] **Step 3: ExchangeView 盘口和成交记录**

卖档行改为：

```vue
        <tr
          v-for="a in [...book.asks].reverse()"
          :key="`a${a.system ? 's' : ''}${a.price}`"
          :class="a.system ? 'text-primary' : 'text-danger'"
          role="button"
          :data-testid="`ex-ask-${a.system ? 'sys-' : ''}${a.price}`"
          @click="price = a.price"
        >
          <td>{{ a.system ? '系统卖' : '卖' }}</td>
          <td>{{ formatNum(a.price) }}</td>
          <td class="text-end">{{ formatNum(a.qty) }}</td>
        </tr>
```

买档行改为：

```vue
        <tr
          v-for="b in book.bids"
          :key="`b${b.system ? 's' : ''}${b.price}`"
          :class="b.system ? 'text-primary' : 'text-success'"
          role="button"
          :data-testid="`ex-bid-${b.system ? 'sys-' : ''}${b.price}`"
          @click="price = b.price"
        >
          <td>{{ b.system ? '系统收' : '买' }}</td>
          <td>{{ formatNum(b.price) }}</td>
          <td class="text-end">{{ formatNum(b.qty) }}</td>
        </tr>
```

成交记录行在 `{{ x.qty }}` 之后加 `<span v-if="x.system" class="text-primary">（系统）</span>`。

- [ ] **Step 4: 后台接口和面板**

`apps/web/src/api/admin.ts`：type import 加 `ExchangeMakerDto`，在 `exchangeFrozen` 之后加：

```ts
  exchangeMaker: (shardId: number) => api.get<ExchangeMakerDto>(`${A}/exchange/maker${qs({ shardId })}`),
```

`apps/web/src/components/admin/ExchangeMakerPanel.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ExchangeMakerDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 后台"可疑数据 → 交易所"下面的"系统做市"（156-3 设计 §7），只读 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<ExchangeMakerDto | null>(null);

async function load() {
  if (admin.shardId === null) return;
  try {
    data.value = await adminApi.exchangeMaker(admin.shardId);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
watch(
  () => admin.shardId,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <h6 class="dt-section mt-3">系统做市</h6>
  <template v-if="data">
    <div class="small mb-2" data-testid="exm-today">
      今天：收购花出 {{ formatNum(data.today.spent) }}，卖出收回 {{ formatNum(data.today.earned) }}，手续费
      {{ formatNum(data.today.fee) }}，净回收 {{ formatNum(data.today.net) }}
    </div>
    <div v-if="data.foods.length === 0" class="text-muted small">系统还没有库存，今天也没有收购</div>
    <table v-else class="table table-sm small">
      <thead>
        <tr>
          <th>食材</th>
          <th class="text-end">库存</th>
          <th class="text-end">今天已收</th>
          <th class="text-end">系统买价</th>
          <th class="text-end">系统卖价</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in data.foods" :key="r.foodsId" :data-testid="`exm-row-${r.foodsId}`">
          <td>{{ catalog.foodName(r.foodsId) }}</td>
          <td class="text-end">{{ formatNum(r.stock) }}</td>
          <td class="text-end">{{ formatNum(r.bought) }}</td>
          <td class="text-end">{{ r.bid === null ? '不收' : formatNum(r.bid) }}</td>
          <td class="text-end">{{ formatNum(r.ask) }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
```

`AdminSuspiciousView.vue`：import `ExchangeMakerPanel`，在 `<ExchangeGuardPanel v-if="tab === 'exchange'" />` 之后加 `<ExchangeMakerPanel v-if="tab === 'exchange'" />`。

- [ ] **Step 5: 运行，确认通过；前端全部测试、类型检查**

Run: `pnpm vitest run apps/web && pnpm -F @dt/web typecheck`
Expected: PASS（`AdminSuspiciousView` 若有测试 mock 了 `adminApi`，在 mock 里补 `exchangeMaker: vi.fn().mockResolvedValue({ foods: [], today: { spent: 0, earned: 0, fee: 0, net: 0 } })`）。

- [ ] **Step 6: 全量测试、lint**

Run: `pnpm vitest run > .superpowers/sdd/2026-10-02-exchange-maker/full.log 2>&1; tail -20 .superpowers/sdd/2026-10-02-exchange-maker/full.log; pnpm lint`
Expected: 全部通过；lint 没有错误。

- [ ] **Step 7: 提交**

```bash
git add apps/web
git commit -m "feat: 交易所页显示系统档，后台系统做市汇总（156-3）"
```
