import { sql, type Kysely } from 'kysely';

/**
 * 性能整理（2026-10-16）：
 * - rest_shiling_week 删掉：0070 起周榜读 shiling_week，没有查询按 week_gain 排序、筛选了；
 *   留着它结算时每次改 week_gain 都要改索引，做不了 HOT 更新。时令衰减按 shard_id 找店，另建 (shard_id)
 * - job_run 加 started_at 索引：每小时按 started_at 删 7 天前的记录，主键 (shard_id, job, period) 用不上
 * - task_done 表和 restaurant.main_task_step 列删掉：老任务系统的，任务改版（quest_done）后没人读写
 * down 恢复表、列和索引的结构，删掉的老任务记录回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`drop index rest_shiling_week`.execute(db);
  await sql`create index rest_shiling_shard on rest_shiling (shard_id)`.execute(db);
  await sql`create index job_run_started on job_run (started_at)`.execute(db);
  await sql`drop table task_done`.execute(db);
  await sql`alter table restaurant drop column main_task_step`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant add column main_task_step integer not null default 1`.execute(db);
  await sql`
    create table task_done (
      rest_id integer not null references restaurant(id) on delete cascade,
      task_id integer not null,
      done_at timestamptz not null,
      primary key (rest_id, task_id)
    )`.execute(db);
  await sql`drop index job_run_started`.execute(db);
  await sql`drop index rest_shiling_shard`.execute(db);
  await sql`create index rest_shiling_week on rest_shiling (shard_id, week, week_gain desc)`.execute(db);
}
