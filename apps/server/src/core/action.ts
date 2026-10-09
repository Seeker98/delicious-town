import type { Op } from './op';

/** 玩家行为成功后发出，task 模块据此累计任务计数和活跃度（设计文档 §5.1） */
export async function emitAction(op: Op, key: string, n = 1): Promise<void> {
  await op.deps.bus.emit(op.tx, {
    name: 'action',
    shardId: op.shardId,
    restId: op.rest.id,
    payload: { key, n, star: op.rest.star_level, level: op.rest.level, at: op.now.toISOString() },
    events: op.events,
  });
}

/** 另一家店的星级和等级（发动作事件用） */
export interface ActionRest {
  id: number;
  star_level: number;
  level: number;
}

/** 一次读出几家店的星级和等级（不锁行）：每家挂单方几个计数也只读一次（backlog 1010） */
export async function actionRests(op: Op, ids: number[]): Promise<Map<number, ActionRest>> {
  if (ids.length === 0) return new Map();
  const rows = await op.tx
    .selectFrom('restaurant')
    .select(['id', 'star_level', 'level'])
    .where('id', 'in', ids)
    .execute();
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * 给另一家店发动作事件（问题记录 318：交易所成交时挂单方也计数）。
 * 活跃项的星级要求、限时活动的等级门槛按那家店自己的算（backlog 318），星级和等级用 actionRests 读好传进来
 */
export async function emitActionFor(op: Op, r: ActionRest, key: string, n = 1): Promise<void> {
  await op.deps.bus.emit(op.tx, {
    name: 'action',
    shardId: op.shardId,
    restId: r.id,
    payload: { key, n, star: r.star_level, level: r.level, at: op.now.toISOString() },
    events: [],
  });
}
