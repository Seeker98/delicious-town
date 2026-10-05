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
import { fid } from '../../../../test/items';

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
/** 登记某个周期任务跑完了（判定前要确认那一轮真的刷新过，backlog 238-2） */
async function ran(shardId: number, job: string, period: string, at: Date) {
  await t.db
    .insertInto('job_run')
    .values({ shard_id: shardId, job, period, started_at: at, finished_at: at })
    .execute();
}
const rctx = async (shardId: number) => ({
  d: t.game.deps,
  shardId,
  settings: await t.game.deps.shards.settings(shardId),
});

describe('蟹老板（238-2 设计 §4.1）', () => {
  it('出题：明天 a~a+5 号街，概率 6/29（蟹老板 1~29 号街，问题记录 284），当天 23:50 截止，明天 9 点判定', async () => {
    const shardId = await createShard(t.db);
    const dr = (await krab.create(await ctx(shardId)))!;
    const { from, to } = dr.params as { from: number; to: number };
    expect(to - from).toBe(5);
    expect(from).toBeGreaterThanOrEqual(1);
    expect(to).toBeLessThanOrEqual(29);
    expect(dr.title).toBe(`明天蟹老板会在 ${from}~${to} 号街出现吗`);
    // 前端按参数渲染各语言的题目（问题记录 272）
    expect(dr.params).toMatchObject({ hour: 9 });
    expect(dr.p0).toBeCloseTo(6 / 29, 9);
    expect(dr.closeAt).toEqual(gameTime(DAY, 23, 50));
    expect(dr.resolveAt).toEqual(gameTime(addDays(DAY, 1), 9));
  });

  it('判定：和世界服务 9 点刷新出的街一致（之后被驱赶改的不算）', async () => {
    const shardId = await createShard(t.db);
    const tomorrow = addDays(DAY, 1);
    const slot = { key: slotKey(tomorrow, 9), day: tomorrow, hour: 9, start: gameTime(tomorrow, 9) };
    const { street } = await t.game.world.changeKrabStreet(shardId, slot, gameTime(tomorrow, 9));
    await ran(shardId, 'daily-event', slot.key, gameTime(tomorrow, 9));
    for (const from of [1, 5, 8]) {
      const r = (await krab.resolve(await rctx(shardId), { day: tomorrow, from, to: from + 5, hour: 9 }))!;
      expect(r.outcome).toBe(street >= from && street <= from + 5);
      // 判定依据写具体日期：事后看"明天"会让人糊涂（终审 M4）
      expect(r.note).toBe(`11月4日 9 点蟹老板刷新在 ${street} 号街`);
      expect(r.noteParams).toEqual({ day: tomorrow, hour: 9, street });
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
    // 有近期活跃的玩家店："某家餐厅"也在候选里，概率按全部地点权重算（backlog 238-2）
    const active = await newRestaurant(t, { shardId });
    await t.db
      .insertInto('income_round')
      .values({
        rest_id: active.restaurantId,
        round_no: 1,
        coin: 1,
        exp: 0,
        oil: 0,
        customers: JSON.stringify([]),
        rates: JSON.stringify({}),
        drops: JSON.stringify([]),
        created_at: new Date(at0.getTime() - 3_600_000),
      })
      .execute();
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
        foods_id: fid('大米'),
        worth: 1,
        created_at: at0,
      })
      .execute();
    const r = (await hiphop.resolve(await rctx(shardId), dr.params))!;
    expect(r.outcome).toBe(false);
    expect(r.note).toMatch(/^11月4日嘻哈男孩出现在/);
    expect(r.noteParams).toEqual({ day: addDays(DAY, 1), place: other });
    expect(dr.params).toMatchObject({ hour: expect.any(Number) });
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
    expect(no).toEqual({
      outcome: false,
      note: '11月3日 12 点日常货架没有 2 级稀有食材',
      noteParams: { day: DAY, hour: 12, level: 2, foods: [] },
    });
    await t.db.insertInto('market_item').values(row(rare2.id, null)).execute();
    const yes = (await market.resolve(await rctx(shardId), params))!;
    expect(yes).toEqual({
      outcome: true,
      note: `11月3日 12 点日常货架上了 2 级稀有食材：${rare2.name}`,
      noteParams: { day: DAY, hour: 12, level: 2, foods: [rare2.id] },
    });
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
    await ran(shardId, 'weather', period, new Date(gameTime(DAY, hour).getTime() + 30_000));
    const auto = t.deps.config.weather.get(to)!;
    const r = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r.outcome).toBe(true);
    expect(r.note).toBe(
      `11月3日 ${hour} 点自动轮换的天气是${auto.name}（${['', '晴', '雨', '雪', '风沙雾霾'][auto.type]}类）`,
    );
    expect(r.noteParams).toEqual({ day: DAY, hour, weather: to, type: auto.type });
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
    expect(r2.noteParams).toEqual({ day: DAY, hour, weather: to, type: auto.type, hammerTo: other.id });
  });
});

