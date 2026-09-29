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
  await ensureDailyPartitions(db, 'ledger', yesterday, 5);
  await ensureDailyPartitions(db, 'news', yesterday, 5);
  await db.destroy();

  const redis = createRedis(testEnv.REDIS_URL!);
  await redis.flushdb();
  redis.disconnect();
}
