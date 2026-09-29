import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../test/fixtures';
import { getDaily, incrementDaily } from './counter/dailyCounter';
import { recordLedger } from './ledger/ledger';
import { postNews } from './news/news';

const db = testDb();
let shardId: number;
let restId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
  restId = await createRestaurantRow(db, shardId, await createAccountRow(db));
});

describe('dailyCounter', () => {
  it('按（餐厅, 游戏日, 计数项）累加', async () => {
    expect(await getDaily(db, restId, 'flip', '2026-09-29')).toBe(0);
    expect(await incrementDaily(db, restId, 'flip', 1, '2026-09-29')).toBe(1);
    expect(await incrementDaily(db, restId, 'flip', 2, '2026-09-29')).toBe(3);
    expect(await incrementDaily(db, restId, 'flip', 1, '2026-09-30')).toBe(1);
    expect(await getDaily(db, restId, 'flip', '2026-09-29')).toBe(3);
  });
});

describe('ledger / news', () => {
  it('写入流水', async () => {
    await recordLedger(db, [
      { restId, kind: 'goods', itemId: 1, delta: 3, source: 'test' },
      { restId, kind: 'coin', delta: -50, source: 'test' },
    ]);
    const rows = await db.selectFrom('ledger').selectAll().where('rest_id', '=', restId).execute();
    expect(rows.map((r) => [r.kind, r.delta])).toEqual(
      expect.arrayContaining([
        ['goods', 3],
        ['coin', -50],
      ]),
    );
  });

  it('空列表不报错', async () => {
    await expect(recordLedger(db, [])).resolves.toBeUndefined();
  });

  it('写入新闻（结构化参数）', async () => {
    await postNews(db, { shardId, type: 'test.news', restId, params: { name: '小店' } });
    const row = await db
      .selectFrom('news')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('type', '=', 'test.news')
      .executeTakeFirstOrThrow();
    expect(row.params).toEqual({ name: '小店' });
  });
});
