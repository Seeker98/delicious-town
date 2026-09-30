import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { befriend, createTestGame, newPair, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { addOrder, addRider, openFor } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { ensureNpc } from '../npc/npc';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const hire = (ctx: RestCtx, restId: number) => t.game.takeaway.hire(ctx, { restId });
const dismiss = (ctx: RestCtx, riderId: number) => t.game.takeaway.dismiss(ctx, { riderId });
/** a 已开通，b 是 a 的 1 星好友 */
const pair = async (): Promise<[RestCtx, RestCtx]> => {
  const [a, b] = await newPair(t, {}, { patch: { star_level: 1 } });
  await befriend(t, a.restaurantId, b.restaurantId);
  await openFor(t, a);
  return [a, b];
};
const setCap = (restId: number, cap: number) =>
  t.db.updateTable('takeaway_state').set({ rider_cap: cap }).where('rest_id', '=', restId).execute();

describe('雇佣（设计文档 §3.5）', () => {
  it('雇 1 星好友；满员报 LIMIT riders；列表里标出能不能雇', async () => {
    const [a, b] = await pair();
    await expect(hire(a, b.restaurantId)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'riders', max: 1 },
    });
    await setCap(a.restaurantId, 2);
    const r = await hire(a, b.restaurantId);
    expect(r.data).toEqual({ riderId: expect.any(Number) });
    const v = await t.game.takeaway.overview(a);
    expect(v.riders.map((x) => [x.self, x.restId])).toEqual([
      [true, a.restaurantId],
      [false, b.restaurantId],
    ]);
    expect(await t.game.takeaway.candidates(a)).toEqual([
      { restId: b.restaurantId, name: expect.any(String), level: 1, star: 1, block: 'mine' },
    ]);
  });

  it('不能雇：蟹老板、不到 1 星、已被别人雇、不是好友、自己没开通', async () => {
    const [a, b] = await pair();
    await setCap(a.restaurantId, 4);
    const npc = await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1));
    await befriend(t, a.restaurantId, npc.id);
    await expect(hire(a, npc.id)).rejects.toMatchObject({ params: { reason: 'target_npc' } });
    const zero = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, a.restaurantId, zero.restaurantId);
    await expect(hire(a, zero.restaurantId)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const boss = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await openFor(t, boss);
    await addRider(t, boss.restaurantId, b.restaurantId);
    await expect(hire(a, b.restaurantId)).rejects.toMatchObject({ params: { reason: 'rider_hired' } });
    const stranger = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { star_level: 1 } });
    await expect(hire(a, stranger.restaurantId)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
    const blocks = new Map((await t.game.takeaway.candidates(a)).map((c) => [c.restId, c.block]));
    expect(blocks.get(npc.id)).toBe('target_npc');
    expect(blocks.get(zero.restaurantId)).toBe('star');
    expect(blocks.get(b.restaurantId)).toBe('hired');
    const [c, d] = await newPair(t, {}, { patch: { star_level: 1 } });
    await befriend(t, c.restaurantId, d.restaurantId);
    await expect(hire(c, d.restaurantId)).rejects.toMatchObject({ params: { reason: 'takeaway_closed' } });
  });

  it('同一个好友同时被两个人雇：只有一个成功（Review Focus 3）', async () => {
    const [x, z] = await pair();
    const y = await newRestaurant(t, { shardId: x.shardId, verified: true });
    await befriend(t, y.restaurantId, z.restaurantId);
    await openFor(t, y);
    await setCap(x.restaurantId, 2);
    await setCap(y.restaurantId, 2);
    const r = await Promise.allSettled([hire(x, z.restaurantId), hire(y, z.restaurantId)]);
    expect(r.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((s) => s.status === 'rejected')).toMatchObject({
      reason: { params: { reason: 'rider_hired' } },
    });
  });
});

describe('解雇（设计文档 §3.5）', () => {
  it('花 当前经验×50 银币，得 当前经验×500 经验；解雇后别人可以雇他', async () => {
    const [a, b] = await pair();
    await t.db
      .updateTable('restaurant')
      .set({ coin: 10_000, level: 30 })
      .where('id', '=', a.restaurantId)
      .execute();
    const rider = await addRider(t, a.restaurantId, b.restaurantId);
    await t.db.updateTable('takeaway_rider').set({ exp: 3 }).where('id', '=', rider).execute();
    expect((await t.game.takeaway.overview(a)).riders[1]).toMatchObject({
      dismissCoin: 150,
      dismissExp: 1500,
    });
    expect((await dismiss(a, rider)).data).toEqual({ coin: 150, exp: 1500 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 9850, exp: 1500 });
    expect((await t.game.takeaway.overview(a)).riders).toHaveLength(1);
    expect((await t.game.takeaway.candidates(a))[0]!.block).toBeNull();
  });

  it('不能解雇自己、正在配送的、别人的骑手', async () => {
    const [a, b] = await pair();
    const self = (await t.game.takeaway.overview(a)).riders[0]!.id;
    await expect(dismiss(a, self)).rejects.toMatchObject({ params: { reason: 'rider_self' } });
    const rider = await addRider(t, a.restaurantId, b.restaurantId);
    const order = await addOrder(t, a.shardId, { state: 2 });
    await t.db
      .insertInto('takeaway_delivery')
      .values({
        order_id: order,
        rest_id: a.restaurantId,
        rider_id: rider,
        grade: 1,
        private: false,
        double: false,
        mystery_kinds: 0,
        coin: 1,
        exp: 1,
        renown: 1,
        success_odds: 800,
        started_at: t.clock.now,
        arrive_at: t.clock.now,
      })
      .execute();
    await expect(dismiss(a, rider)).rejects.toMatchObject({ params: { reason: 'rider_delivering' } });
    const other = await newRestaurant(t, { shardId: a.shardId });
    await openFor(t, other);
    await expect(dismiss(other, rider)).rejects.toMatchObject({ params: { reason: 'rider_gone' } });
  });
});
