import { ErrorCode, type ForumReplyBody, type ForumReplyDto } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { assertReady, assertVerified, isAdmin, loadPost } from './common';
import { normalizeText, textOk } from './rules';

/**
 * 回复（设计文档 §2.2）：锁住帖子行分配楼层号（reply_count + 1），同时更新回复数和最后回复时间。
 * 60 秒冷却跨帖子计；replyTo 必须是本帖已有的楼层（已删除的也可以）
 */
export async function createReply(
  o: Op,
  ctx: RestCtx,
  postId: number,
  b: ForumReplyBody,
): Promise<ForumReplyDto> {
  const t = o.tuning.forum;
  await assertVerified(o, ctx.accountId);
  const content = normalizeText(b.content);
  if (!textOk(content, t.replyMax)) throw invalidState('reply_text', { max: t.replyMax });
  await assertReady(o, 'forum_reply', t.replyCooldownSec, 'forum_reply');
  const post = await loadPost(o, postId, { forUpdate: true });
  if (b.replyTo !== undefined) {
    const target = await o.tx
      .selectFrom('forum_reply')
      .select('id')
      .where('post_id', '=', postId)
      .where('floor', '=', b.replyTo)
      .executeTakeFirst();
    if (!target) throw invalidState('reply_to');
  }
  const floor = post.reply_count + 1;
  const r = await o.tx
    .insertInto('forum_reply')
    .values({
      post_id: postId,
      rest_id: o.rest.id,
      floor,
      reply_to: b.replyTo ?? null,
      anonymous: b.anonymous,
      content,
      created_at: o.now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await o.tx
    .updateTable('forum_post')
    .set({ reply_count: floor, last_reply_at: o.now })
    .where('id', '=', postId)
    .execute();
  restLog(o, 'forum.reply', { postId, floor, anonymous: b.anonymous });
  return {
    id: r.id,
    floor,
    replyTo: b.replyTo ?? null,
    restId: o.rest.id,
    restName: o.rest.name,
    anonymous: b.anonymous,
    content,
    createdAt: o.now.toISOString(),
    deleted: false,
    canDelete: true,
  };
}

/** 删回复（软删除）：回复者本人或管理员；帖子已删除时当作不存在；重复删除不报错 */
export async function deleteReply(o: Op, ctx: RestCtx, replyId: number): Promise<Record<string, never>> {
  const r = await o.tx
    .selectFrom('forum_reply as x')
    .innerJoin('forum_post as p', 'p.id', 'x.post_id')
    .select(['x.rest_id', 'x.deleted_at', 'x.post_id'])
    .where('x.id', '=', replyId)
    .where('p.shard_id', '=', o.shardId)
    .where('p.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'reply' });
  if (r.rest_id !== o.rest.id && !(await isAdmin(o.tx, ctx.accountId)))
    throw new AppError(ErrorCode.FORBIDDEN, 403, { what: 'reply' });
  if (r.deleted_at === null) {
    await o.tx.updateTable('forum_reply').set({ deleted_at: o.now }).where('id', '=', replyId).execute();
    restLog(o, 'forum.reply.delete', { postId: r.post_id, replyId, by: ctx.accountId });
  }
  return {};
}
