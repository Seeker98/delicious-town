import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime, seededRng, slotKey } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../../test/game';
import { hiphop } from './hiphop';
import { krab } from './krab';
import { market } from './market';
import { stats } from './stats';
import type { AutoCtx } from './types';
import { weather } from './weather';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 出题时间固定在某天 0:05（游戏时间） */
const DAY = '2026-11-03';
const at0 = gameTime(DAY, 0, 5);
async function ctx(shardId: number, seed = 1): Promise<AutoCtx> {
  return {
    d: t.game.deps,
    shardId,
    settings: await t.game.deps.shards.settings(shardId),
    now: at0,
    day: DAY,
    rng: seededRng(seed),
  };
}
const rctx = async (shardId: number) => ({
  d: t.game.deps,
  shardId,
  settings: await t.game.deps.shards.settings(shardId),
});

describe('蟹老板（238-2 设计 §4.1）', () => {
  it('出题：明天 a~a+5 号街，概率 6/13，当天 23:50 截止，明天 9 点判定', async () => {
    const shardId = await createShard(t.db);
    const dr = (await krab.create(await ctx(shardId)))!;
    const { from, to } = dr.params as { from: number; to: number };
    expect(to - from).toBe(5);
    expect(from).toBeGreaterThanOrEqual(1);
    expect(to).toBeLessThanOrEqual(13);
    expect(dr.title).toBe(`明天蟹老板会在 ${from}~${to} 号街出现吗`);
    expect(dr.p0).toBeCloseTo(6 / 13, 9);
    expect(dr.closeAt).toEqual(gameTime(DAY, 23, 50));
    expect(dr.resolveAt).toEqual(gameTime(addDays(DAY, 1), 9));
  });

  it('判定：和世界服务 9 点刷新出的街一致（之后被驱赶改的不算）', async () => {
    const shardId = await createShard(t.db);
    const tomorrow = addDays(DAY, 1);
    const slot = { key: slotKey(tomorrow, 9), day: tomorrow, hour: 9, start: gameTime(tomorrow, 9) };
    const { street } = await t.game.world.changeKrabStreet(shardId, slot, gameTime(tomorrow, 9));
    for (const from of [1, 5, 8]) {
      const r = (await krab.resolve(await rctx(shardId), { day: tomorrow, from, to: from + 5 }))!;
      expect(r.outcome).toBe(street >= from && street <= from + 5);
      // 判定依据写具体日期：事后看"明天"会让人糊涂（终审 M4）
      expect(r.note).toBe(`11月4日 9 点蟹老板刷新在 ${street} 号街`);
    }
  });
});

describe('嘻哈男孩（238-2 设计 §4.2）', () => {
  it('出题只考虑本区服开着的功能的地点（问题记录 256）', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({
          features: { kuji: false },
          tuning: {
            hiphop: {
              placeWeights: [
                [12, 1000],
                [2, 1],
              ],
            },
          },
        }),
      })
      .execute();
    t.game.shards.invalidate(shardId);
    const dr = (await hiphop.create(await ctx(shardId, 3)))!;
    expect(dr.params.place).toBe(2);
    // 1000 : 1 只剩商店一个地点，概率夹到上限 0.95
    expect(dr.p0).toBe(0.95);
    expect(dr.title).toBe('明天嘻哈男孩会出现在商店吗');
  });

  it('出题：按地点权重，明天 hiphop.hour 判定；判定读地点记录，没生成返回 null', async () => {
    const shardId = await createShard(t.db);
    const dr = (await hiphop.create(await ctx(shardId, 3)))!;
    const place = dr.params.place as number;
    const weights = t.deps.config.tuning.hiphop.placeWeights;
    const total = weights.reduce((s, [, x]) => s + x, 0);
    expect(dr.p0).toBeCloseTo(weights.find(([p]) => p === place)![1] / total, 9);
    expect(dr.resolveAt).toEqual(gameTime(addDays(DAY, 1), t.deps.config.tuning.hiphop.hour));
    expect(await hiphop.resolve(await rctx(shardId), dr.params)).toBeNull();
    const other = place === 1 ? 2 : 1;
    await t.db
      .insertInto('hiphop_day')
      .values({
        shard_id: shardId,
        day: addDays(DAY, 1),
        place: other,
        foods_id: 101,
        worth: 1,
        created_at: at0,
      })
      .execute();
    const r = (await hiphop.resolve(await rctx(shardId), dr.params))!;
    expect(r.outcome).toBe(false);
    expect(r.note).toMatch(/^11月4日嘻哈男孩出现在/);
  });
});

