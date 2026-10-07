import { sql } from 'kysely';
import {
  ErrorCode,
  type ForumAdminAction,
  type ForumAdminDto,
  type ForumReactDto,
  type ForumReaction,
} from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { emitAction } from '../../core/action';
import { opNews, restLog, type Op } from '../../core/op';
import { gainDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { grantGoodsOp } from '../store/goods';
import { isAdmin, loadPost } from './common';

const COL: Record<ForumReaction, 'up_num' | 'down_num'> = { up: 'up_num', down: 'down_num' };

/** 赞和踩（设计文档 §2.3）：没有就加；相同就取消；不同就切换。锁帖子行保证计数正确 */
export async function react(o: Op, postId: number, kind: ForumReaction): Promise<ForumReactDto> {
  await loadPost(o, postId, { forUpdate: true });
  const had = await o.tx
    .selectFrom('forum_reaction')
    .select('kind')
    .where('post_id', '=', postId)
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirst();
  const old = (had?.kind as ForumReaction | undefined) ?? null;
  const bump = (k: ForumReaction, n: number) =>
    o.tx
      .updateTable('forum_post')
      .set({ [COL[k]]: sql<number>`${sql.ref(COL[k])} + ${n}` })
      .where('id', '=', postId)
      .execute();
  let mine: ForumReaction | null;
  if (old === null) {
    await o.tx
      .insertInto('forum_reaction')
      .values({ post_id: postId, rest_id: o.rest.id, kind, created_at: o.now })
      .execute();
    await bump(kind, 1);
    mine = kind;
  } else if (old === kind) {
    await o.tx
      .deleteFrom('forum_reaction')
      .where('post_id', '=', postId)
      .where('rest_id', '=', o.rest.id)
      .execute();
    await bump(kind, -1);
    mine = null;
  } else {
    await o.tx
      .updateTable('forum_reaction')
      .set({ kind, created_at: o.now })
      .where('post_id', '=', postId)
      .where('rest_id', '=', o.rest.id)
      .execute();
    await bump(old, -1);
    await bump(kind, 1);
    mine = kind;
  }
  const p = await o.tx
    .selectFrom('forum_post')
    .select(['up_num', 'down_num'])
    .where('id', '=', postId)
    .executeTakeFirstOrThrow();
  return { mine, up: p.up_num, down: p.down_num };
}

/**
 * 置顶和加精（设计文档 §2.4）：只有管理员。第一次加精给作者发奖励（只发一次）；置顶和加精写新闻（挂在作者名下），
 * 重复操作不重复写。me、author 两家店已按店号顺序锁住（author 可以就是 me）
 */
export async function adminPost(
  me: Op,
  author: Op,
  ctx: RestCtx,
  postId: number,
  action: ForumAdminAction,
): Promise<ForumAdminDto> {
  if (!(await isAdmin(me.tx, ctx.accountId)))
    throw new AppError(ErrorCode.FORBIDDEN, 403, { what: 'forum_admin' });
  const post = await loadPost(me, postId, { forUpdate: true });
  if (post.rest_id !== author.rest.id) throw invalidState('post_changed');
  const set: { pinned_at?: Date | null; featured_at?: Date | null; feature_rewarded?: boolean } = {};
  let rewarded = false;
  if (action === 'pin' && !post.pinned_at) {
    set.pinned_at = me.now;
    opNews(author, 'forum.pin', { postId, title: post.title });
  } else if (action === 'unpin') {
    set.pinned_at = null;
  } else if (action === 'feature' && !post.featured_at) {
    set.featured_at = me.now;
    if (!post.feature_rewarded) {
      const r = me.tuning.forum.featureReward;
      for (const [goodsId, num] of r.goods) await grantGoodsOp(author, goodsId, num);
      gainDiamond(author, r.diamond);
      set.feature_rewarded = true;
      rewarded = true;
      opNews(author, 'forum.feature', { postId, title: post.title });
      // 支线“社交”（问题记录 515）：帖子第一次被加精
      await emitAction(author, 'post.featured');
    }
  } else if (action === 'unfeature') {
    set.featured_at = null;
  }
  if (Object.keys(set).length > 0)
    await me.tx.updateTable('forum_post').set(set).where('id', '=', postId).execute();
  restLog(me, 'forum.admin', { postId, action, rewarded });
  const pinned = 'pinned_at' in set ? set.pinned_at !== null : post.pinned_at !== null;
  const featured = 'featured_at' in set ? set.featured_at !== null : post.featured_at !== null;
  return { pinned, featured, rewarded };
}
