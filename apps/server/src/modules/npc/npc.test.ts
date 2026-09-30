import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, setTables, tablesOf, type TestGame } from '../../../test/game';
import { settleShardRound } from '../settlement/runner';
import { ensureNpc, npcIdOf, npcInvite, npcTableRound, NPC_USERNAME } from './npc';

const config = testConfig();
const npcT = config.tuning.friend.npc;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('蟹老板（设计文档 §4.9）', () => {
  it('每区一家，重复调用不重复建；32 张桌，橱柜已补货；系统账号', async () => {
    const shardId = await createShard(t.db);
    const a = await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    const b = await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    expect(await tablesOf(t, a.id)).toHaveLength(32);
    const foods = await t.db
      .selectFrom('cupboard_food')
      .select('foods_id')
      .where('rest_id', '=', a.id)
      .execute();
    expect(foods).toHaveLength(npcT.restockKinds);
    const acc = await t.db
      .selectFrom('restaurant as r')
      .innerJoin('account as x', 'x.id', 'r.account_id')
      .select(['x.username', 'x.is_system', 'r.npc', 'r.name'])
      .where('r.id', '=', a.id)
      .executeTakeFirstOrThrow();
    expect(acc).toEqual({ username: NPC_USERNAME, is_system: true, npc: true, name: '蟹老板' });
  });

  it('只邀请邮箱已验证的店，每家只邀请一次（拒绝后不会再来）', async () => {
    const shardId = await createShard(t.db);
    const npc = (await ensureNpc(t.db, config, npcT, shardId, seededRng(1))).id;
    const v = await newRestaurant(t, { shardId, verified: true });
    const u = await newRestaurant(t, { shardId });
    expect(await npcInvite(t.db, { shardId })).toBe(1);
    const reqs = await t.db.selectFrom('friend_request').selectAll().where('from_rest', '=', npc).execute();
    expect(reqs.map((r) => r.to_rest)).toEqual([v.restaurantId]);
    await t.game.social.relations.respond(v, npc, false);
    expect(await npcInvite(t.db, { shardId })).toBe(0);
    void u;
  });

  it('同意蟹老板的申请后成为好友，不占好友上限', async () => {
    const shardId = await createShard(t.db);
    const npc = (await ensureNpc(t.db, config, npcT, shardId, seededRng(1))).id;
    const v = await newRestaurant(t, { shardId, verified: true });
    await npcInvite(t.db, { restId: v.restaurantId });
    expect(await t.game.social.relations.respond(v, npc, true)).toEqual({ status: 'friends' });
    const list = await t.game.social.reads.list(v, 'level');
    expect(list.items[0]).toMatchObject({ id: npc, npc: true });
    expect(list.count).toBe(0);
  });

  it('已验证的账号开店时收到邀请', async () => {
    const shardId = await createShard(t.db);
    await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    const accountId = await createAccountRow(t.db);
    await t.db
      .updateTable('account')
      .set({ email_verified_at: new Date() })
      .where('id', '=', accountId)
      .execute();
    const restId = await t.game.restaurant.open(accountId, shardId, `n${accountId}`);
    const req = await t.db
      .selectFrom('friend_request')
      .select('from_rest')
      .where('to_rest', '=', restId)
      .execute();
    expect(req).toHaveLength(1);
  });

  it('系统账号不能登录', async () => {
    const shardId = await createShard(t.db);
    await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    await expect(t.game.account.login({ username: NPC_USERNAME, password: '!' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('餐桌轮：白食桌累计、空桌按 roachRate 长蟑螂；同一轮只跑一次；普通结算不含 NPC', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({ tuning: { friend: { npc: { roachRate: 1 } } } }),
      })
      .execute();
    t.game.shards.invalidate(shardId);
    const npc = (await ensureNpc(t.db, config, npcT, shardId, seededRng(1))).id;
    const now = new Date('2026-09-30T04:00:00Z');
    await setTables(t, npc, [
      {
        no: 1,
        floor: 1,
        customer: 9,
        freeloader: { restId: 1, level: 16, since: '2026-09-30T03:00:00Z', coin: 0, exp: 0 },
      },
      { no: 2, floor: 1, customer: 0 },
    ]);
    expect(await npcTableRound(t.game.deps, shardId, roundOf(now), now)).toBe('settled');
    const tables = await tablesOf(t, npc);
    expect(tables[0]!.freeloader!.exp).toBeGreaterThan(0);
    expect(tables[1]).toMatchObject({ customer: 3, roach: { by: null } });
    expect(await npcTableRound(t.game.deps, shardId, roundOf(now), now)).toBe('skipped');
    const stats = await settleShardRound(t.game.deps, t.game.world, shardId, roundOf(now) + 1, now);
    expect(stats.restaurants).toBe(0);
    const inc = await t.db.selectFrom('income_round').select('id').where('rest_id', '=', npc).execute();
    expect(inc).toHaveLength(0);
    expect(await npcIdOf(t.db, shardId)).toBe(npc);
  });
});
