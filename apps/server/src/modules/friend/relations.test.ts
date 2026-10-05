import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { befriend, createTestGame, newPair, newRestaurant, type TestGame } from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { flipHostKey, killHostKey } from '../interact/rules';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const rel = () => t.game.social.relations;
const reads = () => t.game.social.reads;
const isFriendRow = async (a: number, b: number) =>
  (await t.db
    .selectFrom('friend')
    .select('rest_id')
    .where('rest_id', '=', a)
    .where('friend_id', '=', b)
    .executeTakeFirst()) !== undefined;

describe('好友关系（规格书 13 §13.1）', () => {
  it('申请 → 对方同意 → 双向好友；对方收到动态', async () => {
    const [a, b] = await newPair(t);
    expect(await rel().apply(a, b.restaurantId)).toEqual({ status: 'requested' });
    expect((await reads().requests(b)).map((r) => r.id)).toEqual([a.restaurantId]);
    expect(await rel().respond(b, a.restaurantId, true)).toEqual({ status: 'friends' });
    expect(await isFriendRow(a.restaurantId, b.restaurantId)).toBe(true);
    expect(await isFriendRow(b.restaurantId, a.restaurantId)).toBe(true);
    expect(await reads().requests(b)).toEqual([]);
    const log = await t.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'friend.accept')
      .execute();
    expect(log).toHaveLength(1);
  });

  it('对方已经向我申请时，我申请直接成为好友', async () => {
    const [a, b] = await newPair(t);
    await rel().apply(a, b.restaurantId);
    expect(await rel().apply(b, a.restaurantId)).toEqual({ status: 'friends' });
    expect(await isFriendRow(a.restaurantId, b.restaurantId)).toBe(true);
  });

  it('两人同时互相申请只产生一对好友', async () => {
    const [a, b] = await newPair(t);
    const r = await Promise.all([rel().apply(a, b.restaurantId), rel().apply(b, a.restaurantId)]);
    expect(r.map((x) => x.status).sort()).toEqual(['friends', 'requested']);
    const rows = await t.db
      .selectFrom('friend')
      .select('rest_id')
      .where('rest_id', 'in', [a.restaurantId, b.restaurantId])
      .execute();
    expect(rows).toHaveLength(2);
  });

  it('拒绝后申请消失；删除好友后双方都不是好友', async () => {
    const [a, b] = await newPair(t);
    await rel().apply(a, b.restaurantId);
    expect(await rel().respond(b, a.restaurantId, false)).toEqual({ status: 'rejected' });
    expect(await reads().requests(b)).toEqual([]);
    await befriend(t, a.restaurantId, b.restaurantId);
    await rel().remove(a, b.restaurantId);
    expect(await isFriendRow(b.restaurantId, a.restaurantId)).toBe(false);
    await expect(rel().remove(a, b.restaurantId)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
  });

  it('已是好友、对自己、对方未验证邮箱、没有申请时报错', async () => {
    const [a, b] = await newPair(t);
    await befriend(t, a.restaurantId, b.restaurantId);
    await expect(rel().apply(a, b.restaurantId)).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'friend' },
    });
    await expect(rel().apply(a, a.restaurantId)).rejects.toMatchObject({ params: { reason: 'target_self' } });
    const c = await newRestaurant(t, { shardId: a.shardId });
    await expect(rel().apply(a, c.restaurantId)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      params: { who: 'target' },
    });
    await expect(rel().respond(a, c.restaurantId, true)).rejects.toMatchObject({
      params: { reason: 'no_request' },
    });
  });

  it('好友上限（不含蟹老板）', async () => {
    const [a, b] = await newPair(t);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ tuning: { friend: { maxFriends: 1 } } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await befriend(t, a.restaurantId, b.restaurantId);
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await expect(rel().apply(a, c.restaurantId)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'friends', max: 1 },
    });
  });
});

describe('好友列表和搜索', () => {
  it('列表带蟑螂数、白食空位、可翻橱位；按等级排序', async () => {
    const [a, b] = await newPair(t, {}, { patch: { level: 20, star_level: 1 } });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { level: 5 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    await befriend(t, a.restaurantId, c.restaurantId);
    await t.db
      .updateTable('restaurant_tables')
      .set({
        tables: JSON.stringify([
          { no: 1, floor: 1, customer: 3, roach: { by: null, at: '2026-09-30T00:00:00Z' } },
          { no: 2, floor: 1, customer: 1 },
        ]),
      })
      .where('rest_id', '=', b.restaurantId)
      .execute();
    await t.db
      .insertInto('cupboard_flip')
      .values({
        host_rest_id: b.restaurantId,
        slot_no: 1,
        by_rest_id: a.restaurantId,
        cool_until: new Date(Date.now() + 3600_000),
      })
      .execute();
    const list = await reads().list(a, 'level');
    expect(list.count).toBe(2);
    expect(list.items.map((x) => x.id)).toEqual([b.restaurantId, c.restaurantId]);
    // 空闲格 9 和 5，但每天在同一家店最多翻 3 格（问题记录 374）
    expect(list.items[0]).toMatchObject({ roaches: 1, dineSeat: false, flipReady: 3 });
    expect(list.items[1]).toMatchObject({ roaches: 0, dineSeat: true, flipReady: 3 });
  });

  it('可翻橱数扣掉今天在这家店已翻的（问题记录 374）；好友店详情带今天还能灭几只，自己店和蟹老板店不限', async () => {
    const [a, b] = await newPair(t);
    await befriend(t, a.restaurantId, b.restaurantId);
    const day = gameDay(t.clock.now);
    await incrementDaily(t.db, a.restaurantId, flipHostKey(b.restaurantId), 2, day);
    await incrementDaily(t.db, a.restaurantId, killHostKey(b.restaurantId), 3, day);
    const list = await reads().list(a, 'level');
    expect(list.items.find((x) => x.id === b.restaurantId)).toMatchObject({ flipReady: 1 });
    expect((await reads().detail(a, b.restaurantId)).killLeft).toBe(0);
    expect((await reads().detail(b, a.restaurantId)).killLeft).toBe(3);
    expect((await reads().detail(a, a.restaurantId)).killLeft).toBeNull();
  });

  it('搜索按店名（通配符按字面），标出是否好友和是否已申请', async () => {
    const [a, b] = await newPair(t);
    await t.db
      .updateTable('restaurant')
      .set({ name: `搜%${b.restaurantId}` })
      .where('id', '=', b.restaurantId)
      .execute();
    await rel().apply(a, b.restaurantId);
    const found = await reads().search(a, `搜%${b.restaurantId}`);
    expect(found).toEqual([
      expect.objectContaining({ id: b.restaurantId, isFriend: false, requested: true }),
    ]);
    expect(await reads().search(a, '%')).not.toContainEqual(expect.objectContaining({ id: a.restaurantId }));
  });
});