describe('全服数据（238-2 设计 §4.5）', () => {
  it('出题：只问营业银币（活跃店数太容易被小号刷，终审 I1），概率 50%，当天 18 点截止，明天 0:10 判定', async () => {
    const shardId = await createShard(t.db);
    for (const day of [DAY, addDays(DAY, 1)]) {
      const dr = (await stats.create({ ...(await ctx(shardId)), day, now: gameTime(day, 0, 5) }))!;
      expect(dr.title).toBe('今天全服营业银币会超过昨天吗');
      expect(dr.params).toEqual({ day, metric: 'coin', close: 18 });
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
    expect(tie).toEqual({
      outcome: false,
      note: '11月3日 1,000，11月2日 1,000',
      noteParams: { day: DAY, today: 1000, prevDay: addDays(DAY, -1), yesterday: 1000 },
    });
    await income(DAY, 1);
    expect((await stats.resolve(await rctx(shardId), { day: DAY, metric: 'coin' }))!.outcome).toBe(true);
  });
});

describe('判定边界（backlog 238-2）', () => {
  it('蟹老板：那一轮没跑过（world 关掉、worker 漏跑）返回 null；按出题时记下的整点判，之后改了 krabHour 也不变', async () => {
    const shardId = await createShard(t.db);
    const tomorrow = addDays(DAY, 1);
    const slot = { key: slotKey(tomorrow, 9), day: tomorrow, hour: 9, start: gameTime(tomorrow, 9) };
    const { street } = await t.game.world.changeKrabStreet(shardId, slot, gameTime(tomorrow, 9));
    const params = { day: tomorrow, from: street, to: street, hour: 9 };
    expect(await krab.resolve(await rctx(shardId), params)).toBeNull();
    await ran(shardId, 'daily-event', slot.key, gameTime(tomorrow, 9));
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { world: { krabHour: 15 } } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = (await krab.resolve(await rctx(shardId), params))!;
    expect(r).toMatchObject({ outcome: true, noteParams: { day: tomorrow, hour: 9, street } });
  });

  it('天气：那一轮没跑过返回 null；轮换之前用的雷神锤会被轮换覆盖，不写进判定依据', async () => {
    const shardId = await createShard(t.db);
    const hour = 15;
    const period = slotKey(DAY, hour);
    const start = gameTime(DAY, hour);
    const { to } = await t.game.world.changeWeather(shardId, { key: period, day: DAY, hour, start }, start);
    const type = t.deps.config.weather.get(to)!.type;
    expect(await weather.resolve(await rctx(shardId), { hour, type, period })).toBeNull();
    const other = [...t.deps.config.weather.values()].find((x) => !x.special && x.type !== type)!;
    await t.db
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'weather.change',
        params: JSON.stringify({ from: to, to: other.id, by: 1 }),
        created_at: new Date(start.getTime() + 10_000),
      })
      .execute();
    await ran(shardId, 'weather', period, new Date(start.getTime() + 30_000));
    const r = (await weather.resolve(await rctx(shardId), { hour, type, period }))!;
    expect(r.noteParams).not.toHaveProperty('hammerTo');
  });

  it('天气：轮换任务开始后、写完成时间前用的雷神锤也写进判定依据（天气在任务开始时就换了，质量期 ②）', async () => {
    const shardId = await createShard(t.db);
    const hour = 15;
    const period = slotKey(DAY, hour);
    const start = gameTime(DAY, hour);
    const { to } = await t.game.world.changeWeather(shardId, { key: period, day: DAY, hour, start }, start);
    const type = t.deps.config.weather.get(to)!.type;
    const other = [...t.deps.config.weather.values()].find((x) => !x.special && x.type !== type)!;
    await t.db
      .insertInto('job_run')
      .values({
        shard_id: shardId,
        job: 'weather',
        period,
        started_at: new Date(start.getTime() + 30_000),
        finished_at: new Date(start.getTime() + 90_000),
      })
      .execute();
    await t.db
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'weather.change',
        params: JSON.stringify({ from: to, to: other.id, by: 1 }),
        created_at: new Date(start.getTime() + 60_000),
      })
      .execute();
    const r = (await weather.resolve(await rctx(shardId), { hour, type, period }))!;
    expect(r.noteParams).toMatchObject({ hammerTo: other.id });
  });

  it('菜场：货架被下一轮清掉时按种子重算那一轮的系统进货；那一轮没跑过返回 null', async () => {
    const shardId = await createShard(t.db);
    const hour = 12;
    const period = slotKey(DAY, hour);
    const slot = { key: period, day: DAY, hour, start: gameTime(DAY, hour) };
    const { foods } = await t.game.market.refresh(shardId, 0, slot, gameTime(DAY, hour));
    const level = foods.some((id) => {
      const f = t.deps.config.requireFood(id);
      return f.level === 1 && f.odds < 100;
    })
      ? 1
      : 2;
    const params = { hour, level, period };
    const before = (await market.resolve(await rctx(shardId), params))!;
    await t.db.deleteFrom('market_item').where('shard_id', '=', shardId).execute();
    expect(await market.resolve(await rctx(shardId), params)).toBeNull();
    await ran(shardId, 'market-daily', period, gameTime(DAY, hour));
    expect(await market.resolve(await rctx(shardId), params)).toEqual(before);
  });

  it('菜场：货架被清掉时按那一轮的进货新闻判，不按现在的数值重算（backlog #113）', async () => {
    const shardId = await createShard(t.db);
    const hour = 12;
    const period = slotKey(DAY, hour);
    const slot = { key: period, day: DAY, hour, start: gameTime(DAY, hour) };
    const { foods } = await t.game.market.refresh(shardId, 0, slot, gameTime(DAY, hour));
    // 当时进货新闻里记的是一种实际没进的 2 级稀有食材：判定要按新闻（运营事后改数值，重算会不一样）
    const r2 = [...t.deps.config.foods.values()].find(
      (f) => f.level === 2 && f.odds < 100 && !foods.includes(f.id),
    )!;
    await t.db
      .updateTable('news')
      // 999999：之后从配置里删掉的食材，判定时跳过（质量期 ⑤ 终审）
      .set({ params: JSON.stringify({ shelf: 0, foods: [999999, r2.id] }) })
      .where('shard_id', '=', shardId)
      .where('type', '=', 'market.restock')
      .execute();
    await t.db.deleteFrom('market_item').where('shard_id', '=', shardId).execute();
    await ran(shardId, 'market-daily', period, gameTime(DAY, hour));
    const r = (await market.resolve(await rctx(shardId), { hour, level: 2, period }))!;
    expect(r).toMatchObject({ outcome: true, noteParams: { foods: [r2.id] } });
  });

  it('嘻哈男孩：近期没有活跃玩家店时不出"某家餐厅"，概率按公共地点重新算', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({
          tuning: {
            hiphop: {
              placeWeights: [
                [9, 1000],
                [2, 1],
                [3, 1],
              ],
            },
          },
        }),
      })
      .execute();
    t.game.shards.invalidate(shardId);
    for (const seed of [1, 2, 3, 4, 5]) {
      const dr = (await hiphop.create(await ctx(shardId, seed)))!;
      expect(dr.params.place).not.toBe(9);
      expect(dr.p0).toBeCloseTo(0.5, 9);
    }
  });
});
