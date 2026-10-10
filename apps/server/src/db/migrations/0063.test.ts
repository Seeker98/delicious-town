import { afterAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { FUTURES_INITIAL } from './0063_futures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0063：食材期货（期货设计 §5、§6）', () => {
  // 上架、额度这些会被别的测试文件临时改（futures_food 全服一份，并行跑，终审 I1），这里只看种数和分布
  it('初始列表 185 种：1~5 级菜谱用得到的稀有食材加 2 级普通食材', async () => {
    const rows = await db
      .selectFrom('futures_food')
      .selectAll()
      .where('foods_id', 'in', [...FUTURES_INITIAL])
      .execute();
    expect(rows).toHaveLength(185);
    const foods = testConfig().foods;
    const count = (lv: number, rare: boolean) =>
      FUTURES_INITIAL.filter((id) => foods.get(id)!.level === lv && foods.get(id)!.odds < 100 === rare)
        .length;
    expect([
      count(1, true),
      count(2, true),
      count(3, true),
      count(4, true),
      count(5, true),
      count(2, false),
    ]).toEqual([11, 25, 41, 37, 9, 62]);
  });

  it('额度一行是区服 × 食材 × 天，主键防重复', async () => {
    const shardId = await createShard(db);
    const row = { shard_id: shardId, foods_id: FUTURES_INITIAL[0]!, day: '2000-01-01', used: 1 };
    await db.insertInto('futures_quota').values(row).execute();
    await expect(db.insertInto('futures_quota').values(row).execute()).rejects.toThrow();
  });

  it('期货单默认进行中、进橱柜和交易所账户都是 0', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantRow(db, shardId, await createAccountRow(db));
    const r = await db
      .insertInto('futures_contract')
      .values({
        shard_id: shardId,
        rest_id: restId,
        foods_id: FUTURES_INITIAL[0]!,
        qty: 2,
        unit_price: 100,
        deposit: 60,
        balance: 140,
        created_at: new Date(),
        due_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({ status: 'open', settled_at: null, to_cupboard: 0, to_wallet: 0 });
    await db.deleteFrom('futures_contract').where('id', '=', r.id).execute();
  });
});
