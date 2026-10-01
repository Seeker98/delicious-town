import { ErrorCode, gameDay, type ForumPostBody } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { assertReady, assertVerified, isAdmin, loadPost } from './common';
import { normalizeText, textOk } from './rules';

/** 规整并校验标题、正文（设计文档 §2.1） */
function cleanPost(o: Op, b: ForumPostBody): { title: string; content: string } {
  const t = o.tuning.forum;
  const title = normalizeText(b.title).replace(/\n/g, ' ');
  const content = normalizeText(b.content);
  if (!textOk(title, t.titleMax)) throw invalidState('post_text', { field: 'title', max: t.titleMax });
  if (!textOk(content, t.contentMax))
    throw invalidState('post_text', { field: 'content', max: t.contentMax });
  return { title, content };
}

/** 发帖：邮箱已验证；60 秒冷却；每天最多 postDailyMax 篇 */
export async function createPost(o: Op, ctx: RestCtx, b: ForumPostBody): Promise<{ id: number }> {
  const t = o.tuning.forum;
  await assertVerified(o, ctx.accountId);
  const { title, content } = cleanPost(o, b);
  await assertReady(o, 'forum_post', t.postCooldownSec, 'forum_post');
  if ((await incrementDaily(o.tx, o.rest.id, 'forum.post', 1, gameDay(o.now))) > t.postDailyMax)
    throw limitReached('forum_post', { max: t.postDailyMax });
  const r = await o.tx
    .insertInto('forum_post')
    .values({
      shard_id: o.shardId,
      rest_id: o.rest.id,
      category: b.category,
      title,
      content,
      created_at: o.now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await emitAction(o, 'post.create');
  restLog(o, 'forum.post', { postId: r.id, category: b.category });
  return { id: r.id };
}

/** 编辑：作者或管理员；不受冷却限制 */
export async function editPost(o: Op, ctx: RestCtx, id: number, b: ForumPostBody): Promise<{ id: number }> {
  const post = await loadPost(o, id, { forUpdate: true });
  if (post.rest_id !== o.rest.id && !(await isAdmin(o.tx, ctx.accountId)))
    throw new AppError(ErrorCode.FORBIDDEN, 403, { what: 'post' });
  const { title, content } = cleanPost(o, b);
  await o.tx
    .updateTable('forum_post')
    .set({ category: b.category, title, content, edited_at: o.now })
    .where('id', '=', id)
    .execute();
  restLog(o, 'forum.edit', { postId: id, by: ctx.accountId });
  return { id };
}

/** 删帖（软删除）：作者能删未置顶、未加精的；管理员都能删 */
export async function deletePost(o: Op, ctx: RestCtx, id: number): Promise<Record<string, never>> {
  const post = await loadPost(o, id, { forUpdate: true });
  const admin = await isAdmin(o.tx, ctx.accountId);
  if (!admin) {
    if (post.rest_id !== o.rest.id) throw new AppError(ErrorCode.FORBIDDEN, 403, { what: 'post' });
    if (post.pinned_at || post.featured_at) throw invalidState('post_locked');
  }
  await o.tx.updateTable('forum_post').set({ deleted_at: o.now }).where('id', '=', id).execute();
  restLog(o, 'forum.delete', { postId: id, by: ctx.accountId });
  return {};
}
