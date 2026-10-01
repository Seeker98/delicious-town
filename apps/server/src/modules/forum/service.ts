import type {
  ForumAdminAction,
  ForumAdminDto,
  ForumListQuery,
  ForumPostBody,
  ForumReaction,
  ForumReplyBody,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { ErrorCode } from '@dt/shared';
import { createOp, flushOp, runOp, type Op, type OpResult } from '../../core/op';
import { AppError } from '../../http/errors';
import { withRestaurants } from '../../db/tx';
import { adminPost, react } from './admin';
import { createPost, deletePost, editPost } from './posts';
import { createReply, deleteReply } from './replies';
import { isAdmin } from './common';
import { listPosts, postDetail, postReads, postSource } from './view';

/** 论坛（子项目 4E-3） */
export function createForumService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'forum', source }, fn);

  return {
    react(ctx: RestCtx, id: number, kind: ForumReaction) {
      return op(ctx, 'forum.react', (o) => react(o, id, kind));
    },
    /**
     * 置顶、加精：先按店号顺序锁住管理员和作者两家店，再锁帖子行（和回帖"先锁店、再锁帖子"的顺序一致，不会死锁）；
     * 加精奖励和标记在同一个事务里
     */
    async admin(ctx: RestCtx, id: number, action: ForumAdminAction): Promise<OpResult<ForumAdminDto>> {
      const settings = await d.shards.ensureFeature(ctx.shardId, 'forum');
      // 先查权限再锁店：普通玩家反复调用不会锁住帖子作者的店（PR31 遗留）；事务里 adminPost 还会再查一次
      if (!(await isAdmin(d.db, ctx.accountId)))
        throw new AppError(ErrorCode.FORBIDDEN, 403, { what: 'forum_admin' });
      const pre = await d.db
        .selectFrom('forum_post')
        .select('rest_id')
        .where('id', '=', id)
        .where('shard_id', '=', ctx.shardId)
        .executeTakeFirst();
      const authorId = pre?.rest_id ?? ctx.restaurantId;
      return withRestaurants(d.db, [ctx.restaurantId, authorId], async (tx, rests) => {
        const me = createOp(d, tx, rests.get(ctx.restaurantId)!, settings, { source: 'forum.admin', ctx });
        const author =
          authorId === ctx.restaurantId
            ? me
            : createOp(d, tx, rests.get(authorId)!, settings, {
                source: 'forum.feature',
                now: me.now,
                rng: me.rng,
              });
        const data = await adminPost(me, author, ctx, id, action);
        await flushOp(me);
        if (author !== me) await flushOp(author);
        return { data, events: me.events };
      });
    },
    reply(ctx: RestCtx, id: number, b: ForumReplyBody) {
      return op(ctx, 'forum.reply', (o) => createReply(o, ctx, id, b));
    },
    deleteReply(ctx: RestCtx, id: number) {
      return op(ctx, 'forum.reply.delete', (o) => deleteReply(o, ctx, id));
    },
    list(ctx: RestCtx, q: ForumListQuery) {
      return listPosts(d, ctx, q);
    },
    detail(ctx: RestCtx, id: number) {
      return op(ctx, 'forum.read', (o) => postDetail(o, ctx, id));
    },
    reads(ctx: RestCtx, id: number) {
      return postReads(d, ctx, id);
    },
    source(ctx: RestCtx, id: number) {
      return postSource(d, ctx, id);
    },
    createPost(ctx: RestCtx, b: ForumPostBody) {
      return op(ctx, 'forum.post', (o) => createPost(o, ctx, b));
    },
    editPost(ctx: RestCtx, id: number, b: ForumPostBody) {
      return op(ctx, 'forum.edit', (o) => editPost(o, ctx, id, b));
    },
    deletePost(ctx: RestCtx, id: number) {
      return op(ctx, 'forum.delete', (o) => deletePost(o, ctx, id));
    },
  };
}

export type ForumService = ReturnType<typeof createForumService>;
