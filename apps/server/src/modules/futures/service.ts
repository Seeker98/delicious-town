import { sql, type Kysely, type Selectable } from 'kysely';
import { gameDay, type FuturesContractDto, type FuturesDto, type FuturesFoodDto } from '@dt/shared';
import type { GameConfig } from '@dt/config';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { featureAvailable } from '../../core/features';
import { restLog, runOp, type Op } from '../../core/op';
import { foodPrice } from '../../core/prices';
import { spendCoin } from '../../core/resources';
import type { DB, FuturesContractTable } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { eligibility } from '../exchange/eligibility';
import { frozenReason } from '../exchange/guard';
import { refPrice, refPrices } from '../exchange/ref';
import { futuresDeposit, futuresQuota, futuresUnitPrice } from './rules';

type ContractRow = Selectable<FuturesContractTable>;

/** 已结束的单在“我的期货单”里最多列几张 */
const CLOSED_SHOWN = 30;
const HOUR_MS = 3_600_000;
const DAILY_KEY = 'futures.qty';

export const contractDto = (r: ContractRow): FuturesContractDto => ({
  id: Number(r.id),
  foodsId: r.foods_id,
  qty: r.qty,
  unitPrice: Number(r.unit_price),
  deposit: Number(r.deposit),
  balance: Number(r.balance),
  createdAt: r.created_at.toISOString(),
  dueAt: r.due_at.toISOString(),
  status: r.status,
  settledAt: r.settled_at?.toISOString() ?? null,
  toCupboard: r.to_cupboard,
  toWallet: r.to_wallet,
});

/** 能下期货单的食材（期货设计 §5.1）：在表里、上架、配置里有、没下架、1~5 级 */
function listable(config: GameConfig, row: { foods_id: number; enabled: boolean } | undefined) {
  const food = row ? config.foods.get(row.foods_id) : undefined;
  return row?.enabled && food && !food.retired && food.level >= 1 && food.level <= 5 ? food : null;
}

/** 区服今天每种食材已订的份数 */
async function usedToday(db: Kysely<DB>, shardId: number, day: string): Promise<Map<number, number>> {
  const rows = await db
    .selectFrom('futures_quota')
    .select(['foods_id', 'used'])
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .execute();
  return new Map(rows.map((r) => [r.foods_id, r.used]));
}

