import { buildApp } from './app';
import { migrateToLatest } from './db/migrate';
import { initSeedSecret } from './core/seedSecret';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { pullOffset } from './infra/clock';
import { syncNewbieCodes } from './modules/redeem/newbie';
import { retiredInOverrides } from './modules/shard/retired';
import { maintainPartitions } from './worker/jobs';

const env = loadEnv();
const deps = createDeps(env);
if (env.MIGRATE_ON_START) {
  await migrateToLatest(deps.db);
  await maintainPartitions(deps.db, new Date());
}
await initSeedSecret(deps);
// 开发环境：沿用之前 test/tick 推进过的时间，重启不回退
if (deps.clock) await pullOffset(deps.clock, deps.redis);
// 新手兑换码（问题记录 150）：每次启动按配置同步；失败只记日志，不挡启动
await syncNewbieCodes(deps.db, deps.config.newbieCodes, console)
  .then((r) => console.info('sync newbie codes', r))
  .catch((err: unknown) => console.error('sync newbie codes failed', err));
// 已存的区服数值引用了下架的道具、食材（问题记录 367）：只写警告，不挡启动；到后台改掉那几项
await retiredInOverrides(deps.db, deps.config)
  .then((list) => {
    for (const x of list)
      console.warn('shard', x.shardId, 'settings use retired items:', x.errors.join('; '));
  })
  .catch((err: unknown) => console.error('check retired items in shard settings failed', err));
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
