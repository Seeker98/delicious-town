import type { Op } from '../../core/op';
import { invalidState } from '../../core/errors';
import type { TableState } from '../../db/schema';

/** 读餐桌；调用方必须持有这家店的锁（runOp / runPairOp 里） */
export async function readTables(op: Op): Promise<TableState[]> {
  const r = await op.tx
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  return r.tables;
}

export async function writeTables(op: Op, tables: TableState[]): Promise<void> {
  await op.tx
    .updateTable('restaurant_tables')
    .set({ tables: JSON.stringify(tables) })
    .where('rest_id', '=', op.rest.id)
    .execute();
}

export function findTable(tables: TableState[], no: number): TableState {
  const t = tables.find((x) => x.no === no);
  if (!t) throw invalidState('no_table', { no });
  return t;
}

/** 空桌：没有顾客（0）或蟑螂刚被蟑螂药消灭（-3），且没有蟑螂、没有白食者（计划裁定 7） */
export function isEmptyTable(t: TableState): boolean {
  return (t.customer === 0 || t.customer === -3) && !t.roach && !t.freeloader;
}

/** 清空一张桌子（灭蟑螂、结束白食后） */
export function clearTable(t: TableState): TableState {
  return { no: t.no, floor: t.floor, customer: 0 };
}
