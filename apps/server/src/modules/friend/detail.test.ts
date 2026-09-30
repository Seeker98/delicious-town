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
});
