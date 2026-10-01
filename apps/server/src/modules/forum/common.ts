import type { Kysely, Selectable } from 'kysely';
import { ErrorCode } from '@dt/shared';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';

export type PostRow = Selectable<DB['forum_post']>;

/** 本区未删除的帖子；forUpdate 时锁行；不存在（含跨区服、已删除）报 NOT_FOUND */
export async function loadPost(o: Op, id: number, opts: { forUpdate?: boolean } = {}): Promise<PostRow> {
  let q = o.tx
    .selectFrom('forum_post')
    .selectAll()
    .where('id', '=', id)
    .where('shard_id', '=', o.shardId)
    .where('deleted_at', 'is', null);
  if (opts.forUpdate) q = q.forUpdate();
  const r = await q.executeTakeFirst();
  if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'post' });
  return r;
}

/** 当前账号是否论坛管理员：角色 mod 或 admin（每次从库里读，不信任前端） */
export async function isAdmin(db: Kysely<DB>, accountId: number): Promise<boolean> {
  const r = await db.selectFrom('account').select('role').where('id', '=', accountId).executeTakeFirst();
  return r?.role === 'mod' || r?.role === 'admin';
}

export async function isVerified(db: Kysely<DB>, accountId: number): Promise<boolean> {
  const r = await db
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', accountId)
    .executeTakeFirst();
  return !!r?.email_verified_at;
}

/** 邮箱已验证，否则 EMAIL_NOT_VERIFIED */
export async function assertVerified(o: Op, accountId: number): Promise<void> {
  if (!(await isVerified(o.tx, accountId))) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
}

/** 发帖或回复的冷却：本店最近一条的 created_at + sec；已经可以再发时返回 null */
export async function readyAt(
  db: Kysely<DB>,
  table: 'forum_post' | 'forum_reply',
  restId: number,
  sec: number,
  now: Date,
): Promise<Date | null> {
  const r = await db
    .selectFrom(table)
    .select('created_at')
    .where('rest_id', '=', restId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!r) return null;
  const at = new Date(r.created_at.getTime() + sec * 1000);
  return at > now ? at : null;
}

/** 冷却中时报 COOLDOWN（带剩余秒数） */
export async function assertReady(
  o: Op,
  table: 'forum_post' | 'forum_reply',
  sec: number,
  what: 'forum_post' | 'forum_reply',
): Promise<void> {
  const at = await readyAt(o.tx, table, o.rest.id, sec, o.now);
  if (at)
    throw new AppError(ErrorCode.COOLDOWN, 429, {
      what,
      seconds: Math.max(1, Math.ceil((at.getTime() - o.now.getTime()) / 1000)),
    });
}
