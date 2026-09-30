import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { roundOf } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  newPair,
  newRestaurant,
  restRow,
  setTables,
  tablesOf,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { settleShardRound } from '../settlement/runner';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const dine = () => t.game.social.dine;
const MIN = 60_000;

/** 白食者 a（有头像、1000 银币）和店主 b，互为好友 */
async function setup(host: NewRestaurantOptions = {}) {
  t.clock.set(new Date());
  const [a, b] = await newPair(t, { patch: { avatar: 1, coin: 1000 } }, host);
  await befriend(t, a.restaurantId, b.restaurantId);
  return [a, b] as const;
}
const dineRow = (id: number) =>
  t.db.selectFrom('dine_dash').selectAll().where('diner_rest_id', '=', id).executeTakeFirst();
/** 把白食桌上的累计值改成给定值 */
async function setAcc(host: number, coin: number, exp: number) {
  const tables = await tablesOf(t, host);
  await setTables(
    t,
    host,
    tables.map((x) => (x.freeloader ? { ...x, freeloader: { ...x.freeloader, coin, exp } } : x)),
  );
}

describe('白食开始（规格书 13 §13.3）', () => {
  it('空桌变白食桌；记下白食者；店主收到动态', async () => {
    const [a, b] = await setup();
    const r = await dine().start(a, { restId: b.restaurantId, tableNo: 2 });
    expect(r.data).toMatchObject({ hostRestId: b.restaurantId, tableNo: 2 });
    const table = (await tablesOf(t, b.restaurantId)).find((x) => x.no === 2)!;
    expect(table).toMatchObject({ customer: 9, freeloader: { restId: a.restaurantId, coin: 0, exp: 0 } });
    expect(await dineRow(a.restaurantId)).toMatchObject({ host_rest_id: b.restaurantId, table_no: 2 });
    expect(await dine().current(a)).toMatchObject({ hostRestId: b.restaurantId, tableNo: 2, canEnd: false });
    const feed = await t.game.social.reads.feed(b, { limit: 30 });
    expect(feed.items[0]).toMatchObject({ type: 'dine.start', params: { by: a.restaurantId } });
  });

  it('没设置头像、已在白食、对方停业、桌子有人、白食位满时拒绝；蟹老板不限人数', async () => {
    const [a, b] = await setup();
    await t.db.updateTable('restaurant').set({ avatar: null }).where('id', '=', a.restaurantId).execute();
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'avatar' },
    });
    await t.db.updateTable('restaurant').set({ avatar: 1 }).where('id', '=', a.restaurantId).execute();
    await setTables(t, b.restaurantId, [
      { no: 1, floor: 1, customer: 1 },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
    ]);
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'table_occupied' },
    });
    await dine().start(a, { restId: b.restaurantId, tableNo: 2 });
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 3 })).rejects.toMatchObject({
      params: { reason: 'already_dining' },
    });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { avatar: 1 } });
    await befriend(t, c.restaurantId, b.restaurantId);
    await expect(dine().start(c, { restId: b.restaurantId, tableNo: 3 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'seats', max: 1 },
    });
    const [d, e] = await setup({ patch: { state: 2 } });
    await expect(dine().start(d, { restId: e.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'target_closed' },
    });
  });

  it('两个人同时抢同一张空桌：只有一个成功（Review Focus 1）', async () => {
    const [a, b] = await setup({ patch: { star_level: 2 } });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { avatar: 1 } });
    await befriend(t, c.restaurantId, b.restaurantId);
    const r = await Promise.allSettled([
      dine().start(a, { restId: b.restaurantId, tableNo: 1 }),
      dine().start(c, { restId: b.restaurantId, tableNo: 1 }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ params: { reason: 'table_occupied' } });
    expect((await tablesOf(t, b.restaurantId)).filter((x) => x.customer === 9)).toHaveLength(1);
  });

  it('白食中结算照常跑：白食桌保留并累计（Review Focus 3）', async () => {
    const [a, b] = await setup({ patch: { oil: 1000, coin: 1000 } });
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    t.clock.advance(5 * MIN);
    await settleShardRound(t.game.deps, t.game.world, b.shardId, roundOf(t.clock.now), t.clock.now);
    const table = (await tablesOf(t, b.restaurantId)).find((x) => x.no === 1)!;
    expect(table.customer).toBe(9);
    expect(table.freeloader!.exp).toBeGreaterThan(0);
    expect(table.freeloader!.coin).toBeGreaterThan(0);
  });
});

