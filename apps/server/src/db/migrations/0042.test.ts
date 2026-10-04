import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0042：长尾第 ② 批的索引和约束', () => {
  it('交易所最新玩家成交价、全服合力名次各有索引（backlog 156-3、148-3）', async () => {
    const rows = await sql<{ indexname: string; indexdef: string }>`
      select indexname, indexdef from pg_indexes
      where indexname in ('exchange_trade_last_player', 'activity_counter_rank')
      order by indexname`.execute(db);
    expect(rows.rows.map((r) => r.indexname)).toEqual([
      'activity_counter_rank',
      'exchange_trade_last_player',
    ]);
    expect(rows.rows[1]!.indexdef).toContain('WHERE (NOT system)');
  });

  it('事件预测：已判定的事件必须有结果（backlog 238-1）', async () => {
    const shardId = await createShard(db);
    const base = {
      shard_id: shardId,
      title: '测试',
      b: 10,
      unit: 100,
      p0: 0.5,
      open_at: new Date(),
      close_at: new Date(),
    };
    await expect(
      db
        .insertInto('predict_event')
        .values({ ...base, status: 'resolved', outcome: null })
        .execute(),
    ).rejects.toThrow(/predict_event_resolved_outcome/);
    await db
      .insertInto('predict_event')
      .values({ ...base, status: 'resolved', outcome: true })
      .execute();
    await db
      .insertInto('predict_event')
      .values({ ...base, status: 'void', outcome: null })
      .execute();
  });
});
