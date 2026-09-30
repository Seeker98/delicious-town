import type { EquipAttrs } from './types';

/**
 * 守塔人属性（4C-2 设计文档裁定 1）：规格书 20.14 的比例
 * （厨艺 = 刀工 = 火候 = 等级×1.2 + 8×层，调味 = 创意 = 等级×0.6 + 5×层，幸运 = 等级），
 * 整体缩放到厨力 = power（原版数据的 attrSum）；返回取整后的属性和它们算出的厨力
 */
export function calibrateWatchman(
  floor: number,
  minLevel: number,
  power: number,
): { attrs: EquipAttrs; power: number } {
  const a = minLevel * 1.2 + 8 * floor;
  const b = minLevel * 0.6 + 5 * floor;
  const k = power / (3 * a + 2 * b + Math.floor(minLevel / 2));
  const x = Math.round(a * k);
  const y = Math.round(b * k);
  const luck = Math.round(minLevel * k);
  return {
    attrs: { cook: x, cutting: x, fire: x, season: y, creatives: y, luck },
    power: 3 * x + 2 * y + Math.floor(luck / 2),
  };
}
