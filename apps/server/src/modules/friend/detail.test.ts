import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  newPair,
  newRestaurant,
  setTables,
  type TestGame,
} from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const reads = () => t.game.social.reads;

describe('访问好友餐厅（规格书 13 §13.2）', () => {
  it('公开信息：不含银币等资产；只显示展示中的图标、有效勋章；白食者带名字', async () => {
    const [a, b] = await newPair(t, {}, { patch: { notice: '你好', door: 3, avatar: 2, coin: 999 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    await t.db
      .insertInto('rest_icon')
      .values([
        { rest_id: b.restaurantId, icon_key: 'founder', shown: true },
        { rest_id: b.restaurantId, icon_key: 'helper', shown: false },
      ])
      .execute();
    await grantGoods(t.db, config, b.restaurantId, GOODS.magicLamp, 1, new Date());
    await grantGoods(t.db, config, b.restaurantId, GOODS.bangle, 1, new Date(Date.now() - 2 * 3600_000));
    await setTables(t, b.restaurantId, [
      {
        no: 1,
        floor: 1,
        customer: 9,
        freeloader: { restId: a.restaurantId, level: 1, since: '2026-09-30T00:00:00.000Z', coin: 0, exp: 0 },
      },
    ]);
    const r = await reads().detail(a, b.restaurantId);
    expect(r).toMatchObject({
      id: b.restaurantId,
      notice: '你好',
      door: 3,
      avatar: 2,
      isFriend: true,
      icons: [{ key: 'founder', title: '开服元老' }],
      honors: [GOODS.magicLamp],
      thumbedToday: false,
    });
    expect(r).not.toHaveProperty('coin');
    const name = (
      await t.db
        .selectFrom('restaurant')
        .select('name')
        .where('id', '=', a.restaurantId)
        .executeTakeFirstOrThrow()
    ).name;
    expect(r.tables[0]).toMatchObject({
      customer: 9,
      freeloaderRestId: a.restaurantId,
      freeloaderName: name,
    });
  });

  it('非好友也能看，isFriend=false；别的区服的店看不到', async () => {
    const [a, b] = await newPair(t);
    expect((await reads().detail(a, b.restaurantId)).isFriend).toBe(false);
    const other = await newRestaurant(t);
    await expect(reads().detail(a, other.restaurantId)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
    });
  });
});

describe('好友动态（规格书 13 §13.8）', () => {
  it('只含互动类型、近 3 天', async () => {
    const a = await newRestaurant(t);
    const now = Date.now();
    await t.db
      .insertInto('rest_log')
      .values([
        {
          rest_id: a.restaurantId,
          type: 'thumb',
          params: JSON.stringify({ by: 1 }),
          created_at: new Date(now),
        },
        { rest_id: a.restaurantId, type: 'level.up', params: '{}', created_at: new Date(now) },
        {
          rest_id: a.restaurantId,
          type: 'friend.flip',
          params: '{}',
          created_at: new Date(now - 4 * 86_400_000),
        },
      ])
      .execute();
    const page = await reads().feed(a, { limit: 30 });
    expect(page.items.map((x) => x.type)).toEqual(['thumb']);
  });

  it('问题记录 553 补的类型都在动态里；琐碎的（老鼠没偷到、停业、分红）不在', async () => {
    const a = await newRestaurant(t);
    const added = [
      'takeaway.hired',
      'dine.left',
      'forum.replied',
      'acquire.taken',
      'acquire.freed',
      'acquire.lost',
      'mouse.steal',
      'market.share',
      'fridge.drop',
    ];
    const left = ['mouse.nothing', 'mouse.escape', 'rest.closed', 'acquire.dividend'];
    const at = new Date();
    await t.db
      .insertInto('rest_log')
      .values(
        [...added, ...left].map((type) => ({ rest_id: a.restaurantId, type, params: '{}', created_at: at })),
      )
      .execute();
    const page = await reads().feed(a, { limit: 30 });
    expect(page.items.map((x) => x.type).sort()).toEqual([...added].sort());
  });
});

describe('首页餐厅动态（问题记录 553）', () => {
  it('概览带最近 3 条动态：只含动态类型、近 3 天，新的在前', async () => {
    const a = await newRestaurant(t);
    const now = t.clock.now.getTime();
    const at = (min: number) => new Date(now - min * 60_000);
    await t.db
      .insertInto('rest_log')
      .values([
        { rest_id: a.restaurantId, type: 'thumb', params: '{"n":1}', created_at: at(50) },
        { rest_id: a.restaurantId, type: 'thumb', params: '{"n":2}', created_at: at(40) },
        { rest_id: a.restaurantId, type: 'mouse.steal', params: '{"n":3}', created_at: at(30) },
        { rest_id: a.restaurantId, type: 'level.up', params: '{}', created_at: at(20) },
        { rest_id: a.restaurantId, type: 'dine.left', params: '{"n":4}', created_at: at(10) },
      ])
      .execute();
    const o = await t.game.restaurant.overview(a.restaurantId);
    expect(o.feed.map((x) => x.params.n)).toEqual([4, 3, 2]);
    const b = await newRestaurant(t);
    await t.db
      .insertInto('rest_log')
      .values({ rest_id: b.restaurantId, type: 'thumb', params: '{}', created_at: at(4 * 24 * 60) })
      .execute();
    expect((await t.game.restaurant.overview(b.restaurantId)).feed).toEqual([]);
  });
});
