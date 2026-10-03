import type { Kysely } from 'kysely';
import { BROADCAST_STYLE_NEWS, type HeadlinesDto, type NewsDto } from '@dt/shared';
import type { DB } from '../../db/schema';

export interface NewsInput {
  shardId: number;
  type: string;
  restId?: number;
  params?: Record<string, unknown>;
}

/** 新闻只存事件类型和参数，文案由前端生成 */
export async function postNews(db: Kysely<DB>, news: NewsInput, at?: Date): Promise<void> {
  await db
    .insertInto('news')
    .values({
      shard_id: news.shardId,
      type: news.type,
      rest_id: news.restId ?? null,
      params: JSON.stringify(news.params ?? {}),
      ...(at ? { created_at: at } : {}),
    })
    .execute();
}

export interface ListNewsOptions {
  before?: number;
  limit: number;
  only?: string[];
  not?: string[];
}

/** 本区服新闻，按 id 倒序；店名取当前名字（左连接，店不存在时为 null） */
export async function listNews(db: Kysely<DB>, shardId: number, o: ListNewsOptions): Promise<NewsDto[]> {
  let q = db
    .selectFrom('news as n')
    .leftJoin('restaurant as r', 'r.id', 'n.rest_id')
    .select(['n.id', 'n.type', 'n.rest_id', 'r.name as rest_name', 'n.params', 'n.created_at'])
    .where('n.shard_id', '=', shardId);
  if (o.before !== undefined) q = q.where('n.id', '<', o.before);
  if (o.only && o.only.length > 0) q = q.where('n.type', 'in', o.only);
  if (o.not && o.not.length > 0) q = q.where('n.type', 'not in', o.not);
  const rows = await q.orderBy('n.id', 'desc').limit(o.limit).execute();
  return rows.map((r) => ({
    // news.id 是 bigint，驱动返回字符串
    id: Number(r.id),
    type: r.type,
    restId: r.rest_id,
    restName: r.rest_name ?? null,
    params: r.params,
    createdAt: r.created_at.toISOString(),
  }));
}

/** 首页头条（设计文档 裁定 21） */
export async function headlines(db: Kysely<DB>, shardId: number): Promise<HeadlinesDto> {
  const [news, bc] = await Promise.all([
    // 一番赏大赏也算全服广播，和玩家喇叭一起显示（一番赏设计 §6）
    listNews(db, shardId, { limit: 3, not: [...BROADCAST_STYLE_NEWS] }),
    listNews(db, shardId, { limit: 1, only: [...BROADCAST_STYLE_NEWS] }),
  ]);
  return { news, broadcast: bc[0] ?? null };
}
