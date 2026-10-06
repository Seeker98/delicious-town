import { sql } from 'kysely';
import {
  ErrorCode,
  type AcquireBriefDto,
  type AcquireHoldingDto,
  type AcquireInvestRowDto,
  type AcquireMarketDto,
  type AcquireRankDto,
  type AcquireRestDto,
  type AcquireResultDto,
  type AcquireTendDto,
  type AcquireViewDto,
} from '@dt/shared';
import { addDays, gameDay, gameTime } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { createOp, flushOp, restLog, runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { opNeedPick } from '../../core/scarcity';
import { withRestaurants } from '../../db/tx';
import { AppError } from '../../http/errors';
import { isBanned } from '../admin/ban';
import { awardFoodsPool } from '../award/random';
import { addFoods } from '../cupboard/foods';
import { linkedAccounts } from '../exchange/guard';
import {
  buyBlock,
  heatAfterAcquire,
  heatAfterListedSale,
  listPrice,
  priceOf,
  share,
  validListRate,
  type T,
} from './rules';
import { baseOf, ensureState, lockState, type AcquireStateRow } from './state';

const RANK_SIZE = 50;
const MARKET_SIZE = 100;

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
}

function briefOf(x: BriefRow, now: Date): AcquireBriefDto {
  const listed = x.list_rate !== null && x.list_until !== null && x.list_until > now;
  return {
    restId: x.rest_id,
    name: x.name,
    level: x.level,
    star: x.star_level,
    base: x.base,
    heat: x.heat,
    price: priceOf(x),
    owner: x.owner_rest_id === null ? null : { restId: x.owner_rest_id, name: x.owner_name ?? '' },
    listed: listed ? { rate: x.list_rate!, price: listPrice(x)!, until: x.list_until!.toISOString() } : null,
  };
}

const DAY_MS = 86_400_000;

