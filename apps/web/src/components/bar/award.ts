import type { BarAwardDto } from '@dt/shared';
import { activeMessages } from '../../i18n';
import type { Names } from '../../utils/events';
import { formatNum } from '../../utils/format';

/** 出拳名：0 石头、1 剪刀、2 布（按语言，问题记录 272） */
export function handName(h: number): string {
  return activeMessages().bar.hands[h] ?? '?';
}

/** 随机奖励的文字：银币 1,400、经验 100、物品名×1（幸运） */
export function awardText(a: BarAwardDto, names: Pick<Names, 'goodsName' | 'foodName'>): string {
  const w = activeMessages().bar.award;
  const what =
    a.kind === 'coin'
      ? w.coin(formatNum(a.num))
      : a.kind === 'exp'
        ? w.exp(formatNum(a.num))
        : activeMessages().common.qty(
            a.kind === 'goods' ? names.goodsName(a.id ?? 0) : names.foodName(a.id ?? 0),
            a.num,
          );
  return a.lucky ? w.lucky(what) : what;
}
