import pino from 'pino';
import { initSeedSecret } from './core/seedSecret';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { createGame } from './game';
import { subscribeSettings } from './infra/settingsBus';
import { untilAborted, waitForLeadership } from './worker/leader';
import { startScheduler } from './worker/scheduler';
import { workerJobs } from './worker/jobs';

/** 收到停止信号后最多等正在跑的任务这么久（compose 里 worker 的 stop_grace_period 是 30 秒） */
const STOP_WAIT_MS = 25_000;

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const deps = createDeps(env);
await initSeedSecret(deps);
const game = createGame(deps);
const settingsSub = subscribeSettings(env.REDIS_URL, (id) => game.shards.invalidate(id));
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
  const scheduler = startScheduler(workerJobs(game, log), log);
  await untilAborted(ac.signal);
  if (!(await scheduler.stop(STOP_WAIT_MS))) {
    // 还有任务在跑：不先放主节点锁（新 worker 会在旧任务没停时开始，backlog）；直接退出，
    // 连接一断数据库回滚没提交的事务、同时释放锁
    log.warn('jobs still running at shutdown, exiting without releasing leadership first');
    process.exit(1);
  }
  await leader.end();
}
settingsSub.close();
await deps.db.destroy();
deps.redis.disconnect();