describe('菜场（238-2 设计 §4.3）', () => {
  it('出题：时段在出题 1 小时之后；截止在开货前 5 分钟', async () => {
    const shardId = await createShard(t.db);
    const dr = (await market.create(await ctx(shardId)))!;
    const { hour, level } = dr.params as { hour: number; level: number };
    expect(t.deps.config.tuning.market.dailyHours).toContain(hour);
    expect([1, 2]).toContain(level);
    expect(dr.title).toBe(`今天 ${hour} 点的日常货架会出现 ${level} 级稀有食材吗`);
    expect(dr.closeAt).toEqual(new Date(gameTime(DAY, hour).getTime() - 5 * 60_000));
    expect(dr.resolveAt).toEqual(gameTime(DAY, hour));
    expect(dr.closeAt.getTime() - at0.getTime()).toBeGreaterThanOrEqual(3_600_000);
    expect(dr.p0).toBeGreaterThanOrEqual(0.05);
    expect(dr.p0).toBeLessThanOrEqual(0.95);
  });

  it('判定：货架还没生成返回 null；只看系统进货，不看玩家手动进的货（Review Focus 4、5）', async () => {
    const shardId = await createShard(t.db);
    const period = slotKey(DAY, 12);
    const params = { hour: 12, level: 2, period };
    expect(await market.resolve(await rctx(shardId), params)).toBeNull();
    const rare2 = [...t.deps.config.foods.values()].find((f) => f.level === 2 && f.odds < 100 && f.odds > 0)!;
    const common1 = [...t.deps.config.foods.values()].find((f) => f.level === 1 && f.odds >= 100)!;
    const owner = await newRestaurant(t, { shardId });
    const row = (foodsId: number, owner_rest_id: number | null) => ({
      shard_id: shardId,
      shelf: 0,
      period,
      foods_id: foodsId,
      stock: 10,
      opened_at: gameTime(DAY, 12),
      owner_rest_id,
    });
    await t.db
      .insertInto('market_item')
      .values([row(common1.id, null), row(rare2.id, owner.restaurantId)])
      .execute();
    const no = (await market.resolve(await rctx(shardId), params))!;
    expect(no).toEqual({ outcome: false, note: '11月3日 12 点日常货架没有 2 级稀有食材' });
    await t.db.insertInto('market_item').values(row(rare2.id, null)).execute();
    const yes = (await market.resolve(await rctx(shardId), params))!;
    expect(yes).toEqual({ outcome: true, note: `11月3日 12 点日常货架上了 2 级稀有食材：${rare2.name}` });
  });
});

describe('天气（238-2 设计 §4.4）', () => {
  it('出题：时段在出题 3 小时之后，截止在整点前 5 分钟，时段结束后判定', async () => {
    const shardId = await createShard(t.db);
    const dr = (await weather.create(await ctx(shardId)))!;
    const { hour, type } = dr.params as { hour: number; type: number };
    expect(gameTime(DAY, hour).getTime() - at0.getTime()).toBeGreaterThanOrEqual(3 * 3_600_000);
    expect(dr.closeAt).toEqual(new Date(gameTime(DAY, hour).getTime() - 5 * 60_000));
    expect(dr.resolveAt).toEqual(new Date(gameTime(DAY, hour).getTime() + 2 * 3_600_000));
    expect([1, 2, 3, 4]).toContain(type);
    expect(dr.description).toContain('雷神锤');
  });

  it('判定：按自动轮换判；雷神锤改过时判定依据写明（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const hour = 15;
    const period = slotKey(DAY, hour);
    const slot = { key: period, day: DAY, hour, start: gameTime(DAY, hour) };
    const { to } = await t.game.world.changeWeather(shardId, slot, gameTime(DAY, hour));
    const auto = t.deps.config.weather.get(to)!;
    const r = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r.outcome).toBe(true);
    expect(r.note).toBe(
      `11月3日 ${hour} 点自动轮换的天气是${auto.name}（${['', '晴', '雨', '雪', '风沙雾霾'][auto.type]}类）`,
    );
    const other = [...t.deps.config.weather.values()].find((x) => !x.special && x.type !== auto.type)!;
    await t.db
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'weather.change',
        params: JSON.stringify({ from: to, to: other.id, by: 1 }),
        created_at: new Date(gameTime(DAY, hour).getTime() + 600_000),
      })
      .execute();
    const r2 = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r2.outcome).toBe(true);
    expect(r2.note).toBe(`${r.note}；之后有人用雷神锤改成了${other.name}，按题目规则不算`);
  });
});

describe('全服数据（238-2 设计 §4.5）', () => {
  it('出题：只问营业银币（活跃店数太容易被小号刷，终审 I1），概率 50%，当天 18 点截止，明天 0:10 判定', async () => {
    const shardId = await createShard(t.db);
    for (const day of [DAY, addDays(DAY, 1)]) {
      const dr = (await stats.create({ ...(await ctx(shardId)), day, now: gameTime(day, 0, 5) }))!;
      expect(dr.title).toBe('今天全服营业银币会超过昨天吗');
      expect(dr.params).toEqual({ day, metric: 'coin' });
      expect(dr.p0).toBe(0.5);
      expect(dr.closeAt).toEqual(gameTime(day, 18));
      expect(dr.resolveAt).toEqual(gameTime(addDays(day, 1), 0, 10));
    }
  });

  it('出题任务过了早上 6 点才跑的那天不出这题（大半天的数据已经能看出趋势，终审 I1）', async () => {
    const shardId = await createShard(t.db);
    expect(await stats.create({ ...(await ctx(shardId)), now: gameTime(DAY, 6, 1) })).toBeNull();
    expect(await stats.create({ ...(await ctx(shardId)), now: gameTime(DAY, 5, 59) })).not.toBeNull();
  });

  it('判定：今天严格大于昨天才算"是"', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const income = (day: string, coin: number) =>
      t.db
        .insertInto('income_round')
        .values({
          rest_id: r.restaurantId,
          round_no: 1,
          coin,
          exp: 0,
          oil: 0,
          customers: JSON.stringify([]),
          rates: JSON.stringify({}),
          drops: JSON.stringify([]),
          created_at: gameTime(day, 12),
        })
        .execute();
    await income(addDays(DAY, -1), 1000);
    await income(DAY, 1000);
    const tie = (await stats.resolve(await rctx(shardId), { day: DAY, metric: 'coin' }))!;
    expect(tie).toEqual({ outcome: false, note: '11月3日 1,000，11月2日 1,000' });
    await income(DAY, 1);
    expect((await stats.resolve(await rctx(shardId), { day: DAY, metric: 'coin' }))!.outcome).toBe(true);
  });
});
