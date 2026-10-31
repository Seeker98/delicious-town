import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, roundOf } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { cid } from '../../../test/items';
import { eventCount } from '../../../test/quests';
import { queryCounter } from '../../../test/queries';
import { setWeather } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { runOp, type Op } from '../../core/op';
import { settleShardRound } from '../settlement/runner';
import { accrue, cookInSeason, decayOf, perPortion, roadsOf } from './rules';
import { shopPools } from './service';
import { accrueShiling, decayShiling, gainShiling } from './store';

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
const MC6 = 45; // 秘·三层套鸡：6 级、二道
const balanceOf = async (restId: number) =>
  (await t.db.selectFrom('rest_shiling').selectAll().where('rest_id', '=', restId).executeTakeFirst()) ??
  null;
const give = (ctx: RestCtx, balance: number) =>
  t.db
    .insertInto('rest_shiling')
    .values({ rest_id: ctx.restaurantId, shard_id: ctx.shardId, balance })
    .execute();

describe('规则（天气改版设计 §3）', () => {
  it('当令表：中雨一道二道、特殊天气一道到六道全部当令（特色菜清理 2026-10-13）、表里没有的空', () => {
    expect(roadsOf(T, RAIN)).toEqual([1, 2]);
    expect(roadsOf(T, 24)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(roadsOf(T, 999)).toEqual([]);
  });

  it('这一轮算应时：够星、当令这道', () => {
    expect(cookInSeason(T, 1, RAIN, 1)).toBe(true);
    expect(cookInSeason(T, 1, RAIN, 3)).toBe(false);
    expect(cookInSeason(T, 0, RAIN, 1)).toBe(false);
  });

  it('每份点数 = 每种食材现价之和 ÷ 360 ÷ 1100 × (1 + 0.1 × (品级 − 1))（时令值改法 2026-10-13）', () => {
    const per = (mcId: number, grade: number) =>
      perPortion(
        T,
        config.tuning.mysterious,
        config.tuning.market,
        config.requireMc(mcId).foods.map((f) => config.requireFood(f)),
        grade,
      );
    // 1 级 秘·肉末烧饼：大米类 1 级 1200 + 1600，2 级 2200 × 1.3
    expect(per(14, 1)).toBeCloseTo((1200 + 1600 + 2860) / 360 / 1100);
    // 3 级 秘·凤凰展翅：2 级 2200 × 1.3 两种，4 级 5300 × 3
    expect(per(3, 1)).toBeCloseTo((2860 + 2860 + 15900) / 360 / 1100);
    // 5 级 秘·芙蓉大虾：三种 4 级 (5200 + 5800 + 5300) × 3；品级 3 再 × 1.2
    expect(per(4, 1)).toBeCloseTo(48900 / 360 / 1100);
    expect(per(4, 3)).toBeCloseTo((48900 / 360 / 1100) * 1.2);
  });

  it('每日衰减：余额超过 500 的部分扣 1%，向下取整', () => {
    expect([499, 500, 599, 600, 1500, 3000].map((b) => decayOf(b, T.decay))).toEqual([0, 0, 0, 1, 10, 25]);
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
    expect(p.rare).toContain(MC6);
  });
});

describe('下锅（时令值改法 2026-10-13）', () => {
  async function cook(mcId: number, star = 1) {
    const foods = Object.fromEntries(config.requireMc(mcId).foods.map((f) => [f, 10]));
    const ctx = await newRestaurant(t, { patch: { star_level: star }, foods });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
    await setWeather(t, ctx.shardId, RAIN);
    const r = await t.game.mysterious.cook(ctx, { mcId, cookNum: 1, cookie: false });
    return { ctx, cook: r.data.cook };
  }

  it('这一批记下每份时令值（按这一批的品级）；当令的道下锅发 shiling.cook（支线）', async () => {
    const { ctx, cook: c } = await cook(MC1);
    expect(c.shilingPts).toBe(0);
    const row = await t.db.selectFrom('mc_cook').selectAll().where('id', '=', c.id).executeTakeFirstOrThrow();
    const want = perPortion(
      T,
      config.tuning.mysterious,
      config.tuning.market,
      config.requireMc(MC1).foods.map((f) => config.requireFood(f)),
      row.grade,
    );
    expect(row.shiling_per).toBeCloseTo(want);
    expect(await eventCount(t, ctx.restaurantId, 'shiling.cook')).toBe(1);
  });

  it('不当令的道：不发 shiling.cook，每份时令值照记', async () => {
    const { ctx, cook: c } = await cook(MC3);
    const row = await t.db.selectFrom('mc_cook').selectAll().where('id', '=', c.id).executeTakeFirstOrThrow();
    expect(row.shiling_per).toBeGreaterThan(0);
    expect(await eventCount(t, ctx.restaurantId, 'shiling.cook')).toBe(0);
  });

  it('道具盖着按盖的天气算（支线）', async () => {
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
    await t.game.mysterious.cook(ctx, { mcId: MC3, cookNum: 1, cookie: false });
    expect(await eventCount(t, ctx.restaurantId, 'shiling.cook')).toBe(1);
  });

  it('特色菜页带上现在的当令', async () => {
    const { ctx } = await cook(MC1);
    const o = await t.game.mysterious.overview(ctx);
    expect(o.season).toMatchObject({ open: true, minStar: 1, weatherId: RAIN, roads: [1, 2] });
    expect(o.current).toMatchObject({ mcId: MC1, shilingPts: 0 });
  });
});

describe('挑剔顾客、章鱼哥在当令的那一轮吃掉才攒（时令值改法 2026-10-13）', () => {
  // 全是挑剔顾客：新手街本街必点、点中机会按 1 道算、不过软上限；学会新手街的桑椹葡萄粥 1 品，1 星都满足、每桌吃 2 份
  const picky = {
    tuning: {
      rest: { atRateBase: 5, spRateBase: 5 },
      settlement: { pickyHitCount: 1, spSoftCapAt: 1 },
    },
  };
  // 全是普通顾客、每桌都吃特色菜
  const normal = {
    tuning: { rest: { atRateBase: 5, spRateBase: -5 }, settlement: { normalSpecialShare: 1 } },
  };
  async function withDish(o: {
    override?: object;
    mcId?: number;
    weather?: number;
    cover?: number;
    star?: number;
    per?: number | null;
  }) {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify(o.override ?? picky) })
      .execute();
    const ctx = await newRestaurant(t, {
      shardId,
      patch: { coin: 1000, oil: 100000, star_level: o.star ?? 1, table_num: 20 },
      cookbooks: { [cid('桑椹葡萄粥')]: 1 },
    });
    await setWeather(t, shardId, o.weather ?? RAIN);
    if (o.cover !== undefined)
      await t.db
        .updateTable('world_state')
        .set({
          cover_weather_id: o.cover,
          cover_until: new Date(t.clock.now.getTime() + 3_600_000),
          cover_goods: GOODS.compass,
        })
        .where('shard_id', '=', shardId)
        .execute();
    const c = await t.db
      .insertInto('mc_cook')
      .values({
        rest_id: ctx.restaurantId,
        shard_id: shardId,
        mc_id: o.mcId ?? MC1,
        level: config.requireMc(o.mcId ?? MC1).level,
        grade: 3,
        cook_num: 1,
        total_num: 1000,
        left_num: 1000,
        price: 50,
        shiling_per: o.per === undefined ? 0.75 : o.per,
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

  it('当令：挑剔顾客吃掉的份数 × 每份点数，整数入账，余额和本周获得一起加', async () => {
    const { ctx, cook, used } = await withDish({});
    expect(used).toBeGreaterThan(0);
    const want = Math.floor(used * 0.75 + 1e-9);
    expect(cook.shiling_acc).toBeCloseTo(used * 0.75);
    expect(cook.shiling_pts).toBe(want);
    expect(await balanceOf(ctx.restaurantId)).toMatchObject({ balance: want, week_gain: want });
  });

  it('普通顾客顺便吃的不算', async () => {
    const { ctx, used } = await withDish({ override: normal });
    expect(used).toBeGreaterThan(0);
    expect(await balanceOf(ctx.restaurantId)).toBeNull();
  });

  it('这一轮不当令不攒（下锅时当不当令都不管）', async () => {
    const { ctx, used } = await withDish({ mcId: MC3 });
    expect(used).toBeGreaterThan(0);
    expect(await balanceOf(ctx.restaurantId)).toBeNull();
  });

  it('不够 1 星不攒', async () => {
    const { ctx, used } = await withDish({ star: 0 });
    expect(used).toBeGreaterThan(0);
    expect(await balanceOf(ctx.restaurantId)).toBeNull();
  });

  it('道具盖着按盖的天气判：底下中雨、盖着暴雨，三道的菜当令，再加 25%', async () => {
    const { cook, used } = await withDish({ mcId: MC3, cover: STORM });
    expect(used).toBeGreaterThan(0);
    expect(cook.shiling_pts).toBe(Math.floor(used * 0.75 * 1.25 + 1e-9));
  });

  it('迁移 0077 之前下锅的批次（没有每份点数）按配置现算', async () => {
    const { cook, used } = await withDish({ per: null });
    const per = perPortion(
      T,
      config.tuning.mysterious,
      config.tuning.market,
      config.requireMc(MC1).foods.map((f) => config.requireFood(f)),
      3,
    );
    expect(used).toBeGreaterThan(0);
    expect(cook.shiling_acc).toBeCloseTo(used * per);
  });
});

describe('每日衰减（时令值改法 2026-10-13）', () => {
  it('余额超过 500 的店扣超出部分的 1%，记流水；本周获得不动；500 以内的不碰', async () => {
    const shardId = await createShard(t.db);
    const week = '2026-10-12';
    // 逐家建：并发建时店号先后和余额顺序对不上，按店号排出来的结果就乱了（CI 偶发失败）
    const shops: number[] = [];
    for (const balance of [499, 600, 1500]) {
      const ctx = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
      await t.db
        .insertInto('rest_shiling')
        .values({ rest_id: ctx.restaurantId, shard_id: shardId, balance, week, week_gain: 77 })
        .execute();
      shops.push(ctx.restaurantId);
    }
    const r = await decayShiling(t.game.deps, shardId, t.clock.now);
    expect(r).toEqual({ shops: 2, total: 11, failed: 0 });
    const rows = await t.db
      .selectFrom('rest_shiling')
      .select(['rest_id', 'balance', 'week_gain'])
      .where('rest_id', 'in', shops)
      .orderBy('rest_id')
      .execute();
    const byShop = new Map(rows.map((x) => [x.rest_id, [x.balance, x.week_gain]]));
    expect(shops.map((id) => byShop.get(id))).toEqual([
      [499, 77],
      [599, 77],
      [1490, 77],
    ]);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['rest_id', 'delta', 'source'])
      .where('rest_id', 'in', shops)
      .where('kind', '=', 'shiling')
      .orderBy('rest_id')
      .execute();
    expect(ledger.map((x) => [x.rest_id, x.delta, x.source])).toEqual([
      [shops[1], -1, 'shiling.decay'],
      [shops[2], -10, 'shiling.decay'],
    ]);
  });

  /** 一个区服建几家有时令值的店（逐家建，店号和余额同序） */
  async function shopsWith(balances: number[]): Promise<{ shardId: number; shops: number[] }> {
    const shardId = await createShard(t.db);
    const shops: number[] = [];
    for (const balance of balances) {
      const ctx = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
      await give(ctx, balance);
      shops.push(ctx.restaurantId);
    }
    return { shardId, shops };
  }

  it('按批衰减（性能整理 2026-10-31）：每家的余额、流水和逐家按 decayOf 算的一样', async () => {
    const floor = T.decay.floor;
    const balances = [0, floor - 1, floor, floor + 1, floor + 99, floor + 100, 1500, 12_345, 99_999];
    const { shardId, shops } = await shopsWith(balances);
    const cuts = balances.map((b) => decayOf(b, T.decay));
    const r = await decayShiling(t.game.deps, shardId, t.clock.now);
    expect(r).toEqual({
      shops: cuts.filter((c) => c > 0).length,
      total: cuts.reduce((a, b) => a + b, 0),
      failed: 0,
    });
    const rows = await t.db
      .selectFrom('rest_shiling')
      .select(['rest_id', 'balance'])
      .where('rest_id', 'in', shops)
      .execute();
    const byShop = new Map(rows.map((x) => [x.rest_id, x.balance]));
    expect(shops.map((id) => byShop.get(id))).toEqual(balances.map((b, i) => b - cuts[i]!));
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['rest_id', 'delta', 'source', 'item_id', 'ref_rest_id', 'created_at'])
      .where('rest_id', 'in', shops)
      .where('kind', '=', 'shiling')
      .orderBy('rest_id')
      .execute();
    expect(ledger.map((x) => [x.rest_id, Number(x.delta), x.source, x.item_id, x.ref_rest_id])).toEqual(
      shops.flatMap((id, i) => (cuts[i]! > 0 ? [[id, -cuts[i]!, 'shiling.decay', null, null]] : [])),
    );
    expect(ledger.every((x) => x.created_at.getTime() === t.clock.now.getTime())).toBe(true);
  });

  it('查询条数不随店数增长', async () => {
    const q = queryCounter();
    try {
      const deps = { ...t.game.deps, db: q.db };
      const few = await shopsWith([600, 1500, 3000]);
      const many = await shopsWith([600, 1500, 3000, 4000, 5000, 6000, 7000, 8000]);
      const a = await q.count(() => decayShiling(deps, few.shardId, t.clock.now));
      const b = await q.count(() => decayShiling(deps, many.shardId, t.clock.now));
      expect(a.result.shops).toBe(3);
      expect(b.result.shops).toBe(8);
      expect(b.n).toBe(a.n);
      expect(a.n).toBeLessThanOrEqual(5);
    } finally {
      await q.db.destroy();
    }
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

  it('珍稀残卷 1500：6 级的菜；钱不够报 NOT_ENOUGH', async () => {
    const ctx = await shop(1600);
    await t.game.shiling.buy(ctx, { item: 'rare', mcId: MC6 });
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
    expect(v.table.at(-1)).toEqual({ ids: [6, 7, 18, 24, 27], roads: [1, 2, 3, 4, 5, 6] });
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
  const dish = { id: 0, shiling_acc: 0, shiling_pts: 0 };

  it('本周获得跨过 200 发一次 shiling.week200；跨周从 0 算，余额不清', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    expect((await run(ctx, (o) => gainShiling(o, 150))).data).toEqual({ before: 0, after: 150 });
    await run(ctx, (o) => accrueShiling(o, dish, 30, 1, 0));
    expect(await eventCount(t, ctx.restaurantId, 'shiling.week200')).toBe(0);
    await run(ctx, (o) => accrueShiling(o, dish, 30, 1, 0));
    expect(await eventCount(t, ctx.restaurantId, 'shiling.week200')).toBe(1);
    await run(ctx, (o) => accrueShiling(o, dish, 30, 1, 0));
    expect(await eventCount(t, ctx.restaurantId, 'shiling.week200')).toBe(1);
    const was = t.clock.now;
    t.clock.set(new Date(was.getTime() + 7 * 86_400_000));
    try {
      expect((await run(ctx, (o) => gainShiling(o, 5))).data).toEqual({ before: 0, after: 5 });
    } finally {
      t.clock.set(was);
    }
    expect((await balanceOf(ctx.restaurantId))?.balance).toBe(150 + 90 + 5); // 周榜（PR③）按周另记，跨周也留着
    const weeks = await t.db
      .selectFrom('shiling_week')
      .select(['week', 'gain'])
      .where('rest_id', '=', ctx.restaurantId)
      .orderBy('week')
      .execute();
    expect(weeks).toEqual([
      { week: '2026-10-12', gain: 240 },
      { week: '2026-10-19', gain: 5 },
    ]);
  });
});
