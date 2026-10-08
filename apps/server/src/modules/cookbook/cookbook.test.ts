import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { cid, fid } from '../../../test/items';
import { gradeOf } from './rules';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const cb = () => t.game.cookbook;
/** 新手街的桑椹葡萄粥、湖南街的白斩鸡 */
const ZHOU = cid('桑椹葡萄粥');
const JI = cid('白斩鸡');
const levelOf = async (restId: number, id: number) =>
  (
    await t.db
      .selectFrom('restaurant_cookbooks')
      .select('levels')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow()
  ).levels.at(t.deps.config.cookbookIndex.slotOf[id]!) ?? 0;

describe('学习食谱', () => {
  it('食材够：学会 1 品级，扣食材，更新派生计数', async () => {
    const ctx = await newRestaurant(t, { foods: { [fid('葡萄')]: 1, [fid('薏仁')]: 1, [fid('桑椹')]: 2 } });
    const r = await cb().learn(ctx, ZHOU);
    expect(r.data).toEqual({ cookbookId: cid('桑椹葡萄粥'), grade: 1, learnType: '0' });
    expect(await levelOf(ctx.restaurantId, ZHOU)).toBe(1);
    expect((await foodNum(t, ctx.restaurantId, fid('桑椹'))).num).toBe(1);
    expect((await foodNum(t, ctx.restaurantId, fid('葡萄'))).num).toBe(0);
    const counts = (await restRow(t, ctx.restaurantId)).cookbook_counts;
    expect(counts).toMatchObject({ learned: 1, street: { '0': 1 } });
    expect(counts.grade[1]).toBe(1);
  });

  it('缺一种时用同级万能食材（桑椹 3 级 → 469）', async () => {
    const ctx = await newRestaurant(t, {
      foods: { [fid('葡萄')]: 1, [fid('薏仁')]: 1, [fid('三级万能食材')]: 1 },
    });
    const r = await cb().learn(ctx, ZHOU);
    expect(r.data.learnType).toBe('3');
    expect((await foodNum(t, ctx.restaurantId, fid('三级万能食材'))).num).toBe(0);
  });

  it('不够时报 NOT_ENOUGH（带第一种缺的食材）', async () => {
    const ctx = await newRestaurant(t, { foods: { [fid('葡萄')]: 1 } });
    await expect(cb().learn(ctx, ZHOU)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods' },
    });
  });

  it('新菜上线前开的店（已学记录比现在的存储位总数短）也能学新菜（问题记录 284）', async () => {
    // 店在日本街（14）：只能学本街的菜（问题记录 312）
    const ctx = await newRestaurant(t, {
      patch: { street_id: 14 },
      foods: { [fid('鲷鱼')]: 1, [fid('大米')]: 1, [fid('醋')]: 1 },
    });
    await t.db
      .updateTable('restaurant_cookbooks')
      // 字节串正好缺这道菜的存储位
      .set({ levels: Buffer.alloc(t.deps.config.cookbookIndex.slotOf[cid('鲷鱼握寿司')]!) })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    await cb().learn(ctx, cid('鲷鱼握寿司'));
    const levels = (
      await t.db
        .selectFrom('restaurant_cookbooks')
        .select('levels')
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow()
    ).levels;
    expect(levels.length).toBe(t.deps.config.cookbookIndex.slots);
    expect(gradeOf(levels, t.deps.config.cookbookIndex.slotOf, cid('鲷鱼握寿司'))).toBe(1);
    expect((await restRow(t, ctx.restaurantId)).cookbook_counts.street['14']).toBe(1);
  });

  it('已经是最高品级（7）时报错', async () => {
    const ctx = await newRestaurant(t, { cookbooks: { [ZHOU]: 7 } });
    await expect(cb().learn(ctx, ZHOU)).rejects.toMatchObject({ code: 'COOKBOOK_MAX_GRADE' });
  });
});

describe('只能学、升级所在街道的菜（问题记录 312）', () => {
  it('不在这条街：学新菜、升级学过的都拒绝，食材不扣', async () => {
    // 桑椹葡萄粥是新手街的菜；店在湖南街（1）
    const ctx = await newRestaurant(t, {
      patch: { street_id: 1 },
      foods: { [fid('葡萄')]: 2, [fid('薏仁')]: 2, [fid('桑椹')]: 4 },
      cookbooks: { [JI]: 1 },
    });
    await expect(cb().learn(ctx, ZHOU)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'other_street', streetId: 0 },
    });
    await expect(cb().learn(ctx, JI)).rejects.toMatchObject({ params: { reason: 'other_street' } });
    expect((await foodNum(t, ctx.restaurantId, fid('葡萄'))).num).toBe(2);
    expect(await levelOf(ctx.restaurantId, JI)).toBe(1);
  });

  it('列表：别的街的菜标成不能学（street），可学、可升级筛选里没有；本街照常', async () => {
    const ctx = await newRestaurant(t, {
      patch: { street_id: 1 },
      foods: { [fid('葡萄')]: 1, [fid('薏仁')]: 1, [fid('桑椹')]: 2 },
    });
    const other = await cb().list(ctx, { street: 0, page: 1, filter: 'all' });
    expect(other.items.every((r) => r.learn === 'street')).toBe(true);
    expect((await cb().list(ctx, { street: 0, page: 1, filter: 'learnable' })).items).toEqual([]);
    expect((await cb().list(ctx, { street: 0, page: 1, filter: 'upgradable' })).items).toEqual([]);
    expect((await cb().detail(ctx, ZHOU)).learn).toBe('street');
    const mine = await cb().list(ctx, { street: 1, page: 1, filter: 'all' });
    expect(mine.items.some((r) => r.learn === 'street')).toBe(false);
  });
});

