import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  FORUM_CATEGORIES,
  gameDay,
  type ForumCategory,
  type ForumListDto,
  type ForumListQuery,
  type ForumPostDetailDto,
  type ForumPostItemDto,
  type ForumPostSourceDto,
  type ForumReaction,
  type ForumReadsDto,
  type ForumReplyDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { isAdmin, isVerified, loadPost, readyAt, type PostRow } from './common';
import { decodeCursor, encodeCursor, excerpt, likePattern, normalizeText, textLength } from './rules';

/** 最后动态时间：有回复是最后回复时间，否则是发帖时间 */
const ACTIVE = sql<Date>`coalesce(p.last_reply_at, p.created_at)`;

function toItem(p: PostRow, restName: string, n: number): ForumPostItemDto {
  return {
    id: p.id,
    category: p.category as ForumCategory,
    title: p.title,
    excerpt: excerpt(p.content, n),
    restId: p.rest_id,
    restName,
    createdAt: p.created_at.toISOString(),
    activeAt: (p.last_reply_at ?? p.created_at).toISOString(),
    readNum: p.read_num,
    upNum: p.up_num,
    downNum: p.down_num,
    replyCount: p.reply_count,
    pinned: p.pinned_at !== null,
    featured: p.featured_at !== null,
  };
}

function baseQuery(db: Kysely<DB>, shardId: number, tab: ForumListQuery['tab'], pattern: string | null) {
  let q = db
    .selectFrom('forum_post as p')
    .innerJoin('restaurant as r', 'r.id', 'p.rest_id')
    .selectAll('p')
    .select('r.name as rest_name')
    .where('p.shard_id', '=', shardId)
    .where('p.deleted_at', 'is', null);
  if ((FORUM_CATEGORIES as readonly string[]).includes(tab)) q = q.where('p.category', '=', tab);
  if (pattern)
    q = q.where((eb) => eb.or([eb('p.title', 'ilike', pattern), eb('p.content', 'ilike', pattern)]));
  return q;
}

/** 帖子列表（设计文档 §2.5）：置顶只在第一页；普通帖按最后动态时间倒序，游标翻页 */
export async function listPosts(d: GameDeps, ctx: RestCtx, q: ForumListQuery): Promise<ForumListDto> {
  const { tuning } = await d.shards.ensureFeature(ctx.shardId, 'forum');
  const t = tuning.forum;
  const now = d.now();
  const kw = normalizeText(q.q ?? '');
  if (textLength(kw) > t.queryMax) throw invalidState('query_text', { max: t.queryMax });
  const pattern = kw ? likePattern(kw) : null;
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cursor) throw invalidState('cursor');
  const featured = q.tab === 'featured';

  let items = baseQuery(d.db, ctx.shardId, q.tab, pattern);
  if (featured) {
    items = items
      .where('p.featured_at', 'is not', null)
      .orderBy('p.featured_at', 'desc')
      .orderBy('p.id', 'desc');
    if (cursor) items = items.where(sql<boolean>`(p.featured_at, p.id) < (${cursor.at}, ${cursor.id})`);
  } else {
    items = items.where('p.pinned_at', 'is', null).orderBy(ACTIVE, 'desc').orderBy('p.id', 'desc');
    if (cursor) items = items.where(sql<boolean>`(${ACTIVE}, p.id) < (${cursor.at}, ${cursor.id})`);
  }
  const rows = await items.limit(t.pageSize + 1).execute();
  const page = rows.slice(0, t.pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > t.pageSize && last
      ? encodeCursor(featured ? last.featured_at! : (last.last_reply_at ?? last.created_at), last.id)
      : null;

  const pinned =
    !cursor && !featured
      ? await baseQuery(d.db, ctx.shardId, q.tab, pattern)
          .where('p.pinned_at', 'is not', null)
          .orderBy('p.pinned_at', 'desc')
          .orderBy('p.id', 'desc')
          .execute()
      : [];

  const at = async (table: 'forum_post' | 'forum_reply', sec: number) =>
    (await readyAt(d.db, table, ctx.restaurantId, sec, now))?.toISOString() ?? null;
  return {
    pinned: pinned.map((p) => toItem(p, p.rest_name, t.excerpt)),
    items: page.map((p) => toItem(p, p.rest_name, t.excerpt)),
    nextCursor,
    now: now.toISOString(),
    me: {
      canPost: await isVerified(d.db, ctx.accountId),
      isAdmin: await isAdmin(d.db, ctx.accountId),
      postReadyAt: await at('forum_post', t.postCooldownSec),
      replyReadyAt: await at('forum_reply', t.replyCooldownSec),
    },
  };
}

/** 回复列表：匿名回复对他人隐藏店名（管理员和本人看到真名）；已删除的内容为空 */
export async function loadReplies(o: Op, postId: number, admin: boolean): Promise<ForumReplyDto[]> {
  const rows = await o.tx
    .selectFrom('forum_reply as x')
    .innerJoin('restaurant as r', 'r.id', 'x.rest_id')
    .selectAll('x')
    .select('r.name as rest_name')
    .where('x.post_id', '=', postId)
    .orderBy('x.floor')
    .execute();
  return rows.map((x) => {
    const visible = !x.anonymous || admin || x.rest_id === o.rest.id;
    const deleted = x.deleted_at !== null;
    return {
      id: x.id,
      floor: x.floor,
      replyTo: x.reply_to,
      restId: visible ? x.rest_id : null,
      restName: visible ? x.rest_name : '匿名',
      anonymous: x.anonymous,
      content: deleted ? '' : x.content,
      createdAt: x.created_at.toISOString(),
      deleted,
      canDelete: !deleted && (admin || x.rest_id === o.rest.id),
    };
  });
}

