import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { incomeValue, settleRestaurant } from './settle';
import type { SettleGlobals } from './types';

const config = testConfig();
const price = (id: number) => config.cookbookIndex.coin[id]!;
const street1 = config.cookbookIndex.idsByStreet.get(1)![0]!;
/** 规则测试按原作数值断言，经验倍率固定为 1 */
const withMultiplier = (m: number) => ({
  ...config.tuning,
  settlement: { ...config.tuning.settlement, expMultiplier: m },
});
const rules = withMultiplier(1);
const settle = (patch: InputPatch, g: Partial<SettleGlobals>, rng: number[]) =>
  settleRestaurant(buildInput(config, patch), buildGlobals(config, rules, g), sequenceRng(rng));

describe('incomeValue（规格书 01 §1.6）', () => {
  it('有加成时向下取整且至少为 1；没有加成时取整', () => {
    expect(incomeValue(2, 0.6)).toBe(3);
    expect(incomeValue(1, 0.1)).toBe(1);
    expect(incomeValue(10.7, 0)).toBe(10);
    expect(incomeValue(0, 0.5)).toBe(0);
  });
  it('负数（白食损失）不吃加成，也不会变成 1', () => {
    expect(incomeValue(-26, 0.5)).toBe(-26);
  });
});

describe('逐桌分配（规格书 01 §1.5）', () => {
  it('普通顾客：基础 油2 银币10 经验2；上座 1 桌，其余空桌', () => {
    const r = settle({}, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r).toMatchObject({ closed: false, coin: 10, exp: 3, oil: 2 });
    expect(r.customers).toEqual({ '1': 1, '0': 3 });
    expect(r.tables[0]).toMatchObject({ customer: 1, last: { type: 1, coin: 10, exp: 2, oil: 2 } });
  });

  it('经验倍率：每桌经验先乘倍率，再吃经验加成', () => {
    const r = settle({}, { tuning: withMultiplier(5) }, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ exp: 10, coin: 10 });
    expect(r.exp).toBe(16);
  });

  it('每桌银币加成只加一次（设计文档 裁定 1）', () => {
    const r = settle({ agg: { coinValue: 3 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.coin).toBe(13);
  });

  it('挑剔满足：耗油加倍再加品级，经验加品级，银币加售价 ×(1+品级加成)', () => {
    const r = settle({ cookbooks: { 194: 1 } }, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({
      type: 2,
      req: 1,
      grade: 1,
      cookbookId: 194,
      satisfied: true,
      exp: 3,
      oil: 5,
    });
    expect(r.coin).toBe(Math.floor(10 + price(194) * 1.2));
    expect(r.exp).toBe(4);
    expect(r.oil).toBe(5);
  });

  it('挑剔点了没学过的菜：经验减半，没有二哈时银币减半', () => {
    const r = settle({}, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 1, satisfied: false, coin: 5, exp: 1, oil: 2 });
    const h = settle({ agg: { husky: 1 } }, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.9, 0.9, 0.9]);
    expect(h.tables[0]!.last!.coin).toBe(10);
  });

  it('蟑螂：原有蟑螂被蟑螂药消灭变成 -3；新蟑螂在上座判定之前产生', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T00:00:00.000Z' } },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
      { no: 4, floor: 1, customer: 0 },
    ];
    const r = settle({ tables, agg: { roachClearRate: 0.2 } }, {}, [0.5, 0.65, 0.1, 0.001, 0.9, 0.9]);
    expect(r.tables.map((t) => t.customer)).toEqual([-3, 3, 0, 0]);
    expect(r.tables[1]!.roach!.by).toBeNull();
    expect(r.coin).toBe(0);
    const kept = settle({ tables, agg: { roachClearRate: 0.2 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9]);
    expect(kept.tables[0]).toMatchObject({ customer: 3, roach: { by: 7 } });
  });

  it('关闭自然蟑螂时不产生新蟑螂，原有蟑螂照常处理', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T00:00:00.000Z' } },
      { no: 2, floor: 1, customer: 0 },
    ];
    const r = settle({ tables }, { naturalRoach: false }, Array(12).fill(0.001) as number[]);
    expect(r.tables[0]).toMatchObject({ customer: 3, roach: { by: 7 } });
    expect(r.tables[1]!.customer).not.toBe(3);
    expect(r.tables[1]!.roach).toBeUndefined();
  });

  it('蟹老板满足：得到回味无穷(133)，银币 = 售价 ×(1+品级加成)×5', () => {
    const r = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 3 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ type: 8, req: 2, grade: 3, satisfied: true, oil: 7, exp: 17 });
    expect(r.coin).toBe(Math.floor(10 + price(street1) * 1.6 * 5));
    expect(r.exp).toBe(24);
    expect(r.drops).toEqual([{ goodsId: 133, num: 1 }]);
    expect(r.logs.map((l) => l.type)).toContain('krab.happy');
  });

  it('蟹老板不满足：扫兴而归(134)，银币经验减半；有二哈时 30% 摸二哈不惩罚', () => {
    const angry = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.9, 0.9, 0.9],
    );
    expect(angry.tables[0]!.last).toMatchObject({ type: 8, satisfied: false, coin: 5, exp: 1 });
    expect(angry.drops).toEqual([{ goodsId: 134, num: 1 }]);
    const husky = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 1 }, agg: { husky: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.1, 0.9, 0.9, 0.9],
    );
    expect(husky.tables[0]!.last).toMatchObject({ type: 8, satisfied: false, coin: 10, exp: 2 });
    expect(husky.drops).toEqual([]);
  });

  it('痞老板：驻留店每轮最多出现一次，×5；下一轮保持', () => {
    const r = settle({ rest: { star: 1 } }, { planktonRestId: 1 }, [0.5, 0.65, 0.00005, 0.9, 0.9, 0.9]);
    expect(r.tables[0]).toMatchObject({ customer: 7, last: { type: 7, coin: 50, exp: 10, oil: 10 } });
    expect(r.drops).toEqual([{ goodsId: 363, num: 1 }]);
    expect(r.planktonAppeared).toBe(true);
    const next = settle(
      { rest: { star: 1 }, tables: r.tables },
      { planktonRestId: 1 },
      [0.5, 0.65, 0.9, 0.9, 0.9],
    );
    expect(next.tables[0]!.last).toMatchObject({ type: 7, coin: 50 });
  });

  it('白食：损失记为负银币，白食者累计收益；白食桌不占上座名额（Review Focus 3）', () => {
    const now = new Date('2026-09-30T04:00:00Z');
    const tables = [
      {
        no: 1,
        floor: 1,
        customer: 9,
        freeloader: { restId: 99, level: 16, since: '2026-09-30T03:00:00.000Z', coin: 0, exp: 0 },
      },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
      { no: 4, floor: 1, customer: 0 },
    ];
    const r = settle({ tables, now }, {}, [0.5, 0.65, 0.5, 0.5, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.freeloader).toMatchObject({ coin: 36, exp: 18 });
    expect(r.tables[0]!.last).toMatchObject({ type: 9, coin: -36, oil: 5 });
    expect(r.tables[1]!.customer).toBe(1);
    expect(r.coin).toBe(-26);
    expect(r.oil).toBe(7);
  });

  it('章鱼哥（≥3 星）：银币经验都是 1', () => {
    const r = settle(
      { rest: { star: 3, streetId: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.001, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.customers).toEqual({ '6': 1, '1': 1, '0': 2 });
    expect(r.tables[0]!.last).toMatchObject({ type: 6, coin: 1, exp: 1, oil: 1 });
    expect(r.coin).toBe(10);
  });

  it('特色菜（输入存在时）：普通顾客吃 1 份半价', () => {
    const r = settle(
      { special: { price: 100, level: 3, leftNum: 1 } },
      {},
      [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.specialUsed).toBe(1);
    expect(r.tables[0]!.last).toMatchObject({ coin: 60, exp: 3 });
  });

  it('没油：停业，桌子原样保留，不消耗随机数', () => {
    const r = settle({ rest: { oil: 0 } }, {}, [0.5]);
    expect(r).toMatchObject({ closed: true, coin: 0, exp: 0, oil: 0, rates: null });
    expect(r.tables).toHaveLength(4);
  });

  it('耗油不超过当前油量', () => {
    const r = settle({ rest: { oil: 1 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.oil).toBe(1);
  });
});

describe('挑剔消耗食材（规格书 01 §1.8）', () => {
  const cb = street1;
  const need = config.requireCookbook(cb).needFoods[4]!;
  const cupboard = (n: number) => new Map(need.map((f) => [f.foodsId, n]));
  const seq = [0.5, 0.65, 0.9, 0.9, 0.1, 0.9, 0.7, 0.1, 0, 0.9, 0.9, 0.9, 0.9, 0.9, ...Array(40).fill(0.99)];
  const patch = (n: number): InputPatch => ({
    rest: { star: 6, streetId: 1, cookfoodsFlag: 1 },
    cookbooks: { [cb]: 5 },
    cupboard: cupboard(n),
  });

  it('要求品级 ≥5 且满足的桌：扣第 4 级所需食材，得到经验和声望', () => {
    const r = settle(patch(60), {}, seq);
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 5, grade: 5, satisfied: true });
    expect(r.foodsUsed).toEqual(need.map((f) => ({ foodsId: f.foodsId, num: f.num })));
    const foodPrice = need.reduce((s, f) => s + config.requireFood(f.foodsId).coin * f.num, 0);
    expect(r.exp).toBe(15 + Math.floor(foodPrice / 100));
    const krab = need.reduce((s, f) => {
      const food = config.requireFood(f.foodsId);
      return s + food.level * (101 - food.odds);
    }, 0);
    expect(r.renown).toBe(Math.sqrt(krab) / 100 > 0.2 ? 1 : 0);
  });

  it('挑剔消耗食材的经验也乘经验倍率', () => {
    const g = { tuning: withMultiplier(5) };
    const used = settle(patch(60), g, seq);
    const none = settle(patch(49), g, seq);
    const foodPrice = need.reduce((s, f) => s + config.requireFood(f.foodsId).coin * f.num, 0);
    expect(used.exp - none.exp).toBe(5 * Math.floor(foodPrice / 100));
  });

  it('任何一种食材少于 档位×50 就不消耗', () => {
    const r = settle(patch(49), {}, seq);
    expect(r.foodsUsed).toEqual([]);
    expect(r.exp).toBe(15);
  });
});
