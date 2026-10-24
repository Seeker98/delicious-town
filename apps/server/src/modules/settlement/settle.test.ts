import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { incomeValue, settleRestaurant } from './settle';
import type { SettleGlobals } from './types';
import { GOODS } from '@dt/config';
import { cid } from '../../../test/items';

const config = testConfig();
const price = (id: number) => config.cookbookIndex.coin[id]!;
const street1 = config.cookbookIndex.idsByStreet.get(1)![0]!;
/** 规则测试按原作数值断言，经验倍率、菜价倍率固定为 1 */
const withMultiplier = (m: number) => ({
  ...config.tuning,
  // 星级底数按原来的 0.3 + 0.05s、0.1 + 0.02s（街道再平衡第三版 2026-10-17 改了默认值，下面固定随机数排的桌按它）
  rest: { ...config.tuning.rest, atRateBase: 0.3, atRatePerStar: 0.05, spRateBase: 0.1, spRatePerStar: 0.02 },
  // 菜价倍率也按原版 1（240-1 的效果由“菜价倍率”那条单独测）；低等级经验加成关掉（问题记录 378，rates.test 单独测）
  settlement: {
    ...config.tuning.settlement,
    expMultiplier: m,
    dishCoinRate: 1,
    newbieExp: { ...config.tuning.settlement.newbieExp, rate: 0 },
  },
});
const rules = withMultiplier(1);
/** 原来的特色菜卖法：普通顾客每桌都吃 1 份半价（特色菜卖法 2026-10-13 前；只有 1 桌普通顾客的用例用它） */
const everyNormal = {
  ...rules,
  settlement: { ...rules.settlement, normalSpecialShare: 1, normalSpecialPriceRate: 0.5 },
};
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

  describe('普通顾客按本街菜价付（收益模型改版 2026-10-15）', () => {
    const newbie = config.cookbookIndex.idsByStreet.get(0)!;
    const all = Object.fromEntries(newbie.map((id) => [id, 1]));
    // 浮动两个、第 1 桌蟑螂和挑剔各一个、点菜一个、后 3 张空桌蟑螂各一个
    const seq = (pick: number) => [0.5, 0.65, 0.9, 0.9, pick, 0.9, 0.9, 0.9];

    it('点到学会的本街菜：菜价 × 4% × 1.2，不超过 64、不低于 10 + 星级', () => {
      expect(rules.settlement.normalDishRate).toBe(0.04);
      expect(rules.settlement.normalCoinCap).toBe(64);
      const r = settle({ cookbooks: all }, {}, seq(0));
      const want = Math.max(10, Math.min(price(newbie[0]!) * 0.04 * 1.2, 64));
      expect(r.tables[0]!.last).toMatchObject({ type: 1, coin: Math.round(want * 100) / 100 });
    });

    it('点到没学会的本街菜付基础价 10 + 星级', () => {
      const one = { [newbie[68]!]: 1 };
      const r = settle({ rest: { star: 2 }, cookbooks: one }, {}, [0.5, 0.65, 0.9, 0.9, 0, 0.9, 0.9, 0.9]);
      expect(r.tables.find((x) => x.last?.type === 1)!.last).toMatchObject({ coin: 12 });
    });

    it('外街的菜不算：只学外街菜时付基础价', () => {
      const r = settle({ cookbooks: { [street1]: 5 } }, {}, seq(0));
      expect(r.tables[0]!.last).toMatchObject({ type: 1, coin: 10 });
    });
  });

  it('经验倍率：每桌经验先乘倍率，再吃经验加成', () => {
    const r = settle({}, { tuning: withMultiplier(5) }, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ exp: 10, coin: 10 });
    expect(r.exp).toBe(16);
  });

  it('银币倍率（148-4）：每桌银币乘倍率，挑剔满足的额外银币一起变', () => {
    const tuning = { ...rules, settlement: { ...rules.settlement, coinMultiplier: 2 } };
    const r = settle({}, { tuning }, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ coin: 20 });
    expect(r.coin).toBe(20);
  });

  it('每桌耗油减到 0 以下时仍至少 1 油（问题记录 346：节油器不能让有客人的桌不耗油）', () => {
    const r = settle({ agg: { oilValue: -4 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]!.last).toMatchObject({ type: 1, oil: 1 });
    expect(r.oil).toBe(1);
    // 空桌仍然不耗油
    expect(r.tables[1]!.last).toMatchObject({ type: 0, oil: 0 });
  });

  it('白食桌每桌耗油也至少 1 油（问题记录 346）', () => {
    const now = new Date('2026-09-30T04:00:00Z');
    const tables = [
      {
        no: 1,
        floor: 1,
        customer: 9,
        freeloader: { restId: 99, level: 16, since: '2026-09-30T03:00:00.000Z', coin: 0, exp: 0 },
      },
    ];
    const r = settle({ tables, now, agg: { oilValue: -20 } }, {}, [0.5, 0.65, 0.5, 0.5]);
    expect(r.tables[0]!.last).toMatchObject({ type: 9, oil: 1 });
  });

  it('每桌银币加成只加一次（设计文档 裁定 1）', () => {
    const r = settle({ agg: { coinValue: 3 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.coin).toBe(13);
  });

  it('挑剔满足：耗油加倍再加品级，经验加品级，银币加售价 ×(1+品级加成)', () => {
    const r = settle(
      { cookbooks: { [cid('桑椹葡萄粥')]: 1 } },
      {},
      [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({
      type: 2,
      req: 1,
      grade: 1,
      cookbookId: cid('桑椹葡萄粥'),
      satisfied: true,
      exp: 3,
      oil: 5,
    });
    expect(r.coin).toBe(Math.floor(10 + price(cid('桑椹葡萄粥')) * 1.2));
    expect(r.exp).toBe(4);
    expect(r.oil).toBe(5);
  });

  it('菜价倍率（240-1）：挑剔、蟹老板按菜价付的银币乘倍率并向下取整；普通顾客不变', () => {
    const half = { ...rules, settlement: { ...rules.settlement, dishCoinRate: 0.5 } };
    const picky = settle(
      { cookbooks: { [cid('桑椹葡萄粥')]: 1 } },
      { tuning: half },
      [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9],
    );
    expect(picky.coin).toBe(Math.floor(10 + Math.floor(price(cid('桑椹葡萄粥')) * 0.5) * 1.2));
    const krab = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 3 } },
      { krabStreet: 1, tuning: half },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.9, 0.9, 0.9],
    );
    expect(krab.coin).toBe(Math.floor(10 + Math.floor(price(street1) * 0.5) * 1.6 * 5));
    const plain = settle({}, { tuning: half }, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(plain.coin).toBe(10);
  });

  it('挑剔点到本街没学会的菜：走人，这桌银币、经验、油都是 0，桌子记 -2 和点的菜（挑剔顾客调整 2026-10-12）', () => {
    const newbie = config.cookbookIndex.idsByStreet.get(0)!;
    // 本街一道没学：命中率 0，挑没学会的第 int(0.5 × 69) 道
    const r = settle({}, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.9, 0.5, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(r.tables[0]).toMatchObject({
      customer: -2,
      last: { type: -2, req: 1, cookbookId: newbie[34], coin: 0, exp: 0, oil: 0 },
    });
    expect(r.tables[0]!.last!.satisfied).toBeUndefined();
    expect(r.customers['-2']).toBe(1);
    expect(r.coin).toBe(0);
    expect(r.oil).toBe(0);
  });

  it('本街学会不到 30 道：按 学会数 ÷ 30 的机会点到会做的', () => {
    const cookbooks = Object.fromEntries(
      config.cookbookIndex.idsByStreet
        .get(0)!
        .slice(0, 15)
        .map((id) => [id, 1]),
    );
    // 学会 15 道：0.49 < 0.5 点到会做的，0.51 走人
    const hit = settle({ cookbooks }, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.49, 0, 0.9, 0.9, 0.9]);
    expect(hit.tables[0]!.last).toMatchObject({ type: 2, satisfied: true });
    const miss = settle({ cookbooks }, {}, [0.5, 0.65, 0.9, 0.05, 0.3, 0.51, 0, 0.9, 0.9, 0.9]);
    expect(miss.tables[0]!.last!.type).toBe(-2);
    expect(cookbooks[miss.tables[0]!.last!.cookbookId!]).toBeUndefined();
  });

  it('挑剔品级不够：按自己的品级算的挑剔价付一半，不再整桌减半', () => {
    const cb = cid('桑椹葡萄粥');
    // 2 星新手街：要求 int(0.9 × 2) + 1 = 2 品，学会的是 1 品
    const r = settle(
      { rest: { star: 2 }, cookbooks: { [cb]: 1 } },
      {},
      [0.5, 0.65, 0.9, 0.05, 0.9, 0.3, 0, 0, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 2, grade: 1, satisfied: false, exp: 4, oil: 5 });
    expect(r.tables[0]!.last!.coin).toBeCloseTo(9 + price(cb) * 1.2 * 0.5, 1);
  });

  it('外街一道都没学会：银币、经验减半（不变）', () => {
    // 1 星湖南街：0.95 ≥ 0.9 点外街，外街没有学会的菜
    const r = settle(
      { rest: { star: 1, streetId: 1 } },
      {},
      [0.5, 0.65, 0.9, 0.05, 0.9, 0.5, 0.95, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ type: 2, req: 1, satisfied: false, coin: 5, exp: 1, oil: 2 });
  });

  it('蟑螂：原有蟑螂被蟑螂药消灭变成 -3；新蟑螂在上座判定之前产生', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T03:00:00.000Z' } },
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

  it('别人放的蟑螂待满 4 小时就跑掉，桌子照常接客；自然长的、不满 4 小时的留着（问题记录 457）', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T00:00:00.000Z' } },
      { no: 2, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T00:00:01.000Z' } },
      { no: 3, floor: 1, customer: 3, roach: { by: null, at: '2026-09-29T00:00:00.000Z' } },
      { no: 4, floor: 1, customer: 0 },
    ];
    const r = settle({ tables }, { naturalRoach: false }, Array(20).fill(0.9) as number[]);
    expect(r.tables[0]!.customer).not.toBe(3);
    expect(r.tables[0]!.roach).toBeUndefined();
    expect(r.tables[1]).toMatchObject({ customer: 3, roach: { by: 7 } });
    expect(r.tables[2]).toMatchObject({ customer: 3, roach: { by: null } });
    // 章鱼哥的卫生巡查只数自己长的（n3），好友放的不算
    expect(r.customers.n3).toBe(1);
  });

  it('关闭自然蟑螂时不产生新蟑螂，原有蟑螂照常处理', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T03:00:00.000Z' } },
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
    expect(r.drops).toEqual([{ goodsId: GOODS.krabHappy, num: 1 }]);
    expect(r.logs.map((l) => l.type)).toContain('krab.happy');
  });

  it('蟹老板不满足：扫兴而归(134)，银币经验减半；二哈作废，不再摸二哈免罚', () => {
    const angry = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.9, 0.9, 0.9],
    );
    expect(angry.tables[0]!.last).toMatchObject({ type: 8, satisfied: false, coin: 5, exp: 1 });
    expect(angry.drops).toEqual([{ goodsId: GOODS.krabAngry, num: 1 }]);
    const husky = settle(
      { rest: { star: 1, streetId: 1 }, cookbooks: { [street1]: 1 }, agg: { husky: 1 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.1, 0.0001, 0.2, 0, 0.1, 0.9, 0.9, 0.9],
    );
    expect(husky.tables[0]!.last).toMatchObject({ type: 8, satisfied: false, coin: 5, exp: 1 });
    expect(husky.logs.map((l) => l.type)).not.toContain('krab.husky');
  });

  it('痞老板：驻留店每轮最多出现一次，×5；下一轮保持', () => {
    const r = settle({ rest: { star: 1 } }, { planktonRestId: 1 }, [0.5, 0.65, 0.00005, 0.9, 0.9, 0.9]);
    expect(r.tables[0]).toMatchObject({ customer: 7, last: { type: 7, coin: 50, exp: 10, oil: 10 } });
    expect(r.drops).toEqual([{ goodsId: GOODS.plankton, num: 1 }]);
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
    // 章鱼哥 1 + 普通顾客基础价 10 + 3 星（收益模型改版 2026-10-15）
    expect(r.coin).toBe(14);
  });

  it('特色菜（输入存在时）：普通顾客吃 1 份半价；卖出时乘这一级的倍率（3 级 ×2.5，问题记录 412）', () => {
    const r = settle(
      { special: { price: 100, level: 3, leftNum: 1 } },
      { tuning: everyNormal },
      [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.specialUsed).toBe(1);
    // 普通顾客吃的不攒时令值（时令值改法 2026-10-13）
    expect(r.specialPicky).toBe(0);
    // 每桌银币 10 + 100 × 2.5 × 半价
    expect(r.tables[0]!.last).toMatchObject({ coin: 135, exp: 3 });
  });

  it('挑剔满足时多吃 2 份特色菜，按原价 × 卖出倍率、不打折（backlog 411~413）', () => {
    const rng = [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9];
    const patch = { cookbooks: { [cid('桑椹葡萄粥')]: 1 } };
    const base = settle(patch, {}, rng);
    const r = settle({ ...patch, special: { price: 100, level: 3, leftNum: 5 } }, {}, rng);
    expect(r.specialUsed).toBe(2);
    expect(r.specialPicky).toBe(2);
    expect(r.tables[0]!.last).toMatchObject({ type: 2, satisfied: true });
    // 100 × 2.5 × 2 份
    expect(r.coin - base.coin).toBe(500);
  });

  it('满足的挑剔顾客银币加成（街道勋章）只乘菜钱，不乘特色菜（用户 2026-10-24）', () => {
    const rng = [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9];
    const patch = { cookbooks: { [cid('桑椹葡萄粥')]: 1 } };
    const plain = settle(patch, {}, rng);
    const bonus = settle({ ...patch, agg: { spCoinRate: 0.3 } }, {}, rng);
    const dish = bonus.coin - plain.coin;
    expect(dish).toBeGreaterThan(0);
    const withMc = settle(
      { ...patch, agg: { spCoinRate: 0.3 }, special: { price: 100, level: 3, leftNum: 5 } },
      {},
      rng,
    );
    // 特色菜 100 × 2.5 × 2 份照原价，不再多 30%
    expect(withMc.coin - bonus.coin).toBe(500);
  });

  it('章鱼哥带魔笛：吃掉的特色菜按原价算经验，不乘卖出倍率（backlog 411~413）', () => {
    const r = settle(
      {
        rest: { star: 3, streetId: 1 },
        agg: { magicFlute: 1 },
        special: { price: 100, level: 3, leftNum: 10 },
      },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.001, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ type: 6 });
    const portions = rules.settlement.squidwardPortions;
    expect(r.tables[0]!.last!.exp).toBe(100 * portions);
  });

  it('每桌记下吃了几份哪道特色菜，餐桌页显示用（问题记录 559）；没吃的桌不记', () => {
    const normal = settle(
      { special: { price: 100, level: 3, leftNum: 1, mcId: 42 } },
      { tuning: everyNormal },
      [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(normal.tables[0]!.last).toMatchObject({ type: 1, mcId: 42, mcNum: 1 });
    expect(normal.tables[1]!.last).not.toHaveProperty('mcNum');
    const rng = [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9];
    const picky = settle(
      { cookbooks: { [cid('桑椹葡萄粥')]: 1 }, special: { price: 100, level: 3, leftNum: 5, mcId: 42 } },
      {},
      rng,
    );
    expect(picky.tables[0]!.last).toMatchObject({
      type: 2,
      cookbookId: cid('桑椹葡萄粥'),
      satisfied: true,
      mcId: 42,
      mcNum: 2,
    });
    const none = settle({}, {}, [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(none.tables[0]!.last).not.toHaveProperty('mcNum');
    expect(none.tables[0]!.last).not.toHaveProperty('mcId');
  });

  it('章鱼哥吃掉的特色菜也记下（问题记录 559）', () => {
    const r = settle(
      { rest: { star: 3, streetId: 1 }, special: { price: 100, level: 3, leftNum: 10, mcId: 7 } },
      { krabStreet: 1 },
      [0.5, 0.65, 0.9, 0.001, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ type: 6, mcId: 7, mcNum: rules.settlement.squidwardPortions });
    // 章鱼哥吃的和挑剔顾客一样攒时令值（时令值改法 2026-10-13）
    expect(r.specialPicky).toBe(rules.settlement.squidwardPortions);
  });

  it('特色菜卖出倍率按特色菜等级：1 级 ×1.3', () => {
    const r = settle(
      { special: { price: 100, level: 1, leftNum: 1 } },
      { tuning: everyNormal },
      [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9],
    );
    expect(r.tables[0]!.last).toMatchObject({ coin: 75 });
  });

  describe('普通顾客按比例吃特色菜（特色菜卖法 2026-10-13）', () => {
    /** 4 桌全上座、都是普通顾客：每桌取两次随机数（蟑螂、挑剔）都是 0.9 */
    const fourNormal = [0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const full = { agg: { atRate: 1 } };

    it('默认 0.5 / 0.5：4 桌里随机挑 2 桌各吃 1 份，每份半价，经验 1', () => {
      expect(rules.settlement.normalSpecialShare).toBe(0.5);
      expect(rules.settlement.normalSpecialPriceRate).toBe(0.5);
      // 挑桌：int(4) 取 0.9 → 第 4 桌换到最前；int(3) 取 0 → 第 2 桌不动；挑中第 2、4 桌
      const rng = [...fourNormal, 0.9, 0];
      const base = settle(full, {}, rng);
      const r = settle({ ...full, special: { price: 100, level: 3, leftNum: 10, mcId: 5 } }, {}, rng);
      expect(r.customers).toEqual({ '1': 4 });
      expect(r.specialUsed).toBe(2);
      expect(r.specialPicky).toBe(0);
      expect(r.tables.map((x) => x.last!.mcNum ?? 0)).toEqual([0, 1, 0, 1]);
      expect(r.tables[1]!.last).toMatchObject({ mcId: 5, coin: 135, exp: 3 });
      expect(r.tables[0]!.last).toMatchObject({ coin: 10, exp: 2 });
      // 100 × 2.5 × 0.5 × 2 份
      expect(r.coin - base.coin).toBe(250);
      // 每桌 +1 经验，合计再吃经验率（这里 +50%）
      expect(r.exp - base.exp).toBe(3);
    });

    it('价钱比例不取整：1 级每份 15、比例 1/3 时每份 15 × 1.3 / 3 = 6.5，两份合计后取整', () => {
      const tuning = { ...rules, settlement: { ...rules.settlement, normalSpecialPriceRate: 1 / 3 } };
      const rng = [...fourNormal, 0.9, 0];
      const base = settle(full, { tuning }, rng);
      const r = settle({ ...full, special: { price: 15, level: 1, leftNum: 10 } }, { tuning }, rng);
      expect(r.tables[1]!.last!.coin).toBe(16.5);
      expect(r.coin - base.coin).toBe(13);
    });

    it('比例 1 / 0.5 等于原来的卖法：每桌都吃 1 份半价，按桌号吃，不多取随机数', () => {
      const r = settle(
        { ...full, special: { price: 100, level: 3, leftNum: 3 } },
        { tuning: everyNormal },
        fourNormal,
      );
      expect(r.specialUsed).toBe(3);
      expect(r.tables.map((x) => x.last!.mcNum ?? 0)).toEqual([1, 1, 1, 0]);
      expect(r.tables[0]!.last).toMatchObject({ coin: 135 });
    });

    it('只有 1 桌普通顾客时 ⌊1 × 0.5⌋ = 0，不吃', () => {
      const r = settle({ special: { price: 100, level: 3, leftNum: 1 } }, {}, [0.5, 0.65, 0.9, 0.9, 0.9]);
      expect(r.specialUsed).toBe(0);
      expect(r.tables[0]!.last).not.toHaveProperty('mcNum');
    });

    it('一批剩得不够时先卖给满足的挑剔顾客：第 1 桌挑剔吃 2 份，后面的普通顾客没得吃', () => {
      const rng = [0.5, 0.65, 0.9, 0.05, 0.3, 0, 0.9, 0.9, 0.9];
      const r = settle(
        { ...full, cookbooks: { [cid('桑椹葡萄粥')]: 1 }, special: { price: 100, level: 3, leftNum: 2 } },
        { tuning: everyNormal },
        rng,
      );
      expect(r.tables[0]!.last).toMatchObject({ type: 2, satisfied: true, mcNum: 2 });
      expect(r.tables.slice(1).some((x) => x.last!.type === 1)).toBe(true);
      expect(r.tables.slice(1).every((x) => !x.last!.mcNum)).toBe(true);
      expect(r.specialUsed).toBe(2);
      expect(r.specialPicky).toBe(2);
    });
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

describe('问题记录 228：一家店的蟑螂上限', () => {
  const empty = (n: number) => Array.from({ length: n }, (_, i) => ({ no: i + 1, floor: 1, customer: 0 }));
  const roaches = (r: { tables: Array<{ customer: number }> }) =>
    r.tables.filter((x) => x.customer === 3).length;
  it('同时最多 ⌈桌数 × 0.33⌉ 张蟑螂桌：6 桌每张都判定会长时也只长 2 只', () => {
    const r = settle({ tables: empty(6) }, {}, Array(80).fill(0.0001) as number[]);
    expect(roaches(r)).toBe(2);
    expect(r.customers.n3).toBe(2);
  });
  it('原有的蟑螂算在上限里；被蟑螂药消灭的腾出名额', () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: 7, at: '2026-09-30T03:00:00.000Z' } },
      ...empty(6).slice(1),
    ];
    const kept = settle({ tables }, {}, Array(80).fill(0.0001) as number[]);
    expect(roaches(kept)).toBe(2);
    expect(kept.customers.n3).toBe(1);
    const cleared = settle({ tables, agg: { roachClearRate: 0.5 } }, {}, Array(80).fill(0.0001) as number[]);
    expect(cleared.tables[0]!.customer).toBe(-3);
    expect(roaches(cleared)).toBe(2);
  });
});
