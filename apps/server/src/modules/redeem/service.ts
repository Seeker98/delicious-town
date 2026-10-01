import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp } from '../../core/op';
import { guideCodes } from './newbie';
import { redeemOp } from './redeem';

/** 兑换码（子项目 6A-2） */
export function createRedeemService(d: GameDeps) {
  return {
    redeem: (ctx: RestCtx, code: string) =>
      runOp(d, ctx, { feature: 'redeem', source: 'redeem' }, (o) => redeemOp(o, d, ctx, code)),
    /** 指引页的新手码状态（问题记录 150） */
    guideCodes: (ctx: RestCtx) => guideCodes(d.db, d.config.newbieCodes, ctx.restaurantId),
  };
}
export type RedeemService = ReturnType<typeof createRedeemService>;
