import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, roundOf } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { setWeather } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { runOp, type Op } from '../../core/op';
import { settleShardRound } from '../settlement/runner';
import { accrue, cookInSeason, portionPoints, roadsOf } from './rules';
import { shopPools } from './service';
import { accrueShiling, gainShiling } from './store';

const config = testConfig();
const T = config.tuning.shiling;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  // 周三中午：本周内前后挪都不跨周
  t.clock.set(gameTime('2026-10-14', 12));
});
afterAll(() => t.close());

const RAIN = 11; // 中雨：当令一道、二道
const STORM = 13; // 暴雨：三道、四道，时令值 +25%
const MC1 = 1; // 秘·仿膳饽饽：4 级、一道
const MC3 = 69; // 秘·荷花酥：1 级、三道
const balanceOf = async (restId: number) =>
  (await t.db.selectFrom('rest_shiling').selectAll().where('rest_id', '=', restId).executeTakeFirst()) ??
  null;
const give = (ctx: RestCtx, balance: number) =>
  t.db
    .insertInto('rest_shiling')
    .values({ rest_id: ctx.restaurantId, shard_id: ctx.shardId, balance })
    .execute();

describe('规则（天气改版设计 §3）', () => {
  it('当令表：中雨一道二道、特殊天气兽道、表里没有的空', () => {
    expect(roadsOf(T, RAIN)).toEqual([1, 2]);
    expect(roadsOf(T, 24)).toEqual([7]);
    expect(roadsOf(T, 999)).toEqual([]);
  });

  it('下锅算应时：够星、当令这道', () => {
    expect(cookInSeason(T, 1, RAIN, 1)).toBe(true);
    expect(cookInSeason(T, 1, RAIN, 3)).toBe(false);
    expect(cookInSeason(T, 0, RAIN, 1)).toBe(false);
  });

  it('每份点数 = 等级 × (1 + 0.1 × (品级 − 1)) ÷ 10 × (1 + 天气加成)', () => {
    expect(portionPoints(T, 4, 3, 0)).toBeCloseTo(0.48);
    expect(portionPoints(T, 1, 1, 0)).toBeCloseTo(0.1);
    expect(portionPoints(T, 4, 3, 0.25)).toBeCloseTo(0.6);
  });

  it('小数累积在这一批上，入账整数部分；0.1 累计 10 次算 1', () => {
    expect(accrue(0.9, 0, 1, 0.48)).toEqual({ acc: expect.closeTo(1.38), gain: 1 });
    expect(accrue(1.38, 1, 1, 0.48)).toEqual({ acc: expect.closeTo(1.86), gain: 0 });
    let s = { acc: 0, paid: 0 };
    for (let i = 0; i < 10; i++) {
      const r = accrue(s.acc, s.paid, 1, 0.1);
      s = { acc: r.acc, paid: s.paid + r.gain };
    }
    expect(s.paid).toBe(1);
  });

  it('时令铺的菜：残卷是可鉴定 1~5 级，珍稀是不能鉴定的和 6 级；学会的不列', () => {
    const all = config.bundle.mysteriousCookbooks;
    const p = shopPools(all, new Set([MC1]));
    expect(p.remnant).not.toContain(MC1);
    expect(p.remnant).toContain(MC3);
    for (const id of p.remnant) expect(config.requireMc(id)).toMatchObject({ appraisable: true });
    for (const id of p.rare) {
      const m = config.requireMc(id);
      expect(!m.appraisable || m.level >= 6).toBe(true);
    }
    expect(p.rare).toContain(231);
  });
});

describe('下锅时定应时（§3.2）', () => {
  async function cook(mcId: number, star = 1) {
    const foods = Object.fromEntries(config.requireMc(mcId).foods.map((f) => [f, 10]));
    const ctx = await newRestaurant(t, { patch: { star_level: star }, foods });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
    await setWeather(t, ctx.shardId, RAIN);
    const r = await t.game.mysterious.cook(ctx, { mcId, cookNum: 1, cookie: false });
    return { ctx, cook: r.data.cook };
  }

  it('当令的道下锅：整批应时，发 shiling.cook', async () => {
    const { ctx, cook: c } = await cook(MC1);
    expect(c).toMatchObject({ shiling: true, shilingPts: 0 });
    expect(await eventCount(t, ctx.restaurantId, 'shiling.cook')).toBe(1);
  });

  it('不当令的道：不应时，不发', async () => {
    const { ctx, cook: c } = await cook(MC3);
    expect(c.shiling).toBe(false);
    expect(await eventCount(t, ctx.restaurantId, 'shiling.cook')).toBe(0);
  });

  it('道具盖着按盖的天气算', async () => {
    const foods = Object.fromEntries(config.requireMc(MC3).foods.map((f) => [f, 10]));
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, foods });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: MC3, way: 1 }).execute();
    await setWeather(t, ctx.shardId, RAIN);
    await t.db
      .updateTable('world_state')
      .set({
        cover_weather_id: STORM,
        cover_until: new Date(t.clock.now.getTime() + 3_600_000),
        cover_goods: GOODS.compass,
      })
      .where('shard_id', '=', ctx.shardId)
      .execute();
    const r = await t.game.mysterious.cook(ctx, { mcId: MC3, cookNum: 1, cookie: false });
    expect(r.data.cook.shiling).toBe(true);
  });

  it('特色菜页带上现在的当令', async () => {
    const { ctx } = await cook(MC1);
    const o = await t.game.mysterious.overview(ctx);
    expect(o.season).toMatchObject({ open: true, minStar: 1, weatherId: RAIN, roads: [1, 2] });
    expect(o.current).toMatchObject({ mcId: MC1, shiling: true });
  });
});

