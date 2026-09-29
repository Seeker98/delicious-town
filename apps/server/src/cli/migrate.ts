import { createDb } from '../db';
import { migrateToLatest } from '../db/migrate';
import { loadEnv } from '../env';
import { maintainPartitions } from '../worker/jobs';

const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
try {
  await migrateToLatest(db);
  await maintainPartitions(db, new Date());
  console.log('migrations applied');
} finally {
  await db.destroy();
}
