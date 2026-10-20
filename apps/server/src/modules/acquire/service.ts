import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  type AcquireBriefDto,
  type AcquireHoldingDto,
  type AcquireInvestRowDto,
  type AcquireMarketDto,
  type AcquireOwnedDto,
  type AcquireRankDto,
  type AcquireRestDto,
  type AcquireResultDto,
  type AcquireRulesDto,
  type AcquireTendAllDto,
  type AcquireTendDto,
  type AcquireViewDto,
} from '@dt/shared';
import { addDays, DAY_MS, gameDay, gameTime } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { emitAction } from '../../core/action';
import { createOp, flushOp, opNews, restLog, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import type { DB } from '../../db/schema';
import { withRestaurants } from '../../db/tx';
import { AppError } from '../../http/errors';
import { isBanned } from '../admin/ban';
import { linkedAccounts } from '../exchange/guard';
import { grantGoodsOp } from '../store/goods';
import {
  avgOf,
  buyBlock,
  cedeState,
  heatAfterAcquire,
  heatAfterListedSale,
  listPrice,
  priceOf,
  redeemPrice,
  splitFirst,
  splitRedeem,
  splitResale,
  tendCost,
  tendPacks,
  validListRate,
  type T,
} from './rules';
import { baseOf, ensureState, lockState, type AcquireStateRow } from './state';
import { bumpCounters } from '../achieve/counters';

const RANK_SIZE = 50;
const MARKET_SIZE = 100;
/** 被收购页的“近 30 天让出” */
const CEDED_DAYS = 30;
/** 被收购页的“近 7 天老板打理了几天” */
const TEND_DAYS = 7;

interface BriefRow {
  rest_id: number;
  name: string;
  level: number;
  star_level: number;
  base: number;
  heat: number;
  owner_rest_id: number | null;
  owner_name: string | null;
  list_rate: number | null;
  list_until: Date | null;
  door?: number;
}

const isListed = (x: { list_rate: number | null; list_until: Date | null }, now: Date): boolean =>
  x.list_rate !== null && x.list_until !== null && x.list_until > now;

function briefOf(x: BriefRow, now: Date, t: T): AcquireBriefDto {
  const listed = isListed(x, now);
  return {
    restId: x.rest_id,
    name: x.name,
    level: x.level,
    star: x.star_level,
    base: x.base,
    avg: avgOf(x.base, t),
    heat: x.heat,
    price: priceOf(x),
    owner: x.owner_rest_id === null ? null : { restId: x.owner_rest_id, name: x.owner_name ?? '' },
    listed: listed ? { rate: x.list_rate!, price: listPrice(x)!, until: x.list_until!.toISOString() } : null,
    ...(x.door !== undefined ? { door: x.door } : {}),
  };
}

/** 规则面板、提示用的数 */
const rulesOf = (t: T): AcquireRulesDto => ({
  minStar: t.minStar,
  buyerMinStar: t.buyerMinStar,
  buyerMinAccountDays: t.buyerMinAccountDays,
  buyerMaxPerDay: t.buyerMaxPerDay,
  maxHoldings: t.maxHoldings,
  maxPerDay: t.maxPerDay,
  priceDays: t.priceDays,
  newStarProtectDays: t.newStarProtectDays,
  protectDays: t.protectDays,
  priceMultiple: t.priceMultiple,
  heatStep: t.heatStep,
  taxRate: t.taxRate,
  firstStoreRate: t.firstStoreRate,
  firstBurnRate: t.firstBurnRate,
  resaleStoreRate: t.resaleStoreRate,
  redeemBurnRate: t.redeemBurnRate,
  cedeRate: t.cedeRate,
  cedeTendRate: t.cedeTendRate,
  tendMultiplier: t.tendMultiplier,
  tendCostRate: t.tendCostRate,
  tendPackStep: t.tendPackStep,
  tendPackMax: t.tendPackMax,
  tendHalfDays: t.tendHalfDays,
  tendStopDays: t.tendStopDays,
  tendReleaseDays: t.tendReleaseDays,
  listMinRate: t.listMinRate,
  listMaxRate: t.listMaxRate,
  listDays: t.listDays,
});

/** 收购的“不能这样做”：带 scope，前端按收购自己的文案表显示（原因名 not_owned、npc 等和别的玩法重名） */
const bad = (reason: string, params: Record<string, unknown> = {}) =>
  invalidState(reason, { scope: 'acquire', ...params });

/** 收购（问题记录 421；改版 2026-10-16）：强收、买挂牌、赎身、放手、挂牌 / 撤牌、老板打理和读接口 */
export function createAcquireService(d: GameDeps) {
  /**
   * 一个事务里按 id 升序锁住这些店，每家一个 Op，最后一起写回（同 runPairOp，多家）。
   * 结算、别的操作每次只锁一家，或者也按 id 升序锁，不会死锁
   */
  async function runMulti<R>(
    ctx: RestCtx,
    ids: number[],
    source: string,
    fn: (ops: Map<number, Op>, t: T) => Promise<R>,
  ): Promise<OpResult<R>> {
    const settings = await d.shards.ensureFeature(ctx.shardId, 'acquire');
    return withRestaurants(d.db, ids, async (tx, rests) => {
      const now = d.now();
      const ops = new Map<number, Op>();
      for (const [id, row] of rests) {
        if (row.shard_id !== ctx.shardId) throw bad('other_shard');
        ops.set(
          id,
          createOp(d, tx, row, settings, { source, ctx: id === ctx.restaurantId ? ctx : null, now }),
        );
      }
      const data = await fn(ops, settings.tuning.acquire);
      for (const op of ops.values()) await flushOp(op);
      return { data, events: ops.get(ctx.restaurantId)?.events ?? [] };
    });
  }

  /** 关联账号（共用设备 / IP）：拦下并记录；记录写在事务外，拒绝以后也留着 */
  async function checkLinked(ctx: RestCtx, targetId: number, accountIds: number[], t: T): Promise<void> {
    const links = await linkedAccounts(
      d.db,
      { accountId: ctx.accountId, ip: ctx.ip, deviceId: ctx.deviceId },
      accountIds,
      t.linkDays,
      d.now(),
    );
    if (links.size === 0) return;
    const reason = [...links.values()].includes('device') ? 'device' : 'ip';
    // 记下按这个原因关联上的账号（可能是目标店的老板，不是目标店本身），后台才看得出（收购 PR 3 遗留）；
    // 关联上几个时固定记编号最小的那个（backlog：原来按查询返回的顺序，记哪个不固定）
    const linked = Math.min(...[...links].filter(([, why]) => why === reason).map(([id]) => id));
    await d.db
      .insertInto('acquire_block')
      .values({
        shard_id: ctx.shardId,
        buyer_rest_id: ctx.restaurantId,
        target_rest_id: targetId,
        reason,
        created_at: d.now(),
        linked_account_id: linked,
      })
      .execute();
    throw bad('linked');
  }

  /**
   * 目标店今天被强收几次（买挂牌不算）、买家今天收购买下几家、这两家 pairDays 天内交易过没有（不分方向）
   */
  async function tradeFacts(db: GameDeps['db'], buyerId: number, targetId: number, t: T, now: Date) {
    const dayStart = gameTime(gameDay(now), 0);
    const since = new Date(now.getTime() - t.pairDays * DAY_MS);
    const rows = await db
      .selectFrom('acquire_log')
      .select(['kind', 'buyer_rest_id', 'target_rest_id', 'created_at'])
      .where('kind', 'in', ['acquire', 'buy_listed'])
      .where((eb) =>
        eb.or([
          eb('target_rest_id', '=', targetId),
          eb('buyer_rest_id', '=', buyerId),
          eb.and([eb('buyer_rest_id', '=', targetId), eb('target_rest_id', '=', buyerId)]),
        ]),
      )
      .where('created_at', '>=', since < dayStart ? since : dayStart)
      .execute();
    return {
      todayCount: rows.filter(
        (r) => r.target_rest_id === targetId && r.kind === 'acquire' && r.created_at >= dayStart,
      ).length,
      buyerTodayCount: rows.filter((r) => r.buyer_rest_id === buyerId && r.created_at >= dayStart).length,
      pairRecent: rows.some(
        (r) =>
          r.created_at >= since &&
          ((r.buyer_rest_id === buyerId && r.target_rest_id === targetId) ||
            (r.buyer_rest_id === targetId && r.target_rest_id === buyerId)),
      ),
    };
  }

  /** 我今天收购、买下了几家 */
  async function boughtToday(db: GameDeps['db'], buyerId: number, now: Date): Promise<number> {
    const r = await db
      .selectFrom('acquire_log')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('buyer_rest_id', '=', buyerId)
      .where('kind', 'in', ['acquire', 'buy_listed'])
      .where('created_at', '>=', gameTime(gameDay(now), 0))
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }

  /** 名下几家 */
  async function holdingsOf(db: GameDeps['db'], restId: number): Promise<number> {
    const r = await db
      .selectFrom('acquire_state')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('owner_rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }

  /** 买家的星级和账号注册时间（买家门槛） */
  async function buyerOf(db: Kysely<DB>, restId: number): Promise<{ star: number; createdAt: Date }> {
    const r = await db
      .selectFrom('restaurant as r')
      .innerJoin('account as a', 'a.id', 'r.account_id')
      .select(['r.star_level', 'a.created_at'])
      .where('r.id', '=', restId)
      .executeTakeFirstOrThrow();
    return { star: r.star_level, createdAt: r.created_at };
  }

  /**
   * 强收（way = acquire，按身价，只能收没有老板的店）或买挂牌（way = listed，按挂牌价）。
   * 强收：店得 firstStoreRate，并购咨询费 firstBurnRate 销毁，其余是税；
   * 买挂牌：原老板得 1 − resaleStoreRate − taxRate，店得转会费 resaleStoreRate，其余是税。店归买家
   */
  async function buy(
    ctx: RestCtx,
    b: { restId: number; way: 'acquire' | 'listed'; expect: number },
  ): Promise<OpResult<AcquireResultDto>> {
    const settings = await d.shards.ensureFeature(ctx.shardId, 'acquire');
    const t0 = settings.tuning.acquire;
    const target0 = await d.db
      .selectFrom('restaurant')
      .select(['id', 'shard_id', 'account_id', 'star_level', 'npc'])
      .where('id', '=', b.restId)
      .executeTakeFirst();
    if (!target0 || target0.shard_id !== ctx.shardId) throw bad('other_shard');
    // 先报这几项（不用锁也不会变）：免得给 1 星的店、蟹老板、自己建收购状态行，或者记一条用不着的关联拦截
    if (b.restId === ctx.restaurantId) throw bad('self');
    if (target0.npc) throw bad('npc');
    if (target0.star_level < t0.minStar) throw bad('star');
    const pre = await ensureState(d.db, ctx.shardId, b.restId, t0, d.now());
    if (b.way === 'acquire' && pre.owner_rest_id !== null && pre.owner_rest_id !== ctx.restaurantId)
      throw bad('owned');
    const sellerId = pre.owner_rest_id ?? b.restId;
    const accounts = await d.db
      .selectFrom('restaurant')
      .select('account_id')
      .where('id', 'in', [b.restId, sellerId])
      .execute();
    await checkLinked(ctx, b.restId, [...new Set(accounts.map((a) => a.account_id))], t0);
    return runMulti(ctx, [ctx.restaurantId, b.restId, sellerId], 'acquire.buy', async (ops, t) => {
      const me = ops.get(ctx.restaurantId)!;
      const target = ops.get(b.restId)!;
      const now = me.now;
      const s = (await lockState(me.tx, b.restId))!;
      // 拿锁前读到的老板变了（别人刚收购、赎身、放手）：挂牌也作废了，让玩家刷新重看
      if ((s.owner_rest_id ?? b.restId) !== sellerId) throw bad('owner_changed');
      const mine = await lockState(me.tx, ctx.restaurantId);
      const acc = await me.tx
        .selectFrom('account')
        .select(['banned_at', 'banned_until'])
        .where('id', '=', target.rest.account_id)
        .executeTakeFirstOrThrow();
      const buyer = await buyerOf(me.tx, ctx.restaurantId);
      const facts = await tradeFacts(me.tx, ctx.restaurantId, b.restId, t, now);
      const listed = isListed(s, now);
      const block = buyBlock(
        {
          buyerId: ctx.restaurantId,
          buyerStar: buyer.star,
          buyerCreatedAt: buyer.createdAt,
          buyerTodayCount: facts.buyerTodayCount,
          targetId: b.restId,
          targetOwnerId: s.owner_rest_id,
          buyerOwned: (mine?.owner_rest_id ?? null) !== null,
          holdings: await holdingsOf(me.tx, ctx.restaurantId),
          targetStar: target.rest.star_level,
          targetNpc: target.rest.npc,
          targetBanned: isBanned(acc, now),
          protectedUntil: s.protected_until,
          todayCount: facts.todayCount,
          pairRecent: facts.pairRecent,
          listed,
          now,
        },
        t,
        b.way,
      );
      if (block !== null) throw bad(block);
      // 挂牌只有老板挂得了：没有老板却在挂牌（不该有）按没挂牌处理
      if (b.way === 'listed' && s.owner_rest_id === null) throw bad('not_listed');
      const price = b.way === 'listed' ? listPrice(s)! : priceOf(s);
      if (price !== b.expect) throw bad('price_changed', { price });
      const split = s.owner_rest_id === null ? splitFirst(price, t) : splitResale(price, t);
      const seller = ops.get(sellerId)!;
      spendCoin(me, price, { source: 'acquire.buy' });
      if (split.sellerGot > 0) gainCoin(seller, split.sellerGot, { source: 'acquire.sale' });
      if (split.storeGot > 0)
        gainCoin(target, split.storeGot, {
          source: s.owner_rest_id === null ? 'acquire.sale' : 'acquire.transfer',
        });
      const heat = b.way === 'listed' ? heatAfterListedSale(s.heat, t) : heatAfterAcquire(s.heat, t);
      await me.tx
        .updateTable('acquire_state')
        .set({
          owner_rest_id: ctx.restaurantId,
          heat,
          list_rate: null,
          list_until: null,
          acquired_at: now,
          tended_at: null,
        })
        .where('rest_id', '=', b.restId)
        .execute();
      await me.tx
        .insertInto('acquire_log')
        .values({
          shard_id: ctx.shardId,
          kind: b.way === 'listed' ? 'buy_listed' : 'acquire',
          buyer_rest_id: ctx.restaurantId,
          target_rest_id: b.restId,
          seller_rest_id: sellerId,
          price,
          tax: split.tax,
          store_got: split.storeGot,
          burn: split.burn,
          heat_after: heat,
          created_at: now,
        })
        .execute();
      restLog(me, 'acquire.bought', { restId: b.restId, name: target.rest.name, price, way: b.way });
      // 支线“收购”（问题记录 515）：强收、买挂牌都算
      await emitAction(me, 'acquire.buy');
      // 隐藏成就“打工人”：被收购的次数（强收、被转手都算）
      await bumpCounters(target, [['acquire.taken', 1]]);
      restLog(target, 'acquire.taken', {
        by: ctx.restaurantId,
        byName: me.rest.name,
        price,
        got: split.storeGot,
      });
      if (price >= t.newsMinPrice)
        opNews(me, 'acquire.big', { restId: b.restId, name: target.rest.name, price, way: b.way });
      if (sellerId !== b.restId)
        restLog(seller, 'acquire.sold', {
          restId: b.restId,
          name: target.rest.name,
          to: me.rest.name,
          got: split.sellerGot,
        });
      return { restId: b.restId, price, ...split };
    });
  }

  /**
   * 赎身：被收购的店按基础身价（不乘热度；老板挂牌更便宜时按挂牌价）把自己买回来：老板得 1 − redeemBurnRate − taxRate，
   * redeemBurnRate 销毁，其余是税；店变回自主，protectDays 天内不能被收购
   */
  async function redeem(ctx: RestCtx, b: { expect: number }): Promise<OpResult<AcquireResultDto>> {
    await d.shards.ensureFeature(ctx.shardId, 'acquire');
    const pre = await d.db
      .selectFrom('acquire_state')
      .select('owner_rest_id')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirst();
    const ownerId = pre?.owner_rest_id ?? null;
    if (ownerId === null) throw bad('not_owned');
    return runMulti(ctx, [ctx.restaurantId, ownerId], 'acquire.redeem', async (ops, t) => {
      const me = ops.get(ctx.restaurantId)!;
      const owner = ops.get(ownerId)!;
      const now = me.now;
      const s = (await lockState(me.tx, ctx.restaurantId))!;
      // 拿锁前读到的老板变了（刚被别人买走、被放手）
      if (s.owner_rest_id === null) throw bad('not_owned');
      if (s.owner_rest_id !== ownerId) throw bad('owner_changed');
      const price = redeemPrice(s, isListed(s, now));
      if (price !== b.expect) throw bad('price_changed', { price });
      const split = splitRedeem(price, t);
      spendCoin(me, price, { source: 'acquire.redeem' });
      gainCoin(owner, split.sellerGot, { source: 'acquire.sale' });
      await me.tx
        .updateTable('acquire_state')
        .set({
          owner_rest_id: null,
          protected_until: new Date(now.getTime() + t.protectDays * DAY_MS),
          list_rate: null,
          list_until: null,
          acquired_at: null,
          tended_at: null,
        })
        .where('rest_id', '=', ctx.restaurantId)
        .execute();
      await me.tx
        .insertInto('acquire_log')
        .values({
          shard_id: ctx.shardId,
          kind: 'redeem',
          buyer_rest_id: ctx.restaurantId,
          target_rest_id: ctx.restaurantId,
          seller_rest_id: ownerId,
          price,
          tax: split.tax,
          burn: split.burn,
          heat_after: s.heat,
          created_at: now,
        })
        .execute();
      restLog(me, 'acquire.redeemed', { price, from: owner.rest.name });
      // 隐藏成就“重获自由”
      await bumpCounters(me, [['acquire.redeem', 1]]);
      restLog(owner, 'acquire.lost', { restId: ctx.restaurantId, name: me.rest.name, got: split.sellerGot });
      // 赎身也按 newsMinPrice 门槛（收购 PR 3 裁定 2：小店赎身不刷屏）
      if (price >= t.newsMinPrice) opNews(me, 'acquire.redeem', { price, ownerName: owner.rest.name });
      return { restId: ctx.restaurantId, price, ...split };
    });
  }

  /** 老板管名下一家店（放手、挂牌、撤牌、打理）：锁住两家，确认是老板 */
  function asOwner<R>(
    ctx: RestCtx,
    restId: number,
    source: string,
    fn: (me: Op, target: Op, s: AcquireStateRow, t: T) => Promise<R>,
  ): Promise<OpResult<R>> {
    return runMulti(ctx, [ctx.restaurantId, restId], source, async (ops, t) => {
      const me = ops.get(ctx.restaurantId)!;
      const s = restId === ctx.restaurantId ? undefined : await lockState(me.tx, restId);
      if (!s || s.owner_rest_id !== ctx.restaurantId) throw bad('not_owner');
      return fn(me, ops.get(restId)!, s, t);
    });
  }

  /** 放手：免费放掉名下一家店，店变回自主；不退钱、热度不变、没有保护期 */
  function release(ctx: RestCtx, b: { restId: number }) {
    return asOwner(ctx, b.restId, 'acquire.release', async (me, target, s) => {
      await me.tx
        .updateTable('acquire_state')
        .set({ owner_rest_id: null, list_rate: null, list_until: null, acquired_at: null, tended_at: null })
        .where('rest_id', '=', b.restId)
        .execute();
      await me.tx
        .insertInto('acquire_log')
        .values({
          shard_id: ctx.shardId,
          kind: 'release',
          buyer_rest_id: null,
          target_rest_id: b.restId,
          seller_rest_id: ctx.restaurantId,
          price: 0,
          tax: 0,
          heat_after: s.heat,
          created_at: me.now,
        })
        .execute();
      restLog(me, 'acquire.released', { restId: b.restId, name: target.rest.name });
      restLog(target, 'acquire.freed', { by: ctx.restaurantId, byName: me.rest.name });
      return { restId: b.restId };
    });
  }

  /** 挂牌：身价的 listMinRate ~ listMaxRate，5% 一档，listDays 天后自动撤下 */
  function list(ctx: RestCtx, b: { restId: number; rate: number }) {
    return asOwner(ctx, b.restId, 'acquire.list', async (me, _target, _s, t) => {
      if (!validListRate(b.rate, t)) throw bad('list_rate', { min: t.listMinRate, max: t.listMaxRate });
      const until = new Date(me.now.getTime() + t.listDays * DAY_MS);
      await me.tx
        .updateTable('acquire_state')
        .set({ list_rate: b.rate, list_until: until })
        .where('rest_id', '=', b.restId)
        .execute();
      await emitAction(me, 'acquire.list');
      return { restId: b.restId, rate: b.rate, until: until.toISOString() };
    });
  }

  function unlist(ctx: RestCtx, b: { restId: number }) {
    return asOwner(ctx, b.restId, 'acquire.list', async (me) => {
      await me.tx
        .updateTable('acquire_state')
        .set({ list_rate: null, list_until: null })
        .where('rest_id', '=', b.restId)
        .execute();
      return { restId: b.restId };
    });
  }

  /**
   * 老板打理名下一家（已锁住两家、确认过是老板）：付这家日均的 tendCostRate（销毁），送店补给包，
   * 记下打理时间：这家店之后的结算 × tendMultiplier、让渡按 cedeTendRate（收购改版 2026-10-16）
   */
  async function tendOne(me: Op, target: Op, s: AcquireStateRow, t: T): Promise<AcquireTendDto> {
    const today = gameDay(me.now);
    if (cedeState(s, today, t).tendedToday) throw bad('tended');
    const cost = tendCost(s.base, t);
    const packs = tendPacks(s.base, t);
    spendCoin(me, cost, { source: 'acquire.tend' });
    if (packs > 0) await grantGoodsOp(target, t.tendPackGoods, packs, { source: 'acquire.tend' });
    await me.tx
      .updateTable('acquire_state')
      .set({ tended_at: me.now })
      .where('rest_id', '=', s.rest_id)
      .execute();
    await me.tx
      .insertInto('acquire_tend')
      .values({
        rest_id: s.rest_id,
        day: today,
        owner_rest_id: me.rest.id,
        cost,
        packs,
        created_at: me.now,
      })
      .onConflict((oc) => oc.columns(['rest_id', 'day', 'owner_rest_id']).doNothing())
      .execute();
    restLog(me, 'acquire.tended', { restId: s.rest_id, name: target.rest.name, cost, packs });
    restLog(target, 'acquire.tendedBy', { ownerName: me.rest.name, packs });
    return { restId: s.rest_id, cost, packs };
  }

  /** 名下这些店里和我是关联账号（共用设备 / IP）的：不能打理 */
  async function linkedRests(ctx: RestCtx, restIds: number[], t: T): Promise<Set<number>> {
    if (restIds.length === 0) return new Set();
    const rows = await d.db
      .selectFrom('restaurant')
      .select(['id', 'account_id'])
      .where('id', 'in', restIds)
      .execute();
    const links = await linkedAccounts(
      d.db,
      { accountId: ctx.accountId, ip: ctx.ip, deviceId: ctx.deviceId },
      rows.map((r) => r.account_id),
      t.linkDays,
      d.now(),
    );
    return new Set(rows.filter((r) => links.has(r.account_id)).map((r) => r.id));
  }

  /** 老板打理名下一家；和店是关联账号的不能打理 */
  async function tend(ctx: RestCtx, b: { restId: number }): Promise<OpResult<AcquireTendDto>> {
    const t0 = (await d.shards.ensureFeature(ctx.shardId, 'acquire')).tuning.acquire;
    if ((await linkedRests(ctx, [b.restId], t0)).size > 0) throw bad('linked');
    return asOwner(ctx, b.restId, 'acquire.tend', (me, target, s, t) => tendOne(me, target, s, t));
  }

  /** 全部打理：名下今天还没打理、不是关联账号的店一起打理，一个事务；一家都没有时报 tended */
  async function tendAll(ctx: RestCtx): Promise<OpResult<AcquireTendAllDto>> {
    const t0 = (await d.shards.ensureFeature(ctx.shardId, 'acquire')).tuning.acquire;
    const today = gameDay(d.now());
    const mine = await d.db
      .selectFrom('acquire_state')
      .select(['rest_id', 'tended_at', 'acquired_at'])
      .where('owner_rest_id', '=', ctx.restaurantId)
      .execute();
    const todo = mine.filter((s) => !cedeState(s, today, t0).tendedToday).map((s) => s.rest_id);
    const linked = await linkedRests(ctx, todo, t0);
    const ids = todo.filter((id) => !linked.has(id));
    // 没打理的只剩关联账号的店：报关联，不报“打理过了”（代码审查 2026-10-19）
    if (ids.length === 0) throw bad(todo.length > 0 ? 'linked' : 'tended');
    return runMulti(ctx, [ctx.restaurantId, ...ids], 'acquire.tend', async (ops, t) => {
      const me = ops.get(ctx.restaurantId)!;
      const items: AcquireTendDto[] = [];
      for (const id of ids) {
        const s = await lockState(me.tx, id);
        // 拿锁前读到的已经变了（刚被赎身、放手、别处打理过）：跳过
        if (!s || s.owner_rest_id !== ctx.restaurantId || cedeState(s, gameDay(me.now), t).tendedToday)
          continue;
        items.push(await tendOne(me, ops.get(id)!, s, t));
      }
      if (items.length === 0) throw bad('tended');
      return { items, cost: items.reduce((a, x) => a + x.cost, 0) };
    });
  }

  /** 一批店的摘要：店名、等级、星级、身价、老板名字、挂牌；一条查询读完 */
  async function briefs(ids: number[], now: Date, t: T): Promise<Map<number, AcquireBriefDto>> {
    if (ids.length === 0) return new Map();
    const rows = await d.db
      .selectFrom('acquire_state as s')
      .innerJoin('restaurant as r', 'r.id', 's.rest_id')
      .leftJoin('restaurant as o', 'o.id', 's.owner_rest_id')
      .select([
        's.rest_id',
        'r.name',
        'r.level',
        'r.star_level',
        's.base',
        's.heat',
        's.owner_rest_id',
        'o.name as owner_name',
        's.list_rate',
        's.list_until',
        'r.door',
      ])
      .where('s.rest_id', 'in', ids)
      .execute();
    return new Map(rows.map((x) => [x.rest_id, briefOf(x, now, t)]));
  }

  /**
   * 一家店的身价、老板、挂牌，“我”能不能强收、买挂牌，和两种买法各怎么分（对方餐厅页、我的身价用）。
   * 还没有状态行时不建行：不到 minStar 两项都是 no_state；到了的按近几天收入算出基础身价显示，带新店保护期
   */
  async function restOf(ctx: RestCtx, restId: number, t: T, now: Date): Promise<AcquireRestDto> {
    const row = await d.db
      .selectFrom('restaurant as r')
      .innerJoin('account as a', 'a.id', 'r.account_id')
      .leftJoin('acquire_state as s', 's.rest_id', 'r.id')
      .leftJoin('restaurant as o', 'o.id', 's.owner_rest_id')
      .select([
        'r.id',
        'r.shard_id',
        'r.name',
        'r.level',
        'r.star_level',
        'r.npc',
        'r.account_id',
        'o.account_id as owner_account_id',
        'a.banned_at',
        'a.banned_until',
        's.rest_id as state_id',
        's.base',
        's.heat',
        's.owner_rest_id',
        'o.name as owner_name',
        's.list_rate',
        's.list_until',
        's.protected_until',
      ])
      .where('r.id', '=', restId)
      .executeTakeFirst();
    if (!row || row.shard_id !== ctx.shardId)
      throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
    const hasState = row.state_id !== null;
    const state = {
      rest_id: row.id,
      name: row.name,
      level: row.level,
      star_level: row.star_level,
      base: hasState ? row.base! : await baseOf(d.db, restId, t, now),
      heat: hasState ? row.heat! : 1,
      owner_rest_id: row.owner_rest_id,
      owner_name: row.owner_name,
      list_rate: row.list_rate,
      list_until: row.list_until,
    };
    const brief = briefOf(state, now, t);
    const splits = {
      acquireSplit: state.owner_rest_id === null ? splitFirst(brief.price, t) : null,
      listedSplit: brief.listed ? splitResale(brief.listed.price, t) : null,
    };
    if (!hasState && row.star_level < t.minStar)
      return { ...brief, ...splits, protectedUntil: null, acquireBlock: 'no_state', listedBlock: 'no_state' };
    // 还没有行的 minStar 星店：第一次被看到、被买时才建行，那时带新店保护期，这里先按那样显示
    const protectedUntil = hasState
      ? row.protected_until
      : new Date(now.getTime() + t.newStarProtectDays * DAY_MS);
    const protectedIso = protectedUntil && protectedUntil > now ? protectedUntil.toISOString() : null;
    // 自己的店：不用再查别的
    if (restId === ctx.restaurantId)
      return { ...brief, ...splits, protectedUntil: protectedIso, acquireBlock: 'self', listedBlock: 'self' };
    const [mine, holdings, facts, buyer, links] = await Promise.all([
      d.db
        .selectFrom('acquire_state')
        .select('owner_rest_id')
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirst(),
      holdingsOf(d.db, ctx.restaurantId),
      tradeFacts(d.db, ctx.restaurantId, restId, t, now),
      buyerOf(d.db, ctx.restaurantId),
      // 关联账号（共用设备 / IP）：页面上先标出来；真正买的时候还会再查并记录
      linkedAccounts(
        d.db,
        { accountId: ctx.accountId, ip: ctx.ip, deviceId: ctx.deviceId },
        [row.account_id, ...(row.owner_account_id === null ? [] : [row.owner_account_id])],
        t.linkDays,
        now,
      ),
    ]);
    const facts0 = {
      buyerId: ctx.restaurantId,
      buyerStar: buyer.star,
      buyerCreatedAt: buyer.createdAt,
      buyerTodayCount: facts.buyerTodayCount,
      targetId: restId,
      targetOwnerId: row.owner_rest_id,
      buyerOwned: (mine?.owner_rest_id ?? null) !== null,
      holdings,
      targetStar: row.star_level,
      targetNpc: row.npc,
      targetBanned: isBanned(row, now),
      protectedUntil,
      todayCount: facts.todayCount,
      pairRecent: facts.pairRecent,
      listed: brief.listed !== null,
      now,
    };
    return {
      ...brief,
      ...splits,
      protectedUntil: protectedIso,
      acquireBlock: buyBlock(facts0, t, 'acquire') ?? (links.size > 0 ? 'linked' : null),
      listedBlock: buyBlock(facts0, t, 'listed') ?? (links.size > 0 ? 'linked' : null),
    };
  }

  async function settingsOf(ctx: RestCtx): Promise<T> {
    return (await d.shards.ensureFeature(ctx.shardId, 'acquire')).tuning.acquire;
  }

  /** 我被收购时的那一块：今天和近 30 天让了多少、现在的抽成、老板打理的情况、赎身价 */
  async function ownedOf(ctx: RestCtx, t: T, now: Date): Promise<AcquireOwnedDto | null> {
    const s = await d.db
      .selectFrom('acquire_state')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirst();
    if (!s || s.owner_rest_id === null) return null;
    const today = gameDay(now);
    const [due, tends] = await Promise.all([
      d.db
        .selectFrom('acquire_due')
        .select(['day', 'owner_rest_id', 'coin'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('day', '>=', addDays(today, 1 - CEDED_DAYS))
        .where('refunded', '=', false)
        .execute(),
      d.db
        .selectFrom('acquire_tend')
        .select(['day', 'packs'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('owner_rest_id', '=', s.owner_rest_id)
        .where('day', '>=', addDays(today, 1 - TEND_DAYS))
        .execute(),
    ]);
    const st = cedeState(s, today, t);
    const price = redeemPrice(s, isListed(s, now));
    return {
      since: s.acquired_at?.toISOString() ?? null,
      cededToday: due
        .filter((x) => x.day === today && x.owner_rest_id === s.owner_rest_id)
        .reduce((a, x) => a + Number(x.coin), 0),
      ceded30: due.reduce((a, x) => a + Number(x.coin), 0),
      cedeRate: st.rate,
      tendedToday: st.tendedToday,
      tendedAt: st.tendedToday ? s.tended_at!.toISOString() : null,
      packsToday: tends.filter((x) => x.day === today).reduce((a, x) => a + x.packs, 0),
      tendDays7: new Set(tends.map((x) => x.day)).size,
      idleDays: st.idleDays,
      redeemPrice: price,
      redeemSplit: splitRedeem(price, t),
    };
  }

  /** 我的：我的身价、被收购的情况，名下的店（按身价从高到低，带今天攒下的、昨天到账的、打理的成本），和规则数 */
  async function view(ctx: RestCtx): Promise<AcquireViewDto> {
    const t = await settingsOf(ctx);
    const now = d.now();
    const today = gameDay(now);
    const yday = addDays(today, -1);
    const hold = await d.db
      .selectFrom('acquire_state as s')
      // 今天、昨天让给我的（今天刚换老板的店，昨天的是给前一个老板的）
      .leftJoin('acquire_due as td', (j) =>
        j
          .onRef('td.rest_id', '=', 's.rest_id')
          .on('td.day', '=', today)
          .on('td.owner_rest_id', '=', ctx.restaurantId),
      )
      .leftJoin('acquire_due as yd', (j) =>
        j
          .onRef('yd.rest_id', '=', 's.rest_id')
          .on('yd.day', '=', yday)
          .on('yd.owner_rest_id', '=', ctx.restaurantId),
      )
      .select([
        's.rest_id',
        's.base',
        's.tended_at',
        's.acquired_at',
        'td.coin as today_coin',
        'yd.coin as yday_coin',
        'yd.paid_at as yday_paid',
        'yd.refunded as yday_refunded',
      ])
      // 今天的发放任务跑完没有：零点到任务跑完之间，名下店的“昨天到账”是还没发，不是没有（收购 PR 2 遗留）；
      // 并进这条查询，条数不变。有老板没发成时任务记成出错、等重试，只有 failedOwners 里的老板算还没发
      // （稳健性收尾批终审 I1：原来整个区服都写“还没发”）
      .select(
        sql<boolean>`exists(select 1 from job_run where shard_id = ${ctx.shardId} and job = 'acquire-dividend'
          and period = ${`acquire-dividend-${today}`} and (finished_at is not null
            or (stats ? 'failedOwners' and not stats->'failedOwners' @> to_jsonb(${ctx.restaurantId}::int))))`.as(
          'paid',
        ),
      )
      .where('s.owner_rest_id', '=', ctx.restaurantId)
      .execute();
    const [me, m, bought] = await Promise.all([
      restOf(ctx, ctx.restaurantId, t, now),
      briefs(
        hold.map((x) => x.rest_id),
        now,
        t,
      ),
      boughtToday(d.db, ctx.restaurantId, now),
    ]);
    // 被收购时才多查让渡、打理（没被收购的号不多花查询）
    const owned = me.owner ? await ownedOf(ctx, t, now) : null;
    // 关联账号的店不能打理：页面上不给按钮、“全部打理”不算它们；只查今天还没打理的（多 3 条查询，都打理过就不查）
    const linked = await linkedRests(
      ctx,
      hold.filter((x) => !cedeState(x, today, t).tendedToday).map((x) => x.rest_id),
      t,
    );
    const paid = hold[0]?.paid ?? true;
    const holdings: AcquireHoldingDto[] = hold
      .filter((x) => m.has(x.rest_id))
      .map((x) => {
        const st = cedeState(x, today, t);
        const yesterday =
          x.yday_paid !== null ? (x.yday_refunded ? 0 : Number(x.yday_coin)) : paid ? 0 : null;
        return {
          ...m.get(x.rest_id)!,
          tendedToday: st.tendedToday,
          idleDays: st.idleDays,
          cedeRate: st.rate,
          pending: Number(x.today_coin ?? 0),
          yesterday,
          tendCost: tendCost(x.base, t),
          tendPacks: tendPacks(x.base, t),
          linked: linked.has(x.rest_id),
        };
      });
    return {
      me,
      owned,
      // 没有名下店时用不上，按已发
      dividendPaid: paid,
      holdings: holdings.sort((x, y) => y.price - x.price || x.restId - y.restId),
      pendingTotal: holdings.reduce((a, h) => a + h.pending, 0),
      yesterdayTotal: holdings.reduce((a, h) => a + (h.yesterday ?? 0), 0),
      boughtToday: bought,
      rules: rulesOf(t),
    };
  }

  async function rest(ctx: RestCtx, restId: number): Promise<AcquireRestDto> {
    return restOf(ctx, restId, await settingsOf(ctx), d.now());
  }

  /** 身价榜（身价前 50）、投资榜（名下身价合计前 50）：只算 board 指定的那个 */
  async function rank(ctx: RestCtx, board: 'price' | 'invest'): Promise<AcquireRankDto> {
    const t = await settingsOf(ctx);
    const now = d.now();
    if (board === 'invest') {
      const rows = await d.db
        .selectFrom('acquire_state as s')
        .innerJoin('restaurant as o', 'o.id', 's.owner_rest_id')
        .leftJoin('acquire_holder as h', 'h.rest_id', 's.owner_rest_id')
        .select([
          's.owner_rest_id',
          'o.name',
          'o.door',
          'h.dividend_total',
          (eb) => eb.fn.countAll<number>().as('n'),
          // 和 priceOf 的 Math.round 一样：正好 .5 进位（Postgres 对 double 的 round 是四舍六入五成双，#189 遗留）
          sql<number>`sum(floor(s.base * s.heat + 0.5))`.as('value'),
        ])
        .where('s.shard_id', '=', ctx.shardId)
        .where('s.owner_rest_id', 'is not', null)
        .groupBy(['s.owner_rest_id', 'o.name', 'o.door', 'h.dividend_total'])
        .orderBy('value', 'desc')
        .orderBy('s.owner_rest_id')
        .limit(RANK_SIZE)
        .execute();
      const invest: AcquireInvestRowDto[] = rows.map((r) => ({
        restId: r.owner_rest_id!,
        name: r.name,
        holdings: Number(r.n),
        value: Number(r.value),
        dividendTotal: Number(r.dividend_total ?? 0),
        door: r.door,
      }));
      return { board, price: [], invest };
    }
    const top = await d.db
      .selectFrom('acquire_state as s')
      .innerJoin('restaurant as r', 'r.id', 's.rest_id')
      .select('s.rest_id')
      .where('s.shard_id', '=', ctx.shardId)
      .where('r.npc', '=', false)
      .orderBy(sql`s.base * s.heat`, 'desc')
      .orderBy('s.rest_id')
      .limit(RANK_SIZE)
      .execute();
    const m = await briefs(
      top.map((x) => x.rest_id),
      now,
      t,
    );
    return { board, price: top.map((x) => m.get(x.rest_id)!), invest: [] };
  }

  /** 在售：正在挂牌的店，挂牌价从低到高 */
  async function market(ctx: RestCtx): Promise<AcquireMarketDto> {
    const t = await settingsOf(ctx);
    const now = d.now();
    const rows = await d.db
      .selectFrom('acquire_state')
      .select('rest_id')
      .where('shard_id', '=', ctx.shardId)
      .where('list_until', '>', now)
      .orderBy(sql`base * heat * list_rate`)
      .orderBy('rest_id')
      .limit(MARKET_SIZE)
      .execute();
    const m = await briefs(
      rows.map((x) => x.rest_id),
      now,
      t,
    );
    return { items: rows.map((x) => m.get(x.rest_id)!) };
  }

  return { buy, redeem, release, list, unlist, tend, tendAll, view, rest, rank, market };
}

export type AcquireService = ReturnType<typeof createAcquireService>;
