import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from 'kysely';
import { buildBundle, defaultDataDir, readSourceDir } from '@dt/config';
import { createDb } from '../src/db';
import { migrateToLatest } from '../src/db/migrate';
import { ensureDailyPartitions } from '../src/db/partitions';
import { createRedis } from '../src/infra/redis';
import { TEST_BUNDLE_PATH, testEnv } from './testEnv';

/** 每次测试运行：生成配置包、重建数据库、清空 Redis */
export default async function setup(): Promise<void> {
  const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
  if (!bundle) throw new Error(`config bundle invalid:\n${errors.join('\n')}`);
  mkdirSync(dirname(TEST_BUNDLE_PATH), { recursive: true });
  writeFileSync(TEST_BUNDLE_PATH, JSON.stringify(bundle));

  const db = createDb(testEnv.DATABASE_URL!, 2);
  await sql`drop schema if exists public cascade`.execute(db);
  await sql`create schema public`.execute(db);
  await migrateToLatest(db);
  const yesterday = new Date(Date.now() - 86_400_000);
  for (const table of ['ledger', 'news', 'income_round', 'rest_log'] as const) {
    await ensureDailyPartitions(db, table, yesterday, 5);
  }
  // 测试专用：test_fail_rest 里的餐厅写个人日志时报错，用来模拟单店处理失败。
  // 必须在这里建好：测试运行期间对分区表做 DDL 会和其他测试文件的并发查询死锁
  await sql`create table test_fail_rest (rest_id integer primary key)`.execute(db);
  await sql`create function test_fail_rest_log() returns trigger as $$
    begin
      if exists (select 1 from test_fail_rest where rest_id = new.rest_id) then
        raise exception 'test failure for restaurant %', new.rest_id;
      end if;
      return new;
    end $$ language plpgsql`.execute(db);
  await sql`create trigger test_fail_rest_log before insert on rest_log for each row execute function test_fail_rest_log()`.execute(
    db,
  );
  await db.destroy();

  const redis = createRedis(testEnv.REDIS_URL!);
  await redis.flushdb();
  redis.disconnect();
}
