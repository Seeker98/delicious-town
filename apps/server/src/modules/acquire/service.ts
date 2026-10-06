import type { AcquireResultDto } from '@dt/shared';
import { gameDay, gameTime } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { createOp, flushOp, restLog, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { withRestaurants } from '../../db/tx';
import { isBanned } from '../admin/ban';
import { linkedAccounts } from '../exchange/guard';
import { buyBlock, heatAfterAcquire, heatAfterListedSale, listPrice, priceOf, share, type T } from './rules';
import { ensureState, lockState } from './state';

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
      .select(['id', 'shard_id', 'account_id'])
      .where('id', '=', b.restId)
      .executeTakeFirst();
    if (!target0 || target0.shard_id !== ctx.shardId) throw invalidState('other_shard');
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
      // 拿锁前读到的老板变了（别人刚收购、赎身、放手）：让玩家重新确认
      if ((s.owner_rest_id ?? b.restId) !== sellerId)
        throw invalidState('price_changed', { price: priceOf(s) });
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

  return { buy };
}

export type AcquireService = ReturnType<typeof createAcquireService>;
