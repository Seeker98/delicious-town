import type { Cookbook, Food } from './types';

/**
 * 食材出现权重（问题记录 50）：同等级里 weight = odds × (1 − α) + α × 需求份额 × 同级 odds 之和；
 * 需求份额按全部菜谱、全部品级要的数量算，同级没有需求时 weight = odds
 */
export function foodWeights(
  foods: ReadonlyArray<Pick<Food, 'id' | 'level' | 'odds'>>,
  cookbooks: ReadonlyArray<Pick<Cookbook, 'needFoods'>>,
  alpha: number,
): Map<number, number> {
  const need = new Map<number, number>();
  for (const c of cookbooks)
    for (const list of Object.values(c.needFoods))
      for (const x of list) need.set(x.foodsId, (need.get(x.foodsId) ?? 0) + x.num);
  const byLevel = new Map<number, Array<Pick<Food, 'id' | 'level' | 'odds'>>>();
  for (const f of foods) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f]);
  const out = new Map<number, number>();
  for (const list of byLevel.values()) {
    const odds = list.reduce((a, f) => a + f.odds, 0);
    const demand = list.reduce((a, f) => a + (need.get(f.id) ?? 0), 0);
    for (const f of list) {
      const share = demand > 0 ? (need.get(f.id) ?? 0) / demand : f.odds / odds;
      out.set(f.id, f.odds * (1 - alpha) + alpha * share * odds);
    }
  }
  return out;
}
