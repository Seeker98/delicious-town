import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';

const db = testDb();
afterAll(() => db.destroy());

const indexes = async (table: string) =>
  (
    await sql<{ indexname: string; indexdef: string }>`
      select indexname, indexdef from pg_indexes where tablename = ${table} order by indexname`.execute(db)
  ).rows;

describe('迁移 0079：性能整理的索引，删掉老任务的表和列', () => {
  it('rest_shiling 不再按 week_gain 建索引，按 shard_id 有索引（时令衰减用）', async () => {
    const rows = await indexes('rest_shiling');
    expect(rows.map((r) => r.indexname)).not.toContain('rest_shiling_week');
    expect(rows.some((r) => r.indexdef.includes('week_gain'))).toBe(false);
    expect(rows.find((r) => r.indexname === 'rest_shiling_shard')?.indexdef).toContain('(shard_id)');
  });

  it('job_run 按 started_at 有索引（每小时清理用）', async () => {
    const rows = await indexes('job_run');
    expect(rows.find((r) => r.indexname === 'job_run_started')?.indexdef).toContain('(started_at)');
  });

  it('task_done 表、restaurant.main_task_step 列都没有了', async () => {
    const t = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'task_done'`.execute(
      db,
    );
    expect(t.rows[0]!.n).toBe(0);
    const c = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurant' and column_name = 'main_task_step'`.execute(
      db,
    );
    expect(c.rows[0]!.n).toBe(0);
  });
});
