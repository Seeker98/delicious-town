import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

/** 名单多久重新读一次；后台改了名单当场 refresh，别的进程最多晚这么久 */
const REFRESH_MS = 30_000;

/** 防脚本人机验证名单（PR② 2026-10-25）：到期前要求人机验证 */
export interface ChallengeList {
  required(accountId: number, now: Date): Promise<boolean>;
  refresh(): Promise<void>;
  close(): void;
}

/** 照白名单的做法：定时在后台刷新，请求只在第一次时等读取；按到期时间判断，过期的行不用等清理 */
export function createChallengeList(db: Kysely<DB>): ChallengeList {
  let cache: Map<number, number> | null = null;
  let loading: Promise<Map<number, number>> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const load = async (): Promise<Map<number, number>> =>
    new Map(
      (await db.selectFrom('antibot_challenge').select(['account_id', 'until']).execute()).map((r) => [
        r.account_id,
        r.until.getTime(),
      ]),
    );
  const reload = (): Promise<Map<number, number>> =>
    (loading ??= load()
      .then((m) => (cache = m))
      .finally(() => (loading = null)));

  return {
    async required(accountId, now) {
      if (!timer) {
        timer = setInterval(() => void reload().catch(() => undefined), REFRESH_MS);
        timer.unref();
      }
      const until = (cache ?? (await reload())).get(accountId);
      return until !== undefined && until > now.getTime();
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
