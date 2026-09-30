import type { TakeawayDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { openTakeaway } from './open';
import { refreshPrivate } from './orders';
import { takeawayView } from './view';

export function createTakeawayService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'takeaway', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

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
  };
}

export type TakeawayService = ReturnType<typeof createTakeawayService>;