/** 收购（问题记录 421）：强收、买挂牌、赎身、放手、挂牌 / 撤牌和读接口 */
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
        if (row.shard_id !== ctx.shardId) throw invalidState('other_shard');
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
    await d.db
      .insertInto('acquire_block')
      .values({
        shard_id: ctx.shardId,
        buyer_rest_id: ctx.restaurantId,
        target_rest_id: targetId,
        reason,
        created_at: d.now(),
      })
      .execute();
    throw invalidState('linked');
  }

  /** 目标店今天被强收、买下几次；这两家 pairDays 天内交易过没有（不分方向） */
  async function tradeFacts(db: GameDeps['db'], buyerId: number, targetId: number, t: T, now: Date) {
    const dayStart = gameTime(gameDay(now), 0);
    const since = new Date(now.getTime() - t.pairDays * DAY_MS);
    const rows = await db
      .selectFrom('acquire_log')
      .select(['buyer_rest_id', 'target_rest_id', 'created_at'])
      .where('kind', 'in', ['acquire', 'buy_listed'])
      .where((eb) =>
        eb.or([
          eb('target_rest_id', '=', targetId),
          eb.and([eb('buyer_rest_id', '=', targetId), eb('target_rest_id', '=', buyerId)]),
        ]),
      )
      .where('created_at', '>=', since < dayStart ? since : dayStart)
      .execute();
    return {
      todayCount: rows.filter((r) => r.target_rest_id === targetId && r.created_at >= dayStart).length,
      pairRecent: rows.some(
        (r) =>
          r.created_at >= since &&
          ((r.buyer_rest_id === buyerId && r.target_rest_id === targetId) ||
            (r.buyer_rest_id === targetId && r.target_rest_id === buyerId)),
      ),
    };
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

  /**
   * 强收（way = acquire，按身价）或买挂牌（way = listed，按挂牌价）。
   * 买家付钱，原主人（目标店没被收购时是目标店自己）得 (1 − 税率)，其余是税；店归买家
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
    if (!target0 || target0.shard_id !== ctx.shardId) throw invalidState('other_shard');
    // 先报这几项（不用锁也不会变）：免得给 1 星的店、蟹老板、自己建收购状态行，或者记一条用不着的关联拦截
    if (b.restId === ctx.restaurantId) throw invalidState('self');
    if (target0.npc) throw invalidState('npc');
    if (target0.star_level < t0.minStar) throw invalidState('star');
    const pre = await ensureState(d.db, ctx.shardId, b.restId, t0, d.now());
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
      if ((s.owner_rest_id ?? b.restId) !== sellerId) throw invalidState('owner_changed');
      const mine = await lockState(me.tx, ctx.restaurantId);
      const acc = await me.tx
        .selectFrom('account')
        .select(['banned_at', 'banned_until'])
        .where('id', '=', target.rest.account_id)
        .executeTakeFirstOrThrow();
      const facts = await tradeFacts(me.tx, ctx.restaurantId, b.restId, t, now);
      const listed = s.list_rate !== null && s.list_until !== null && s.list_until > now;
      const block = buyBlock(
        {
          buyerId: ctx.restaurantId,
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
      if (block !== null) throw invalidState(block);
      const price = b.way === 'listed' ? listPrice(s)! : priceOf(s);
      if (price !== b.expect) throw invalidState('price_changed', { price });
      const sellerGot = share(price, 1 - t.taxRate);
      const seller = ops.get(sellerId)!;
      spendCoin(me, price, { source: 'acquire.buy' });
      gainCoin(seller, sellerGot, { source: 'acquire.sale' });
      const heat = b.way === 'listed' ? heatAfterListedSale(s.heat, t) : heatAfterAcquire(s.heat, t);
      await me.tx
        .updateTable('acquire_state')
        .set({ owner_rest_id: ctx.restaurantId, heat, list_rate: null, list_until: null, acquired_at: now })
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
          tax: price - sellerGot,
          heat_after: heat,
          created_at: now,
        })
        .execute();
      restLog(me, 'acquire.bought', { restId: b.restId, name: target.rest.name, price, way: b.way });
      restLog(target, 'acquire.taken', { by: ctx.restaurantId, byName: me.rest.name, price });
      if (sellerId !== b.restId)
        restLog(seller, 'acquire.sold', {
          restId: b.restId,
          name: target.rest.name,
          to: me.rest.name,
          got: sellerGot,
        });
      return { restId: b.restId, price, tax: price - sellerGot, sellerGot };
    });
  }

  /** 赎身：被收购的店按身价把自己买回来，老板得 (1 − 税率)；店变回自主，protectDays 天内不能被收购 */
  async function redeem(ctx: RestCtx, b: { expect: number }): Promise<OpResult<AcquireResultDto>> {
    await d.shards.ensureFeature(ctx.shardId, 'acquire');
    const pre = await d.db
      .selectFrom('acquire_state')
      .select('owner_rest_id')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirst();
    const ownerId = pre?.owner_rest_id ?? null;
    if (ownerId === null) throw invalidState('not_owned');
    return runMulti(ctx, [ctx.restaurantId, ownerId], 'acquire.redeem', async (ops, t) => {
      const me = ops.get(ctx.restaurantId)!;
      const owner = ops.get(ownerId)!;
      const now = me.now;
      const s = (await lockState(me.tx, ctx.restaurantId))!;
      // 拿锁前读到的老板变了（刚被别人收购、被放手）
      if (s.owner_rest_id === null) throw invalidState('not_owned');
      if (s.owner_rest_id !== ownerId) throw invalidState('owner_changed');
      const price = priceOf(s);
      if (price !== b.expect) throw invalidState('price_changed', { price });
      const got = share(price, 1 - t.taxRate);
      spendCoin(me, price, { source: 'acquire.redeem' });
      gainCoin(owner, got, { source: 'acquire.sale' });
      await me.tx
        .updateTable('acquire_state')
        .set({
          owner_rest_id: null,
          protected_until: new Date(now.getTime() + t.protectDays * DAY_MS),
          list_rate: null,
          list_until: null,
          acquired_at: null,
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
          tax: price - got,
          heat_after: s.heat,
          created_at: now,
        })
        .execute();
      restLog(me, 'acquire.redeemed', { price, from: owner.rest.name });
      restLog(owner, 'acquire.lost', { restId: ctx.restaurantId, name: me.rest.name, got });
      return { restId: ctx.restaurantId, price, tax: price - got, sellerGot: got };
    });
  }

  /** 老板管名下一家店（放手、挂牌、撤牌）：锁住两家，确认是老板 */
  function asOwner<R>(
    ctx: RestCtx,
    restId: number,
    source: string,
    fn: (me: Op, target: Op, s: AcquireStateRow, t: T) => Promise<R>,
  ): Promise<OpResult<R>> {
    return runMulti(ctx, [ctx.restaurantId, restId], source, async (ops, t) => {
      const me = ops.get(ctx.restaurantId)!;
      const s = restId === ctx.restaurantId ? undefined : await lockState(me.tx, restId);
      if (!s || s.owner_rest_id !== ctx.restaurantId) throw invalidState('not_owner');
      return fn(me, ops.get(restId)!, s, t);
    });
  }

  /** 放手：免费放掉名下一家店，店变回自主；不退钱、热度不变、没有保护期 */
  function release(ctx: RestCtx, b: { restId: number }) {
    return asOwner(ctx, b.restId, 'acquire.release', async (me, target, s) => {
      await me.tx
        .updateTable('acquire_state')
        .set({ owner_rest_id: null, list_rate: null, list_until: null, acquired_at: null })
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

  /** 打折挂牌：身价的 listMinRate ~ 100%，5% 一档，listDays 天后自动撤下 */
  function list(ctx: RestCtx, b: { restId: number; rate: number }) {
    return asOwner(ctx, b.restId, 'acquire.list', async (me, _target, _s, t) => {
      if (!validListRate(b.rate, t)) throw invalidState('list_rate', { min: t.listMinRate });
      const until = new Date(me.now.getTime() + t.listDays * DAY_MS);
      await me.tx
        .updateTable('acquire_state')
        .set({ list_rate: b.rate, list_until: until })
        .where('rest_id', '=', b.restId)
        .execute();
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
   * 替老板打理（收购 PR 2）：被收购的店每个游戏日一次，得 tendFoods 份食材——和随机奖励一样的食材池
   * （按店的等级，最高 5 级），带个人缺料倾向；老板第二天拿这一天的分红时 × (1 + tendBonus)
   */
  function tend(ctx: RestCtx): Promise<OpResult<AcquireTendDto>> {
    return runOp(d, ctx, { feature: 'acquire', source: 'acquire.tend' }, async (op) => {
      const s = await op.tx
        .selectFrom('acquire_state as s')
        .innerJoin('restaurant as o', 'o.id', 's.owner_rest_id')
        .select(['s.owner_rest_id', 'o.name'])
        .where('s.rest_id', '=', ctx.restaurantId)
        .executeTakeFirst();
      if (!s) throw invalidState('not_owned');
      // 锁着自己的店，主键再挡一次
      const done = await op.tx
        .insertInto('acquire_tend')
        .values({ rest_id: ctx.restaurantId, day: gameDay(op.now), created_at: op.now })
        .onConflict((oc) => oc.columns(['rest_id', 'day']).doNothing())
        .returning('day')
        .executeTakeFirst();
      if (!done) throw invalidState('tended');
      const t = op.tuning.acquire;
      const pool = awardFoodsPool(op.config.bundle.foods, op.rest.level);
      const maxLevel = Math.min(op.rest.level, 5);
      const pick = await opNeedPick(op);
      const picked = new Map<number, number>();
      for (let i = 0; i < t.tendFoods && pool.length > 0; i++) {
        const id = pick(
          (f) => (op.config.foods.get(f)?.level ?? 99) <= maxLevel,
          () => pool[op.rng.int(pool.length)]!,
        );
        picked.set(id, (picked.get(id) ?? 0) + 1);
      }
      const foods: AcquireTendDto['foods'] = [];
      for (const [id, num] of picked) {
        // 实际到账的数量：满了丢掉的不算
        const got = await addFoods(op, id, num, { source: 'acquire.tend' });
        foods.push({ id, num: got.toCupboard + got.toFridge });
      }
      const n = foods.reduce((a, f) => a + f.num, 0);
      restLog(op, 'acquire.tended', { owner: s.owner_rest_id, ownerName: s.name, n });
      return { foods };
    });
  }

  /** 一批店的摘要：店名、等级、星级、身价、老板名字、挂牌；一条查询读完 */
  async function briefs(ids: number[], now: Date): Promise<Map<number, AcquireBriefDto>> {
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
      ])
      .where('s.rest_id', 'in', ids)
      .execute();
    return new Map(rows.map((x) => [x.rest_id, briefOf(x, now)]));
  }

  /**
   * 一家店的身价、老板、挂牌，和“我”能不能强收、买挂牌（对方餐厅页、我的身价用）。
   * 还没有状态行时不建行：不到 minStar 两项都是 no_state；到了的按近几天收入算出基础身价显示
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
    const brief = briefOf(
      {
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
      },
      now,
    );
    const protectedUntil = row.protected_until;
    if (!hasState && row.star_level < t.minStar)
      return { ...brief, protectedUntil: null, acquireBlock: 'no_state', listedBlock: 'no_state' };
    const protectedIso = protectedUntil && protectedUntil > now ? protectedUntil.toISOString() : null;
    // 自己的店：不用再查别的
    if (restId === ctx.restaurantId)
      return { ...brief, protectedUntil: protectedIso, acquireBlock: 'self', listedBlock: 'self' };
    const [mine, holdings, facts, links] = await Promise.all([
      d.db
        .selectFrom('acquire_state')
        .select('owner_rest_id')
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirst(),
      holdingsOf(d.db, ctx.restaurantId),
      tradeFacts(d.db, ctx.restaurantId, restId, t, now),
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
      protectedUntil: protectedIso,
      acquireBlock: buyBlock(facts0, t, 'acquire') ?? (links.size > 0 ? 'linked' : null),
      listedBlock: buyBlock(facts0, t, 'listed') ?? (links.size > 0 ? 'linked' : null),
    };
  }

  async function settingsOf(ctx: RestCtx): Promise<T> {
    return (await d.shards.ensureFeature(ctx.shardId, 'acquire')).tuning.acquire;
  }

  /** 我的：我的身价、老板、今天打理没有，名下的店（按身价从高到低，带昨天给我的分红、今天打理没有），和几项规则数 */
  async function view(ctx: RestCtx): Promise<AcquireViewDto> {
    const t = await settingsOf(ctx);
    const now = d.now();
    const today = gameDay(now);
    const yday = addDays(today, -1);
    const hold = await d.db
      .selectFrom('acquire_state as s')
      // 昨天的分红只算发给我的（今天刚换老板的店，昨天的分红是给前一个老板的）
      .leftJoin('acquire_dividend as dv', (j) =>
        j
          .onRef('dv.rest_id', '=', 's.rest_id')
          .on('dv.day', '=', yday)
          .on('dv.owner_rest_id', '=', ctx.restaurantId),
      )
      .leftJoin('acquire_tend as td', (j) => j.onRef('td.rest_id', '=', 's.rest_id').on('td.day', '=', today))
      .select(['s.rest_id', 'dv.coin', 'dv.tended', 'td.rest_id as tended_today'])
      .where('s.owner_rest_id', '=', ctx.restaurantId)
      .execute();
    const [me, m, myTend] = await Promise.all([
      restOf(ctx, ctx.restaurantId, t, now),
      briefs(
        hold.map((x) => x.rest_id),
        now,
      ),
      d.db
        .selectFrom('acquire_tend')
        .select('day')
        .where('rest_id', '=', ctx.restaurantId)
        .where('day', '=', today)
        .executeTakeFirst(),
    ]);
    const holdings: AcquireHoldingDto[] = hold.map((x) => ({
      ...m.get(x.rest_id)!,
      dividend: x.coin === null ? null : { coin: Number(x.coin), tended: x.tended! },
      tendedToday: x.tended_today !== null,
    }));
    return {
      me,
      tendedToday: myTend !== undefined,
      holdings: holdings.sort((x, y) => y.price - x.price || x.restId - y.restId),
      maxHoldings: t.maxHoldings,
      taxRate: t.taxRate,
      listMinRate: t.listMinRate,
      listDays: t.listDays,
      protectDays: t.protectDays,
      dividendRate: t.dividendRate,
      tendBonus: t.tendBonus,
      tendFoods: t.tendFoods,
    };
  }

  async function rest(ctx: RestCtx, restId: number): Promise<AcquireRestDto> {
    return restOf(ctx, restId, await settingsOf(ctx), d.now());
  }

  /** 身价榜（身价前 50）、投资榜（名下身价合计前 50）：只算 board 指定的那个 */
  async function rank(ctx: RestCtx, board: 'price' | 'invest'): Promise<AcquireRankDto> {
    await settingsOf(ctx);
    const now = d.now();
    if (board === 'invest') {
      const rows = await d.db
        .selectFrom('acquire_state as s')
        .innerJoin('restaurant as o', 'o.id', 's.owner_rest_id')
        .leftJoin('acquire_holder as h', 'h.rest_id', 's.owner_rest_id')
        .select([
          's.owner_rest_id',
          'o.name',
          'h.dividend_total',
          (eb) => eb.fn.countAll<number>().as('n'),
          sql<number>`sum(round(s.base * s.heat))`.as('value'),
        ])
        .where('s.shard_id', '=', ctx.shardId)
        .where('s.owner_rest_id', 'is not', null)
        .groupBy(['s.owner_rest_id', 'o.name', 'h.dividend_total'])
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
    );
    return { board, price: top.map((x) => m.get(x.rest_id)!), invest: [] };
  }

  /** 在售：正在挂牌的店，挂牌价从低到高 */
  async function market(ctx: RestCtx): Promise<AcquireMarketDto> {
    await settingsOf(ctx);
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
    );
    return { items: rows.map((x) => m.get(x.rest_id)!) };
  }

  return { buy, redeem, release, list, unlist, tend, view, rest, rank, market };
}

export type AcquireService = ReturnType<typeof createAcquireService>;
