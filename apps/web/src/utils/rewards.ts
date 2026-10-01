import type { TownRewardDto } from '@dt/shared';
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
      return `银币 ${formatNum(r.num)}`;
    default:
      return `钻石 ${r.num}`;
  }
}
