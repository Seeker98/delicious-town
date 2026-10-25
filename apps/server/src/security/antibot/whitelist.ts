import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

/** 白名单多久重新读一次；后台改了名单当场 refresh，别的进程最多晚这么久 */
const REFRESH_MS = 30_000;

/** 防脚本白名单（2026-10-25）：拦截模式下也不拦的账号 */
export interface Whitelist {
  has(accountId: number): Promise<boolean>;
  refresh(): Promise<void>;
  close(): void;
}

/** 照 accessBan 的做法：定时在后台刷新，请求只在第一次时等读取 */
export function createWhitelist(db: Kysely<DB>): Whitelist {
  let cache: Set<number> | null = null;
  let loading: Promise<Set<number>> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const load = async (): Promise<Set<number>> =>
    new Set((await db.selectFrom('antibot_whitelist').select('account_id').execute()).map((r) => r.account_id));
  const reload = (): Promise<Set<number>> =>
    (loading ??= load()
      .then((s) => (cache = s))
      .finally(() => (loading = null)));

  return {
    async has(accountId) {
      if (!timer) {
        timer = setInterval(() => void reload().catch(() => undefined), REFRESH_MS);
        timer.unref();
      }
      return (cache ?? (await reload())).has(accountId);
    },
    async refresh() {
      await reload();
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
