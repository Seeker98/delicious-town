import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0050：收购的表（问题记录 421）', () => {
  it('一家店一行收购状态；热度至少 1；同一家店同一天的收入只有一行', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    await db
      .insertInto('acquire_state')
      .values({ rest_id: restId, shard_id: shardId, base: 100000, heat: 1 })
      .execute();
    await expect(
      db
        .insertInto('acquire_state')
        .values({ rest_id: restId, shard_id: shardId, base: 1, heat: 1 })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db.updateTable('acquire_state').set({ heat: 0.5 }).where('rest_id', '=', restId).execute(),
    ).rejects.toThrow();
    await db
      .insertInto('rest_income_day')
      .values({ rest_id: restId, day: '2026-10-01', coin: 5, rounds: 1 })
      .execute();
    await expect(
      db
        .insertInto('rest_income_day')
        .values({ rest_id: restId, day: '2026-10-01', coin: 6, rounds: 1 })
        .execute(),
    ).rejects.toThrow();
    const row = await db
      .selectFrom('rest_income_day')
      .selectAll()
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    // 游戏日按字符串读出来（不转成 Date）
    expect(row).toEqual({ rest_id: restId, day: '2026-10-01', coin: 5, rounds: 1 });
  });

  it('交易记录的类型只能是四种', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const log = (kind: string) =>
      db
        .insertInto('acquire_log')
        .values({
          shard_id: shardId,
          kind: kind as 'acquire',
          buyer_rest_id: null,
          target_rest_id: restId,
          seller_rest_id: null,
          price: 1,
          tax: 0,
          heat_after: 1,
          created_at: new Date(),
        })
        .execute();
    for (const k of ['acquire', 'buy_listed', 'redeem', 'release']) await log(k);
    await expect(log('steal')).rejects.toThrow();
  });
});
