import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { openRound } from './open';
import { createWishTreeService } from './service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(11) });
});
afterAll(() => t.close());

const svc = () => createWishTreeService(t.game.deps);
async function shardWithRound(day: string) {
  const shardId = await createShard(t.db);
  t.clock.set(gameTime(day, 20, 1));
  await openRound(t.game.deps, shardId, t.clock.now);
  return shardId;
}

describe('许愿（许愿树设计 §3.2）', () => {
  it('够等级能许、写一条、人数加 1；同一轮再许报 ALREADY_DONE', async () => {
    const shardId = await shardWithRound('2026-10-20');
    const r = await newRestaurant(t, { shardId, patch: { level: 10 } });
    const v = (await svc().wish(r)).data;
    expect(v.wished).toBe(true);
    expect(v.round!.entries).toBe(1);
    const rows = await t.db.selectFrom('wish_entry').selectAll().where('rest_id', '=', r.restaurantId).execute();
    expect(rows).toHaveLength(1);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'wishtree.wish')
      .execute();
    expect(log).toHaveLength(1);
    await expect(svc().wish(r)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'wishtree' } });
  });

  it('不够等级报 level（带 need）', async () => {
    const shardId = await shardWithRound('2026-10-21');
    const r = await newRestaurant(t, { shardId, patch: { level: 9 } });
    await expect(svc().wish(r)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'level', need: 10 },
    });
  });

  it('没有进行中的一轮、开奖时刻已过但还没开奖：报 wishtree_closed（Review Focus 1）', async () => {
    const none = await createShard(t.db);
    const r0 = await newRestaurant(t, { shardId: none, patch: { level: 10 } });
    await expect(svc().wish(r0)).rejects.toMatchObject({ params: { reason: 'wishtree_closed' } });
    const shardId = await shardWithRound('2026-10-22');
    const r = await newRestaurant(t, { shardId, patch: { level: 10 } });
    t.clock.set(gameTime('2026-10-23', 20, 0));
    await expect(svc().wish(r)).rejects.toMatchObject({ params: { reason: 'wishtree_closed' } });
    expect(await t.db.selectFrom('wish_entry').select('rest_id').where('rest_id', '=', r.restaurantId).execute()).toEqual(
      [],
    );
  });

  it('区服关了许愿树：许愿报 FEATURE_DISABLED，看板还能读（enabled: false）', async () => {
    const shardId = await shardWithRound('2026-10-24');
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { wishtree: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await newRestaurant(t, { shardId, patch: { level: 10 } });
    await expect(svc().wish(r)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect((await svc().view(r)).enabled).toBe(false);
  });

  it('看板：这一轮、门槛、我的等级；最近结果里中奖店已删时为 null（Review Focus 5）', async () => {
    const shardId = await shardWithRound('2026-10-25');
    const r = await newRestaurant(t, { shardId, patch: { level: 12 } });
    const gone = await newRestaurant(t, { shardId, patch: { level: 12 } });
    const v = await svc().view(r);
    expect(v).toMatchObject({ enabled: true, hour: 20, minLevel: 10, level: 12, titleDays: 3, wished: false });
    expect(v.round).not.toBeNull();
    // 造一轮开过奖的：中奖店随后被删
    const { id } = await t.db
      .insertInto('wish_round')
      .values({
        shard_id: shardId,
        day: '2026-10-24',
        goods_id: v.round!.goodsId,
        num: 1,
        opens_at: gameTime('2026-10-24', 20),
        ends_at: gameTime('2026-10-25', 20),
        status: 'drawn',
        winner_rest_id: gone.restaurantId,
        entries: 2,
        drawn_at: gameTime('2026-10-25', 20),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('wish_entry')
      .values({
        round_id: id,
        rest_id: r.restaurantId,
        shard_id: shardId,
        created_at: gameTime('2026-10-24', 21),
        won: false,
        award: JSON.stringify({ kind: 'coin', id: null, num: 100, lucky: false }),
        settled_at: gameTime('2026-10-25', 20),
      })
      .execute();
    await t.db.deleteFrom('restaurant').where('id', '=', gone.restaurantId).execute();
    const after = await svc().view(r);
    expect(after.recent[0]).toMatchObject({
      day: '2026-10-24',
      status: 'drawn',
      entries: 2,
      winner: null,
      mine: { won: false, award: { kind: 'coin', num: 100 } },
    });
  });
});
