import type { TakeawayClaimDto, TakeawayDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { runPairOp } from '../../core/pair';
import type { WorldService } from '../world/service';
import { settleDelivery } from './claim';
import { deliverOrder } from './deliver';
import { openTakeaway } from './open';
import { refreshPrivate } from './orders';
import { takeawayView } from './view';

export function createTakeawayService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'takeaway', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  /** 骑手是好友时用双店操作锁住两家店（按店号顺序），回扣和结算在同一个事务里（设计文档裁定 10、计划裁定 9） */
  async function claimOne(
    ctx: RestCtx,
    deliveryId: number,
    drone: boolean,
  ): Promise<OpResult<TakeawayClaimDto>> {
    const row = await d.db
      .selectFrom('takeaway_delivery as v')
      .innerJoin('takeaway_rider as r', 'r.id', 'v.rider_id')
      .select(['v.rest_id', 'r.rider_rest_id'])
      .where('v.id', '=', deliveryId)
      .executeTakeFirst();
    if (row && row.rest_id === ctx.restaurantId && row.rider_rest_id !== ctx.restaurantId)
      return runPairOp(
        d,
        ctx,
        row.rider_rest_id,
        { feature: 'takeaway', source: 'takeaway.claim', friend: 'none', lenient: true },
        (p) => settleDelivery(p.me, p.them, deliveryId, drone),
      );
    return op(ctx, 'takeaway.claim', (o) => settleDelivery(o, null, deliveryId, drone));
  }

  return {
    async overview(ctx: RestCtx): Promise<TakeawayDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'takeaway');
      return takeawayView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning, d.now());
    },
    open(ctx: RestCtx, b: { way: 'ticket' | 'coin' }) {
      return op(ctx, 'takeaway.open', (o) => openTakeaway(o, b.way));
    },
    refresh(ctx: RestCtx) {
      return op(ctx, 'takeaway.refresh', (o) => refreshPrivate(o));
    },
    deliver(ctx: RestCtx, b: { orderId: number; riderId: number; double: boolean }) {
      return op(ctx, 'takeaway.deliver', async (o) =>
        deliverOrder(o, (await world.ensure(o.shardId, o.now, o.tx)).weather.effects, b),
      );
    },
    claim(ctx: RestCtx, b: { deliveryId: number; drone: boolean }) {
      return claimOne(ctx, b.deliveryId, b.drone);
    },
    /** 依次领取所有已到达的配送（不用无人机），每一单一个操作 */
    async claimAll(ctx: RestCtx): Promise<OpResult<TakeawayClaimDto[]>> {
      await d.shards.ensureFeature(ctx.shardId, 'takeaway');
      const ids = await d.db
        .selectFrom('takeaway_delivery')
        .select('id')
        .where('rest_id', '=', ctx.restaurantId)
        .where('state', '=', 1)
        .where('arrive_at', '<=', d.now())
        .orderBy('arrive_at')
        .orderBy('id')
        .execute();
      const out: OpResult<TakeawayClaimDto[]> = { data: [], events: [] };
      for (const { id } of ids) {
        const r = await claimOne(ctx, id, false);
        out.data.push(r.data);
        out.events.push(...r.events);
      }
      return out;
    },
  };
}

export type TakeawayService = ReturnType<typeof createTakeawayService>;
