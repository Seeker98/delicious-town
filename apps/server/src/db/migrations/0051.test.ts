import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0051：收购的分红和打理（收购 PR 2）', () => {
  // 打理、分红两张表在迁移 0083（收购改版）换成了 acquire_tend（带老板）和 acquire_due，见 0083.test.ts
  it('累计分红默认 0', async () => {
    const shardId = await createShard(db);
    const ownerId = await createRestaurantFull(db, shardId, await createAccountRow(db));
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
