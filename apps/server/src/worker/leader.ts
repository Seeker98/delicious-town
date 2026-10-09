import pg from 'pg';

export const LEADER_LOCK_KEY = 7_020_001;

/** PostgreSQL 会话级咨询锁：连接断开时自动释放，另一个 worker 就能接管 */
export async function tryLead(client: pg.Client, key = LEADER_LOCK_KEY): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [key]);
  return r.rows[0]?.ok === true;
}

export async function waitForLeadership(
  url: string,
  opts: { key?: number; intervalMs?: number; signal?: AbortSignal; onWait?: () => void } = {},
): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  while (!opts.signal?.aborted) {
    if (await tryLead(client, opts.key)) return client;
    opts.onWait?.();
    await new Promise((resolve) => setTimeout(resolve, opts.intervalMs ?? 5000));
  }
  await client.end();
  return null;
}

/** 等到收到停止信号；信号已经到了就直接返回（backlog 1010：抢到锁的那一下收到信号，后挂的监听永远等不到） */
export function untilAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}
