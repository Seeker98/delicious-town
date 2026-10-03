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

/**
 * 给另一家店发动作事件（问题记录 318：交易所成交时挂单方也计数）。
 * 没读那家店，不带星级和等级（记 0）：只用于不要求星级的活跃项和任务
 */
export async function emitActionFor(op: Op, restId: number, key: string, n = 1): Promise<void> {
  await op.deps.bus.emit(op.tx, {
    name: 'action',
    shardId: op.shardId,
    restId,
    payload: { key, n, star: 0, level: 0, at: op.now.toISOString() },
    events: [],
  });
}
