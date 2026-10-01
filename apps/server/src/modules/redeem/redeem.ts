import type { RedeemResultDto, RewardItems } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import type { Op } from '../../core/op';
import { grantRewardOp } from '../mail/reward';

const failKey = (accountId: number) => `redeem:fail:${accountId}`;

/**
 * 兑换（设计 裁定 13~17）：只有"码不存在"计入失败次数，其他失败说明码是真的。
 * `redeem_use` 唯一约束防同一家店重复兑换，`used_count` 条件更新防超发；后面抛错会回滚前面的插入
 */
export async function redeemOp(o: Op, d: GameDeps, ctx: RestCtx, input: string): Promise<RedeemResultDto> {
  const code = input.trim().toUpperCase();
  const { failLimit, failWindowSec } = o.tuning.redeem;
  const key = failKey(ctx.accountId);
  if (Number((await d.redis.get(key)) ?? 0) >= failLimit) throw invalidState('too_many_tries');

  const row = await o.tx.selectFrom('redeem_code').selectAll().where('code', '=', code).executeTakeFirst();
  if (!row) {
    const n = await d.redis.incr(key);
    if (n === 1) await d.redis.expire(key, failWindowSec);
    throw invalidState('code_not_found');
  }
  if (row.disabled_at) throw invalidState('code_disabled');
  if (row.starts_at && row.starts_at > o.now) throw invalidState('code_not_started');
  if (row.ends_at && row.ends_at <= o.now) throw invalidState('code_expired');
  if (row.shard_id !== null && row.shard_id !== o.shardId) throw invalidState('code_wrong_shard');
  if (row.min_level !== null && row.min_level > o.rest.level)
    throw invalidState('code_level', { level: row.min_level });

  const used = await o.tx
    .insertInto('redeem_use')
    .values({ code_id: row.id, rest_id: o.rest.id, account_id: ctx.accountId })
    .onConflict((oc) => oc.columns(['code_id', 'rest_id']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!used) throw invalidState('code_used');

  const counted = await o.tx
    .updateTable('redeem_code')
    .set((eb) => ({ used_count: eb('used_count', '+', 1) }))
    .where('id', '=', row.id)
    .where((eb) => eb.or([eb('max_uses', 'is', null), eb('used_count', '<', eb.ref('max_uses'))]))
    .returning('id')
    .executeTakeFirst();
  if (!counted) throw invalidState('code_used_up');

  const items = row.items as RewardItems;
  await grantRewardOp(o, items, { source: 'redeem', logType: 'redeem', logParams: { code } });
  return { code, items };
}
