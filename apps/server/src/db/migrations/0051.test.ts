import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0051：收购的分红和打理（收购 PR 2）', () => {
  it('同一家店同一天只能打理一次、只有一条分红；累计分红默认 0', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const ownerId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const tend = () =>
      db
        .insertInto('acquire_tend')
        .values({ rest_id: restId, day: '2026-10-01', created_at: new Date() })
        .execute();
    await tend();
    await expect(tend()).rejects.toThrow();
    const dividend = () =>
      db
        .insertInto('acquire_dividend')
        .values({ rest_id: restId, day: '2026-10-01', owner_rest_id: ownerId, coin: 5, tended: true })
        .execute();
    await dividend();
    await expect(dividend()).rejects.toThrow();
    expect(
      await db.selectFrom('acquire_dividend').selectAll().where('rest_id', '=', restId).executeTakeFirst(),
    ).toEqual({ rest_id: restId, day: '2026-10-01', owner_rest_id: ownerId, coin: 5, tended: true });
    await db.insertInto('acquire_holder').values({ rest_id: ownerId }).execute();
    expect(
      await db.selectFrom('acquire_holder').selectAll().where('rest_id', '=', ownerId).executeTakeFirst(),
    ).toEqual({ rest_id: ownerId, dividend_total: 0 });
  });

  it('acquire_state 不再有 tended_day（打理记在 acquire_tend）', async () => {
    const r = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.columns
      where table_name = 'acquire_state' and column_name = 'tended_day'`.execute(db);
    expect(r.rows[0]!.n).toBe(0);
  });
});
