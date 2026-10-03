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

/**
 * 被举报的内容（设计 §3.2）：不存在、已删除时返回 null；区服由调用方比较。
 * lock：举报时给内容行加共享锁。后台正在处理（删除、清空）这条内容时先等它提交，
 * 再按处理后的状态判断，免得对刚删掉的内容开空案（backlog 6B-1）
 */
export async function loadTarget(
  db: Kysely<DB>,
  type: ReportTarget,
  id: number,
  opts: { lock?: boolean } = {},
): Promise<ReportTargetInfo | null> {
  if (type === 'post') {
    const r = await db
      .selectFrom('forum_post as p')
      .innerJoin('restaurant as r', 'r.id', 'p.rest_id')
      .select(['p.shard_id', 'p.rest_id', 'r.account_id', 'p.title', 'p.content'])
      .where('p.id', '=', id)
      .where('p.deleted_at', 'is', null)
      .$if(opts.lock === true, (q) => q.forShare('p'))
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
      .$if(opts.lock === true, (q) => q.forShare(['x', 'p']))
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
      .$if(opts.lock === true, (q) => q.forShare('n'))
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
    .$if(opts.lock === true, (q) => q.forShare())
    .executeTakeFirst();
  if (!r) return null;
  return {
    shardId: r.shard_id,
    restId: r.id,
    accountId: r.account_id,
    text: cut(type === 'rest_name' ? r.name : r.notice),
  };
}