describe('食谱列表、详情、需求', () => {
  it('列表：可以学的排在前面，带下一级所需食材和持有数', async () => {
    const ctx = await newRestaurant(t, { foods: { [fid('葡萄')]: 1, [fid('薏仁')]: 1, [fid('桑椹')]: 1 } });
    const list = await cb().list(ctx, { street: 0, page: 1, filter: 'all' });
    expect(list.streetTotal).toBe(69);
    expect(list.items[0]).toMatchObject({ id: ZHOU, grade: 0, learn: '0' });
    expect(list.items[0]!.next).toEqual(expect.arrayContaining([{ foodsId: fid('桑椹'), num: 1, have: 1 }]));
    const learnable = await cb().list(ctx, { street: 0, page: 1, filter: 'learnable' });
    expect(learnable.items.every((x) => x.learn !== 'z' && x.learn !== 'max')).toBe(true);
  });

  it('筛选：可学只列未学、食材够的；可升级只列已学、食材够升下一级的；带全部食谱总数（问题记录）', async () => {
    const probe = await newRestaurant(t);
    const all = await cb().list(probe, { street: 0, page: 1, filter: 'all' });
    const other = all.items.find((x) => x.id !== ZHOU)!;
    const need = [
      ...(await cb().detail(probe, ZHOU)).grades.find((g) => g.grade === 2)!.foods,
      ...(await cb().detail(probe, other.id)).grades.find((g) => g.grade === 1)!.foods,
    ];
    const foods: Record<number, number> = {};
    for (const f of need) foods[f.foodsId] = (foods[f.foodsId] ?? 0) + f.num;
    const ctx = await newRestaurant(t, { cookbooks: { [ZHOU]: 1 }, foods });
    const learnable = await cb().list(ctx, { street: 0, page: 1, filter: 'learnable' });
    expect(learnable.items.map((x) => x.id)).toContain(other.id);
    expect(learnable.items.every((x) => x.grade === 0 && x.learn !== 'z')).toBe(true);
    const upgradable = await cb().list(ctx, { street: 0, page: 1, filter: 'upgradable' });
    expect(upgradable.items.map((x) => [x.id, x.grade])).toEqual([[ZHOU, 1]]);
    expect(upgradable.allTotal).toBe(3810);
  });

  it('详情：各品级所需食材', async () => {
    const ctx = await newRestaurant(t);
    const d = await cb().detail(ctx, ZHOU);
    expect(d).toMatchObject({ id: ZHOU, streetId: 0, streetName: '新手街', grade: 0, learn: 'z' });
    expect(d.grades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('需求计算：新手街全部学会 1 品级还差多少', async () => {
    const ctx = await newRestaurant(t, { foods: { [fid('葡萄')]: 1 } });
    const n = await cb().foodsNeed(ctx, { street: 0, target: 1 });
    const grape = n.items.find((x) => x.foodsId === fid('葡萄'))!;
    expect(grape.have).toBe(1);
    expect(grape.lack).toBe(grape.need - 1);
  });
});

describe('菜谱详情（240-1）', () => {
  it('菜谱详情的售价乘本区服的菜价倍率', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({ tuning: { settlement: { dishCoinRate: 0.5 } } }),
      })
      .execute();
    const ctx = await newRestaurant(t, { shardId });
    const detail = await t.game.cookbook.detail(ctx, ZHOU);
    expect(detail.coin).toBe(Math.floor(testConfig().requireCookbook(cid('桑椹葡萄粥')).coin * 0.5));
  });
});

describe('食谱进度一览（问题记录：食谱页加进度一览）', () => {
  it('每条街的总数、各品级及以上的道数；只列开放的品级；带当前所在的街', async () => {
    const ctx = await newRestaurant(t);
    const idx = t.deps.config.cookbookIndex;
    const levels = new Uint8Array(idx.slots);
    // 新手街：桑椹葡萄粥金牌（5），湖南街：白斩鸡中品（2）
    levels[idx.slotOf[ZHOU]!] = 5;
    levels[idx.slotOf[JI]!] = 2;
    await t.db
      .updateTable('restaurant_cookbooks')
      .set({ levels: Buffer.from(levels) })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    const p = await cb().progress(ctx);
    const max = t.deps.config.tuning.rest.cookbookMaxGrade;
    expect(p.maxGrade).toBe(max);
    expect(p.street).toBe((await restRow(t, ctx.restaurantId)).street_id);
    const row = (street: number) => p.streets.find((s) => s.streetId === street)!;
    const zhou = t.deps.config.requireCookbook(ZHOU).streetId;
    const ji = t.deps.config.requireCookbook(JI).streetId;
    expect(row(zhou).total).toBe(idx.idsByStreet.get(zhou)!.length);
    expect(row(zhou).atLeast).toEqual([1, 1, 1, 1, 1, 0, 0].slice(0, max));
    expect(row(ji).atLeast).toEqual([1, 1, 0, 0, 0, 0, 0].slice(0, max));
    // 每条有菜的街都在，总数加起来是全部食谱数
    expect(p.streets.reduce((s, x) => s + x.total, 0)).toBe(t.deps.config.cookbooks.size);
  });
});
