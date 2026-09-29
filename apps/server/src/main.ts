import { buildApp } from './app';
import { migrateToLatest } from './db/migrate';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { maintainPartitions } from './worker/jobs';

const env = loadEnv();
const deps = createDeps(env);
if (env.MIGRATE_ON_START) {
  await migrateToLatest(deps.db);
  await maintainPartitions(deps.db, new Date());
}
const app = await buildApp(deps);
await app.listen({ port: env.PORT, host: '0.0.0.0' });

const shutdown = async () => {
  await app.close();
  await deps.db.destroy();
  deps.redis.disconnect();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
