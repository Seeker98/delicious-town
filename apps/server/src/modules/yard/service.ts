import { ErrorCode, type BasketDto, type FormulasDto, type FriendYardDto, type YardDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import { isFriend, runPairOp, type PairOp } from '../../core/pair';
import { AppError } from '../../http/errors';
import { basketView, storeBasket } from './basket';
import { dewormPlant, feedPlant, plantSeed, reapPlant, removePlant, waterPlant, weedPlant } from './crop';
import { appraiseFormula, composeFormula, decomposeFormula, formulasView, learnFormula } from './formula';
import { expandLand } from './land';
import { stealPlant } from './steal';
import { friendYardView, yardView } from './view';

export function createYardService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'yard', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  const pair = <T>(ctx: RestCtx, target: number, source: string, fn: (p: PairOp) => Promise<T>) =>
    runPairOp(d, ctx, target, { feature: 'yard', source, friend: 'required' }, fn);
  /**
   * 按作物主人分流（计划裁定 10）：自己的 → runOp；好友的 → runPairOp（要求好友）。
   * 这里先不加锁地查主人，进事务后 lockPlant 会按主人再核对一次
   */
  async function care<T>(
    ctx: RestCtx,
    plantId: number,
    own: { source: string; run: (o: Op) => Promise<T> },
    friend: { source: string; run: (p: PairOp) => Promise<T> },
  ): Promise<OpResult<T>> {
    await d.shards.ensureFeature(ctx.shardId, 'yard');
    const r = await d.db
      .selectFrom('yard_plant')
      .select('rest_id')
      .where('id', '=', plantId)
      .executeTakeFirst();
    if (!r) throw invalidState('no_plant');
    return r.rest_id === ctx.restaurantId
      ? op(ctx, own.source, own.run)
      : pair(ctx, r.rest_id, friend.source, friend.run);
  }

  return {
    async overview(ctx: RestCtx): Promise<YardDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      return yardView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.yard, d.now());
    },

    async friend(ctx: RestCtx, restId: number): Promise<FriendYardDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      const them = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', restId)
        .executeTakeFirst();
      if (!them || them.shard_id !== ctx.shardId)
        throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      if (!(await isFriend(d.db, ctx.restaurantId, restId))) throw new AppError(ErrorCode.NOT_FRIEND, 400);
      return friendYardView(d.db, d.config, await restOf(ctx.restaurantId), them, s.tuning.yard, d.now());
    },

    expand(ctx: RestCtx) {
      return op(ctx, 'yard.land', (o) => expandLand(o));
    },

    plant(ctx: RestCtx, b: { landNo: number; seedId: number }) {
      return op(ctx, 'yard.plant', (o) => plantSeed(o, b));
    },
    feed(ctx: RestCtx, b: { plantId: number; goodsId: number }) {
      return op(ctx, 'yard.feed', (o) => feedPlant(o, b));
    },
    remove(ctx: RestCtx, b: { plantId: number }) {
      return op(ctx, 'yard.remove', (o) => removePlant(o, b.plantId));
    },
    water(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.water', run: (o) => waterPlant(o, null, b.plantId) },
        { source: 'yard.water', run: (p) => waterPlant(p.me, p, b.plantId) },
      );
    },
    weed(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.weed', run: (o) => weedPlant(o, null, b.plantId) },
        { source: 'yard.weed', run: (p) => weedPlant(p.me, p, b.plantId) },
      );
    },
    deworm(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.deworm', run: (o) => dewormPlant(o, null, b.plantId) },
        { source: 'yard.deworm', run: (p) => dewormPlant(p.me, p, b.plantId) },
      );
    },
    /** 自己的作物是收获，好友的作物是偷菜 */
    reap(ctx: RestCtx, b: { plantId: number }) {
      return care(
        ctx,
        b.plantId,
        { source: 'yard.reap', run: (o) => reapPlant(o, b.plantId) },
        { source: 'yard.steal', run: (p) => stealPlant(p, b.plantId) },
      );
    },

    async basket(ctx: RestCtx): Promise<BasketDto> {
      await d.shards.ensureFeature(ctx.shardId, 'yard');
      return basketView(d.db, ctx.restaurantId);
    },
    storeBasket(ctx: RestCtx, b: { foodsId: number; num: number }) {
      return op(ctx, 'yard.basket', (o) => storeBasket(o, b));
    },

    async formulas(ctx: RestCtx): Promise<FormulasDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'yard');
      return formulasView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.yard);
    },
    appraiseFormula(ctx: RestCtx, b: { toolId: number; times: number }) {
      return op(ctx, 'formula.appraise', (o) => appraiseFormula(o, b));
    },
    learnFormula(ctx: RestCtx, b: { formulaId: number }) {
      return op(ctx, 'formula.learn', (o) => learnFormula(o, b));
    },
    decomposeFormula(ctx: RestCtx, b: { formulaId: number; part: 'main' | 'sub'; num: number }) {
      return op(ctx, 'formula.decompose', (o) => decomposeFormula(o, b));
    },
    composeFormula(ctx: RestCtx, b: { formulaId: number; num: number }) {
      return op(ctx, 'formula.compose', (o) => composeFormula(o, b));
    },
  };
}

export type YardService = ReturnType<typeof createYardService>;
