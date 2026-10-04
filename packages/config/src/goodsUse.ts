import type { Goods } from './types';

/** 道具的使用效果。按名称识别只在这里做一次，运行时只看 kind（设计文档 §5.1） */
export type GoodsUse =
  | { kind: 'currency'; coin: number; diamond: number }
  | { kind: 'addTable' }
  | { kind: 'strength'; amount: number }
  | { kind: 'mysteryFood'; level: number }
  /** N 级食材随机券：按掉落权重随机得一个这一等级的食材（问题记录 331） */
  | { kind: 'randomFood'; level: number }
  | { kind: 'lockSlots'; amount: number }
  | { kind: 'resetAttr' }
  | { kind: 'bundle'; goods: number; num: number; targetGoods: number; targetNum: number }
  | { kind: 'foodsMax'; amount: number }
  | { kind: 'storeNum'; amount: number }
  | { kind: 'cupboardNum'; amount: number }
  | { kind: 'gift' }
  | { kind: 'towerTicket' };

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function n(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

export function deriveGoodsUse(g: Goods): GoodsUse | null {
  const amount = typeof g.value === 'number' ? g.value : 0;
  const o = obj(g.value);
  switch (g.name) {
    case '银币':
    case '金币':
    case '钻石':
      return { kind: 'currency', coin: n(o.coin), diamond: n(o.diamond) };
    case '餐桌A':
      return { kind: 'addTable' };
    case '小体力卡':
    case '体力卡':
      return amount > 0 ? { kind: 'strength', amount } : null;
    case '神秘食材随机劵':
      return { kind: 'mysteryFood', level: amount > 0 ? amount : 7 };
    case '保险卡':
      return amount > 0 ? { kind: 'lockSlots', amount } : null;
    case '洗点卡':
      return { kind: 'resetAttr' };
    case '鞋带':
      return {
        kind: 'bundle',
        goods: n(o.goods),
        num: n(o.num),
        targetGoods: n(o.targetGoods),
        targetNum: n(o.targetNum),
      };
    case '小食材叠加卡':
    case '食材叠加卡':
      return amount > 0 ? { kind: 'foodsMax', amount } : null;
    case '小扩建卡':
    case '中扩建卡':
    case '大扩建卡':
      return amount > 0 ? { kind: 'storeNum', amount } : null;
    case '小扩容卡':
    case '中扩容卡':
    case '大扩容卡':
      return amount > 0 ? { kind: 'cupboardNum', amount } : null;
    case '厨塔挑战券':
      return { kind: 'towerTicket' };
  }
  if (g.name.includes('礼包') && g.gift !== null) return { kind: 'gift' };
  return null;
}