/** 食材期货（期货设计 2026-10-10）：下单、撤单、期货标签 */
export function createFuturesService(d: GameDeps) {
  async function order(
    o: Op,
    b: { foodsId: number; qty: number; unitPrice: number },
  ): Promise<FuturesContractDto> {
    const t = o.tuning.futures;
    const et = o.tuning.exchange;
    // 门槛和交易所一样（期货设计 §2）
    const frozen = await frozenReason(o.tx, o.rest.id);
    if (frozen !== null) throw invalidState('exchange_frozen', { why: frozen });
    const reason = await eligibility({
      db: o.tx,
      level: o.rest.level,
      accountId: o.rest.account_id,
      now: o.now,
      t: et,
    });
    if (reason === 'exchange_level') throw requirement(reason, { need: et.minLevel });
    if (reason === 'exchange_age') throw requirement(reason, { days: et.minAccountDays });
    if (reason) throw requirement(reason);
    const row = await o.tx
      .selectFrom('futures_food')
      .select(['foods_id', 'enabled', 'daily_quota'])
      .where('foods_id', '=', b.foodsId)
      .executeTakeFirst();
    const food = listable(o.config, row);
    if (!food || !row) throw invalidState('futures_not_listed');
    const day = gameDay(o.now);
    const ref = await refPrice(o.tx, o.config, et, o.tuning.market.levelPriceRate, o.shardId, food.id, day);
    const unit = futuresUnitPrice(foodPrice(food, o.tuning.market), ref, t);
    if (unit !== b.unitPrice) throw invalidState('futures_price_moved', { price: unit });
    // 个人额度：锁着店，不会并发
    const mine = await getDaily(o.tx, o.rest.id, DAILY_KEY, day);
    if (mine + b.qty > t.personDaily)
      throw limitReached('futures_person', { max: t.personDaily, left: Math.max(0, t.personDaily - mine) });
    const total = unit * b.qty;
    const deposit = futuresDeposit(total, t);
    spendCoin(o, deposit, { source: 'futures.deposit' });
    // 区服额度：原子地加，加完超了就没加上（期货设计 §4，并发下也不超）
    const quota = futuresQuota(food.level, row.daily_quota, t);
    const got = await sql<{ used: number }>`
      insert into futures_quota (shard_id, foods_id, day, used)
      select ${o.shardId}, ${food.id}, ${day}::date, ${b.qty} where ${b.qty}::int <= ${quota}::int
      on conflict (shard_id, foods_id, day) do update set used = futures_quota.used + excluded.used
        where futures_quota.used + excluded.used <= ${quota}::int
      returning used`.execute(o.tx);
    if (got.rows.length === 0) {
      const used = (await usedToday(o.tx, o.shardId, day)).get(food.id) ?? 0;
      throw limitReached('futures_quota', { max: quota, left: Math.max(0, quota - used) });
    }
    await incrementDaily(o.tx, o.rest.id, DAILY_KEY, b.qty, day);
    const c = await o.tx
      .insertInto('futures_contract')
      .values({
        shard_id: o.shardId,
        rest_id: o.rest.id,
        foods_id: food.id,
        qty: b.qty,
        unit_price: unit,
        deposit,
        balance: total - deposit,
        created_at: o.now,
        due_at: new Date(o.now.getTime() + t.deliverHours * HOUR_MS),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    restLog(o, 'futures.order', {
      foodsId: food.id,
      qty: b.qty,
      unitPrice: unit,
      deposit,
      balance: total - deposit,
    });
    return contractDto(c);
  }

  /** 撤单（期货设计 §6）：自己的、进行中的、没到期的才能撤；算违约，定金和额度都不退 */
  async function cancel(o: Op, id: number): Promise<FuturesContractDto> {
    const c = await o.tx
      .updateTable('futures_contract')
      .set({ status: 'cancelled', settled_at: o.now })
      .where('id', '=', String(id))
      .where('rest_id', '=', o.rest.id)
      .where('status', '=', 'open')
      .where('due_at', '>', o.now)
      .returningAll()
      .executeTakeFirst();
    if (!c) throw invalidState('futures_not_open');
    restLog(o, 'futures.cancel', { foodsId: c.foods_id, qty: c.qty, deposit: Number(c.deposit) });
    return contractDto(c);
  }

  /** 期货标签（期货设计 §9）：开关关着也能看自己的单 */
  async function view(ctx: RestCtx): Promise<FuturesDto> {
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.futures;
    const et = s.tuning.exchange;
    const now = d.now();
    const day = gameDay(now);
    const enabled = featureAvailable(s, 'futures') && featureAvailable(s, 'exchange');
    const rest = await d.db
      .selectFrom('restaurant')
      .select('level')
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const blocked =
      (await frozenReason(d.db, ctx.restaurantId)) !== null
        ? ('exchange_frozen' as const)
        : await eligibility({ db: d.db, level: rest.level, accountId: ctx.accountId, now, t: et });
    let foods: FuturesFoodDto[] = [];
    if (enabled) {
      const rows = await d.db
        .selectFrom('futures_food')
        .select(['foods_id', 'enabled', 'daily_quota'])
        .execute();
      const list = rows.flatMap((r) => {
        const food = listable(d.config, r);
        return food ? [{ food, quota: futuresQuota(food.level, r.daily_quota, t) }] : [];
      });
      const ids = list.map((x) => x.food.id);
      const refs = await refPrices(d.db, d.config, et, s.tuning.market.levelPriceRate, ctx.shardId, ids, day);
      const used = await usedToday(d.db, ctx.shardId, day);
      foods = list
        .map(({ food, quota }) => ({
          foodsId: food.id,
          level: food.level,
          rare: food.odds < 100,
          unitPrice: futuresUnitPrice(foodPrice(food, s.tuning.market), refs.get(food.id)!, t),
          left: Math.max(0, quota - (used.get(food.id) ?? 0)),
        }))
        .sort((a, b) => a.level - b.level || a.foodsId - b.foodsId);
    }
    const mine = await getDaily(d.db, ctx.restaurantId, DAILY_KEY, day);
    const base = d.db.selectFrom('futures_contract').selectAll().where('rest_id', '=', ctx.restaurantId);
    const open = await base
      .where('status', '=', 'open')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .execute();
    const closed = await base
      .where('status', '!=', 'open')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(CLOSED_SHOWN)
      .execute();
    const contracts = [...open, ...closed]
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || Number(b.id) - Number(a.id))
      .map(contractDto);
    return {
      enabled,
      blocked,
      needLevel: et.minLevel,
      needDays: et.minAccountDays,
      foods,
      personDaily: t.personDaily,
      personLeft: Math.max(0, t.personDaily - mine),
      deliverHours: t.deliverHours,
      depositRate: t.depositRate,
      contracts,
    };
  }

  /** 锁外先把今天的参考价算好存下（和交易所下单一样，质量期 ③）：冷门食材第一次要往前补算，不该占着店锁 */
  async function warmRef(ctx: RestCtx, foodsId: number): Promise<void> {
    const { tuning } = await d.shards.ensureFeature(ctx.shardId, 'exchange');
    const food = d.config.foods.get(foodsId);
    if (!food || food.level < 1 || food.level > 5) return;
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
    view,
    order: async (ctx: RestCtx, b: { foodsId: number; qty: number; unitPrice: number }) => {
      await warmRef(ctx, b.foodsId);
      return runOp(d, ctx, { feature: 'futures', source: 'futures' }, (o) => order(o, b));
    },
    cancel: (ctx: RestCtx, id: number) =>
      runOp(d, ctx, { feature: 'restaurant', source: 'futures' }, (o) => cancel(o, id)),
  };
}
export type FuturesService = ReturnType<typeof createFuturesService>;