describe('顾客吃掉应时菜攒时令值（§3.3）', () => {
  const busy = { tuning: { rest: { atRateBase: 5, spRateBase: -5 } } };
  async function withDish(shiling: boolean, weather = RAIN) {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify(busy) })
      .execute();
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 100000, star_level: 1 } });
    await setWeather(t, shardId, weather);
    const c = await t.db
      .insertInto('mc_cook')
      .values({
        rest_id: ctx.restaurantId,
        shard_id: shardId,
        mc_id: MC1,
        level: 4,
        grade: 3,
        cook_num: 1,
        total_num: 1000,
        left_num: 1000,
        price: 50,
        shiling,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .updateTable('restaurant')
      .set({ mc_cook_id: c.id })
      .where('id', '=', ctx.restaurantId)
      .execute();
    await settleShardRound(t.game.deps, t.game.world, shardId, roundOf(t.clock.now), t.clock.now);
    const cook = await t.db
      .selectFrom('mc_cook')
      .selectAll()
      .where('id', '=', c.id)
      .executeTakeFirstOrThrow();
    return { ctx, cook, used: 1000 - cook.left_num };
  }

  it('应时的一批：吃掉的份数 × 0.48，整数入账，余额和本周获得一起加', async () => {
    const { ctx, cook, used } = await withDish(true);
    expect(used).toBeGreaterThan(0);
    const want = Math.floor(used * 0.48 + 1e-9);
    expect(cook.shiling_acc).toBeCloseTo(used * 0.48);
    expect(cook.shiling_pts).toBe(want);
    expect(await balanceOf(ctx.restaurantId)).toMatchObject({ balance: want, week_gain: want });
  });

  it('不应时的一批不攒', async () => {
    const { ctx, used } = await withDish(false);
    expect(used).toBeGreaterThan(0);
    expect(await balanceOf(ctx.restaurantId)).toBeNull();
  });

  it('暴雨时令值 +25%', async () => {
    const { cook, used } = await withDish(true, STORM);
    expect(cook.shiling_pts).toBe(Math.floor(used * 0.6 + 1e-9));
  });
});

describe('时令铺（§3.4）', () => {
  async function shop(balance: number, star = 1) {
    const ctx = await newRestaurant(t, { patch: { star_level: star } });
    await give(ctx, balance);
    return ctx;
  }

  it('司天罗盘 300、每周 2 个；第三个报 limit；下周又能换', async () => {
    const ctx = await shop(1000);
    await t.game.shiling.buy(ctx, { item: 'compass' });
    const r = await t.game.shiling.buy(ctx, { item: 'compass' });
    expect(r.data).toEqual({ item: 'compass', mcId: null, balance: 400 });
    expect(r.events).toContainEqual({ type: 'loss', kind: 'shiling', num: 300 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.compass)).toBe(2);
    await expect(t.game.shiling.buy(ctx, { item: 'compass' })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'shiling_weekly', limit: 2 },
    });
    expect((await t.game.shiling.view(ctx)).shop.find((x) => x.item === 'compass')).toMatchObject({
      left: 0,
    });
    const was = t.clock.now;
    t.clock.set(new Date(was.getTime() + 7 * 86_400_000));
    try {
      await t.game.shiling.buy(ctx, { item: 'lots' });
      expect((await t.game.shiling.view(ctx)).shop.find((x) => x.item === 'compass')).toMatchObject({
        left: 2,
      });
      expect(await goodsNum(t, ctx.restaurantId, GOODS.weatherLots)).toBe(1);
    } finally {
      t.clock.set(was);
    }
    expect(await eventCount(t, ctx.restaurantId, 'shiling.buy')).toBe(3);
  });

  it('残卷：80 × 等级，得 1 张；学会的、6 级的、没选菜的报错', async () => {
    const ctx = await shop(1000);
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: MC1, way: 1 }).execute();
    const r = await t.game.shiling.buy(ctx, { item: 'remnant', mcId: MC3 });
    expect(r.data).toEqual({ item: 'remnant', mcId: MC3, balance: 1000 - 80 });
    const rem = await t.db
      .selectFrom('mc_remnant')
      .select('num')
      .where('rest_id', '=', ctx.restaurantId)
      .where('mc_id', '=', MC3)
      .executeTakeFirst();
    expect(rem?.num).toBe(1);
    await expect(t.game.shiling.buy(ctx, { item: 'remnant', mcId: MC1 })).rejects.toMatchObject({
      params: { reason: 'mc_learned' },
    });
    const six = config.bundle.mysteriousCookbooks.find((m) => m.appraisable && m.level === 6)!;
    await expect(t.game.shiling.buy(ctx, { item: 'remnant', mcId: six.id })).rejects.toMatchObject({
      params: { reason: 'shiling_not_in_shop' },
    });
    await expect(t.game.shiling.buy(ctx, { item: 'remnant' })).rejects.toMatchObject({
      params: { reason: 'mc_id' },
    });
  });

  it('珍稀残卷 1500：不能鉴定的菜；钱不够报 NOT_ENOUGH', async () => {
    const ctx = await shop(1600);
    await t.game.shiling.buy(ctx, { item: 'rare', mcId: 231 });
    expect((await balanceOf(ctx.restaurantId))?.balance).toBe(100);
    const poor = await shop(100);
    await expect(t.game.shiling.buy(poor, { item: 'lots' })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'shiling', need: 120, have: 100 },
    });
  });

  it('0 星不能换', async () => {
    const ctx = await shop(1000, 0);
    await expect(t.game.shiling.buy(ctx, { item: 'lots' })).rejects.toMatchObject({
      params: { reason: 'star', need: 1, have: 0 },
    });
  });
});

