import type { Kysely } from 'kysely';
import type { ReportTarget } from '@dt/shared';
import type { DB } from '../../db/schema';

const SNAPSHOT_MAX = 2000;

export interface ReportTargetInfo {
  shardId: number;
  /** 被举报的店 */
  restId: number;
  /** 店主账号 */
  accountId: number;
  /** 当前内容（帖子 = 标题\n正文），截断到 2000 字；公告为空时为 '' */
  text: string;
}

const cut = (s: string) => [...s].slice(0, SNAPSHOT_MAX).join('');

/** 被举报的内容（设计 §3.2）：不存在、已删除时返回 null；区服由调用方比较 */
export async function loadTarget(
  db: Kysely<DB>,
  type: ReportTarget,
  id: number,
): Promise<ReportTargetInfo | null> {
  if (type === 'post') {
    const r = await db
      .selectFrom('forum_post as p')
      .innerJoin('restaurant as r', 'r.id', 'p.rest_id')
      .select(['p.shard_id', 'p.rest_id', 'r.account_id', 'p.title', 'p.content'])
      .where('p.id', '=', id)
      .where('p.deleted_at', 'is', null)
      .executeTakeFirst();
    if (!r) return null;
    return {
      shardId: r.shard_id,
      restId: r.rest_id,
      accountId: r.account_id,
      text: cut(`${r.title}\n${r.content}`),
    };
  }
  if (type === 'reply') {
    const r = await db
      .selectFrom('forum_reply as x')
      .innerJoin('forum_post as p', 'p.id', 'x.post_id')
      .innerJoin('restaurant as r', 'r.id', 'x.rest_id')
      .select(['p.shard_id', 'x.rest_id', 'r.account_id', 'x.content'])
      .where('x.id', '=', id)
      .where('x.deleted_at', 'is', null)
      .where('p.deleted_at', 'is', null)
      .executeTakeFirst();
    if (!r) return null;
    return { shardId: r.shard_id, restId: r.rest_id, accountId: r.account_id, text: cut(r.content) };
  }
  if (type === 'broadcast') {
    const r = await db
      .selectFrom('news as n')
      .innerJoin('restaurant as r', 'r.id', 'n.rest_id')
      .select(['n.shard_id', 'r.id as rest_id', 'r.account_id', 'n.params'])
      .where('n.id', '=', id)
      .where('n.type', '=', 'town.broadcast')
      .executeTakeFirst();
    if (!r) return null;
    const text = (r.params as { text?: unknown }).text;
    return { shardId: r.shard_id, restId: r.rest_id, accountId: r.account_id, text: cut(String(text ?? '')) };
  }
  const r = await db
    .selectFrom('restaurant')
    .select(['shard_id', 'id', 'account_id', 'name', 'notice'])
    .where('id', '=', id)
    .where('npc', '=', false)
    .executeTakeFirst();
  if (!r) return null;
  return {
    shardId: r.shard_id,
    restId: r.id,
    accountId: r.account_id,
    text: cut(type === 'rest_name' ? r.name : r.notice),
  };
}
