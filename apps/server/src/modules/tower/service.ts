import type { TowerDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { challengeTower, towerView } from './tower';

export function createTowerService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'tower', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return {
    async overview(ctx: RestCtx): Promise<TowerDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return towerView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.tower, d.now());
    },
    challenge(ctx: RestCtx, b: { floor: number; test: boolean }) {
      return op(ctx, 'tower.challenge', (o) => challengeTower(o, b.floor, b.test));
    },
  };
}

export type TowerService = ReturnType<typeof createTowerService>;
