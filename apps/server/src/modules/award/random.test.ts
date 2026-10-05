import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS, GOODS_TYPE } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { createShard } from '../../../test/fixtures';
import { setTuning } from '../../../test/town';
import { runOp } from '../../core/op';
import { awardExp, awardFoodsPool, awardGoodsPool, awardKindOf, randomAward } from './random';

const config = testConfig();
const rates = { foods: 0.25, goods: 0.15, coin: 0.3, exp: 0.3 };

/** 固定随机序列的用例关掉个人缺料倾向（问题记录 50）：倾向会多消耗一次随机数 */
async function noTiltShard(t: TestGame): Promise<number> {
  const shardId = await createShard(t.db);
  await setTuning(t, shardId, { scarcity: { needBase: 0, needLuckFactor: 0, needMax: 0 } });
  return shardId;
}

describe('awardKindOf（规格书 00 §0.8）', () => {
  it('幸运 0、等级 2：起点 −0.00002，依次是食材、物品、银币、经验，超出算食材', () => {
    expect(awardKindOf(0, 0, 2, rates)).toBe('foods');
    expect(awardKindOf(0.24997, 0, 2, rates)).toBe('foods');
    expect(awardKindOf(0.24999, 0, 2, rates)).toBe('goods');
    expect(awardKindOf(0.39999, 0, 2, rates)).toBe('coin');
    expect(awardKindOf(0.69999, 0, 2, rates)).toBe('exp');
    expect(awardKindOf(0.99999, 0, 2, rates)).toBe('foods');
  });

  it('幸运率让起点更低：0.2499 在幸运率 0.3 时已经是物品', () => {
    expect(awardKindOf(0.2499, 0, 1, rates)).toBe('foods');
    expect(awardKindOf(0.2499, 0.3, 1, rates)).toBe('goods');
  });
});

describe('awardExp', () => {
  it('(50 + 幸运总值) × 等级 × (厨具档 + 1)；幸运总值很低时不为负（计划裁定 2）', () => {
    expect(awardExp(0, 2, 0)).toBe(100);
    expect(awardExp(100, 3, 1)).toBe(900);
    expect(awardExp(-80, 2, 0)).toBe(0);
  });
});

describe('物品池、食材池', () => {
  it('物品池：非厨具的奖励等级在 [等级−4, 等级]；noTicket 去掉神秘礼券；厨具只在厨具档 ≥ 奖励等级时出现', () => {
    const p2 = awardGoodsPool(config.bundle.goods, 2, 0, false);
    expect(p2).toHaveLength(8);
    expect(p2).toContain(GOODS.mysteryTicket);
    expect(awardGoodsPool(config.bundle.goods, 2, 0, true)).toEqual(
      p2.filter((id) => id !== GOODS.mysteryTicket),
    );
    for (const id of awardGoodsPool(config.bundle.goods, 10, 0, false)) {
      const g = config.requireGoods(id);
      expect(g.type).not.toBe(GOODS_TYPE.equip);
      expect(g.awardFlag!).toBeGreaterThanOrEqual(6);
      expect(g.awardFlag!).toBeLessThanOrEqual(10);
    }
    const withEquip = awardGoodsPool(config.bundle.goods, 2, 1, false);
    const equips = withEquip.filter((id) => config.requireGoods(id).type === GOODS_TYPE.equip);
    expect(equips.length).toBeGreaterThan(0);
    for (const id of equips) expect(config.requireGoods(id).awardFlag).toBe(1);
    expect(awardGoodsPool(config.bundle.goods, 100, 0, false)).toEqual([]);
  });

  it('食材池：权重 100、等级 ≤ min(等级, 5)，按 id 排序', () => {
    expect(awardFoodsPool(config.bundle.foods, 1)).toHaveLength(16);
    expect(awardFoodsPool(config.bundle.foods, 2)).toHaveLength(80); // 77 + 新街道权重 100 的 3 种（问题记录 284）
    expect(awardFoodsPool(config.bundle.foods, 9)).toHaveLength(177); // 171 + 新街道权重 100 的 6 种
    const p = awardFoodsPool(config.bundle.foods, 5);
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });

  it('下架的食材不进食材池（问题记录 367）', () => {
    const [first] = awardFoodsPool(config.bundle.foods, 1);
    const foods = config.bundle.foods.map((f) => (f.id === first ? { ...f, retired: true as const } : f));
    expect(awardFoodsPool(foods, 1)).not.toContain(first);
    expect(awardFoodsPool(foods, 1)).toHaveLength(15);
  });
});

