import type { TownRewardDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import { formatNum } from './format';

/** 小镇玩法获得的东西的文案 */
export function rewardText(
  r: TownRewardDto,
  x: { goodsName(id: number): string; foodName(id: number): string; seedName(id: number): string },
): string {
  switch (r.kind) {
    case 'foods':
      return `${x.foodName(r.id!)}×${r.num}`;
    case 'goods':
      return `${x.goodsName(r.id!)}×${r.num}`;
    case 'seed':
      return `${x.seedName(r.id!)}×${r.num}`;
    case 'coin':
      return activeMessages().util.reward.coin(formatNum(r.num));
    default:
      return activeMessages().util.reward.diamond(formatNum(r.num));
  }
}
