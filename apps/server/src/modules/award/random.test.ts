import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS, GOODS_TYPE } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { createShard } from '../../../test/fixtures';
import { setTuning } from '../../../test/town';
import { runOp } from '../../core/op';
import {
  awardExp,
  awardFoodsPool,
  awardGoodsPool,
  awardKindOf,
  pickPrizeFood,
  prizeFoodPools,
  prizeFoodTier,
  randomAward,
} from './random';

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

  it('物品池各等级的大小锁住：加减了能进随机奖励的道具要有意改这张表（backlog 天机石审查）', () => {
    // 等级 → 非厨具物品池的种数（2026-10-07 用户用道具整理工具又下架一批后更新；含天机石一~五阶）
    const sizes: Record<number, number> = {
      1: 3,
      2: 8,
      3: 15,
      4: 26,
      5: 42,
      6: 57,
      7: 71,
      8: 84,
      9: 85,
      10: 77,
      11: 65,
      12: 46,
      13: 26,
      14: 14,
      15: 6,
      16: 0,
    };
    for (const [lv, n] of Object.entries(sizes))
      expect(awardGoodsPool(config.bundle.goods, Number(lv), 0, false), `等级 ${lv}`).toHaveLength(n);
    // 天机石一~五阶的奖励等级 7~11，六阶不进随机奖励
    // 问题记录 493 按阶改名：天机原石、天机灵石……天机神玉
    const WORD: Record<string, string> = {
      一: '原石',
      二: '灵石',
      三: '神石',
      四: '原玉',
      五: '灵玉',
      六: '神玉',
    };
    const gem = (n: string) => config.bundle.goods.find((g) => g.name === `[${n}阶]•天机${WORD[n]}`)!;
    expect(['一', '二', '三', '四', '五'].map((n) => gem(n).awardFlag)).toEqual([7, 8, 9, 10, 11]);
    expect(awardGoodsPool(config.bundle.goods, 11, 0, false)).toEqual(
      expect.arrayContaining(['一', '二', '三', '四', '五'].map((n) => gem(n).id)),
    );
    for (let lv = 1; lv <= 16; lv++)
      expect(awardGoodsPool(config.bundle.goods, lv, 9, false)).not.toContain(gem('六').id);
  });

  it('食材池：权重 100、等级 ≤ min(等级, 5)，按 id 排序', () => {
    expect(awardFoodsPool(config.bundle.foods, 1)).toHaveLength(16);
    expect(awardFoodsPool(config.bundle.foods, 2)).toHaveLength(80); // 77 + 新街道权重 100 的 3 种（问题记录 284）
    expect(awardFoodsPool(config.bundle.foods, 9)).toHaveLength(177); // 171 + 新街道权重 100 的 6 种
    const p = awardFoodsPool(config.bundle.foods, 5);
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });

  it('下架的食材不进食材池（问题记录 367）', () => {
    const before = awardFoodsPool(config.bundle.foods, 1);
    const [first] = before;
    const foods = config.bundle.foods.map((f) => (f.id === first ? { ...f, retired: true as const } : f));
    expect(awardFoodsPool(foods, 1)).not.toContain(first);
    expect(awardFoodsPool(foods, 1)).toHaveLength(before.length - 1);
  });
});

describe('酒吧奖励抽哪个食材（backlog 352）', () => {
  const rare = [
    { id: 1, odds: 10 },
    { id: 2, odds: 30 },
  ];
  it('先判稀有（一次随机数），稀有池按权重抽', () => {
    expect(pickPrizeFood([5, 6], rare, 0.5, [], sequenceRng([0.1, 0.2]))).toBe(1);
    expect(pickPrizeFood([5, 6], rare, 0.5, [], sequenceRng([0.1, 0.3]))).toBe(2);
  });
  it('没抽中稀有时普通池平均抽', () => {
    expect(pickPrizeFood([5, 6], rare, 0.5, [], sequenceRng([0.6, 0.7]))).toBe(6);
  });
  it('抽中的一边是空的就用另一边', () => {
    expect(pickPrizeFood([5, 6], [], 0.5, [], sequenceRng([0.1, 0.2]))).toBe(5);
    expect(pickPrizeFood([], rare, 0.5, [], sequenceRng([0.9, 0.3]))).toBe(2);
  });
  it('两边都空用退回池；退回池也空返回 null（调用方改发银币）', () => {
    expect(pickPrizeFood([], [], 0.5, [7, 8], sequenceRng([0.6]))).toBe(8);
    expect(pickPrizeFood([], [], 0.5, [], sequenceRng([0.6]))).toBeNull();
  });
});

