import { sql, type Kysely } from 'kysely';
import type { DB } from '../src/db/schema';

/** 当前连接（事务里）的后端进程号：给 waitBlockedBy 用 */
export async function backendPid(db: Kysely<DB>): Promise<number> {
  const r = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db);
  return r.rows[0]!.pid;
}

/**
 * 并发测试：等到有别的连接被 pid 这条连接拿着的锁挡住（backlog：原来等 300 毫秒，赌对方已经卡在锁上）。
 * 只认被这条连接挡住的，同时跑的别的测试文件里的等锁不算
 */
export async function waitBlockedBy(db: Kysely<DB>, pid: number, timeoutMs = 10_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const r = await sql<{ n: number }>`
      select count(*)::int as n from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`.execute(db);
    if (r.rows[0]!.n > 0) return;
    if (Date.now() > end) throw new Error(`没有连接被 ${pid} 挡住`);
    await new Promise((res) => setTimeout(res, 20));
  }
}
