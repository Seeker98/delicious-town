import type { BasketDto, YardDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { basketView, storeBasket } from './basket';
import { dewormPlant, feedPlant, plantSeed, reapPlant, removePlant, waterPlant, weedPlant } from './crop';
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

    plant(ctx: RestCtx, b: { landNo: number; seedId: number }) {
      return op(ctx, 'yard.plant', (o) => plantSeed(o, b));
    },
    water(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.water', (o) => waterPlant(o, null, b.plantId));
    },
    weed(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.weed', (o) => weedPlant(o, null, b.plantId));
    },
    deworm(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.deworm', (o) => dewormPlant(o, null, b.plantId));
    },
    feed(ctx: RestCtx, b: { plantId: number; goodsId: number }) {
      return op(ctx, 'yard.feed', (o) => feedPlant(o, b));
    },
    remove(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.remove', (o) => removePlant(o, b.plantId));
    },
    reap(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.reap', (o) => reapPlant(o, b.plantId));
    },

    async basket(ctx: RestCtx): Promise<BasketDto> {
      await d.shards.ensureFeature(ctx.shardId, 'yard');
      return basketView(d.db, ctx.restaurantId);
    },
    storeBasket(ctx: RestCtx, b: { foodsId: number; num: number }) {
      return op(ctx, 'yard.basket', (o) => storeBasket(o, b));
    },
  };
}

export type YardService = ReturnType<typeof createYardService>;
