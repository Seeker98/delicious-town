import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  foodNum,
  newPair,
  newRestaurant,
  restRow,
  type TestGame,
} from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数 0.9：偷 2 个、边牧不触发 */
let hi: TestGame;
/** 随机数 0：偷 1 个、边牧必触发、选第一个食材 */
let lo: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  hi = await createTestGame({ rng: () => sequenceRng([0.9]) });
  lo = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await hi.close();
  await lo.close();
});

/** 在 restId 的 1 号地种一株大米（默认收获期、剩 20 个） */
async function cropOf(g: TestGame, restId: number, shardId: number, patch: Record<string, unknown> = {}) {
  const land = await g.db
    .insertInto('yard_land')
    .values({ rest_id: restId, no: 1 })
    .returning('id')
    .executeTakeFirstOrThrow();
  const p = await g.db
    .insertInto('yard_plant')
    .values({
      rest_id: restId,
      shard_id: shardId,
      land_id: land.id,
      seed_id: 1,
      foods_id: 101,
      stage: 4,
      stage_at: g.clock.now,
      infancy: 24,
      maturity: 36,
      autumn: 60,
      harvest: 1440,
      harvest_num: 20,
      harvest_max: 20,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return p.id;
}
/** 我（a，声望 5）和好友 b；b 的 1 号地上有作物 */
async function friends(g: TestGame, patch: Record<string, unknown> = {}) {
  const [a, b] = await newPair(g, { patch: { renown: 5 } });
  await befriend(g, a.restaurantId, b.restaurantId);
  const plantId = await cropOf(g, b.restaurantId, b.shardId, patch);
  return { a, b, plantId };
}
const plantOf = (g: TestGame, id: number) =>
  g.db.selectFrom('yard_plant').selectAll().where('id', '=', id).executeTakeFirst();
const logsOf = (g: TestGame, restId: number) =>
  g.db
    .selectFrom('rest_log')
    .select(['type', 'params'])
    .where('rest_id', '=', restId)
    .orderBy('id')
    .execute();
async function basketNum(g: TestGame, restId: number, foodsId: number) {
  const r = await g.db
    .selectFrom('yard_basket')
    .select('num')
    .where('rest_id', '=', restId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

describe('帮好友照料（规格书 08 §8.3）', () => {
  it('除虫、除草、浇水：系数不 ×2、不加对方土地经验；对方动态记 yard.helped', async () => {
    const { a, b, plantId } = await friends(t, {
      stage: 1,
      stage_at: new Date(t.clock.now.getTime() - 30 * 60_000),
      worm: 1,
      grass: 1,
    });
    await t.game.yard.deworm(a, { plantId });
    await t.game.yard.weed(a, { plantId });
    expect((await t.game.yard.water(a, { plantId })).data).toEqual({ stage: 2 });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 2, worm: 0, grass: 0 });
    // 等级 1、好友的地：系数 3。三次各 3 银币、3 经验、1 体力
    expect(await restRow(t, a.restaurantId)).toMatchObject({ strength: 97, coin: 3 * 3, exp: 3 * 3 });
    const land = await t.db
      .selectFrom('yard_land')
      .selectAll()
      .where('rest_id', '=', b.restaurantId)
      .executeTakeFirstOrThrow();
    expect(land.exp).toBe(0);
    const logs = (await logsOf(t, b.restaurantId)).filter((l) => l.type === 'yard.helped');
    expect(logs.map((l) => (l.params as { what: string }).what)).toEqual(['deworm', 'weed', 'water']);
    expect(logs[0]!.params).toMatchObject({ by: a.restaurantId, foodsId: 101 });
  });
});

describe('偷菜（规格书 08 §8.3，裁定 4、10）', () => {
  it('扣 1 声望，偷 1~2 个进我的菜篮，对方剩余减少；每人每株一次；对方动态 yard.stolen', async () => {
    const { a, b, plantId } = await friends(hi);
    const r = await hi.game.yard.reap(a, { plantId });
    expect(r.data).toEqual({ foodsId: 101, num: 2, stolen: true, punished: null });
    expect(await basketNum(hi, a.restaurantId, 101)).toBe(2);
    expect((await plantOf(hi, plantId))!.harvest_num).toBe(18);
    // 系数 3：银币 ⌊3×2⌋，经验 ⌊3×3⌋ + 食材等级 1
    expect(await restRow(hi, a.restaurantId)).toMatchObject({ renown: 4, strength: 99, coin: 6, exp: 10 });
    await expect(hi.game.yard.reap(a, { plantId })).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'steal' },
    });
    const logs = await logsOf(hi, b.restaurantId);
    expect(logs.find((l) => l.type === 'yard.stolen')!.params).toMatchObject({
      by: a.restaurantId,
      foodsId: 101,
      num: 2,
      punished: null,
    });
    const counter = await hi.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', a.restaurantId)
      .where('key', '=', 'yard.steal')
      .executeTakeFirst();
    expect(counter?.count).toBe(1);
  });

  it('门槛：剩余 < 种子原产量 × 0.7 报 steal_left（按原产量 20，不含土地加成）；声望不够报 renown；7 级只偷 1', async () => {
    const low = await friends(hi, { harvest_num: 13, harvest_max: 30 });
    await expect(hi.game.yard.reap(low.a, { plantId: low.plantId })).rejects.toMatchObject({
      params: { reason: 'steal_left' },
    });
    const ok = await friends(hi, { harvest_num: 14, harvest_max: 30 });
    await hi.game.yard.reap(ok.a, { plantId: ok.plantId });
    const poor = await friends(hi);
    await hi.db.updateTable('restaurant').set({ renown: 0 }).where('id', '=', poor.a.restaurantId).execute();
    await expect(hi.game.yard.reap(poor.a, { plantId: poor.plantId })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'renown', need: 1 },
    });
    const rare = await friends(hi, { seed_id: 95, foods_id: 460, harvest_num: 1, harvest_max: 1 });
    expect((await hi.game.yard.reap(rare.a, { plantId: rare.plantId })).data.num).toBe(1);
  });

  it('对方有边牧：随机数 0 → 从我的橱柜拿 1 个食材给对方（锁定的不拿）', async () => {
    const { a, b, plantId } = await friends(lo);
    await grantGoods(lo.db, config, b.restaurantId, 339, 1, lo.clock.now);
    await lo.db
      .insertInto('cupboard_food')
      .values([
        { rest_id: a.restaurantId, foods_id: 102, num: 3, locked: true },
        { rest_id: a.restaurantId, foods_id: 103, num: 2, locked: false },
      ])
      .execute();
    const r = await lo.game.yard.reap(a, { plantId });
    expect(r.data).toEqual({ foodsId: 101, num: 1, stolen: true, punished: 103 });
    expect((await foodNum(lo, a.restaurantId, 103)).num).toBe(1);
    expect((await foodNum(lo, b.restaurantId, 103)).num).toBe(1);
    expect((await foodNum(lo, a.restaurantId, 102)).num).toBe(3);
  });

  it('非好友报 NOT_FRIEND；不在收获期报 not_ripe；主人收获后再偷报 no_plant，什么都不扣（Review Focus 2）', async () => {
    const { a, b, plantId } = await friends(t);
    const stranger = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { renown: 5 } });
    await expect(t.game.yard.reap(stranger, { plantId })).rejects.toMatchObject({ code: 'NOT_FRIEND' });
    await t.db.updateTable('yard_plant').set({ stage: 3 }).where('id', '=', plantId).execute();
    await expect(t.game.yard.reap(a, { plantId })).rejects.toMatchObject({ params: { reason: 'not_ripe' } });
    await t.db.updateTable('yard_plant').set({ stage: 4 }).where('id', '=', plantId).execute();
    await t.game.yard.reap(b, { plantId });
    await expect(t.game.yard.reap(a, { plantId })).rejects.toMatchObject({ params: { reason: 'no_plant' } });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ renown: 5, strength: 100 });
  });
});

describe('好友菜园视图（设计文档 §5）', () => {
  it('只读字段、我偷过没有、能不能偷；非好友报 NOT_FRIEND', async () => {
    const { a, b, plantId } = await friends(hi);
    const before = await hi.game.yard.friend(a, b.restaurantId);
    expect(before).toMatchObject({ restId: b.restaurantId, strength: 100, renown: 5 });
    expect(before.lands).toHaveLength(1);
    expect(before.lands[0]).toMatchObject({
      no: 1,
      level: 1,
      plant: { id: plantId, stage: 4, harvestNum: 20, baseNum: 20, stolen: false, stealBlock: null },
    });
    await hi.game.yard.reap(a, { plantId });
    const after = await hi.game.yard.friend(a, b.restaurantId);
    expect(after.lands[0]!.plant).toMatchObject({ stolen: true, stealBlock: 'stolen', harvestNum: 18 });
    const stranger = await newRestaurant(hi, { shardId: a.shardId, verified: true });
    await expect(hi.game.yard.friend(stranger, b.restaurantId)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
  });
});
