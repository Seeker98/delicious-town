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
