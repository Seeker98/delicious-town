import { goodsEffectHours, GOODS_TYPE, type Goods } from '@dt/config';
import type { BuyBlock } from '@dt/shared';
import { isPlaque } from '../store/rules';

export interface BuyState {
  /** 当前持有（过期勋章算 0） */
  owned: number;
  /** 银币或钻石余额 */
  money: number;
  price: number;
  /** 仓库已满（买新种类会被拒） */
  storeFull: boolean;
}

/** 一次最多能买几个，和买不了的原因（与 buy 里的 assertBuyable 同一套规则） */
export function buyCap(g: Goods, s: BuyState, maxBuy: number): { max: number; blocked: BuyBlock } {
  const plaque = isPlaque(g);
  const honor = g.type === GOODS_TYPE.honor;
  const permanent = plaque || (honor && goodsEffectHours(g) === null);
  if (permanent && s.owned > 0) return { max: 0, blocked: 'owned' };
  // 不可叠放的道具一次只能买 1 个，也受持有上限限制（问题记录 136：教师证买完按钮不变灰）
  const cap = plaque || honor ? 1 : Math.min(g.stackable ? maxBuy : 1, g.maxNum - s.owned);
  if (cap <= 0) return { max: 0, blocked: 'max' };
  const newKind = !honor && (g.type === GOODS_TYPE.equip || s.owned === 0);
  if (newKind && s.storeFull) return { max: 0, blocked: 'store' };
  const afford = s.price > 0 ? Math.floor(s.money / s.price) : cap;
  if (afford <= 0) return { max: 0, blocked: 'money' };
  return { max: Math.min(cap, afford), blocked: null };
}
