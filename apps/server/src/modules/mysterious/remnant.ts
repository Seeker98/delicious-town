import { sql } from 'kysely';
import { notEnough } from '../../core/errors';
import type { Op } from '../../core/op';
import { recordChange, type GainOptions } from '../../core/resources';

export async function remnantNum(op: Op, mcId: number): Promise<number> {
  const r = await op.tx
    .selectFrom('mc_remnant')
    .select('num')
    .where('rest_id', '=', op.rest.id)
    .where('mc_id', '=', mcId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

export async function addRemnant(op: Op, mcId: number, num: number, opts: GainOptions = {}): Promise<void> {
  if (num <= 0) return;
  op.config.requireMc(mcId);
  await op.tx
    .insertInto('mc_remnant')
    .values({ rest_id: op.rest.id, mc_id: mcId, num })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'mc_id']).doUpdateSet({ num: sql<number>`mc_remnant.num + ${num}` }),
    )
    .execute();
  recordChange(op, 'remnant', num, opts, mcId);
}

/** 扣残卷；扣到 0 删行 */
export async function subRemnant(op: Op, mcId: number, num: number, opts: GainOptions = {}): Promise<void> {
  if (num <= 0) return;
  const row = await op.tx
    .updateTable('mc_remnant')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', op.rest.id)
    .where('mc_id', '=', mcId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) throw notEnough('remnant', num, await remnantNum(op, mcId), mcId);
  if (row.num === 0)
    await op.tx
      .deleteFrom('mc_remnant')
      .where('rest_id', '=', op.rest.id)
      .where('mc_id', '=', mcId)
      .execute();
  recordChange(op, 'remnant', -num, opts, mcId);
}
