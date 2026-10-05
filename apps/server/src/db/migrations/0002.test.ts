import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { fid } from '../../../test/items';

const db = testDb();
afterAll(() => db.destroy());
let shardId: number;
let restId: number;
beforeAll(async () => {
  shardId = await createShard(db);
  restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
});

describe('迁移 0002', () => {
  it('餐厅新列有默认值，cookbook_counts 是完整结构', async () => {
    const r = await db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', restId)
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({
      promo_on: false,
      cte_on: false,
      cookfoods_flag: 0,
      plaque2_open: false,
      main_task_step: 1,
      state_reason: null,
    });
    expect(r.cookbook_counts).toEqual({ learned: 0, grade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: {} });
  });

  it('橱柜数量不能为负', async () => {
    await expect(
      db
        .insertInto('cupboard_food')
        .values({ rest_id: restId, foods_id: fid('大米'), num: -1 })
        .execute(),
    ).rejects.toThrow();
  });

  it('菜场售出数不能超过库存', async () => {
    const now = new Date();
    const item = await db
      .insertInto('market_item')
      .values({ shard_id: shardId, shelf: 0, period: 'p', foods_id: fid('大米'), stock: 1, opened_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(
      db.updateTable('market_item').set({ sold: 2 }).where('id', '=', item.id).execute(),
    ).rejects.toThrow();
  });

  it('income_round、rest_log 按 created_at 分区写入', async () => {
    const at = new Date();
    await db
      .insertInto('income_round')
      .values({
        rest_id: restId,
        round_no: 1,
        coin: 10,
        exp: 5,
        oil: 2,
        customers: JSON.stringify({ '1': 1 }),
        rates: JSON.stringify({}),
        drops: JSON.stringify([]),
        created_at: at,
      })
      .execute();
    await db
      .insertInto('rest_log')
      .values({ rest_id: restId, type: 'level.up', params: JSON.stringify({ to: 2 }), created_at: at })
      .execute();
    const { rows } = await sql<{
      n: number;
    }>`select count(*)::int as n from income_round where rest_id = ${restId}`.execute(db);
    expect(rows[0]!.n).toBe(1);
  });

  it('market_guess 的 foods_ids 读出为数字数组', async () => {
    await db
      .insertInto('market_guess')
      .values({
        shard_id: shardId,
        period: '2026-09-30@10',
        rest_id: restId,
        foods_ids: [238, 240],
        created_at: new Date(),
      })
      .execute();
    const g = await db
      .selectFrom('market_guess')
      .selectAll()
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    expect(g.foods_ids).toEqual([238, 240]);
  });
});
