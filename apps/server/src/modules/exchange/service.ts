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
export async function eligibility(o: {
  db: Kysely<DB>;
  level: number;
  accountId: number;
  now: Date;
  t: { minLevel: number; minAccountDays: number };
}) {
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
  async function place(
    o: Op,
    b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number },
  ): Promise<ExchangePlaceDto> {
    const t = o.tuning.exchange;
    const reason = await eligibility({
      db: o.tx,
      level: o.rest.level,
      accountId: o.rest.account_id,
      now: o.now,
      t,
    });
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
        .set({
          filled: mFilled,
          ...(mFilled === m.qty ? { status: 'filled' as const, closed_at: o.now } : {}),
        })
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
          params: JSON.stringify({
            side: m.side,
            foodsId: b.foodsId,
            price,
            qty: n,
            fee: m.side === 'sell' ? fee : 0,
          }),
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
