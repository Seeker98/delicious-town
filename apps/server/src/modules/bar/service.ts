import type { BarDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { playFg } from './games';
import { barView } from './view';

export function createBarService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'bar', source }, fn);

  return {
    async overview(ctx: RestCtx): Promise<BarDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'bar');
      const rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      return barView(d.db, d.config, rest, s.tuning.bar, d.now());
    },
    fg(ctx: RestCtx, b: { hand: number }) {
      return op(ctx, 'bar.fg', (o) => playFg(o, b.hand));
    },
  };
}

export type BarService = ReturnType<typeof createBarService>;
