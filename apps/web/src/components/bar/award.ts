import type { BarAwardDto } from '@dt/shared';
import type { Names } from '../../utils/events';
import { formatNum } from '../../utils/format';

/** 0 石头、1 剪刀、2 布 */
export const HANDS = ['石头', '剪刀', '布'] as const;

export function handName(h: number): string {
  return HANDS[h] ?? '?';
}

export const NUM_HINTS = { close: '就差一丝丝了', soft: '下次再轻一点', hard: '力气用得太大了' } as const;

/** 随机奖励的文字：银币 1,400、经验 100、物品名×1（幸运） */
export function awardText(a: BarAwardDto, names: Pick<Names, 'goodsName' | 'foodName'>): string {
  const what =
    a.kind === 'coin'
      ? `银币 ${formatNum(a.num)}`
      : a.kind === 'exp'
        ? `经验 ${formatNum(a.num)}`
        : `${a.kind === 'goods' ? names.goodsName(a.id ?? 0) : names.foodName(a.id ?? 0)}×${a.num}`;
  return a.lucky ? `${what}（幸运）` : what;
}
