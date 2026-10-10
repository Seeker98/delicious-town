import type { Kysely, Selectable } from 'kysely';
import type { BulkBidInput, BulkDto, BulkResultDto } from '@dt/shared';
import type { ShardSettings } from '@dt/config';
import type { GameDeps, RestCtx } from '../../core/deps';
import type { BidIn } from './rules';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { featureAvailable } from '../../core/features';
import { restLog, runOp, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import type { BulkLotTable, DB } from '../../db/schema';
import { eligibility } from '../exchange/eligibility';
import { frozenReason } from '../exchange/guard';
import { minRaisePrice, standing } from './rules';

/** 最近结果列几批 */
const RECENT = 7;

type Blocked = BulkDto['blocked'];
type LotRow = Selectable<BulkLotTable>;
type Snapshot = { at: Date; price: number; threshold: number; demand: number; bidders: number };
const MIN_MS = 60_000;

/**
 * 最后一段停更（问题记录 595）：名义结束前 blindMin 分钟起，看板停在进入停更那一刻。
 * 已经写下快照就用它；进入停更了还没写就按现在的出价算出来，persist 时写进批次（只写一次）。
 * 出价的事务里对批次拿着共享锁，那里只算不写（persist = false），写快照放在出价之前的短事务里
 * blindMin 为 0（或还没到停更）时返回 null：实时显示
 */
async function blindOf(
  db: Kysely<DB>,
  lot: LotRow,
  blindMin: number,
  now: Date,
  bids: readonly BidIn[],
  persist: boolean,
): Promise<Snapshot | null> {
  if (blindMin <= 0) return null;
  const at = new Date(lot.ends_at.getTime() - blindMin * MIN_MS);
  if (now < at) return null;
  if (lot.blind_at !== null)
    return {
      at: lot.blind_at,
      price: Number(lot.blind_price),
      threshold: Number(lot.blind_threshold),
      demand: lot.blind_demand ?? 0,
      bidders: lot.blind_bidders ?? 0,
    };
  const st = standing(lot.qty, Number(lot.reserve), bids);
  const snap = { at, price: st.price, threshold: st.threshold, demand: st.demand, bidders: st.bidders };
  if (!persist) return snap;
  const w = await db
    .updateTable('bulk_lot')
    .set({
      blind_at: at,
      blind_price: snap.price,
      blind_threshold: snap.threshold,
      blind_demand: snap.demand,
      blind_bidders: snap.bidders,
    })
    .where('id', '=', lot.id)
    .where('blind_at', 'is', null)
    .executeTakeFirst();
  if (Number(w.numUpdatedRows) > 0) return snap;
  // 别处先写了：用写下的那份
  const again = await db
    .selectFrom('bulk_lot')
    .selectAll()
    .where('id', '=', lot.id)
    .executeTakeFirstOrThrow();
  return blindOf(db, again, blindMin, now, bids, persist);
}

const bidsOf = async (db: Kysely<DB>, lotId: string): Promise<BidIn[]> =>
  (await db.selectFrom('bulk_bid').selectAll().where('lot_id', '=', lotId).execute()).map((b) => ({
    restId: b.rest_id,
    price: Number(b.price),
    qty: b.qty,
    rankedAt: b.ranked_at,
  }));

/** 每分钟的任务：进入停更的进行中批次写下快照，保证看板停在进入停更那一刻（问题记录 595）。返回新写了几批 */
export async function freezeDue(d: GameDeps, shardId: number, now: Date): Promise<number> {
  const t = (await d.shards.settings(shardId)).tuning.bulk;
  if (t.blindMin <= 0) return 0;
  const lots = await d.db
    .selectFrom('bulk_lot')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('blind_at', 'is', null)
    .where('ends_at', '<=', new Date(now.getTime() + t.blindMin * MIN_MS))
    .execute();
  let n = 0;
  for (const lot of lots)
    if (await blindOf(d.db, lot, t.blindMin, now, await bidsOf(d.db, lot.id), true)) n++;
  return n;
}

/** 出价之前：这一批已经进入停更、还没写快照时先写（问题记录 595），保证快照里没有这笔出价 */
async function freezeLot(d: GameDeps, shardId: number, lotId: number, now: Date): Promise<void> {
  const t = (await d.shards.settings(shardId)).tuning.bulk;
  if (t.blindMin <= 0) return;
  const lot = await d.db
    .selectFrom('bulk_lot')
    .selectAll()
    .where('id', '=', String(lotId))
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .executeTakeFirst();
  if (lot && lot.blind_at === null)
    await blindOf(d.db, lot, t.blindMin, now, await bidsOf(d.db, lot.id), true);
}

/** 看板（大宗认购设计 §1.3）：进行中的批次、公开数据、我的出价、最近结果。不返回真正的收盘时刻 */
async function viewOf(
  db: Kysely<DB>,
  s: ShardSettings,
  shardId: number,
  restId: number,
  blocked: Blocked,
  coin: number,
  now: Date,
  /** 停更快照要不要写进批次：出价的事务里不写（见 blindOf） */
  persist = true,
): Promise<BulkDto> {
  const t = s.tuning.bulk;
  const et = s.tuning.exchange;
  const lot = await db
    .selectFrom('bulk_lot')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .orderBy('opens_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  let lotDto: BulkDto['lot'] = null;
  let mine: BulkDto['mine'] = null;
  if (lot) {
    const bids = await db.selectFrom('bulk_bid').selectAll().where('lot_id', '=', lot.id).execute();
    const ins = bids.map((b) => ({
      restId: b.rest_id,
      price: Number(b.price),
      qty: b.qty,
      rankedAt: b.ranked_at,
    }));
    const st = standing(lot.qty, Number(lot.reserve), ins);
    // 停更期间公开的数停在进入停更那一刻，入围情况不公布（问题记录 595）
    const blind = await blindOf(db, lot, t.blindMin, now, ins, persist);
    const shown = blind ?? st;
    lotDto = {
      id: Number(lot.id),
      foodsId: lot.foods_id,
      level: lot.level,
      qty: lot.qty,
      reserve: Number(lot.reserve),
      cap: lot.cap,
      groupQty: lot.group_qty,
      opensAt: lot.opens_at.toISOString(),
      endsAt: lot.ends_at.toISOString(),
      price: shown.price,
      threshold: shown.threshold,
      demand: shown.demand,
      bidders: shown.bidders,
      grouped: shown.demand >= lot.group_qty,
      blindAt: blind ? blind.at.toISOString() : null,
    };
    const b = bids.find((x) => x.rest_id === restId);
    if (b) {
      const won = st.won.get(restId) ?? 0;
      const wait = b.last_bid_at.getTime() + t.cooldownSec * 1000 - now.getTime();
      mine = {
        price: Number(b.price),
        qty: b.qty,
        frozen: Number(b.frozen),
        won: blind ? null : won,
        estimate: blind ? null : st.price * won,
        cooldownLeft: wait > 0 ? Math.ceil(wait / 1000) : 0,
      };
    }
  }
  const done = await db
    .selectFrom('bulk_lot')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('status', '!=', 'open')
    .orderBy('opens_at', 'desc')
    .limit(RECENT)
    .execute();
  const myBids =
    done.length === 0
      ? []
      : await db
          .selectFrom('bulk_bid')
          .selectAll()
          .where('rest_id', '=', restId)
          .where(
            'lot_id',
            'in',
            done.map((l) => l.id),
          )
          .execute();
  const recent: BulkResultDto[] = await Promise.all(
    done.map(async (l) => {
      const b = myBids.find((x) => x.lot_id === l.id);
      const sum = await db
        .selectFrom('bulk_bid')
        .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('qty'), eb.lit(0)).as('n'))
        .where('lot_id', '=', l.id)
        .executeTakeFirstOrThrow();
      return {
        id: Number(l.id),
        foodsId: l.foods_id,
        level: l.level,
        qty: l.qty,
        sold: l.sold ?? 0,
        price: l.price === null ? null : Number(l.price),
        demand: Number(sum.n),
        status: l.status as BulkResultDto['status'],
        endsAt: l.ends_at.toISOString(),
        mine: b
          ? {
              qty: b.qty,
              won: b.won ?? 0,
              paid: b.paid === null ? null : Number(b.paid),
              refunded: b.refunded === null ? null : Number(b.refunded),
              consolation: b.consolation,
            }
          : null,
      };
    }),
  );
  return {
    enabled: featureAvailable(s, 'bulk') && featureAvailable(s, 'exchange'),
    blocked,
    needLevel: et.minLevel,
    needDays: et.minAccountDays,
    cooldownSec: t.cooldownSec,
    minRaise: t.minRaise,
    closeWindowMin: t.closeWindowMin,
    blindMin: t.blindMin,
    openHour: t.openHour,
    coin,
    lot: lotDto,
    mine,
    recent,
  };
}

