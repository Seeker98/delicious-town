import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { addDays, gameTime, seededRng, slotKey } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../../test/game';
import { krab } from './krab';
import { market } from './market';
import type { AutoCtx } from './types';
import { weather } from './weather';
import { wish } from './wish';

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
      note: `11月3日 12 点日常货架上了 2 级稀有食材: ${rare2.name}`,
      noteParams: { day: DAY, hour: 12, level: 2, foods: [rare2.id] },
    });
  });
});

describe('天气（238-2 设计 §4.4）', () => {
  it('出题：时段在出题 3 小时之后，截止在整点前 5 分钟，下一次换天（4 小时后）判定', async () => {
    const shardId = await createShard(t.db);
    await t.game.world.ensure(shardId, at0);
    const dr = (await weather.create(await ctx(shardId)))!;
    const { hour, type } = dr.params as { hour: number; type: number };
    expect(gameTime(DAY, hour).getTime() - at0.getTime()).toBeGreaterThanOrEqual(3 * 3_600_000);
    expect(dr.closeAt).toEqual(new Date(gameTime(DAY, hour).getTime() - 5 * 60_000));
    expect(dr.resolveAt).toEqual(new Date(gameTime(DAY, hour).getTime() + 4 * 3_600_000));
    expect([1, 2, 3, 4]).toContain(type);
    expect(dr.description).toContain('司天罗盘');
  });

  it('判定：按换天时的自然天气判；罗盘、签改过时判定依据写明（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const hour = 17;
    const period = slotKey(DAY, hour);
    const slot = { key: period, day: DAY, hour, start: gameTime(DAY, hour) };
    const { to } = await t.game.world.changeWeather(shardId, slot, gameTime(DAY, hour));
    await ran(shardId, 'weather', period, new Date(gameTime(DAY, hour).getTime() + 30_000));
    const auto = t.deps.config.weather.get(to)!;
    const r = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r.outcome).toBe(true);
    expect(r.note).toBe(
      `11月3日 ${hour} 点换天后是${auto.name} (${['', '晴', '雨', '雪', '风沙雾霾'][auto.type]}类)`,
    );
    expect(r.noteParams).toEqual({ day: DAY, hour, weather: to, type: auto.type });
    const other = [...t.deps.config.weather.values()].find((x) => !x.special && x.type !== auto.type)!;
    await t.db
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'weather.tool',
        params: JSON.stringify({ goodsId: GOODS.compass, from: to, to: other.id }),
        created_at: new Date(gameTime(DAY, hour).getTime() + 600_000),
      })
      .execute();
    const r2 = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r2.outcome).toBe(true);
    expect(r2.note).toBe(`${r.note}；之后有人用道具改成了${other.name}, 按题目规则不算`);
    expect(r2.noteParams).toEqual({ day: DAY, hour, weather: to, type: auto.type, coverTo: other.id });
  });
});

describe('许愿树（2026-10-16 换掉全服营业银币题）', () => {
  it('出题：从奖品表里等概率挑一样，概率按权重占比；20 点开树前 5 分钟截止，开树时判定', async () => {
    const shardId = await createShard(t.db);
    const c = await ctx(shardId);
    const prizes = c.settings.tuning.wishTree.prizes;
    const total = prizes.reduce((s, p) => s + p.weight, 0);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const dr = (await wish.create({ ...c, rng: seededRng(seed) }))!;
      const goods = Number(dr.params.goods);
      seen.add(goods);
      const w = prizes.filter((p) => p.goods === goods).reduce((s, p) => s + p.weight, 0);
      expect(dr.p0).toBeCloseTo(Math.min(0.95, Math.max(0.05, w / total)), 9);
      expect(dr.title).toBe(`今天 20 点许愿树会结出${t.game.deps.config.goods.get(goods)!.name}吗`);
      expect(dr.params).toEqual({ day: DAY, hour: 20, goods });
      expect(dr.closeAt).toEqual(gameTime(DAY, 19, 55));
      expect(dr.resolveAt).toEqual(gameTime(DAY, 20));
    }
    expect([...seen].every((g) => prizes.some((p) => p.goods === g))).toBe(true);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('离截止不到 1 小时、区服关了许愿树：不出', async () => {
    const shardId = await createShard(t.db);
    expect(await wish.create({ ...(await ctx(shardId)), now: gameTime(DAY, 18, 56) })).toBeNull();
    expect(await wish.create({ ...(await ctx(shardId)), now: gameTime(DAY, 18, 54) })).not.toBeNull();
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: off, override: JSON.stringify({ features: { wishtree: false } }) })
      .execute();
    t.game.shards.invalidate(off);
    expect(await wish.create(await ctx(off))).toBeNull();
  });

  it('判定：当天那一轮还没开返回 null；开了按结的道具判，不看数量', async () => {
    const shardId = await createShard(t.db);
    const goods = t.game.deps.config.tuning.wishTree.prizes[0]!.goods;
    const other = t.game.deps.config.tuning.wishTree.prizes.find((p) => p.goods !== goods)!.goods;
    expect(await wish.resolve(await rctx(shardId), { day: DAY, hour: 20, goods })).toBeNull();
    await t.db
      .insertInto('wish_round')
      .values({
        shard_id: shardId,
        day: DAY,
        goods_id: goods,
        num: 3,
        opens_at: gameTime(DAY, 20),
        ends_at: gameTime(addDays(DAY, 1), 20),
      })
      .execute();
    const yes = (await wish.resolve(await rctx(shardId), { day: DAY, hour: 20, goods }))!;
    expect(yes).toEqual({
      outcome: true,
      note: `11月3日许愿树结的是${t.game.deps.config.goods.get(goods)!.name} ×3`,
      noteParams: { day: DAY, goods, num: 3 },
    });
    expect((await wish.resolve(await rctx(shardId), { day: DAY, hour: 20, goods: other }))!.outcome).toBe(
      false,
    );
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

  it('天气：那一轮没跑过返回 null；换天之前用的道具不写进判定依据', async () => {
    const shardId = await createShard(t.db);
    const hour = 17;
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
        type: 'weather.tool',
        params: JSON.stringify({ goodsId: GOODS.compass, from: to, to: other.id }),
        created_at: new Date(start.getTime() + 10_000),
      })
      .execute();
    await ran(shardId, 'weather', period, new Date(start.getTime() + 30_000));
    const r = (await weather.resolve(await rctx(shardId), { hour, type, period }))!;
    expect(r.noteParams).not.toHaveProperty('coverTo');
  });

  it('天气：换天任务开始后、写完成时间前用的道具也写进判定依据（天气在任务开始时就换了，质量期 ②）', async () => {
    const shardId = await createShard(t.db);
    const hour = 17;
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
        type: 'weather.tool',
        params: JSON.stringify({ goodsId: GOODS.compass, from: to, to: other.id }),
        created_at: new Date(start.getTime() + 60_000),
      })
      .execute();
    const r = (await weather.resolve(await rctx(shardId), { hour, type, period }))!;
    expect(r.noteParams).toMatchObject({ coverTo: other.id });
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
});
