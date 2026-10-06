import type { BarDto, NimTable } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { dartsAim, dartsStart, dartsThrow } from './darts';
import { devilDrink, devilStart } from './devil';
import { exchangeKrabCoin, playCup, playFg, playNum } from './games';
import { memoryAnswer, memoryNext, memoryStart, memoryStop } from './memory';
import { nimFirst, nimStart, nimTake } from './nim';
import { playSlot } from './slot';
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
    /** 杯号只在路由里校验（计划裁定 7） */
    cup(ctx: RestCtx) {
      return op(ctx, 'bar.cup', (o) => playCup(o));
    },
    num(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'bar.num', (o) => playNum(o, b.num));
    },
    exchange(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'bar.exchange', (o) => exchangeKrabCoin(o, b.num));
    },
    slot(ctx: RestCtx, b: { times: number }) {
      return op(ctx, 'bar.slot', (o) => playSlot(o, b.times));
    },
    devilStart(ctx: RestCtx, b: { stake: number }) {
      return op(ctx, 'bar.devil', (o) => devilStart(o, b.stake));
    },
    devilDrink(ctx: RestCtx, b: { cup: number }) {
      return op(ctx, 'bar.devil', (o) => devilDrink(o, b.cup));
    },
    memoryStart(ctx: RestCtx) {
      return op(ctx, 'bar.memory', (o) => memoryStart(o));
    },
    memoryAnswer(ctx: RestCtx, b: { answer: number[] }) {
      return op(ctx, 'bar.memory', (o) => memoryAnswer(o, b.answer));
    },
    memoryNext(ctx: RestCtx) {
      return op(ctx, 'bar.memory', (o) => memoryNext(o));
    },
    memoryStop(ctx: RestCtx) {
      return op(ctx, 'bar.memory', (o) => memoryStop(o));
    },
    nimStart(ctx: RestCtx, b: { table: NimTable }) {
      return op(ctx, 'bar.nim', (o) => nimStart(o, b.table));
    },
    nimFirst(ctx: RestCtx, b: { who: 'me' | 'bartender' }) {
      return op(ctx, 'bar.nim', (o) => nimFirst(o, b.who));
    },
    nimTake(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'bar.nim', (o) => nimTake(o, b.num));
    },
    dartsStart(ctx: RestCtx) {
      return op(ctx, 'bar.darts', (o) => dartsStart(o));
    },
    dartsAim(ctx: RestCtx) {
      return op(ctx, 'bar.darts', (o) => dartsAim(o));
    },
    dartsThrow(ctx: RestCtx, b: { elapsedMs: number }) {
      return op(ctx, 'bar.darts', (o) => dartsThrow(o, b.elapsedMs));
    },
  };
}

export type BarService = ReturnType<typeof createBarService>;
