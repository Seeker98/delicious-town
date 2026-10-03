import type { Kysely } from 'kysely';
import type { MailTpl, RewardItems } from '@dt/shared';
import type { DB } from '../../db/schema';

export interface NewMail {
  scope: 'rest' | 'shard' | 'all';
  shardId: number | null;
  restId: number | null;
  minLevel: number | null;
  /** 中文原文：后台和旧版前端用 */
  title: string;
  body: string;
  /** 系统邮件的模板（问题记录 272）：前端按语言渲染；管理员写的邮件不传 */
  tpl?: MailTpl;
  items: RewardItems | null;
  source: string;
  actorAccountId: number | null;
}

/** 写一封邮件；created_at、expires_at 用列默认值（数据库时钟，设计 裁定 2、4）。db 可以是调用方的事务 */
export async function sendMail(db: Kysely<DB>, m: NewMail): Promise<number> {
  const r = await db
    .insertInto('mail')
    .values({
      scope: m.scope,
      shard_id: m.shardId,
      rest_id: m.restId,
      min_level: m.minLevel,
      title: m.title,
      body: m.body,
      tpl: m.tpl?.key ?? null,
      tpl_params: m.tpl ? JSON.stringify(m.tpl.params) : null,
      items: m.items ? JSON.stringify(m.items) : null,
      source: m.source,
      actor_account_id: m.actorAccountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
