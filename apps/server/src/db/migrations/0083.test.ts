import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0083：收购改版（让渡、老板打理）', () => {
  it('让渡每家店、每天、每个老板一行；银币默认 0、不能是负数；默认没发、没退', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const o1 = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const o2 = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const due = (owner: number) =>
      db
        .insertInto('acquire_due')
        .values({ rest_id: restId, day: '2026-10-01', owner_rest_id: owner })
        .execute();
    await due(o1);
    await due(o2);
    await expect(due(o1)).rejects.toThrow();
    await expect(
      db
        .insertInto('acquire_due')
        .values({ rest_id: restId, day: '2026-10-02', owner_rest_id: o1, coin: -1 })
        .execute(),
    ).rejects.toThrow();
    expect(
      await db
        .selectFrom('acquire_due')
        .selectAll()
        .where('rest_id', '=', restId)
        .where('owner_rest_id', '=', o1)
        .executeTakeFirst(),
    ).toEqual({
      rest_id: restId,
      day: '2026-10-01',
      owner_rest_id: o1,
      coin: 0,
      tended: false,
      paid_at: null,
      refunded: false,
    });
  });

  it('打理每家店、每天、每个老板一行（当天换了老板，新老板也能打理）', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const o1 = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const o2 = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const tend = (owner: number) =>
      db
        .insertInto('acquire_tend')
        .values({
          rest_id: restId,
          day: '2026-10-01',
          owner_rest_id: owner,
          cost: 1,
          packs: 0,
          created_at: new Date(),
        })
        .execute();
    await tend(o1);
    await tend(o2);
    await expect(tend(o1)).rejects.toThrow();
  });

  it('挂牌价可以高于身价（最多 5 倍）；收购状态有打理时间；旧的分红表没了', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const st = (rate: number) =>
      db
        .insertInto('acquire_state')
        .values({
          rest_id: restId,
          shard_id: shardId,
          base: 1,
          heat: 1,
          list_rate: rate,
          tended_at: new Date(),
        })
        .onConflict((oc) => oc.column('rest_id').doUpdateSet({ list_rate: rate }))
        .execute();
    await st(1.2);
    await expect(st(5.5)).rejects.toThrow();
    const r = await sql<{ t: string | null }>`select to_regclass('acquire_dividend')::text as t`.execute(db);
    expect(r.rows[0]!.t).toBeNull();
    const c = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.columns
      where table_name = 'income_round' and column_name = 'ceded'`.execute(db);
    expect(c.rows[0]!.n).toBe(1);
  });
});