describe('天气页的时令区', () => {
  it('余额、本周获得、会的菜里现在应时的、我会的道、当令表、残卷可选范围', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    await setWeather(t, ctx.shardId, RAIN);
    await t.db
      .insertInto('rest_mc')
      .values([
        { rest_id: ctx.restaurantId, mc_id: MC1, way: 1 },
        { rest_id: ctx.restaurantId, mc_id: MC3, way: 1 },
      ])
      .execute();
    await t.db
      .insertInto('rest_shiling')
      .values({
        rest_id: ctx.restaurantId,
        shard_id: ctx.shardId,
        balance: 50,
        week: '2000-01-03',
        week_gain: 9,
      })
      .execute();
    const v = await t.game.shiling.view(ctx);
    expect(v).toMatchObject({ balance: 50, weekGain: 0, inSeason: [MC1], myRoads: [1, 3], trialPick: 30 });
    expect(v.season).toMatchObject({ open: true, roads: [1, 2], weatherId: RAIN });
    expect(v.table).toContainEqual({ ids: [RAIN], roads: [1, 2] });
    expect(v.table).toContainEqual({ ids: [1, 28], roads: [1, 2] });
    expect(v.table.at(-1)).toEqual({ ids: [6, 7, 18, 24, 27], roads: [7] });
    expect(v.remnantPool).not.toContain(MC1);
    expect(v.shop.map((x) => [x.item, x.price, x.left])).toEqual([
      ['remnant', 80, 6],
      ['rare', 1500, 1],
      ['compass', 300, 2],
      ['lots', 120, 4],
    ]);
  });

  it('0 星：没开放，应时的菜为空', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 0 } });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: MC1, way: 1 }).execute();
    await setWeather(t, ctx.shardId, RAIN);
    const v = await t.game.shiling.view(ctx);
    expect(v.season.open).toBe(false);
    expect(v.inSeason).toEqual([]);
  });
});

describe('1 星说明弹窗', () => {
  it('够星没看过才弹；看过记一次', async () => {
    const zero = await newRestaurant(t, { patch: { star_level: 0 } });
    expect((await t.game.restaurant.overview(zero.restaurantId)).shilingIntro).toBe(false);
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    expect((await t.game.restaurant.overview(ctx.restaurantId)).shilingIntro).toBe(true);
    await t.game.shiling.introSeen(ctx);
    await t.game.shiling.introSeen(ctx);
    expect((await t.game.restaurant.overview(ctx.restaurantId)).shilingIntro).toBe(false);
  });
});

describe('支线“一周获得 200 时令值”', () => {
  const run = <X>(ctx: RestCtx, fn: (o: Op) => Promise<X>) =>
    runOp(t.game.deps, ctx, { feature: 'mysterious', source: 'test' }, fn);
  const dish = { id: 0, level: 10, grade: 1, shiling_acc: 0, shiling_pts: 0 };

  it('本周获得跨过 200 发一次 shiling.week200；跨周从 0 算，余额不清', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    expect((await run(ctx, (o) => gainShiling(o, 150))).data).toEqual({ before: 0, after: 150 });
    await run(ctx, (o) => accrueShiling(o, dish, 30, 0));
    expect(await eventCount(t, ctx.restaurantId, 'shiling.week200')).toBe(0);
    await run(ctx, (o) => accrueShiling(o, dish, 30, 0));
    expect(await eventCount(t, ctx.restaurantId, 'shiling.week200')).toBe(1);
    await run(ctx, (o) => accrueShiling(o, dish, 30, 0));
    expect(await eventCount(t, ctx.restaurantId, 'shiling.week200')).toBe(1);
    const was = t.clock.now;
    t.clock.set(new Date(was.getTime() + 7 * 86_400_000));
    try {
      expect((await run(ctx, (o) => gainShiling(o, 5))).data).toEqual({ before: 0, after: 5 });
    } finally {
      t.clock.set(was);
    }
    expect((await balanceOf(ctx.restaurantId))?.balance).toBe(150 + 90 + 5);
  });
});
