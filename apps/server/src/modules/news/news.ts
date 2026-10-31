import { sql, type Kysely } from 'kysely';
import { BROADCAST_STYLE_NEWS, type HeadlinesDto, type NewsDto } from '@dt/shared';
import type { DB } from '../../db/schema';
import { dailyHead } from '../daily/read';

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
  /** 只要这些编号（小镇日报的“今日要闻”） */
  ids?: number[];
  /** 只要这个时间以后的 */
  since?: Date;
}

/**
 * 本区服新闻，按 id 倒序；店名取当前名字（左连接，店不存在时为 null）。
 * 收购新闻里被收购的店（params.restId、name）也取当前名字；店不在了去掉 restId，网页就不链到不存在的店（ui1010、backlog）
 */
export async function listNews(db: Kysely<DB>, shardId: number, o: ListNewsOptions): Promise<NewsDto[]> {
  let q = db
    .selectFrom('news as n')
    .leftJoin('restaurant as r', 'r.id', 'n.rest_id')
    .leftJoin('restaurant as t', (j) =>
      j.on(sql<boolean>`n.type = 'acquire.big' and t.id = (n.params->>'restId')::int`),
    )
    .select([
      'n.id',
      'n.type',
      'n.rest_id',
      'r.name as rest_name',
      't.id as target_id',
      't.name as target_name',
      'n.params',
      'n.created_at',
    ])
    .where('n.shard_id', '=', shardId);
  if (o.before !== undefined) q = q.where('n.id', '<', o.before);
  if (o.only && o.only.length > 0) q = q.where('n.type', 'in', o.only);
  if (o.not && o.not.length > 0) q = q.where('n.type', 'not in', o.not);
  if (o.since) q = q.where('n.created_at', '>=', o.since);
  if (o.ids) q = o.ids.length > 0 ? q.where('n.id', 'in', o.ids) : q.where(sql<boolean>`false`);
  const rows = await q.orderBy('n.id', 'desc').limit(o.limit).execute();
  return rows.map((r) => ({
    // news.id 是 bigint，驱动返回字符串
    id: Number(r.id),
    type: r.type,
    restId: r.rest_id,
    restName: r.rest_name ?? null,
    params: r.type === 'acquire.big' ? targetParams(r.params, r.target_id, r.target_name) : r.params,
    createdAt: r.created_at.toISOString(),
  }));
}

/** 收购新闻的被收购店：还在就换成现在的名字，不在了去掉 restId（名字留着新闻当时的） */
function targetParams(
  params: Record<string, unknown>,
  id: number | null,
  name: string | null,
): Record<string, unknown> {
  const p = { ...params };
  if (id === null) delete p.restId;
  else if (name) p.name = name;
  return p;
}

/**
 * 首页头条（设计文档 裁定 21）；daily：区服开了小镇日报时带昨天日报的标题。
 * broadcastHours：广播只要这么多小时内的，更早的只在小镇新闻里（问题记录 553）；不给时不限
 */
export async function headlines(
  db: Kysely<DB>,
  shardId: number,
  o: { daily?: boolean; now?: Date; broadcastHours?: number } = {},
): Promise<HeadlinesDto> {
  const since =
    o.now && o.broadcastHours !== undefined
      ? new Date(o.now.getTime() - o.broadcastHours * 3_600_000)
      : undefined;
  const [news, bc, daily] = await Promise.all([
    // 一番赏大赏也算全服广播，和玩家喇叭一起显示（一番赏设计 §6）
    // 首页最多列 3 条（问题记录 619 改成 2 条，2026-10-16 改回 3 条）
    headNews(db, shardId, o.now),
    listNews(db, shardId, { limit: 1, only: [...BROADCAST_STYLE_NEWS], since }),
    o.daily && o.now ? dailyHead(db, shardId, o.now) : null,
  ]);
  return { news, broadcast: bc[0] ?? null, daily };
}

/** 首页头条先只查这么多天内的（性能整理 2026-10-31） */
const HEAD_RECENT_DAYS = 2;
const HEAD_LIMIT = 3;
/** 近两天不够 3 条的区服，这么久之内直接不限时间查（不用每次多查一条） */
const HEAD_QUIET_MS = 10 * 60_000;
/** 区服 → 到这个时间（毫秒）以前直接不限时间查 */
const quietShards = new Map<number, number>();

/**
 * 首页的 3 条非广播新闻：news 按天分区、保留 30 天，不带时间下限时要把三十几个分区都规划一遍
 * （测试库 38 个分区：新连接上第一次规划 30~46 毫秒、之后约 2.2 毫秒；限在近两天 10~12 毫秒、之后约 0.85 毫秒）。
 * 先查近两天的，不够 3 条再不限时间查一次；新闻的编号和时间同序，够 3 条时就是不限时间的前 3 条。
 * 新闻少的区服记下来，10 分钟内直接不限时间查（和原来一样一条）。记不记只影响先查哪条，结果都一样
 */
async function headNews(db: Kysely<DB>, shardId: number, now?: Date): Promise<NewsDto[]> {
  const o = { limit: HEAD_LIMIT, not: [...BROADCAST_STYLE_NEWS] };
  if (!now || (quietShards.get(shardId) ?? 0) > now.getTime()) return listNews(db, shardId, o);
  const recent = await listNews(db, shardId, {
    ...o,
    since: new Date(now.getTime() - HEAD_RECENT_DAYS * 86_400_000),
  });
  if (recent.length >= HEAD_LIMIT) {
    quietShards.delete(shardId);
    return recent;
  }
  quietShards.set(shardId, now.getTime() + HEAD_QUIET_MS);
  return listNews(db, shardId, o);
}
