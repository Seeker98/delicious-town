import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export type EligibilityReason = 'exchange_level' | 'exchange_age' | 'exchange_email';

/**
 * 开通门槛的判断（156-1 设计 §6.1）：等级、注册天数、邮箱；满足返回 null。交易所、事件预测下单和
 * 今日活跃的提示共用这一份（backlog：活跃项原来抄了一份）
 */
export function eligibilityOf(
  f: { level: number; createdAt: Date; verified: boolean },
  t: { minLevel: number; minAccountDays: number },
  now: Date,
): EligibilityReason | null {
  if (f.level < t.minLevel) return 'exchange_level';
  if (now.getTime() - f.createdAt.getTime() < t.minAccountDays * 86_400_000) return 'exchange_age';
  if (!f.verified) return 'exchange_email';
  return null;
}

/** 开通门槛：读账号后按 eligibilityOf 判断 */
export async function eligibility(o: {
  db: Kysely<DB>;
  level: number;
  accountId: number;
  now: Date;
  t: { minLevel: number; minAccountDays: number };
}): Promise<EligibilityReason | null> {
  if (o.level < o.t.minLevel) return 'exchange_level';
  const acc = await o.db
    .selectFrom('account')
    .select(['created_at', 'email_verified_at'])
    .where('id', '=', o.accountId)
    .executeTakeFirstOrThrow();
  return eligibilityOf(
    { level: o.level, createdAt: acc.created_at, verified: acc.email_verified_at !== null },
    o.t,
    o.now,
  );
}
