import type { YardDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { expandLand } from './land';
import { yardView } from './view';

export function createYardService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'yard', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return {
    async overview(ctx: RestCtx): Promise<YardDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      return yardView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.yard, d.now());
    },

    expand(ctx: RestCtx) {
      return op(ctx, 'yard.land', (o) => expandLand(o));
    },
  };
}

export type YardService = ReturnType<typeof createYardService>;
