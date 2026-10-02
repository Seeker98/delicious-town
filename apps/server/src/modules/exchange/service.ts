import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  gameDay,
  gameTime,
  type ExchangeBookDto,
  type ExchangeFoodDto,
  type ExchangeMeDto,
  type ExchangeOrderDto,
  type ExchangePlaceDto,
  type ExchangeWithdrawDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
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
    restLog(o, 'exchange.cancel', {
      side: r.side,
      foodsId: r.foods_id,
      price: r.price,
      left: cur.qty - cur.filled,
    });
    return orderDto(cur as OrderRow);
  }

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

  async function foods(ctx: RestCtx): Promise<ExchangeFoodDto[]> {
    const s = await d.shards.ensureFeature(ctx.shardId, 'exchange');
    const t = s.tuning.exchange;
    const day = gameDay(d.now());
    const list = [...d.config.foods.values()]
      .filter((f) => isTradable(f))
      .sort((a, b) => a.level - b.level || a.id - b.id);
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
      out.push({
        foodsId: f.id,
        ref,
        last,
        changePct: last === null ? null : Math.round(((last - ref) / ref) * 1000) / 1000,
      });
    }
    return out;
  }

  async function book(ctx: RestCtx, foodsId: number): Promise<ExchangeBookDto> {
    const s = await d.shards.ensureFeature(ctx.shardId, 'exchange');
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
    return {
      foodsId,
      ref,
      ...priceBand(ref, t),
      last: last?.price ?? null,
      volume: Number(vol.n),
      bids: await side('buy'),
      asks: await side('sell'),
    };
  }

  async function me(ctx: RestCtx): Promise<ExchangeMeDto> {
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.exchange;
    const now = d.now();
    const rest = await d.db
      .selectFrom('restaurant')
      .select('level')
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const reason = await eligibility({ db: d.db, level: rest.level, accountId: ctx.accountId, now, t });
    const orders = (await d.db
      .selectFrom('exchange_order')
      .select(ORDER_COLS)
      .where('rest_id', '=', ctx.restaurantId)
      .where('status', '=', 'open')
      .orderBy('id', 'desc')
      .execute()) as OrderRow[];
    const w = await d.db
      .selectFrom('exchange_wallet')
      .select('coin')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirst();
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
      .where((eb) =>
        eb.or([eb('buyer_rest_id', '=', ctx.restaurantId), eb('seller_rest_id', '=', ctx.restaurantId)]),
      )
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
        return {
          side,
          foodsId: x.foods_id,
          price: x.price,
          qty: x.qty,
          fee: side === 'sell' ? Number(x.fee) : 0,
          createdAt: x.created_at.toISOString(),
        };
      }),
      feeRate: t.feeRate,
    };
  }

  const op = <T>(ctx: RestCtx, feature: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature, source: 'exchange' }, fn);

  return {
    place: (ctx: RestCtx, b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number }) =>
      op(ctx, 'exchange', (o) => place(o, b)),
    cancel: (ctx: RestCtx, id: number) => op(ctx, 'restaurant', (o) => cancel(o, id)),
    withdraw: (ctx: RestCtx) => op(ctx, 'restaurant', (o) => withdraw(o)),
    foods,
    book,
    me,
  };
}
export type ExchangeService = ReturnType<typeof createExchangeService>;
