import { sql } from 'kysely';
import { setRest, type Op } from '../../core/op';
import type { McCookRow } from '../../db/schema';

/** 这家店当前在售的批次 */
export async function currentCook(op: Op): Promise<McCookRow | null> {
  if (op.rest.mc_cook_id === null) return null;
  const r = await op.tx
    .selectFrom('mc_cook')
    .selectAll()
    .where('id', '=', op.rest.mc_cook_id)
    .executeTakeFirst();
  return r ?? null;
}

/** 结束一批：写结束时间和原因，清空店主指针 */
export async function endCook(op: Op, cookId: number, reason: 'sold' | 'dumped' | 'eaten'): Promise<void> {
  await op.tx
    .updateTable('mc_cook')
    .set({ ended_at: op.now, end_reason: reason })
    .where('id', '=', cookId)
    .where('ended_at', 'is', null)
    .execute();
  if (op.rest.mc_cook_id === cookId) setRest(op, 'mc_cook_id', null);
}

/**
 * 扣份数（结算、品尝共用；op 是店主的 op，店已锁）：调用方保证 n ≤ 剩余份数。
 * 扣到 0 时结束这批。返回剩余份数
 */
export async function consumeSpecial(
  op: Op,
  cookId: number,
  n: number,
  reason: 'sold' | 'eaten',
): Promise<number> {
  const row = await op.tx
    .updateTable('mc_cook')
    .set({ left_num: sql<number>`left_num - ${n}` })
    .where('id', '=', cookId)
    .where('ended_at', 'is', null)
    .where('left_num', '>=', n)
    .returning('left_num')
    .executeTakeFirst();
  if (!row) throw new Error(`mc_cook ${cookId}: cannot take ${n} portions`);
  if (row.left_num === 0) await endCook(op, cookId, reason);
  return row.left_num;
}
