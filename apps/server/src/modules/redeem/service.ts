import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp } from '../../core/op';
import { redeemOp } from './redeem';

/** 兑换码（子项目 6A-2） */
export function createRedeemService(d: GameDeps) {
  return {
    redeem: (ctx: RestCtx, code: string) =>
      runOp(d, ctx, { feature: 'redeem', source: 'redeem' }, (o) => redeemOp(o, d, ctx, code)),
  };
}
export type RedeemService = ReturnType<typeof createRedeemService>;
