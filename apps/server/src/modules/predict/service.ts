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
import { emitAction } from '../../core/action';
import { restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { isFeatureEnabled } from '@dt/config';
import { frozenReason } from '../exchange/guard';
import { eligibility } from '../exchange/service';

const KEEP_DAYS = 7;

/**
 * 结算所得：已判定按押对的份数；已作废退净投入（负数不退）× 作废时定下的比例，
 * 退款总额不超过系统在这个事件的净收入（终审 I1：防止小号一个卖出获利、一个等作废退款）；其他为 null
 */
export function payoutOf(
  e: { status: string; outcome: boolean | null; unit: number; void_ratio: number | null },
  p: { yes: number; no: number; net_cost: number },
): number | null {
  if (e.status === 'resolved') return e.unit * (e.outcome ? p.yes : p.no);
  if (e.status === 'void') return Math.floor(Math.max(Number(p.net_cost), 0) * (e.void_ratio ?? 1));
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
    b: { side: PredictSide; dir: PredictDir; qty: number; limit?: number },
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
    // 交易所被冻结的店也不能用事件合约（backlog 238-1）：两个号配合靠买卖能借做市转钱，买卖都要堵上
    if ((await frozenReason(o.tx, o.rest.id)) !== null) throw invalidState('predict_frozen');
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
    if (b.dir === 'buy' && held[b.side] + b.qty > t.maxHold)
      throw limitReached('predict_hold', { max: t.maxHold });
    if (b.dir === 'sell' && b.qty > held[b.side]) throw invalidState('predict_not_enough');

    const q = predictQuote({ y: e.q_yes, n: e.q_no, b: e.b }, b.side, b.dir, b.qty, {
      unit: e.unit,
      feeRate: t.feeRate,
    });
    // 滑点保护（终审 I2）：带了预估金额时，买入要付的超过它、卖出得到的低于它就不成交
    if (b.limit !== undefined && (b.dir === 'buy' ? q.total > b.limit : q.total < b.limit))
      throw invalidState('predict_price_moved', { total: q.total });
    if (b.dir === 'buy') spendCoin(o, q.total, { source: 'predict' });
    else gainCoin(o, q.total, { source: 'predict' });
    const next = { ...held, [b.side]: held[b.side] + (b.dir === 'buy' ? b.qty : -b.qty) };
    const net = b.dir === 'buy' ? q.total : -q.total;
    await o.tx
      .updateTable('predict_event')
      .set({ q_yes: q.yAfter, q_no: q.nAfter })
      .where('id', '=', e.id)
      .execute();
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
    await emitAction(o, 'predict.trade');
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
    'e.void_ratio',
    'e.auto_key',
    'e.result_note',
    'e.kind',
    'e.params',
    'e.result_params',
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
    void_ratio: number | null;
    auto_key: string | null;
    result_note: string | null;
    kind: string;
    params: Record<string, unknown>;
    result_params: Record<string, unknown> | null;
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
      unit: r.unit,
      yes: p.yes,
      no: p.no,
      netCost: p.net_cost,
      payout: payoutOf(r, p),
      auto: r.auto_key !== null,
      resultNote: r.result_note,
      kind: r.kind,
      params: r.params,
      resultParams: r.result_params,
    };
  };

  const withPosition = (restId: number) =>
    d.db
      .selectFrom('predict_event as e')
      .leftJoin('predict_position as p', (j) =>
        j.onRef('p.event_id', '=', 'e.id').on('p.rest_id', '=', restId),
      );

  async function list(ctx: RestCtx): Promise<PredictListDto> {
    // 关掉事件合约时只禁买卖，持仓和结算结果照常能看（backlog 238-1）
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.predict;
    const now = d.now();
    const rest = await d.db
      .selectFrom('restaurant')
      .select('level')
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const r =
      (await eligibility({ db: d.db, level: rest.level, accountId: ctx.accountId, now, t })) ??
      ((await frozenReason(d.db, ctx.restaurantId)) !== null ? 'predict_frozen' : null);
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
      reason: r === null ? null : (REASON[r] ?? r),
      enabled: isFeatureEnabled(s, 'predict'),
      need: { level: t.minLevel, days: t.minAccountDays },
      feeRate: t.feeRate,
      maxHold: t.maxHold,
      maxTrade: t.maxTrade,
      unit: t.unit,
      events: rows.map((x) => toDto(x, now)),
    };
  }

  async function detail(ctx: RestCtx, id: number): Promise<PredictDetailDto> {
    const now = d.now();
    const r = (await withPosition(ctx.restaurantId)
      .select(EVENT_COLS)
      .where('e.id', '=', String(id))
      .where('e.shard_id', '=', ctx.shardId)
      .executeTakeFirst()) as (Row & { description: string; p0: number; open_at: Date }) | undefined;
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'predict_event', id });
    const trades = await d.db
      .selectFrom('predict_trade')
      .select(['side', 'dir', 'qty', 'amount', 'price_after', 'created_at'])
      .where('event_id', '=', r.id)
      .orderBy('id', 'desc')
      .limit(20)
      .execute();
    // 我这一局的成交和收支（问题记录 254）：汇总按全部成交算，明细最多列 100 笔
    const myTrades = await d.db
      .selectFrom('predict_trade')
      .select(['side', 'dir', 'qty', 'amount', 'fee', 'price_after', 'created_at'])
      .where('event_id', '=', r.id)
      .where('rest_id', '=', ctx.restaurantId)
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    const sums = await d.db
      .selectFrom('predict_trade')
      .select([
        sql<string>`coalesce(sum(case when dir = 'buy' then amount + fee else 0 end), 0)`.as('bought'),
        sql<string>`coalesce(sum(case when dir = 'sell' then amount - fee else 0 end), 0)`.as('sold'),
        sql<string>`coalesce(sum(fee), 0)`.as('fees'),
      ])
      .where('event_id', '=', r.id)
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
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
        priceAfter: x.price_after,
        createdAt: x.created_at.toISOString(),
      })),
      points: [r.p0, ...points.map((x) => x.price_after).reverse()],
      mine: {
        bought: Number(sums.bought),
        sold: Number(sums.sold),
        fees: Number(sums.fees),
        voidRatio: r.void_ratio,
        trades: myTrades.map((x) => ({
          side: x.side,
          dir: x.dir,
          qty: x.qty,
          amount: Number(x.amount),
          fee: Number(x.fee),
          priceAfter: x.price_after,
          createdAt: x.created_at.toISOString(),
        })),
      },
    };
  }

  return {
    list,
    detail,
    trade: (
      ctx: RestCtx,
      id: number,
      b: { side: PredictSide; dir: PredictDir; qty: number; limit?: number },
    ) => runOp(d, ctx, { feature: 'predict', source: 'predict' }, (o) => trade(o, id, b)),
  };
}
export type PredictService = ReturnType<typeof createPredictService>;
