import pino from 'pino';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { waitForLeadership } from './worker/leader';
import { startScheduler } from './worker/scheduler';
import { workerJobs } from './worker/jobs';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const deps = createDeps(env);
const ac = new AbortController();
process.once('SIGTERM', () => ac.abort());
process.once('SIGINT', () => ac.abort());

const leader = await waitForLeadership(env.DATABASE_URL, {
  signal: ac.signal,
  onWait: () => log.info('standby: another worker is the leader'),
});
if (leader) {
  leader.on('error', (err) => {
    log.error({ err }, 'leader connection lost, exiting so the container restarts');
    process.exit(1);
  });
  log.info('became leader, starting jobs');
  const scheduler = startScheduler(workerJobs(deps), log);
  await new Promise<void>((resolve) => ac.signal.addEventListener('abort', () => resolve()));
  scheduler.stop();
  await leader.end();
}
await deps.db.destroy();
deps.redis.disconnect();
