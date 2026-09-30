import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf, sequenceRng } from '@dt/shared';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type TestGame,
} from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { settleShardRound } from '../settlement/runner';

let t: TestGame;
/** 随机数固定 0：概率判定一律成功，礼券取 1 */
let lucky: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  lucky = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await lucky.close();
});

async function serve(
  g: TestGame,
  host: RestCtx,
  opts: { left?: number; price?: number; eatCount?: number } = {},
) {
  const c = await g.db
    .insertInto('mc_cook')
    .values({
      rest_id: host.restaurantId,
      shard_id: host.shardId,
      mc_id: 1,
      level: 4,
      grade: 3,
      cook_num: 1,
      total_num: 500,
      left_num: opts.left ?? 500,
      price: opts.price ?? 157,
      eat_count: opts.eatCount ?? 0,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await g.db
    .updateTable('restaurant')
    .set({ mc_cook_id: c.id, star_level: 2 })
    .where('id', '=', host.restaurantId)
    .execute();
  return c.id;
}
const cookOf = (g: TestGame, id: number) =>
  g.db.selectFrom('mc_cook').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('品尝（规格书 13 §13.6）', () => {
  it('好友：消耗 2 份，体力 = 每份价值；店主得礼券、好友动态；我概率得神秘食谱', async () => {
    const [me, host] = await newPair(lucky, { patch: { strength: 0 } });
    await befriend(lucky, me.restaurantId, host.restaurantId);
    const id = await serve(lucky, host);
    const r = await lucky.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(r.data).toEqual({ strength: 157, recipe: true, left: 498 });
    expect((await restRow(lucky, me.restaurantId)).strength).toBe(157);
    expect(await goodsNum(lucky, me.restaurantId, 162)).toBe(1);
    expect(await goodsNum(lucky, host.restaurantId, 1)).toBe(1);
    expect(await cookOf(lucky, id)).toMatchObject({ left_num: 498, eat_count: 1 });
    const feed = await lucky.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', host.restaurantId)
      .execute();
    expect(feed.map((x) => x.type)).toContain('mc.eaten');
  });

  it('非好友：消耗 1 份，体力减半', async () => {
    const [me, host] = await newPair(t, { patch: { strength: 0 } });
    await serve(t, host);
    const r = await t.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(r.data).toMatchObject({ strength: 78, left: 499 });
  });

  it('同一批只能吃一次；每天最多 2 次', async () => {
    const [me, h1] = await newPair(t);
    const h2 = await newRestaurant(t, { verified: true, shardId: me.shardId });
    const h3 = await newRestaurant(t, { verified: true, shardId: me.shardId });
    for (const h of [h1, h2, h3]) await serve(t, h);
    await t.game.mysterious.taste(me, { restId: h1.restaurantId });
    await expect(t.game.mysterious.taste(me, { restId: h1.restaurantId })).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'taste' },
    });
    await t.game.mysterious.taste(me, { restId: h2.restaurantId });
    await expect(t.game.mysterious.taste(me, { restId: h3.restaurantId })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'taste', max: 2 },
    });
  });

  it('第 21 次起没有奖励（店主不得礼券，我不得神秘食谱）', async () => {
    const [me, host] = await newPair(lucky);
    await serve(lucky, host, { eatCount: 20 });
    const r = await lucky.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(r.data.recipe).toBe(false);
    expect(await goodsNum(lucky, host.restaurantId, 1)).toBe(0);
  });

  it('吃完这批：结束（eaten）、清空店主指针；份数不够时报 NOT_ENOUGH portions', async () => {
    const [me, host] = await newPair(t);
    await befriend(t, me.restaurantId, host.restaurantId);
    const id = await serve(t, host, { left: 2 });
    await t.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(await cookOf(t, id)).toMatchObject({ left_num: 0, end_reason: 'eaten' });
    expect((await restRow(t, host.restaurantId)).mc_cook_id).toBeNull();
    const [me2, host2] = await newPair(t);
    await befriend(t, me2.restaurantId, host2.restaurantId);
    await serve(t, host2, { left: 1 });
    await expect(t.game.mysterious.taste(me2, { restId: host2.restaurantId })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'portions' },
    });
  });

  it('对方打烊、没有在售、品尝自己都报错', async () => {
    const [me, host] = await newPair(t);
    await expect(t.game.mysterious.taste(me, { restId: host.restaurantId })).rejects.toMatchObject({
      params: { reason: 'target_no_special' },
    });
    await serve(t, host);
    await t.db.updateTable('restaurant').set({ state: 2 }).where('id', '=', host.restaurantId).execute();
    await expect(t.game.mysterious.taste(me, { restId: host.restaurantId })).rejects.toMatchObject({
      params: { reason: 'target_closed' },
    });
    await expect(t.game.mysterious.taste(me, { restId: me.restaurantId })).rejects.toMatchObject({
      params: { reason: 'target_self' },
    });
  });

  it('品尝后再结算：两边扣同一批不会扣成负数，卖完只结束一次（Review Focus 1）', async () => {
    const [me, host] = await newPair(t);
    await befriend(t, me.restaurantId, host.restaurantId);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: host.shardId,
        override: JSON.stringify({ tuning: { rest: { atRateBase: 5, spRateBase: -5 } } }),
      })
      .execute();
    t.game.shards.invalidate(host.shardId);
    await t.db.updateTable('restaurant').set({ oil: 100000 }).where('id', '=', host.restaurantId).execute();
    const id = await serve(t, host, { left: 3 });
    await t.game.mysterious.taste(me, { restId: host.restaurantId });
    await settleShardRound(t.game.deps, t.game.world, host.shardId, roundOf(new Date()), new Date());
    expect(await cookOf(t, id)).toMatchObject({ left_num: 0, end_reason: 'sold' });
    expect((await restRow(t, host.restaurantId)).mc_cook_id).toBeNull();
  });
});

describe('好友详情显示对方特色菜', () => {
  it('special 带品级、剩余、每份价值和我吃没吃过', async () => {
    const [me, host] = await newPair(t);
    await serve(t, host);
    expect((await t.game.social.reads.detail(me, host.restaurantId)).special).toMatchObject({
      mcId: 1,
      grade: 3,
      leftNum: 500,
      price: 157,
      eaten: false,
    });
    await t.game.mysterious.taste(me, { restId: host.restaurantId });
    expect((await t.game.social.reads.detail(me, host.restaurantId)).special?.eaten).toBe(true);
    const other = await newRestaurant(t, { shardId: me.shardId });
    expect((await t.game.social.reads.detail(me, other.restaurantId)).special).toBeNull();
  });
});
