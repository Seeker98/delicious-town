import { foodPrice } from '../../core/prices';
import { sql, type Kysely } from 'kysely';
import type { Food, GameConfig, Tuning } from '@dt/config';
import type { WeightedPool } from '@dt/shared';
import type { DB } from '../../db/schema';
import { getDaily } from '../counter/dailyCounter';
import { initialRef, priceBand, type ExchangeTuning } from './rules';

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
  if (inLevel && hasLevel(mt.dailyLevelWeights, food.level)) prices.push(foodPrice(food, mt));
  if ((inLevel && hasLevel(mt.specialLevelWeights, food.level)) || inPool(config.hotFoodPool, food))
    prices.push(mt.specialPrice);
  if (inLevel && food.level === mt.premiumLevel) prices.push(foodPrice(food, mt) * mt.premiumPriceFactor);
  if (prices.length === 0) return null;
  return Math.min(...prices) * cheapestWeather(config) * mt.priceFactor;
}

/**
 * 系统收购价的锚：初始参考价（refOverrides 或 initialRef）。
 * 参考价可以被小号对倒推高，收购价只跟着参考价往下走，不跟着往上涨（156-3 终审 C1）
 */
export function makerBase(
  food: Food,
  config: GameConfig,
  t: ExchangeTuning,
  rates: readonly number[],
): number {
  return t.refOverrides[String(food.id)] ?? initialRef(food, config, rates);
}

/** 系统的买价和卖价（156-3 设计 §4.2）：买价不超过初始参考价那一档；低于挂单下限时没有买这一档 */
export function makerPrices(
  ref: number,
  floor: number | null,
  band: { min: number; max: number },
  m: MakerTuning,
  base: number,
): { bid: number | null; ask: number; floor: boolean } {
  let bid = down(Math.min(ref, base) * m.bidRate);
  if (floor !== null) bid = Math.min(bid, down(floor * m.marketCapRate));
  bid = Math.min(bid, band.max);
  const ask = Math.min(Math.max(up(ref * m.askRate), band.min), band.max);
  // 低于挂单下限也照样收（问题记录 244）：标成兜底价，只能用「卖给系统」成交；不往上抬，否则菜场封顶失效
  if (bid < 1) return { bid: null, ask, floor: false };
  return { bid, ask, floor: bid < band.min };
}

/** 系统这次最多能收几个 */
export function makerBuyQty(
  m: MakerTuning,
  s: { bought: number; stock: number; playerToday: number },
): number {
  return Math.max(0, Math.min(m.dailyBuy - s.bought, m.stockMax - s.stock, m.playerDaily - s.playerToday));
}

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

/**
 * 系统库存加减（调用方已持有这个盘口的锁）；减成负数时违反约束报错。
 * 减少用 update：insert … on conflict 会先拿要插入的负数行检查约束
 */
export async function addStock(
  db: Kysely<DB>,
  shardId: number,
  foodsId: number,
  delta: number,
): Promise<void> {
  if (delta < 0) {
    const r = await db
      .updateTable('exchange_stock')
      .set({ num: sql<number>`num + ${delta}` })
      .where('shard_id', '=', shardId)
      .where('foods_id', '=', foodsId)
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new Error(`exchange_stock missing: ${shardId}/${foodsId}`);
    return;
  }
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
  /** 兜底价：低于挂单下限，只能用「卖给系统」成交（问题记录 244） */
  floor?: boolean;
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
    makerBase(food, x.config, x.tuning.exchange, x.tuning.market.levelPriceRate),
  );
  const st = await makerState(db, x.shardId, x.foodsId, x.day);
  const mine = await getDaily(db, x.restId, TO_SYSTEM, x.day);
  const n = makerBuyQty(m, { ...st, playerToday: mine });
  return {
    bid: p.bid !== null && n > 0 ? { price: p.bid, qty: n, floor: p.floor } : null,
    ask: st.stock > 0 ? { price: p.ask, qty: st.stock } : null,
  };
}