describe('白食结束、请走', () => {
  it('不满 30 分钟不能结束；结束后拿累计银币经验和体力，今天不能再白食', async () => {
    const [a, b] = await setup();
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    await expect(dine().end(a)).rejects.toMatchObject({ params: { reason: 'dine_minutes', need: 30 } });
    await setAcc(b.restaurantId, 100, 50);
    t.clock.advance(121 * MIN);
    const r = await dine().end(a);
    expect(r.data).toEqual({ coin: 100, exp: 50, strength: 40 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 1100, exp: 50, strength: 140 });
    expect(await dineRow(a.restaurantId)).toBeUndefined();
    expect((await tablesOf(t, b.restaurantId))[0]).toEqual({ no: 1, floor: 1, customer: 0 });
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 2 })).rejects.toMatchObject({
      params: { what: 'dine' },
    });
  });

  it('激动的心：经验 ×3、体力 ×1.5', async () => {
    const [a, b] = await setup();
    await grantGoods(t.db, config, a.restaurantId, GOODS.excitedHeart, 1, t.clock.now);
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    await setAcc(b.restaurantId, 0, 50);
    t.clock.advance(121 * MIN);
    expect((await dine().end(a)).data).toEqual({ coin: 0, exp: 150, strength: 60 });
  });

  it('请走：不满 30 分钟不行；有神灯不行；店主拿 2 倍，白食者赔银币、不得经验', async () => {
    const [a, b] = await setup({ patch: { coin: 0 } });
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    await expect(dine().expel(b, { tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'dine_minutes' },
    });
    await setAcc(b.restaurantId, 100, 50);
    t.clock.advance(61 * MIN);
    const r = await dine().expel(b, { tableNo: 1 });
    expect(r.data).toEqual({ hostCoin: 200, dinerLoss: 100 });
    expect((await restRow(t, b.restaurantId)).coin).toBe(200);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 900, exp: 0, strength: 120 });
    expect(await dineRow(a.restaurantId)).toBeUndefined();
    const feed = await t.game.social.reads.feed(a, { limit: 30 });
    expect(feed.items[0]).toMatchObject({ type: 'dine.expelled', params: { by: b.restaurantId, coin: 100 } });

    const [c, e] = await setup();
    await grantGoods(t.db, config, c.restaurantId, GOODS.magicLamp, 1, t.clock.now);
    await dine().start(c, { restId: e.restaurantId, tableNo: 1 });
    t.clock.advance(31 * MIN);
    await expect(dine().expel(e, { tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'diner_protected' },
    });
  });

  it('白食中删了好友、店主被封：白食者仍能结束；白食者被封：店主仍能请走（Review Focus 4）', async () => {
    const [a, b] = await setup();
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    t.clock.advance(31 * MIN);
    await t.game.social.relations.remove(a, b.restaurantId);
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', b.accountId).execute();
    await expect(dine().end(a)).resolves.toMatchObject({ data: { coin: 0 } });

    const [c, e] = await setup();
    await dine().start(c, { restId: e.restaurantId, tableNo: 1 });
    t.clock.advance(31 * MIN);
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', c.accountId).execute();
    await expect(dine().expel(e, { tableNo: 1 })).resolves.toMatchObject({ data: { hostCoin: 0 } });
  });

  it('没在白食时结束、请走一张普通桌都报 not_dining', async () => {
    const [a, b] = await setup();
    await expect(dine().end(a)).rejects.toMatchObject({ params: { reason: 'not_dining' } });
    await expect(dine().expel(b, { tableNo: 1 })).rejects.toMatchObject({ params: { reason: 'not_dining' } });
  });
});

describe('区服关闭 friend 后的收尾（最终审查 Important 4）', () => {
  const disable = async (shardId: number) => {
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { friend: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
  };

  it('进行中的白食仍能结束、请走；自己店的蟑螂仍能消灭；新的互动被拒', async () => {
    const [a, b] = await setup();
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    const [c, e] = await setup();
    await dine().start(c, { restId: e.restaurantId, tableNo: 1 });
    await setTables(t, a.restaurantId, [{ no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } }]);
    t.clock.advance(31 * MIN);
    await disable(a.shardId);
    await disable(c.shardId);
    await expect(dine().end(a)).resolves.toMatchObject({ data: { coin: 0 } });
    await expect(dine().expel(e, { tableNo: 1 })).resolves.toMatchObject({ data: { hostCoin: 0 } });
    await expect(t.game.social.roach.kill(a, { restId: a.restaurantId, tableNo: 1 })).resolves.toMatchObject({
      data: { strength: 1 },
    });
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 2 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
