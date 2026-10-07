import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  gameDay,
  gameTime,
  type ExchangeBookDto,
  type ExchangeFoodDto,
  type ExchangeLevelDto,
  type ExchangeMeDto,
  type ExchangeOrderDto,
  type ExchangePlaceDto,
  type ExchangeWithdrawDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { emitAction, emitActionFor } from '../../core/action';
import { restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { addFoods, cupboardSlotsUsed, planAddFoods, subFoods } from '../cupboard/foods';
import { refPrice, refPrices } from './ref';
import { feeOf, isTradable, priceBand } from './rules';
import { addHold, frozenReason, linkedAccounts, tradeFlags } from './guard';
import { eligibility } from './eligibility';
import { addCredit, creditWallets, newCredits } from './wallet';
import { incrementDaily } from '../counter/dailyCounter';
import { addBought, addStock, makerQuote, TO_SYSTEM, type MakerLevel } from './maker';

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

export function createExchangeService(d: GameDeps) {
  /**
   * 下单并撮合。toSystem（问题记录 244）：只和系统收购那一档成交，可以低于挂单价格区间（兜底价），
   * 不受未成交挂单数限制；系统收不下全部数量就整单拒绝，所以不会留下低于下限的挂单
   */
  async function place(
    o: Op,
    b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number },
    opts: { toSystem?: boolean } = {},
  ): Promise<ExchangePlaceDto> {
    const t = o.tuning.exchange;
    // 被冻结的店不能下单（156-2 设计 §6.1）
    const frozen = await frozenReason(o.tx, o.rest.id);
    if (frozen !== null) throw invalidState('exchange_frozen', { why: frozen });
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
    if (!isTradable(o.config.foods.get(b.foodsId), t.closedLevels)) throw invalidState('not_tradable');
    if (b.qty > t.maxQty) throw limitReached('exchange_qty', { max: t.maxQty });
    const day = gameDay(o.now);
    const ref = await refPrice(o.tx, o.config, t, o.tuning.market.levelPriceRate, o.shardId, b.foodsId, day);
    const band = priceBand(ref, t);
    if (!opts.toSystem && (b.price < band.min || b.price > band.max)) throw invalidState('price_band', band);
    const open = await o.tx
      .selectFrom('exchange_order')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('rest_id', '=', o.rest.id)
      .where('status', '=', 'open')
      .executeTakeFirstOrThrow();
    if (!opts.toSystem && Number(open.n) >= t.maxOpenOrders)
      throw limitReached('exchange_orders', { max: t.maxOpenOrders });

    if (b.side === 'sell') await subFoods(o, b.foodsId, b.qty, { source: 'exchange' });
    else {
      spendCoin(o, b.price * b.qty, { source: 'exchange' });
      // 橱柜检查：现有 + 未成交买单的剩余 + 本单都要放得下（156-1 设计 §6.1）。
      // 别的食材的未成交买单、橱柜里还没有的，成交后各要占一个新格子，先算作已占（backlog 156-1）
      const pending = await o.tx
        .selectFrom('exchange_order')
        .select(sql<string>`coalesce(sum(qty - filled), 0)`.as('n'))
        .where('rest_id', '=', o.rest.id)
        .where('foods_id', '=', b.foodsId)
        .where('side', '=', 'buy')
        .where('status', '=', 'open')
        .executeTakeFirstOrThrow();
      const reserved = await o.tx
        .selectFrom('exchange_order as x')
        .select(sql<string>`count(distinct x.foods_id)`.as('n'))
        .where('x.rest_id', '=', o.rest.id)
        .where('x.foods_id', '!=', b.foodsId)
        .where('x.side', '=', 'buy')
        .where('x.status', '=', 'open')
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom('cupboard_food as c')
                .select('c.foods_id')
                .whereRef('c.rest_id', '=', 'x.rest_id')
                .whereRef('c.foods_id', '=', 'x.foods_id')
                .where('c.num', '>', 0),
            ),
          ),
        )
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
          slotsUsed: (await cupboardSlotsUsed(o.tx, o.rest.id)) + Number(reserved.n),
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
    const book = opts.toSystem ? [] : ((await q.orderBy('id', 'asc').execute()) as OrderRow[]);
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
    if (opts.toSystem) {
      if (!quote.bid) throw invalidState('exchange_no_system_bid');
      if (quote.bid.price < b.price) throw invalidState('exchange_price_moved', { price: quote.bid.price });
      if (quote.bid.qty < b.qty) throw limitReached('exchange_system_qty', { max: quote.bid.qty });
    }
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

    // 关联账号（156-2 设计 §4.1）：挂单方的账号和我共用过设备就跳过，只共用 IP 就标记
    const s = t.suspicious;
    const accOf = new Map<number, number>();
    if (book.length > 0) {
      const rs = await o.tx
        .selectFrom('restaurant')
        .select(['id', 'account_id'])
        .where('id', 'in', [...new Set(book.map((m) => m.rest_id))])
        .execute();
      for (const r of rs) accOf.set(r.id, r.account_id);
    }
    const links = await linkedAccounts(
      o.tx,
      { accountId: o.rest.account_id, ip: o.ctx?.ip ?? '', deviceId: o.ctx?.deviceId ?? null },
      [...new Set(accOf.values())],
      s.traceDays,
      o.now,
    );
    const pairSince = new Date(o.now.getTime() - s.repeatDays * 86_400_000);
    const releaseAt = new Date(o.now.getTime() + s.holdHours * 3_600_000);

    const credits = newCredits();
    const fills: Array<{ price: number; qty: number; held: boolean }> = [];
    /** 这次成交到的玩家挂单方（任务计数，问题记录 318）：同一家只计一次；冻结的成交不计（backlog 318） */
    const makers = new Set<number>();
    let left = b.qty;
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
      const link = links.get(makerAcc);
      if (link === 'device') continue;
      const n = Math.min(left, m.qty - m.filled);
      const price = m.price;
      const fee = feeOf(price, n, t);
      const buy = b.side === 'buy' ? order : m;
      const sell = b.side === 'sell' ? order : m;
      const pair = await o.tx
        .selectFrom('exchange_trade')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('created_at', '>=', pairSince)
        .where((eb) =>
          eb.or([
            eb.and([eb('buyer_account_id', '=', o.rest.account_id), eb('seller_account_id', '=', makerAcc)]),
            eb.and([eb('buyer_account_id', '=', makerAcc), eb('seller_account_id', '=', o.rest.account_id)]),
          ]),
        )
        .executeTakeFirstOrThrow();
      const flags = tradeFlags({ link, price, qty: n, ref, pairCount: Number(pair.n) + 1 }, s);
      const held = flags.length > 0;
      const trade = await o.tx
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
          buyer_account_id: buy === order ? o.rest.account_id : makerAcc,
          seller_account_id: sell === order ? o.rest.account_id : makerAcc,
          flags,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
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
      const makerCoin = m.side === 'sell' ? price * n - fee : 0;
      const makerFoods = m.side === 'buy' ? n : 0;
      if (held)
        await addHold(o.tx, {
          restId: m.rest_id,
          tradeId: trade.id,
          coin: makerCoin,
          foodsId: makerFoods > 0 ? b.foodsId : null,
          num: makerFoods,
          releaseAt,
        });
      else if (m.side === 'sell') addCredit(credits, m.rest_id, makerCoin);
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
            held,
            // 冻结几小时按区服设置写进日志，前端不再写死 24（backlog 156-2）
            ...(held ? { holdHours: t.suspicious.holdHours } : {}),
          }),
          created_at: o.now,
        })
        .execute();
      // 吃单方：正常成交当场到账；可疑成交进冻结（差价是自己的钱，照常退）
      if (b.side === 'buy') {
        if (b.price > price) gainCoin(o, (b.price - price) * n, { source: 'exchange' });
        if (held)
          await addHold(o.tx, {
            restId: o.rest.id,
            tradeId: trade.id,
            coin: 0,
            foodsId: b.foodsId,
            num: n,
            releaseAt,
          });
        else {
          const plan = await addFoods(o, b.foodsId, n, { source: 'exchange', keepDropped: true });
          if (plan.dropped > 0) addCredit(credits, o.rest.id, 0, b.foodsId, plan.dropped);
        }
      } else if (held)
        await addHold(o.tx, {
          restId: o.rest.id,
          tradeId: trade.id,
          coin: price * n - fee,
          foodsId: null,
          num: 0,
          releaseAt,
        });
      else gainCoin(o, price * n - fee, { source: 'exchange' });
      fills.push({ price, qty: n, held });
      if (!held) makers.add(m.rest_id);
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
    // 任务和活跃"交易所成交"（问题记录 318）：下单方成交一次计一次，被成交的每家挂单方各计一次；卖给系统也算。
    // 判为可疑、所得冻结的成交不计，解冻后也不补（backlog 318：关联小号互刷不能领交易所支线和每周奖励）
    // 下单方和挂单方一起按店 id 升序写计数：两笔成交互为挂单方、或同时给同两家挂单方计数时，
    // 加锁顺序一致，不会死锁（和 creditWallets 一样）
    if (fills.some((x) => !x.held)) makers.add(o.rest.id);
    for (const id of [...makers].sort((a, b) => a - b))
      await (id === o.rest.id ? emitAction(o, 'exchange.fill') : emitActionFor(o, id, 'exchange.fill'));
    restLog(o, 'exchange.order', {
      ...(opts.toSystem ? { toSystem: true } : {}),
      side: b.side,
      foodsId: b.foodsId,
      price: b.price,
      qty: b.qty,
      filled,
      held: fills.some((x) => x.held),
      ...(fills.some((x) => x.held) ? { holdHours: o.tuning.exchange.suspicious.holdHours } : {}),
    });
    return { order: orderDto(done), fills };
  }

  /** 退回挂单剩余部分（撤单退回店里；过期由任务退进账户，见 jobs.ts） */
  async function refundToRest(o: Op, r: OrderRow): Promise<void> {
    const left = r.qty - r.filled;
    if (left <= 0) return;
    if (r.side === 'buy') gainCoin(o, r.price * left, { source: 'exchange' });
    else {
      const plan = await addFoods(o, r.foods_id, left, { source: 'exchange', keepDropped: true });
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
    const frozen = await frozenReason(o.tx, o.rest.id);
    if (frozen !== null) throw invalidState('exchange_frozen', { why: frozen });
    // 冷静期到了的冻结记录先转进可用余额（156-2 设计 §5）
    const due = await o.tx
      .updateTable('exchange_hold')
      .set({ status: 'released' })
      .where('rest_id', '=', o.rest.id)
      .where('status', '=', 'held')
      .where('release_at', '<=', o.now)
      .returning(['coin', 'foods_id', 'num'])
      .execute();
    if (due.length > 0) {
      const c = newCredits();
      for (const h of due) addCredit(c, o.rest.id, Number(h.coin), h.foods_id ?? undefined, h.num);
      await creditWallets(o.tx, c);
    }
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
      const plan = await addFoods(o, f.foods_id, f.num, { source: 'exchange', keepDropped: true });
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
    // 什么都没取到（橱柜和冰箱都满）就不写日志
    if (coin > 0 || got.length > 0) restLog(o, 'exchange.withdraw', { coin, foods: got });
    return { coin, foods: got, left };
  }

  async function foods(ctx: RestCtx): Promise<ExchangeFoodDto[]> {
    const s = await d.shards.ensureFeature(ctx.shardId, 'exchange');
    const t = s.tuning.exchange;
    const day = gameDay(d.now());
    const list = [...d.config.foods.values()]
      .filter((f) => isTradable(f, t.closedLevels))
      .sort((a, b) => a.level - b.level || a.id - b.id);
    const ids = list.map((f) => f.id);
    // 一次批量取参考价；最新成交价每种食材走索引取一条（156-1 终审 I2）
    const refs = await refPrices(d.db, d.config, t, s.tuning.market.levelPriceRate, ctx.shardId, ids, day);
    const lasts = await sql<{ foods_id: number; price: number }>`
      select f.id as foods_id, x.price
      from unnest(${ids}::int[]) as f(id)
      cross join lateral (
        select price from exchange_trade
        where shard_id = ${ctx.shardId} and foods_id = f.id and not system
        order by id desc limit 1
      ) x`.execute(d.db);
    const lastBy = new Map(lasts.rows.map((x) => [x.foods_id, x.price]));
    // 在售、在收（问题记录 282）：本区服未过期挂单的剩余数量按食材和方向合计；系统库存
    const open = await d.db
      .selectFrom('exchange_order')
      .select(['foods_id', 'side', sql<string>`sum(qty - filled)`.as('n')])
      .where('shard_id', '=', ctx.shardId)
      .where('status', '=', 'open')
      .where('expires_at', '>', d.now())
      .groupBy(['foods_id', 'side'])
      .execute();
    const openBy = new Map(open.map((x) => [`${x.side}:${x.foods_id}`, Number(x.n)]));
    const stock = await d.db
      .selectFrom('exchange_stock')
      .select(['foods_id', 'num'])
      .where('shard_id', '=', ctx.shardId)
      .where('num', '>', 0)
      .execute();
    const stockBy = new Map(stock.map((x) => [x.foods_id, x.num]));
    const out: ExchangeFoodDto[] = [];
    for (const f of list) {
      const ref = refs.get(f.id)!;
      const last = lastBy.get(f.id) ?? null;
      out.push({
        foodsId: f.id,
        ref,
        last,
        changePct: last === null ? null : Math.round(((last - ref) / ref) * 1000) / 1000,
        selling: openBy.get(`sell:${f.id}`) ?? 0,
        buying: openBy.get(`buy:${f.id}`) ?? 0,
        sysStock: stockBy.get(f.id) ?? 0,
      });
    }
    return out;
  }

  async function book(ctx: RestCtx, foodsId: number): Promise<ExchangeBookDto> {
    const s = await d.shards.ensureFeature(ctx.shardId, 'exchange');
    const t = s.tuning.exchange;
    if (!isTradable(d.config.foods.get(foodsId), t.closedLevels)) throw invalidState('not_tradable');
    const now = d.now();
    const ref = await refPrice(
      d.db,
      d.config,
      t,
      s.tuning.market.levelPriceRate,
      ctx.shardId,
      foodsId,
      gameDay(now),
    );
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
      ).map((x): ExchangeLevelDto => ({ price: x.price, qty: Number(x.qty), system: false }));
    const last = await d.db
      .selectFrom('exchange_trade')
      .select('price')
      .where('shard_id', '=', ctx.shardId)
      .where('foods_id', '=', foodsId)
      // 写成字面的 not system，部分索引 exchange_trade_last_player 才一定用得上（参数化的 = false 要看计划器）
      .where(sql<boolean>`not system`)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    const vol = await d.db
      .selectFrom('exchange_trade')
      .select(sql<string>`coalesce(sum(qty), 0)`.as('n'))
      .where('shard_id', '=', ctx.shardId)
      .where('foods_id', '=', foodsId)
      .where('created_at', '>=', gameTime(gameDay(now), 0))
      .executeTakeFirstOrThrow();
    // 系统做市的一档（156-3 设计 §6）：同价排在玩家后面；买档数量按看的人自己的剩余额度。
    // 被冻结或还没开通的人卖不了，不给他们显示收购档（backlog 156-3）
    const viewer = await d.db
      .selectFrom('restaurant')
      .select('level')
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const canSell =
      (await eligibility({ db: d.db, level: viewer.level, accountId: ctx.accountId, now, t })) === null &&
      (await frozenReason(d.db, ctx.restaurantId)) === null;
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
    return {
      foodsId,
      ref,
      ...priceBand(ref, t),
      last: last?.price ?? null,
      volume: Number(vol.n),
      bids: merge(await side('buy'), canSell ? quote.bid : null, 'buy'),
      asks: merge(await side('sell'), quote.ask, 'sell'),
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
      .select(['buyer_rest_id', 'foods_id', 'price', 'qty', 'fee', 'system', 'created_at'])
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
      level: rest.level,
      maxQty: t.maxQty,
      holdHours: t.suspicious.holdHours,
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
          system: x.system,
          createdAt: x.created_at.toISOString(),
        };
      }),
      feeRate: t.feeRate,
      holds: (
        await d.db
          .selectFrom('exchange_hold')
          .select(['coin', 'foods_id', 'num', 'release_at'])
          .where('rest_id', '=', ctx.restaurantId)
          .where('status', '=', 'held')
          .orderBy('release_at')
          .execute()
      ).map((h) => ({
        coin: Number(h.coin),
        foodsId: h.foods_id,
        num: h.num,
        releaseAt: h.release_at.toISOString(),
      })),
      frozen: await (async () => {
        const r = await frozenReason(d.db, ctx.restaurantId);
        return r === null ? null : { reason: r };
      })(),
    };
  }

  const op = <T>(ctx: RestCtx, feature: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature, source: 'exchange' }, fn);

  /**
   * 进锁店事务之前先把今天的参考价算好存下（质量期 ③）：冷门食材一周多没人看时，第一笔下单要往前补算，
   * 最多约 40 条查询，不该占着店锁。事务里再取就只读一条；正好跨过 0 点时事务里照常补算
   */
  async function warmRef(ctx: RestCtx, foodsId: number): Promise<void> {
    // 功能关着时照常报 FEATURE_DISABLED；等级不够的不补算（锁里的资格检查会拒绝），免得随便下单就触发几十条查询（终审 Important 2）
    const { tuning } = await d.shards.ensureFeature(ctx.shardId, 'exchange');
    if (!isTradable(d.config.foods.get(foodsId), tuning.exchange.closedLevels)) return;
    const rest = await d.db
      .selectFrom('restaurant')
      .select('level')
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirst();
    if (!rest || rest.level < tuning.exchange.minLevel) return;
    await refPrice(
      d.db,
      d.config,
      tuning.exchange,
      tuning.market.levelPriceRate,
      ctx.shardId,
      foodsId,
      gameDay(d.now()),
    );
  }

  return {
    place: async (ctx: RestCtx, b: { foodsId: number; side: 'buy' | 'sell'; price: number; qty: number }) => {
      await warmRef(ctx, b.foodsId);
      return op(ctx, 'exchange', (o) => place(o, b));
    },
    /** 卖给系统（问题记录 244）：按系统收购价立即成交，可以是低于挂单下限的兜底价 */
    sellToSystem: async (ctx: RestCtx, b: { foodsId: number; price: number; qty: number }) => {
      await warmRef(ctx, b.foodsId);
      return op(ctx, 'exchange', (o) => place(o, { ...b, side: 'sell' }, { toSystem: true }));
    },
    cancel: (ctx: RestCtx, id: number) => op(ctx, 'restaurant', (o) => cancel(o, id)),
    withdraw: (ctx: RestCtx) => op(ctx, 'restaurant', (o) => withdraw(o)),
    foods,
    book,
    me,
  };
}
export type ExchangeService = ReturnType<typeof createExchangeService>;