describe('randomAward（发放）', () => {
  let t: TestGame;
  let rngValues: number[] = [0.5];
  beforeAll(async () => {
    t = await createTestGame({ rng: () => sequenceRng(rngValues) });
  });
  afterAll(() => t.close());
  const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
    runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, fn);

  it('银币 = 经验 × 2；经验', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.5];
    expect((await run(ctx, (o) => randomAward(o, { level: 2 }))).data).toEqual({
      kind: 'coin',
      id: null,
      num: 200,
      lucky: false,
    });
    rngValues = [0.8];
    expect((await run(ctx, (o) => randomAward(o, { level: 2 }))).data).toEqual({
      kind: 'exp',
      id: null,
      num: 100,
      lucky: false,
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 200, exp: 100 });
  });

  it('物品：从池里按 rng.int 取，noTicket 时池里没有礼券', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.3, 0.9, 0];
    const pool = awardGoodsPool(config.bundle.goods, 2, 0, true);
    const r = await run(ctx, (o) => randomAward(o, { level: 2, noTicket: true }));
    expect(r.data).toEqual({ kind: 'goods', id: pool[0], num: 1, lucky: false });
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBe(1);
  });

  it('食材：幸运率 0.3 时随机数 0.2 让数量翻倍、标记幸运', async () => {
    const ctx = await newRestaurant(t, { shardId: await noTiltShard(t), patch: { luck: 300 } });
    rngValues = [0.1, 0.2, 0];
    const pool = awardFoodsPool(config.bundle.foods, 2);
    const r = await run(ctx, (o) => randomAward(o, { level: 2 }));
    expect(r.data).toEqual({ kind: 'foods', id: pool[0], num: 2, lucky: true });
    expect((await foodNum(t, ctx.restaurantId, pool[0]!)).num).toBe(2);
    expect(r.events).toContainEqual(expect.objectContaining({ kind: 'foods', id: pool[0], lucky: true }));
  });

  it('onlyGoods：不抽类型，直接从奖励等级 10 的物品池取', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.9, 0.99];
    const pool = awardGoodsPool(config.bundle.goods, 10, 0, true);
    const r = await run(ctx, (o) => randomAward(o, { level: 10, onlyGoods: true, noTicket: true }));
    expect(r.data).toEqual({ kind: 'goods', id: pool[pool.length - 1], num: 1, lucky: false });
  });

  it('勋章不翻倍：幸运时也只发 1 个，返回的数量和幸运标记按实际到账（终审 Minor 1）', async () => {
    const ctx = await newRestaurant(t, { patch: { luck: 300 } });
    const pool = awardGoodsPool(config.bundle.goods, 10, 0, true);
    const idx = pool.findIndex((id) => config.requireGoods(id).type === GOODS_TYPE.honor);
    expect(idx).toBeGreaterThanOrEqual(0);
    rngValues = [0.2, (idx + 0.5) / pool.length]; // 幸运（< 0.3）；抽到这枚勋章
    const r = await run(ctx, (o) => randomAward(o, { level: 10, onlyGoods: true, noTicket: true }));
    expect(r.data).toEqual({ kind: 'goods', id: pool[idx], num: 1, lucky: false });
    expect(await goodsNum(t, ctx.restaurantId, pool[idx]!)).toBe(1);
  });

  it('物品池空时改发银币', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.5];
    const r = await run(ctx, (o) => randomAward(o, { level: 100, onlyGoods: true }));
    expect(r.data).toEqual({ kind: 'coin', id: null, num: 10_000, lucky: false });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(10_000);
  });
});
