import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import type { AdminActor } from './access';

/** 写审计日志；调用方传入业务事务，保证两者一起成功或一起失败 */
export async function writeAudit(
  db: Kysely<DB>,
  a: { actor: AdminActor | null; action: string; target: string | null; detail?: Record<string, unknown> },
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      actor_account_id: a.actor?.accountId ?? null,
      action: a.action,
      target: a.target,
      detail: JSON.stringify(a.detail ?? {}),
      ip: a.actor?.ip ?? null,
    })
    .execute();
}
