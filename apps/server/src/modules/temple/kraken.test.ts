import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPool, gameDay, gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { krakenTarget } from './rules';
import { GOODS } from '@dt/config';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0 */
let win: TestGame;
const day = gameDay(new Date());
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  for (const g of [t, win]) g.clock.set(gameTime(day, 12));
});
afterAll(async () => {
  await t.close();
  await win.close();
});

const pool = buildPool(
  config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= 1 && m.level <= 5),
  (m) => m.odds,
);
async function serve(g: TestGame, ctx: RestCtx, mcId: number, left: number, price: number, grade = 3) {
  const mc = config.requireMc(mcId);
  const c = await g.db
    .insertInto('mc_cook')
    .values({
      rest_id: ctx.restaurantId,
      shard_id: ctx.shardId,
      mc_id: mcId,
      level: mc.level,
      grade,
      cook_num: 1,
      total_num: left,
      left_num: left,
      price,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await g.db.updateTable('restaurant').set({ mc_cook_id: c.id }).where('id', '=', ctx.restaurantId).execute();
  return c.id;
}
const cookLeft = async (g: TestGame, id: number) =>
  await g.db
    .selectFrom('mc_cook')
    .select(['left_num', 'ended_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
const seedsOf = async (g: TestGame, restId: number) =>
  (await g.db.selectFrom('rest_seed').select('num').where('rest_id', '=', restId).execute()).reduce(
    (n, r) => n + r.num,
    0,
  );

describe('克拉肯（规格书 09 §9.5）', () => {
  it('喂它想吃的菜：好感度、种子进库存、扣份数不结束批次；每天一次', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 } });
    const target = krakenTarget(pool, ctx.shardId, day);
    const cookId = await serve(win, ctx, target.id, 20, 50);
    const r = await win.game.temple.feedKraken(ctx, { num: 10 });
    expect(r.data).toMatchObject({ relation: 'same', krabCoin: 0, tentacle: false, punish: null });
    expect(r.data.favor).toBeGreaterThanOrEqual(1);
    expect(await seedsOf(win, ctx.restaurantId)).toBe(r.data.seeds.reduce((n, s) => n + s.num, 0));
    expect(await cookLeft(win, cookId)).toMatchObject({ left_num: 10, ended_at: null });
    await expect(win.game.temple.feedKraken(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'fed_today' },
    });
    const c = await win.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'kraken.feed')
      .executeTakeFirst();
    expect(c?.count).toBe(1);
  });

  it('不在投喂时段报 not_feed_time；没有在售报 no_cooking；份数等于剩余报 portions，什么都不变（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    await expect(t.game.temple.feedKraken(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'no_cooking' },
    });
    const cookId = await serve(t, ctx, 1, 5, 50);
    await expect(t.game.temple.feedKraken(ctx, { num: 5 })).rejects.toMatchObject({
      params: { reason: 'portions' },
    });
    expect((await cookLeft(t, cookId)).left_num).toBe(5);
    expect(
      await t.db.selectFrom('kraken_feed').selectAll().where('rest_id', '=', ctx.restaurantId).execute(),
    ).toEqual([]);
    t.clock.set(gameTime(day, 15));
    await expect(t.game.temple.feedKraken(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_feed_time' },
    });
    t.clock.set(gameTime(day, 12));
  });

  it('负好感度：先扣这道菜的试炼经验', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 } });
    const target = krakenTarget(pool, ctx.shardId, day);
    const other = config.bundle.mysteriousCookbooks.find((m) => m.level <= 5 && m.road !== target.road)!;
    await win.db
      .insertInto('rest_mc')
      .values({ rest_id: ctx.restaurantId, mc_id: other.id, way: 1, trial_exp: 5 })
      .execute();
    await serve(win, ctx, other.id, 200, 100, 1);
    const r = await win.game.temple.feedKraken(ctx, { num: 100 });
    expect(r.data).toMatchObject({ relation: 'other', favor: -1, punish: { kind: 'exp', value: 1 } });
    const m = await win.db
      .selectFrom('rest_mc')
      .select('trial_exp')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(m.trial_exp).toBe(4);
  });

  it('负好感度且没有试炼加成：25% 遗忘（随机数 0 必中）；这道菜已不在时跳过惩罚（Review Focus 4）', async () => {
    const a = await newRestaurant(win, { patch: { star_level: 1 } });
    const target = krakenTarget(pool, a.shardId, day);
    const other = config.bundle.mysteriousCookbooks.find((m) => m.level <= 5 && m.road !== target.road)!;
    await win.db.insertInto('rest_mc').values({ rest_id: a.restaurantId, mc_id: other.id, way: 1 }).execute();
    await serve(win, a, other.id, 200, 100, 1);
    const r = await win.game.temple.feedKraken(a, { num: 100 });
    expect(r.data.punish).toEqual({ kind: 'forget', value: 0 });
    expect(
      await win.db.selectFrom('rest_mc').selectAll().where('rest_id', '=', a.restaurantId).execute(),
    ).toEqual([]);
    const logs = await win.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', a.restaurantId)
      .execute();
    expect(logs.map((l) => l.type)).toContain('kraken.forget');

    const b = await newRestaurant(win, { patch: { star_level: 1 } });
    const target2 = krakenTarget(pool, b.shardId, day);
    const other2 = config.bundle.mysteriousCookbooks.find((m) => m.level <= 5 && m.road !== target2.road)!;
    await serve(win, b, other2.id, 200, 100, 1);
    const r2 = await win.game.temple.feedKraken(b, { num: 100 });
    expect(r2.data.punish).toBeNull();
  });
});

describe('触手商店（规格书 09 §9.5）', () => {
  it('当天固定 6 格；首次刷新免费、之后每次 1 条触手；兑换扣等级数的触手得残卷；同格不能换两次', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.tentacle]: 20 } });
    const s1 = await t.game.temple.tentacleShop(ctx);
    expect(s1.data.slots).toHaveLength(6);
    expect(s1.data).toMatchObject({ refreshes: 0, refreshCost: 0, tentacles: 20 });
    expect((await t.game.temple.tentacleShop(ctx)).data.slots).toEqual(s1.data.slots);
    await t.game.temple.refreshTentacle(ctx);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.tentacle)).toBe(20);
    const s3 = await t.game.temple.refreshTentacle(ctx);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.tentacle)).toBe(19);
    expect(s3.data).toMatchObject({ refreshes: 2, refreshCost: 1 });
    const mc = config.requireMc(s3.data.slots[0]!.mcId);
    const r = await t.game.temple.exchangeTentacle(ctx, { slot: 0 });
    expect(r.data.slots[0]!.bought).toBe(true);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.tentacle)).toBe(19 - mc.level);
    const rem = await t.db
      .selectFrom('mc_remnant')
      .select('num')
      .where('rest_id', '=', ctx.restaurantId)
      .where('mc_id', '=', mc.id)
      .executeTakeFirst();
    expect(rem?.num).toBe(1);
    await expect(t.game.temple.exchangeTentacle(ctx, { slot: 0 })).rejects.toMatchObject({
      params: { reason: 'slot_bought' },
    });
    await expect(t.game.temple.exchangeTentacle(ctx, { slot: 9 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'bad_slot' },
    });
  });

  it('不含 id 249', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.tentacle]: 50 } });
    for (let i = 0; i < 5; i++) {
      const s = await t.game.temple.refreshTentacle(ctx);
      expect(s.data.slots.some((x) => x.mcId === 249)).toBe(false);
    }
  });
});
