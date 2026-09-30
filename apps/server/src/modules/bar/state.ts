import type { Op } from '../../core/op';
import type { BarStateRow } from '../../db/schema';

export type BarStatePatch = Partial<Omit<BarStateRow, 'rest_id'>>;

/** 取本店的酒吧状态行并锁住；第一次玩时先插入（整个操作已经锁了店） */
export async function lockBarState(o: Op): Promise<BarStateRow> {
  await o.tx
    .insertInto('bar_state')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('bar_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export async function saveBarState(o: Op, patch: BarStatePatch): Promise<void> {
  await o.tx.updateTable('bar_state').set(patch).where('rest_id', '=', o.rest.id).execute();
}
