import type { Tuning } from '@dt/config';
import { addDays, gameParts, gameTime } from '@dt/shared';
import { mondayOf } from '../friend/weekly';

type H = Tuning['hiphop'];

/** 想要的食材价值：⌊单价 × 等级/(等级+1) × 数量⌋（规格书 12 §12.3） */
export function foodWorth(coin: number, level: number, num: number): number {
  return Math.floor(coin * (level / (level + 1)) * num + 1e-9);
}

export function coinWorth(num: number, t: H): number {
  return Math.floor(num / t.coinWorthDiv);
}

export function diamondWorth(num: number, t: H): number {
  return Math.floor((num * t.diamondWorthNum) / t.diamondWorthDen);
}

/** 打赏得到的经验：r ∈ [0,1) 产生 ±expJitter 的浮动 */
export function tipExp(kind: 'coin' | 'diamond', num: number, r: number, t: H): number {
  const base = kind === 'coin' ? num / t.coinExpDiv : num * t.diamondExpMul;
  return Math.floor(base * (1 + (r - 0.5) * 2 * t.expJitter));
}

/** 蟹币判定：r < 概率即中；rainbow = 天气加成那一段让它中的（没有天气加成就不会中） */
export function krabRoll(
  r: number,
  t: H,
  weatherRate: number,
  isFood: boolean,
  luckRate: number,
): { hit: boolean; rainbow: boolean } {
  const mult = isFood ? t.foodFactor : 1;
  const without = t.krabRate * mult + luckRate / 10;
  const chance = (t.krabRate + weatherRate) * mult + luckRate / 10;
  const hit = r < chance;
  return { hit, rainbow: hit && weatherRate > 0 && r >= without };
}

/** 餐厅地点店主用食材打赏的额外神秘礼券 */
export function tipTickets(num: number, level: number): number {
  return Math.floor(num / (6 - level));
}

/** 每日门槛：worthBase × (worthMin + worthRand × r) */
export function rollWorth(r: number, t: H): number {
  return Math.floor(t.worthBase * (t.worthMin + t.worthRand * r));
}

/** 周榜周期：最近一次已经过去的"周日 hour 点"所在周的周一 */
export function weekEndPeriod(now: Date, hour: number): string {
  const mon = mondayOf(gameParts(now).day);
  return now >= gameTime(addDays(mon, 6), hour) ? mon : addDays(mon, -7);
}
