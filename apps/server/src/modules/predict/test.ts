import { initialShares } from '@dt/shared';
import type { TestGame } from '../../../test/game';

/** 直接插一个事件（不走后台），返回 id */
export async function newEvent(
  t: TestGame,
  shardId: number,
  o: {
    p0?: number;
    b?: number;
    unit?: number;
    closeInMs?: number;
    status?: 'open' | 'closed' | 'resolved' | 'void';
    title?: string;
  } = {},
): Promise<number> {
  const p0 = o.p0 ?? 0.5;
  const b = o.b ?? 100;
  const s = initialShares(p0, b);
  const r = await t.db
    .insertInto('predict_event')
    .values({
      shard_id: shardId,
      title: o.title ?? '测试事件',
      b,
      unit: o.unit ?? 1000,
      q_yes: s.y,
      q_no: s.n,
      p0,
      open_at: t.clock.now,
      close_at: new Date(t.clock.now.getTime() + (o.closeInMs ?? 3_600_000)),
      status: o.status ?? 'open',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return Number(r.id);
}
