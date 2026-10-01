import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';

const KEEP_MS = 30 * 86_400_000;

/** 记一次登录（设计 §5，多号检测用）：同一账号、IP、设备只一行，再出现时更新最近时间 */
export async function recordLogin(
  db: Kysely<DB>,
  accountId: number,
  ip: string,
  deviceId: string | null,
): Promise<void> {
  await sql`
    insert into login_trace (account_id, ip, device_id) values (${accountId}, ${ip}, ${deviceId})
    on conflict (account_id, ip, device_key) do update set last_seen = now()`.execute(db);
}

/** 删掉 30 天没再出现的记录，返回删了几行 */
export async function cleanLoginTrace(db: Kysely<DB>, now: Date): Promise<number> {
  const r = await db
    .deleteFrom('login_trace')
    .where('last_seen', '<', new Date(now.getTime() - KEEP_MS))
    .executeTakeFirst();
  return Number(r.numDeletedRows);
}
