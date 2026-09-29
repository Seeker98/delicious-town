import { sql, type Kysely } from 'kysely';
import type { AccountRole } from '@dt/shared';
import type { DB } from '../../db/schema';
import { writeAudit } from './audit';

/** 命令行设角色：设第一个管理员用（设计文档 4.7） */
export async function setRoleByUsername(
  db: Kysely<DB>,
  username: string,
  role: AccountRole,
): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const a = await tx
      .updateTable('account')
      .set({ role })
      .where(sql<string>`lower(username)`, '=', username.toLowerCase())
      .returning('id')
      .executeTakeFirst();
    if (!a) throw new Error('no such user');
    await writeAudit(tx, {
      actor: null,
      action: 'player.role',
      target: `account:${a.id}`,
      detail: { role, via: 'cli' },
    });
    return a.id;
  });
}
