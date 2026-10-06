import { equipOff } from '../equip/power';
import type { DuelInfoDto, RankDto, RenownShopDto, TowerDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { runPairOp } from '../../core/pair';
import { duelInfo, friendDuel } from './friendDuel';
import { challengeRank, occupyRank, rankView } from './rank';
import { buyShop, shopView } from './shop';
import { challengeTower, towerView } from './tower';

export function createTowerService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'tower', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return {
    async overview(ctx: RestCtx): Promise<TowerDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return towerView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.tower, d.now(), equipOff(s));
    },
    challenge(ctx: RestCtx, b: { floor: number; test: boolean }) {
      return op(ctx, 'tower.challenge', (o) => challengeTower(o, b.floor, b.test));
    },
    async rank(ctx: RestCtx): Promise<RankDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return rankView(d.db, await restOf(ctx.restaurantId), s.tuning.tower, d.now());
    },
    occupy(ctx: RestCtx, b: { rank: number }) {
      return op(ctx, 'tower.rank', (o) => occupyRank(o, b.rank));
    },
    challengeRank(ctx: RestCtx, b: { rank: number }) {
      return op(ctx, 'tower.rank', (o) => challengeRank(o, b.rank));
    },
    async duelInfo(ctx: RestCtx, restId: number): Promise<DuelInfoDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return duelInfo(d.db, await restOf(ctx.restaurantId), restId, s.tuning.tower, d.now());
    },
    duel(ctx: RestCtx, b: { restId: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'tower', source: 'tower.duel', friend: 'required' },
        (p) => friendDuel(p),
      );
    },
    async shop(ctx: RestCtx): Promise<RenownShopDto> {
      await d.shards.ensureFeature(ctx.shardId, 'tower');
      return shopView(d.db, d.config, await restOf(ctx.restaurantId), d.now());
    },
    buy(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'tower.shop', (o) => buyShop(o, b.goodsId, b.num));
    },
  };
}

export type TowerService = ReturnType<typeof createTowerService>;
