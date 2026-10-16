import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';
import type { Op } from './op';

/** 要验证邮箱才能做（老虎机、新手大礼包、兑换码；2026-10-16 小号刷一番赏后加了后两样） */
export async function assertVerified(o: Op): Promise<void> {
  const acc = await o.tx
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', o.rest.account_id)
    .executeTakeFirstOrThrow();
  if (!acc.email_verified_at) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
}