describe('酒吧奖励的食材档次（问题记录 352）', () => {
  const tiers = [
    { minLevel: 1, levels: [1, 2] as [number, number], rare: 0.2 },
    { minLevel: 4, levels: [3, 4] as [number, number], rare: 0.4 },
    { minLevel: 6, levels: [5, 5] as [number, number], rare: 0.6 },
  ];

  it('取 minLevel 不超过奖励档次的最后一项', () => {
    expect(prizeFoodTier(tiers, 2)).toBe(tiers[0]);
    expect(prizeFoodTier(tiers, 3)).toBe(tiers[0]);
    expect(prizeFoodTier(tiers, 4)).toBe(tiers[1]);
    expect(prizeFoodTier(tiers, 8)).toBe(tiers[2]);
  });

  it('普通池是范围内权重 100 的，稀有池是范围内权重不到 100 的（带权重），都不含下架的，按 id 排序', () => {
    const [first] = awardFoodsPool(config.bundle.foods, 4).filter((id) => config.foods.get(id)!.level === 3);
    const foods = config.bundle.foods.map((f) => (f.id === first ? { ...f, retired: true as const } : f));
    const { normal, rare } = prizeFoodPools(foods, [3, 4]);
    expect(normal.length).toBeGreaterThan(0);
    expect(rare.length).toBeGreaterThan(0);
    expect(normal).not.toContain(first);
    for (const id of normal) {
      const f = config.foods.get(id)!;
      expect([3, 4]).toContain(f.level);
      expect(f.odds).toBe(100);
    }
    for (const r of rare) {
      const f = config.foods.get(r.id)!;
      expect(f.level === 3 || f.level === 4).toBe(true);
      expect(r.odds).toBe(f.odds);
      expect(f.odds).toBeLessThan(100);
      expect(f.retired).toBeUndefined();
    }
    expect(normal).toEqual([...normal].sort((a, b) => a - b));
    expect(rare.map((r) => r.id)).toEqual(rare.map((r) => r.id).sort((a, b) => a - b));
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

  it('酒吧：类型按 bar.prize.rates（食材 0.7、物品 0.15、银币、经验各 0.075）', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.9];
    expect((await run(ctx, (o) => randomAward(o, { level: 2, bar: true }))).data).toMatchObject({
      kind: 'coin',
      num: 200,
    });
    rngValues = [0.95];
    expect((await run(ctx, (o) => randomAward(o, { level: 2, bar: true }))).data).toMatchObject({
      kind: 'exp',
      num: 100,
    });
    rngValues = [0.8, 0.9, 0];
    expect(
      (await run(ctx, (o) => randomAward(o, { level: 2, bar: true, noTicket: true }))).data,
    ).toMatchObject({ kind: 'goods' });
  });

  it('酒吧的食材：按档次的等级范围，先判稀有（< rare 出稀有，按权重抽），否则从普通池平均抽', async () => {
    const ctx = await newRestaurant(t, { shardId: await noTiltShard(t) });
    const tiers = t.game.deps.config.tuning.bar.prize.foodTiers;
    const low = prizeFoodPools(config.bundle.foods, prizeFoodTier(tiers, 2).levels);
    rngValues = [0.5, 0.9, 0.5, 0]; // 食材；不翻倍；0.5 ≥ 0.2 普通；池里第一个
    expect((await run(ctx, (o) => randomAward(o, { level: 2, bar: true }))).data).toEqual({
      kind: 'foods',
      id: low.normal[0],
      num: 1,
      lucky: false,
    });
    rngValues = [0.5, 0.9, 0.1, 0]; // 0.1 < 0.2 稀有；按权重抽到第一个
    expect((await run(ctx, (o) => randomAward(o, { level: 2, bar: true }))).data).toMatchObject({
      kind: 'foods',
      id: low.rare[0]!.id,
    });
    rngValues = [0.5, 0.9, 0.9, 0.999]; // 第 6 档以上只出 5 级
    const r = await run(ctx, (o) => randomAward(o, { level: 8, bar: true }));
    expect(config.foods.get(r.data.id!)!.level).toBe(5);
    expect((await foodNum(t, ctx.restaurantId, low.normal[0]!)).num).toBe(1);
  });

  it('酒吧的个人缺料倾向只在档次的等级范围里挑（backlog 352）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { scarcity: { needBase: 1, needLuckFactor: 0, needMax: 1 } });
    const ctx = await newRestaurant(t, { shardId });
    const tiers = t.game.deps.config.tuning.bar.prize.foodTiers;
    for (const level of [2, 4, 8]) {
      const [lo, hi] = prizeFoodTier(tiers, level).levels;
      for (const r of [0, 0.5, 0.99]) {
        rngValues = [0.5, 0.9, r, r, r, r];
        const got = await run(ctx, (o) => randomAward(o, { level, bar: true }));
        expect(got.data.kind).toBe('foods');
        const lv = config.foods.get(got.data.id!)!.level;
        expect(lv).toBeGreaterThanOrEqual(lo);
        expect(lv).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('物品池空时改发银币', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.5];
    const r = await run(ctx, (o) => randomAward(o, { level: 100, onlyGoods: true }));
    expect(r.data).toEqual({ kind: 'coin', id: null, num: 10_000, lucky: false });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(10_000);
  });
});
