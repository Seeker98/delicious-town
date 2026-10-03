import { sql, type Kysely } from 'kysely';
import type { AuditPageDto } from '@dt/shared';
import type { DB } from '../../db/schema';
import { cursorOf, parseCursor } from '../restaurant/reads';
import type { AdminActor } from './access';

/** 写审计日志；调用方传入业务事务，保证两者一起成功或一起失败 */
export async function writeAudit(
  db: Kysely<DB>,
  a: {
    actor: AdminActor | null;
    action: string;
    target: string | null;
    detail?: Record<string, unknown>;
    /** 玩家自己的操作（没有后台操作人）时记请求 IP */
    ip?: string | null;
  },
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      actor_account_id: a.actor?.accountId ?? null,
      action: a.action,
      target: a.target,
      detail: JSON.stringify(a.detail ?? {}),
      ip: a.actor?.ip ?? a.ip ?? null,
    })
    .execute();
}
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** 审计列表：按操作人用户名和动作前缀筛选（都不分大小写），游标"时间~id" */
export async function auditPage(
  db: Kysely<DB>,
  q: { actor?: string; action?: string; before?: string; limit: number },
): Promise<AuditPageDto> {
  let s = db
    .selectFrom('audit_log as a')
    .leftJoin('account', 'account.id', 'a.actor_account_id')
    .select(['a.id', 'a.action', 'a.target', 'a.detail', 'a.ip', 'a.created_at', 'account.username']);
  if (q.actor) s = s.where(sql<string>`lower(account.username)`, '=', q.actor.toLowerCase());
  // 不区分大小写（问题记录 316）
  if (q.action) s = s.where('a.action', 'ilike', `${likeEscape(q.action)}%`);
  if (q.before) {
    const c = parseCursor(q.before);
    s = c.id
      ? s.where((eb) =>
          eb.or([
            eb('a.created_at', '<', c.at),
            eb.and([eb('a.created_at', '=', c.at), eb('a.id', '<', Number(c.id))]),
          ]),
        )
      : s.where('a.created_at', '<', c.at);
  }
  const rows = await s
    .orderBy('a.created_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(q.limit + 1)
    .execute();
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      actor: r.username ?? null,
      action: r.action,
      target: r.target,
      detail: r.detail,
      ip: r.ip,
      at: r.created_at.toISOString(),
    })),
    nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
  };
}
