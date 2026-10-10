import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0067：许愿树', () => {
  it('同区服同一天只有一轮；同一家店同一轮只能许一次；删店一起删', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const now = new Date();
    const round = { shard_id: shardId, day: '2026-10-11', goods_id: 1, num: 1, opens_at: now, ends_at: now };
    const { id } = await db.insertInto('wish_round').values(round).returning('id').executeTakeFirstOrThrow();
    await expect(db.insertInto('wish_round').values(round).execute()).rejects.toThrow();
    const e = { round_id: id, rest_id: restId, shard_id: shardId, created_at: now };
    await db.insertInto('wish_entry').values(e).execute();
    await expect(db.insertInto('wish_entry').values(e).execute()).rejects.toThrow();
    const r = await db
      .selectFrom('wish_round')
      .select(['status'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(r.status).toBe('open');
    await db.deleteFrom('restaurant').where('id', '=', restId).execute();
    expect(await db.selectFrom('wish_entry').select('rest_id').where('round_id', '=', id).execute()).toEqual(
      [],
    );
  });
});
