import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { ErrorCode } from '@dt/shared';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { activationTotal } from '../task/rules';

export interface TownRestState {
  hammer_at: Date | null;
  broadcast_at: Date | null;
  big_eater_gift: boolean;
}

/** 本店的小镇状态，没有就建一行（调用方已锁店，不会并发） */
export async function townRest(o: Op): Promise<TownRestState> {
  await o.tx
    .insertInto('town_rest')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('town_rest')
    .select(['hammer_at', 'broadcast_at', 'big_eater_gift'])
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
}

export async function setTownRest(o: Op, patch: Partial<TownRestState>): Promise<void> {
  await o.tx.updateTable('town_rest').set(patch).where('rest_id', '=', o.rest.id).execute();
}

/** 冷却中：带剩余秒数（至少 1） */
export function cooldownError(what: string, until: Date, now: Date): AppError {
  const seconds = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
  return new AppError(ErrorCode.COOLDOWN, 400, { what, seconds });
}

/** 区服要求验证邮箱时（tuning.friend.requireVerifiedEmail），检查本店账号 */
export async function assertVerified(o: Op): Promise<void> {
  if (!o.tuning.friend.requireVerifiedEmail) return;
  const a = await o.tx
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', o.rest.account_id)
    .executeTakeFirstOrThrow();
  if (a.email_verified_at === null) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
}

/** 当日活跃度：算法同任务模块（activationTotal，计数键 act:<id>） */
export async function activationPoints(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  day: string,
): Promise<number> {
  const rows = await db
    .selectFrom('daily_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', restId)
    .where('day', '=', day)
    .where('key', 'like', 'act:%')
    .execute();
  const byKey = new Map(rows.map((r) => [r.key, r.count]));
  const acts = config.bundle.activationTasks.filter((a) => a.limitTimes > 0);
  return activationTotal(acts, new Map(acts.map((a) => [a.id, byKey.get(`act:${a.id}`) ?? 0])));
}
