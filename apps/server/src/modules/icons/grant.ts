import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { MAX_SHOWN_ICONS, iconLive } from '../friend/looks';

/** 有效期换成到期时间：null 永久；until 已过返回 'expired'（定制称号设计 三） */
export function expiryOf(v: { days?: number; until?: string }, now: Date): Date | null | 'expired' {
  if (v.days !== undefined) return new Date(now.getTime() + v.days * 86_400_000);
  if (v.until !== undefined) {
    const d = new Date(v.until);
    return d.getTime() <= now.getTime() ? 'expired' : d;
  }
  return null;
}

/**
 * 发一个称号（定制称号设计 三·领取规则）。邮件、兑换码、后台直接发、一番赏都走这里，一条 upsert 写完，
 * 两次几乎同时领也不会互相覆盖：
 * - 没有或已过期：按这次写（到期、发放时间、发放人），展示中的不满上限就展示；
 * - 已经永久：不变；限时 + 永久：变永久；限时 + 限时：取晚的；续期不改展示状态
 */
export async function grantIcon(
  tx: Kysely<DB>,
  a: { restId: number; key: string; expiresAt: Date | null; now: Date; grantedBy?: number | null },
): Promise<void> {
  const n = await tx
    .selectFrom('rest_icon')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', a.restId)
    .where('shown', '=', true)
    .where('icon_key', '!=', a.key)
    .where(iconLive(a.now))
    .executeTakeFirstOrThrow();
  const shown = Number(n.n) < MAX_SHOWN_ICONS;
  const expired = sql<boolean>`(rest_icon.expires_at is not null and rest_icon.expires_at <= ${a.now})`;
  await tx
    .insertInto('rest_icon')
    .values({
      rest_id: a.restId,
      icon_key: a.key,
      shown,
      expires_at: a.expiresAt,
      granted_at: a.now,
      granted_by: a.grantedBy ?? null,
    })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'icon_key']).doUpdateSet({
        expires_at: sql`case when ${expired} then excluded.expires_at
          when rest_icon.expires_at is null or excluded.expires_at is null then null
          else greatest(rest_icon.expires_at, excluded.expires_at) end`,
        shown: sql`case when ${expired} then excluded.shown else rest_icon.shown end`,
        granted_at: sql`case when ${expired} then excluded.granted_at else rest_icon.granted_at end`,
        granted_by: sql`case when ${expired} then excluded.granted_by else rest_icon.granted_by end`,
      }),
    )
    .execute();
}
