import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard, failRestLog } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { consoleDue, drawDue } from './draw';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(21) });
  t.clock.set(gameTime('2026-11-02', 20, 1));
});
afterAll(() => t.close());

const PRIZE = () => t.game.deps.config.tuning.wishTree.prizes[0]!;
let dayN = 0;
/** 造一轮已到开奖时刻的；rests 许了愿 */
async function mkRound(shardId: number, rests: number[]) {
  const { id } = await t.db
    .insertInto('wish_round')
    .values({
      shard_id: shardId,
      day: `2027-02-${String((++dayN % 28) + 1).padStart(2, '0')}`,
      goods_id: PRIZE().goods,
      num: PRIZE().num,
      opens_at: new Date(t.clock.now.getTime() - 86_400_000),
      ends_at: new Date(t.clock.now.getTime() - 60_000),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  for (const r of rests)
    await t.db
      .insertInto('wish_entry')
      .values({ round_id: id, rest_id: r, shard_id: shardId, created_at: t.clock.now })
      .execute();
  return id;
}
const roundRow = (id: string) =>
  t.db.selectFrom('wish_round').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const entries = (id: string) =>
  t.db.selectFrom('wish_entry').selectAll().where('round_id', '=', id).orderBy('rest_id').execute();
const mailsOf = (restId: number) => t.db.selectFrom('mail').selectAll().where('rest_id', '=', restId).execute();
const newsOf = (shardId: number) =>
  t.db
    .selectFrom('news')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('type', '=', 'wishtree.win')
    .execute();

describe('开奖（许愿树设计 §1.1、§3.2）', () => {
  it('只从许过愿的店里抽；中奖店收到邮件（道具 + 称号）、发广播新闻；没中的每家一份随机奖励', async () => {
    const shardId = await createShard(t.db);
    const rs: number[] = [];
    for (let i = 0; i < 3; i++) rs.push((await newRestaurant(t, { shardId })).restaurantId);
    const outsider = (await newRestaurant(t, { shardId })).restaurantId;
    const id = await mkRound(shardId, rs);
    expect(await drawDue(t.game.deps, shardId, t.clock.now)).toBe(1);
    const r = await roundRow(id);
    expect(r.status).toBe('drawn');
    expect(r.entries).toBe(3);
    expect(rs).toContain(r.winner_rest_id);
    const [mail] = await mailsOf(r.winner_rest_id!);
    expect(mail).toMatchObject({ scope: 'rest', tpl: 'wishtree.win', source: 'wishtree' });
    expect(mail!.items).toMatchObject({
      goods: [{ id: PRIZE().goods, num: PRIZE().num }],
      icons: [{ key: 'wish_tree', title: '许愿成真', days: 3 }],
    });
    expect(await mailsOf(outsider)).toEqual([]);
    const news = await newsOf(shardId);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ rest_id: r.winner_rest_id });
    expect(news[0]!.params).toMatchObject({ goodsId: PRIZE().goods, num: PRIZE().num, entries: 3 });

    expect(await consoleDue(t.game.deps, shardId, t.clock.now)).toEqual({ done: 2, failed: 0 });
    for (const e of await entries(id)) {
      expect(e.settled_at).not.toBeNull();
      if (e.rest_id === r.winner_rest_id) expect([e.won, e.award]).toEqual([true, null]);
      else expect(e.award).toMatchObject({ kind: expect.any(String), num: expect.any(Number) });
    }
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['rest_id', 'params'])
      .where('type', '=', 'wishtree.lost')
      .where('rest_id', 'in', rs)
      .execute();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.rest_id)).not.toContain(r.winner_rest_id);
  });

  it('重跑不重复开奖、不重复发安慰奖（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const a = (await newRestaurant(t, { shardId })).restaurantId;
    const b = (await newRestaurant(t, { shardId })).restaurantId;
    await mkRound(shardId, [a, b]);
    expect(await drawDue(t.game.deps, shardId, t.clock.now)).toBe(1);
    expect(await drawDue(t.game.deps, shardId, t.clock.now)).toBe(0);
    expect((await consoleDue(t.game.deps, shardId, t.clock.now)).done).toBe(1);
    expect((await consoleDue(t.game.deps, shardId, t.clock.now)).done).toBe(0);
    expect(await newsOf(shardId)).toHaveLength(1);
  });

  it('某家安慰奖失败：其他家照发，下一轮补上（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const rs: number[] = [];
    for (let i = 0; i < 3; i++) rs.push((await newRestaurant(t, { shardId })).restaurantId);
    const id = await mkRound(shardId, rs);
    await drawDue(t.game.deps, shardId, t.clock.now);
    const losers = (await entries(id)).filter((e) => !e.won).map((e) => e.rest_id);
    const restore = await failRestLog(t.db, losers[0]!);
    expect(await consoleDue(t.game.deps, shardId, t.clock.now)).toEqual({ done: 1, failed: 1 });
    await restore();
    expect(await consoleDue(t.game.deps, shardId, t.clock.now)).toEqual({ done: 1, failed: 0 });
  });

  it('没人许愿：状态 empty、不发新闻', async () => {
    const shardId = await createShard(t.db);
    const id = await mkRound(shardId, []);
    expect(await drawDue(t.game.deps, shardId, t.clock.now)).toBe(1);
    expect(await roundRow(id)).toMatchObject({ status: 'empty', entries: 0, winner_rest_id: null });
    expect(await newsOf(shardId)).toEqual([]);
  });

  it('被封号的店不会被抽中、也不发安慰奖；全被封号时按没人中奖处理（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const ok = await newRestaurant(t, { shardId });
    const bad = await newRestaurant(t, { shardId });
    await t.db.updateTable('account').set({ banned_at: t.clock.now }).where('id', '=', bad.accountId).execute();
    for (let i = 0; i < 5; i++) {
      const id = await mkRound(shardId, [ok.restaurantId, bad.restaurantId]);
      await drawDue(t.game.deps, shardId, t.clock.now);
      expect((await roundRow(id)).winner_rest_id).toBe(ok.restaurantId);
    }
    expect((await consoleDue(t.game.deps, shardId, t.clock.now)).done).toBe(0);
    const badRows = await t.db
      .selectFrom('wish_entry')
      .selectAll()
      .where('rest_id', '=', bad.restaurantId)
      .execute();
    expect(badRows).toHaveLength(5);
    for (const e of badRows) expect([e.won, e.award, e.settled_at !== null]).toEqual([false, null, true]);

    const only = await createShard(t.db);
    const b2 = await newRestaurant(t, { shardId: only });
    await t.db.updateTable('account').set({ banned_at: t.clock.now }).where('id', '=', b2.accountId).execute();
    const id2 = await mkRound(only, [b2.restaurantId]);
    await drawDue(t.game.deps, only, t.clock.now);
    expect(await roundRow(id2)).toMatchObject({ status: 'empty', entries: 1, winner_rest_id: null });
    expect(await newsOf(only)).toEqual([]);
    expect(await mailsOf(b2.restaurantId)).toEqual([]);
  });

  it('还没到开奖时刻的不开', async () => {
    const shardId = await createShard(t.db);
    const a = (await newRestaurant(t, { shardId })).restaurantId;
    const id = await mkRound(shardId, [a]);
    await t.db
      .updateTable('wish_round')
      .set({ ends_at: new Date(t.clock.now.getTime() + 60_000) })
      .where('id', '=', id)
      .execute();
    expect(await drawDue(t.game.deps, shardId, t.clock.now)).toBe(0);
    expect((await roundRow(id)).status).toBe('open');
  });
});
