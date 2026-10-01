import type { ForumListQuery, ForumPostBody } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { createPost, deletePost, editPost } from './posts';
import { listPosts, postDetail, postReads } from './view';

/** 论坛（子项目 4E-3） */
export function createForumService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'forum', source }, fn);

  return {
    list(ctx: RestCtx, q: ForumListQuery) {
      return listPosts(d, ctx, q);
    },
    detail(ctx: RestCtx, id: number) {
      return op(ctx, 'forum.read', (o) => postDetail(o, ctx, id));
    },
    reads(ctx: RestCtx, id: number) {
      return op(ctx, 'forum.reads', (o) => postReads(o, ctx, id));
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