/** 特许大宗认购（大宗认购设计 2026-10-10）：出价、看板 */
export function createBulkService(d: GameDeps) {
  async function bid(o: Op, b: BulkBidInput): Promise<BulkDto> {
    const t = o.tuning.bulk;
    const et = o.tuning.exchange;
    // 门槛和交易所一样（设计 §1.2）
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
    // 对批次行拿共享锁：结算第一段拿排他锁，正在提交的出价先提交，之后的出价看到状态已变（设计 §3.2）
    const lot = await o.tx
      .selectFrom('bulk_lot')
      .selectAll()
      .where('id', '=', String(b.lotId))
      .where('shard_id', '=', o.shardId)
      .forShare()
      .executeTakeFirst();
    if (!lot || lot.status !== 'open') throw invalidState('bulk_not_open');
    if (o.now >= lot.close_at) throw invalidState('bulk_closed');
    const old = await o.tx
      .selectFrom('bulk_bid')
      .selectAll()
      .where('lot_id', '=', lot.id)
      .where('rest_id', '=', o.rest.id)
      .forUpdate()
      .executeTakeFirst();
    if (old) {
      const wait = old.last_bid_at.getTime() + t.cooldownSec * 1000 - o.now.getTime();
      if (wait > 0) throw invalidState('bulk_cooldown', { wait: Math.ceil(wait / 1000) });
      const p0 = Number(old.price);
      // 只能加不能撤（设计 §1.2）：价格、份数都不能少，至少一项变大
      if (b.price < p0 || b.qty < old.qty || (b.price === p0 && b.qty === old.qty))
        throw invalidState('bulk_shrink');
      const min = minRaisePrice(p0, t);
      if (b.price > p0 && b.price < min) throw invalidState('bulk_raise', { min });
    }
    if (b.price < Number(lot.reserve)) throw invalidState('bulk_reserve', { reserve: Number(lot.reserve) });
    if (b.qty > lot.cap) throw limitReached('bulk_cap', { max: lot.cap });
    const frozenNow = b.price * b.qty;
    spendCoin(o, frozenNow - Number(old?.frozen ?? 0), { source: 'bulk.bid' });
    await o.tx
      .insertInto('bulk_bid')
      .values({
        lot_id: lot.id,
        rest_id: o.rest.id,
        shard_id: o.shardId,
        price: b.price,
        qty: b.qty,
        frozen: frozenNow,
        ranked_at: o.now,
        last_bid_at: o.now,
      })
      .onConflict((oc) =>
        oc.columns(['lot_id', 'rest_id']).doUpdateSet({
          price: b.price,
          qty: b.qty,
          frozen: frozenNow,
          ranked_at: o.now,
          last_bid_at: o.now,
        }),
      )
      .execute();
    restLog(o, 'bulk.bid', {
      lotId: b.lotId,
      foodsId: lot.foods_id,
      price: b.price,
      qty: b.qty,
      frozen: frozenNow,
    });
    return viewOf(o.tx, o.settings, o.shardId, o.rest.id, null, o.rest.coin, o.now, false);
  }

  /** 大宗认购标签：开关关着也能看自己的结果 */
  async function view(ctx: RestCtx): Promise<BulkDto> {
    const s = await d.shards.settings(ctx.shardId);
    const now = d.now();
    const rest = await d.db
      .selectFrom('restaurant')
      .select(['level', 'coin'])
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const blocked: Blocked =
      (await frozenReason(d.db, ctx.restaurantId)) !== null
        ? 'exchange_frozen'
        : await eligibility({
            db: d.db,
            level: rest.level,
            accountId: ctx.accountId,
            now,
            t: s.tuning.exchange,
          });
    return viewOf(d.db, s, ctx.shardId, ctx.restaurantId, blocked, Number(rest.coin), now);
  }

  return {
    view,
    bid: async (ctx: RestCtx, b: BulkBidInput) => {
      // 交易所关着也不能出价（设计 §3.2）
      await d.shards.ensureFeature(ctx.shardId, 'exchange');
      await freezeLot(d, ctx.shardId, b.lotId, d.now());
      return runOp(d, ctx, { feature: 'bulk', source: 'bulk' }, (o) => bid(o, b));
    },
  };
}
export type BulkService = ReturnType<typeof createBulkService>;
