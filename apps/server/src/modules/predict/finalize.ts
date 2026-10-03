import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { postNews } from '../news/news';

/**
 * 把事件改为终态（判定或作废），调用方在事务里、事件行已可加锁。
 * 已经是终态（被别人先判定或作废）返回 null、不改。作废时算退款比例（238-1 终审 I1）：
 * 系统净收入（所有人净投入之和，含手续费）÷ 亏损的人的净投入之和，夹在 0~1。
 * 同时在本区服发一条开奖新闻（问题记录 268）
 */
export async function finalizeEvent(
  tx: Kysely<DB>,
  id: string,
  set: {
    status: 'resolved' | 'void';
    outcome: boolean | null;
    note?: string | null;
    /** 判定依据的参数，前端按语言渲染（问题记录 272） */
    noteParams?: Record<string, unknown>;
  },
  now: Date,
): Promise<{ title: string; voidRatio: number | null } | null> {
  const e = await tx
    .selectFrom('predict_event')
    .select(['status', 'title', 'shard_id', 'unit', 'kind', 'params'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst();
  if (!e || (e.status !== 'open' && e.status !== 'closed')) return null;
  let voidRatio: number | null = null;
  if (set.status === 'void') {
    const agg = await tx
      .selectFrom('predict_position')
      .select([
        sql<string>`coalesce(sum(net_cost), 0)`.as('net'),
        sql<string>`coalesce(sum(greatest(net_cost, 0)), 0)`.as('owed'),
      ])
      .where('event_id', '=', id)
      .executeTakeFirstOrThrow();
    const owed = Number(agg.owed);
    voidRatio = owed > 0 ? Math.min(1, Math.max(0, Number(agg.net) / owed)) : 1;
  }
  await tx
    .updateTable('predict_event')
    .set({
      status: set.status,
      outcome: set.outcome,
      resolved_at: now,
      void_ratio: voidRatio,
      ...(set.note !== undefined ? { result_note: set.note } : {}),
      ...(set.noteParams ? { result_params: JSON.stringify(set.noteParams) } : {}),
    })
    .where('id', '=', id)
    .execute();
  // 开奖新闻：参与的店（有过持仓，含已全部卖出的）、押对的店（结算时还持有对的一边）、派出的银币
  const side = set.outcome ? 'yes' : 'no';
  const pos = await tx
    .selectFrom('predict_position')
    .select([
      sql<string>`count(*)`.as('players'),
      sql<string>`count(*) filter (where ${sql.ref(side)} > 0)`.as('winners'),
      sql<string>`coalesce(sum(${sql.ref(side)}), 0)`.as('won'),
    ])
    .where('event_id', '=', id)
    .executeTakeFirstOrThrow();
  // 自动题带题型和出题参数，新闻按语言渲染题目（问题记录 272）
  const base = {
    eventId: Number(id),
    title: e.title,
    ...(e.kind !== 'manual' ? { kind: e.kind, eventParams: e.params } : {}),
  };
  await postNews(tx, {
    shardId: e.shard_id,
    type: 'predict.result',
    params:
      set.status === 'void'
        ? { ...base, outcome: null, voidRatio, players: Number(pos.players) }
        : {
            ...base,
            outcome: set.outcome,
            players: Number(pos.players),
            winners: Number(pos.winners),
            paid: Number(pos.won) * e.unit,
          },
  });
  return { title: e.title, voidRatio };
}