/** 详情（设计文档 §2.3）：先记阅读（作者不计；第一次读 read_num + 1），再返回全文和回复 */
export async function postDetail(o: Op, ctx: RestCtx, id: number): Promise<ForumPostDetailDto> {
  const t = o.tuning.forum;
  // 不锁帖子行（终审 I2）：同一家店的读已被店锁串行，阅读记录靠主键 upsert，read_num 原子加一
  const post = await loadPost(o, id);
  if (post.rest_id !== o.rest.id) {
    const r = await o.tx
      .insertInto('forum_read')
      .values({ post_id: id, rest_id: o.rest.id, times: 1, first_at: o.now, last_at: o.now })
      .onConflict((oc) =>
        oc
          .columns(['post_id', 'rest_id'])
          .doUpdateSet({ times: sql<number>`forum_read.times + 1`, last_at: o.now }),
      )
      .returning(sql<boolean>`(xmax = 0)`.as('inserted'))
      .executeTakeFirstOrThrow();
    if (r.inserted) {
      await o.tx
        .updateTable('forum_post')
        .set({ read_num: sql<number>`read_num + 1` })
        .where('id', '=', id)
        .execute();
      post.read_num += 1;
    }
  }
  const admin = await isAdmin(o.tx, ctx.accountId);
  const author = post.rest_id === o.rest.id;
  const restName = (
    await o.tx
      .selectFrom('restaurant')
      .select('name')
      .where('id', '=', post.rest_id)
      .executeTakeFirstOrThrow()
  ).name;
  const mine = await o.tx
    .selectFrom('forum_reaction')
    .select('kind')
    .where('post_id', '=', id)
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirst();
  const locked = post.pinned_at !== null || post.featured_at !== null;
  return {
    post: {
      ...toItem(post, restName, t.excerpt),
      content: post.content,
      editedAt: post.edited_at?.toISOString() ?? null,
    },
    mine: (mine?.kind as ForumReaction | undefined) ?? null,
    can: {
      edit: author || admin,
      delete: admin || (author && !locked),
      admin,
      reads: author || admin,
      reply: await isVerified(o.tx, ctx.accountId),
    },
    replies: await loadReplies(o, id, admin),
    now: o.now.toISOString(),
    replyReadyAt:
      (await readyAt(o.tx, 'forum_reply', o.rest.id, t.replyCooldownSec, o.now))?.toISOString() ?? null,
  };
}

/** 本区未删除的帖子（纯读，不锁）；作者或管理员才放行，否则 FORBIDDEN */
async function ownPost(d: GameDeps, ctx: RestCtx, id: number, what: string): Promise<PostRow> {
  const post = await d.db
    .selectFrom('forum_post')
    .selectAll()
    .where('id', '=', id)
    .where('shard_id', '=', ctx.shardId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!post) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'post' });
  if (post.rest_id !== ctx.restaurantId && !(await isAdmin(d.db, ctx.accountId)))
    throw new AppError(ErrorCode.FORBIDDEN, 403, { what });
  return post;
}

/** 编辑页要的正文：不记阅读、不带回复（PR31 遗留） */
export async function postSource(d: GameDeps, ctx: RestCtx, id: number): Promise<ForumPostSourceDto> {
  await d.shards.ensureFeature(ctx.shardId, 'forum');
  const p = await ownPost(d, ctx, id, 'edit');
  return { id: p.id, category: p.category as ForumCategory, title: p.title, content: p.content };
}

/** 阅读明细：只有作者和管理员能看；按最后阅读时间倒序。纯读，不锁店（PR31 遗留） */
export async function postReads(d: GameDeps, ctx: RestCtx, id: number): Promise<ForumReadsDto> {
  const { tuning } = await d.shards.ensureFeature(ctx.shardId, 'forum');
  await ownPost(d, ctx, id, 'reads');
  const rows = await d.db
    .selectFrom('forum_read as x')
    .innerJoin('restaurant as r', 'r.id', 'x.rest_id')
    .leftJoin('forum_reaction as k', (j) =>
      j.onRef('k.post_id', '=', 'x.post_id').onRef('k.rest_id', '=', 'x.rest_id'),
    )
    .select(['x.rest_id', 'r.name', 'x.times', 'x.last_at', 'k.kind'])
    .where('x.post_id', '=', id)
    .orderBy('x.last_at', 'desc')
    .limit(tuning.forum.readsMax)
    .execute();
  return {
    items: rows.map((r) => ({
      restId: r.rest_id,
      name: r.name,
      times: r.times,
      lastDay: gameDay(r.last_at),
      reaction: (r.kind as ForumReaction | null) ?? null,
    })),
  };
}
