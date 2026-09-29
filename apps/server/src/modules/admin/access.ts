import type { FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { ErrorCode, type AdminRole } from '@dt/shared';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { requireAccount } from '../../security/session';

export interface AdminActor {
  accountId: number;
  username: string;
  role: AdminRole;
  ip: string;
}

const RANK: Record<string, number> = { player: 0, mod: 1, admin: 2 };

/**
 * 后台权限：未登录 401；角色不够或已封禁一律 404，不暴露后台存在（设计文档 裁定 2）。
 * 每次都读库，降级和封禁立即生效（裁定 3）
 */
export async function requireRole(db: Kysely<DB>, req: FastifyRequest, min: AdminRole): Promise<AdminActor> {
  const session = requireAccount(req);
  const a = await db
    .selectFrom('account')
    .select(['id', 'username', 'role', 'banned_at'])
    .where('id', '=', session.data.accountId)
    .executeTakeFirst();
  if (!a || a.banned_at || (RANK[a.role] ?? 0) < RANK[min]!) throw new AppError(ErrorCode.NOT_FOUND, 404);
  return { accountId: a.id, username: a.username, role: a.role as AdminRole, ip: req.ip };
}
