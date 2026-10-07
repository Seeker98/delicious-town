import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { backfill } from './0057_zasui_backfill';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0057：已经开在杂碎街的店记上“搬到杂碎街”（问题记录 515 终审）', () => {
  it('开在 29 号街的记 1；别的街不记；已经有计数的不动', async () => {
    const shardId = await createShard(db);
    const rest = async (street: number) =>
      createRestaurantFull(db, shardId, await createAccountRow(db), { patch: { street_id: street } });
    const [a, b, c] = [await rest(29), await rest(11), await rest(29)];
    await db.insertInto('event_counter').values({ rest_id: c, key: 'rest.moveTo.29', count: 3 }).execute();
    await backfill(db);
    const rows = await db
      .selectFrom('event_counter')
      .select(['rest_id', 'count'])
      .where('key', '=', 'rest.moveTo.29')
      .where('rest_id', 'in', [a, b, c])
      .orderBy('rest_id')
      .execute();
    expect(rows.map((r) => [r.rest_id, Number(r.count)])).toEqual([
      [a, 1],
      [c, 3],
    ]);
  });
});
