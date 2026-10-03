import { sql } from 'kysely';
import { gameDay, gameTime, type ReportInput } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import type { Op } from '../../core/op';
import { notFound } from '../equip/service';
import { loadTarget } from './targets';

/**
 * 玩家举报（设计 §3.2）：按被举报的内容建案，同一内容只有一个待处理的案子（部分唯一索引），多人挂在上面；
 * 驳回过、内容没改的只记数不开新案。时间都用游戏时钟
 */
export async function reportOp(o: Op, ctx: RestCtx, b: ReportInput): Promise<{ ok: true }> {
  const target = await loadTarget(o.tx, b.targetType, b.targetId, { lock: true });
  if (!target || target.shardId !== o.shardId) throw notFound('report_target', b.targetId);
  if (b.targetType === 'notice' && target.text === '') throw invalidState('report_empty');
  if (target.restId === o.rest.id || target.accountId === ctx.accountId) throw invalidState('report_self');

  const today = await o.tx
    .selectFrom('report_entry')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('reporter_account_id', '=', ctx.accountId)
    .where('created_at', '>=', gameTime(gameDay(o.now), 0))
    .executeTakeFirstOrThrow();
  if (Number(today.n) >= o.tuning.report.dailyMax) throw invalidState('report_daily');

  const openCase = () =>
    o.tx
      .selectFrom('report_case')
      .select('id')
      .where('target_type', '=', b.targetType)
      .where('target_id', '=', b.targetId)
      .where('status', '=', 'open')
      .forUpdate()
      .executeTakeFirst();

  let caseId = (await openCase())?.id;
  if (caseId === undefined) {
    // 只看最近一个结了的案子：它是驳回、且内容和当时一样才只记数。
    // 中间被处理过又改回原样的，要开新案（backlog 6B-1）
    const last = await o.tx
      .selectFrom('report_case')
      .select(['id', 'snapshot', 'status'])
      .where('target_type', '=', b.targetType)
      .where('target_id', '=', b.targetId)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (last && last.status === 'rejected' && last.snapshot === target.text) {
      caseId = last.id;
    } else {
      const inserted = await sql<{ id: number }>`
        insert into report_case
          (shard_id, target_type, target_id, target_rest_id, target_account_id, snapshot, created_at, updated_at)
        values (${o.shardId}, ${b.targetType}, ${b.targetId}, ${target.restId}, ${target.accountId},
                ${target.text}, ${o.now}, ${o.now})
        on conflict (target_type, target_id) where status = 'open' do nothing
        returning id`.execute(o.tx);
      // 并发时另一个人刚开了案：挂到那个案子上
      caseId = inserted.rows[0]?.id ?? (await openCase())?.id;
    }
  }
  if (caseId === undefined) throw invalidState('report_retry');

  const entry = await o.tx
    .insertInto('report_entry')
    .values({
      case_id: caseId,
      reporter_account_id: ctx.accountId,
      reporter_rest_id: o.rest.id,
      reason: b.reason,
      detail: b.detail ?? '',
      created_at: o.now,
    })
    .onConflict((oc) => oc.columns(['case_id', 'reporter_account_id']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!entry) throw invalidState('report_dup');
  await o.tx
    .updateTable('report_case')
    .set((eb) => ({ reporter_count: eb('reporter_count', '+', 1), updated_at: o.now }))
    .where('id', '=', caseId)
    .execute();
  return { ok: true };
}
