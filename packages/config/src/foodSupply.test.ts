import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { foodWeights } from './foodSupply';
import { defaultDataDir, readSourceDir } from './source';
import type { Cookbook, Food } from './types';

const source = () => readSourceDir(defaultDataDir());
const food = (id: number, level: number, odds: number) => ({ id, level, odds }) as Food;
const book = (needs: Array<[number, number]>) =>
  ({ needFoods: { 1: needs.map(([foodsId, num]) => ({ foodsId, num })) } }) as unknown as Cookbook;

describe('食材出现权重（问题记录 50）', () => {
  it('按公式向需求份额拉 α；同级没有需求时等于 odds；α = 0 时等于 odds', () => {
    const foods = [food(1, 1, 100), food(2, 1, 100), food(3, 2, 50)];
    const books = [book([[1, 3]]), book([[1, 1]])];
    // 1 级 odds 和 200，需求全在 1 号：w1 = 100×0.8 + 0.2×1×200 = 120；w2 = 80
    expect(Object.fromEntries(foodWeights(foods, books, 0.2))).toEqual({ 1: 120, 2: 80, 3: 50 });
    expect(Object.fromEntries(foodWeights(foods, books, 0))).toEqual({ 1: 100, 2: 100, 3: 50 });
  });

  it('需求只算到 maxGrade 品级', () => {
    const foods = [food(1, 1, 100), food(2, 1, 100)];
    const books = [
      { needFoods: { 1: [{ foodsId: 1, num: 1 }], 6: [{ foodsId: 2, num: 100 }] } } as unknown as Cookbook,
    ];
    // 只算 1 品级：需求全在 1 号；全算：2 号占 100/101
    expect(foodWeights(foods, books, 0.5, 3).get(1)).toBe(150);
    expect(foodWeights(foods, books, 0.5).get(1)).toBeCloseTo(50 + 0.5 * (1 / 101) * 200, 6);
  });

  it('真实数据（2026-10-22）：α 0.02、需求算到 3 品级；缺口大的十三香、鸡肉、海参、鲍鱼份额变大，没有哪种掉 3% 以上', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const lv = (L: number) => bundle!.foods.filter((x) => x.level === L);
    const ratio = (f: { level: number; odds: number; weight: number }) => {
      const same = lv(f.level);
      return (
        f.weight / same.reduce((a, x) => a + x.weight, 0) / (f.odds / same.reduce((a, x) => a + x.odds, 0))
      );
    };
    const byName = (n: string) => ratio(bundle!.foods.find((x) => x.name === n)!);
    expect(byName('十三香')).toBeGreaterThan(1.1);
    expect(byName('鸡肉')).toBeGreaterThan(1.2);
    expect(byName('海参')).toBeGreaterThan(1.1);
    expect(byName('鲍鱼')).toBeGreaterThan(1.2);
    for (const L of [1, 2, 3, 4, 5]) for (const f of lv(L)) expect(ratio(f)).toBeGreaterThan(0.97);
    expect(bundle!.tuning.scarcity).toEqual({ needBase: 0.05, needLuckFactor: 0.6, needMax: 0.3 });
  });

  it('真实数据把 α 调到 0.2（需求全品级）时：长胡椒、草鸡蛋的同级份额变大', () => {
    const { bundle, errors } = buildBundle({
      ...source(),
      'game/food_supply': { demandBlend: 0.2, demandMaxGrade: 10 },
    });
    expect(errors).toEqual([]);
    const share = (name: string) => {
      const f = bundle!.foods.find((x) => x.name === name)!;
      const same = bundle!.foods.filter((x) => x.level === f.level);
      return [
        f.odds / same.reduce((a, x) => a + x.odds, 0),
        f.weight / same.reduce((a, x) => a + x.weight, 0),
      ];
    };
    const [p0, p1] = share('长胡椒');
    expect(p0).toBeCloseTo(0.0252, 3);
    expect(p1).toBeCloseTo(0.072, 2);
    const [e0, e1] = share('草鸡蛋');
    expect(e0).toBeCloseTo(0.0157, 3);
    expect(e1).toBeCloseTo(0.051, 2);
  });

  it('检查：α 越界、needBase 大于 needMax 时报错', () => {
    const src = source();
    expect(
      buildBundle({ ...src, 'game/food_supply': { demandBlend: 1.5, demandMaxGrade: 3 } }).errors.join(),
    ).toContain('food_supply');
    // α 取 1 时没有需求的食材权重变 0、被剔出池子（某级稀有池可能变空），上限是 < 1（质量期 ②）
    expect(
      buildBundle({ ...src, 'game/food_supply': { demandBlend: 1, demandMaxGrade: 3 } }).errors.join(),
    ).toContain('food_supply');
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.scarcity = { needBase: 0.5, needLuckFactor: 0.6, needMax: 0.3 };
    expect(buildBundle({ ...src, 'game/tuning': t }).errors.join()).toContain('scarcity');
  });
});
