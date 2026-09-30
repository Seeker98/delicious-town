import { sql, type Kysely } from 'kysely';
import { notEnough } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { recordChange } from '../../core/resources';
import type { DB } from '../../db/schema';

export interface CupboardState {
  have: number;
  fridge: number;
  slotsUsed: number;
  slots: number;
  max: number;
}

export interface AddPlan {
  toCupboard: number;
  toFridge: number;
  dropped: number;
}

/** 加食材（规格书 00 §0.10）：已有的加到上限，溢出进冰箱；没有且格子满了全部进冰箱；冰箱也满就丢弃 */
export function planAddFoods(s: CupboardState, num: number): AddPlan {
  let toCupboard = 0;
  if (s.have > 0) toCupboard = Math.min(num, Math.max(0, s.max - s.have));
  else if (s.slotsUsed < s.slots) toCupboard = Math.min(num, s.max);
  const left = num - toCupboard;
  const toFridge = Math.min(left, Math.max(0, s.max - s.fridge));
  return { toCupboard, toFridge, dropped: left - toFridge };
}

export interface FoodRow {
  num: number;
  fridge: number;
  locked: boolean;
}

export async function cupboardSlotsUsed(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('cupboard_food')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export async function foodsMap(db: Kysely<DB>, restId: number): Promise<Map<number, FoodRow>> {
  const rows = await db
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num', 'locked'])
    .where('rest_id', '=', restId)
    .execute();
  return new Map(rows.map((r) => [r.foods_id, { num: r.num, fridge: r.fridge_num, locked: r.locked }]));
}

export async function addFoods(
  op: Op,
  foodsId: number,
  num: number,
  opts: { source?: string; lucky?: boolean; event?: boolean } = {},
): Promise<AddPlan> {
  if (num <= 0) return { toCupboard: 0, toFridge: 0, dropped: 0 };
  op.config.requireFood(foodsId);
  const row = await op.tx
    .selectFrom('cupboard_food')
    .select(['num', 'fridge_num'])
    .where('rest_id', '=', op.rest.id)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  const plan = planAddFoods(
    {
      have: row?.num ?? 0,
      fridge: row?.fridge_num ?? 0,
      slotsUsed: await cupboardSlotsUsed(op.tx, op.rest.id),
      slots: op.rest.cupboard_num,
      max: op.rest.foods_max_num,
    },
    num,
  );
  if (plan.toCupboard + plan.toFridge > 0) {
    const unread = plan.toFridge > 0;
    await op.tx
      .insertInto('cupboard_food')
      .values({
        rest_id: op.rest.id,
        foods_id: foodsId,
        num: plan.toCupboard,
        fridge_num: plan.toFridge,
        fridge_unread: unread,
      })
      .onConflict((oc) =>
        oc.columns(['rest_id', 'foods_id']).doUpdateSet({
          num: sql<number>`cupboard_food.num + ${plan.toCupboard}`,
          fridge_num: sql<number>`cupboard_food.fridge_num + ${plan.toFridge}`,
          fridge_unread: sql<boolean>`cupboard_food.fridge_unread or ${unread}`,
        }),
      )
      .execute();
    recordChange(op, 'foods', plan.toCupboard + plan.toFridge, opts, foodsId);
  }
  if (plan.dropped > 0) restLog(op, 'fridge.drop', { foodsId, num: plan.dropped });
  return plan;
}

/**
 * 一次加多种食材：结果和按 Map 顺序逐种 addFoods 一样（占用新格子按顺序算），
 * 但只查一次橱柜、写一次（问题记录：多张探险图卡顿）
 */
export async function addFoodsMany(
  op: Op,
  foods: ReadonlyMap<number, number>,
  opts: { source?: string; lucky?: boolean; event?: boolean } = {},
): Promise<void> {
  const list = [...foods].filter(([, n]) => n > 0);
  if (list.length === 0) return;
  for (const [id] of list) op.config.requireFood(id);
  const rows = await op.tx
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num'])
    .where('rest_id', '=', op.rest.id)
    .execute();
  const byId = new Map(rows.map((r) => [r.foods_id, r]));
  let slotsUsed = rows.filter((r) => r.num > 0).length;
  const values: Array<{ foods_id: number; num: number; fridge_num: number; fridge_unread: boolean }> = [];
  for (const [id, n] of list) {
    const row = byId.get(id);
    const plan = planAddFoods(
      {
        have: row?.num ?? 0,
        fridge: row?.fridge_num ?? 0,
        slotsUsed,
        slots: op.rest.cupboard_num,
        max: op.rest.foods_max_num,
      },
      n,
    );
    if ((row?.num ?? 0) === 0 && plan.toCupboard > 0) slotsUsed += 1;
    if (plan.toCupboard + plan.toFridge > 0) {
      values.push({
        foods_id: id,
        num: plan.toCupboard,
        fridge_num: plan.toFridge,
        fridge_unread: plan.toFridge > 0,
      });
      recordChange(op, 'foods', plan.toCupboard + plan.toFridge, opts, id);
    }
    if (plan.dropped > 0) restLog(op, 'fridge.drop', { foodsId: id, num: plan.dropped });
  }
  if (values.length === 0) return;
  await op.tx
    .insertInto('cupboard_food')
    .values(values.map((v) => ({ rest_id: op.rest.id, ...v })))
    .onConflict((oc) =>
      oc.columns(['rest_id', 'foods_id']).doUpdateSet({
        num: sql<number>`cupboard_food.num + excluded.num`,
        fridge_num: sql<number>`cupboard_food.fridge_num + excluded.fridge_num`,
        fridge_unread: sql<boolean>`cupboard_food.fridge_unread or excluded.fridge_unread`,
      }),
    )
    .execute();
}

/** 从橱柜扣食材（不动冰箱）；扣到 0 且冰箱也空、没锁定时删除这一行 */
export async function subFoods(
  op: Op,
  foodsId: number,
  num: number,
  opts: { source?: string; event?: boolean } = {},
): Promise<void> {
  if (num <= 0) return;
  const row = await op.tx
    .updateTable('cupboard_food')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', op.rest.id)
    .where('foods_id', '=', foodsId)
    .where('num', '>=', num)
    .returning(['num', 'fridge_num', 'locked'])
    .executeTakeFirst();
  if (!row) {
    const have = await op.tx
      .selectFrom('cupboard_food')
      .select('num')
      .where('rest_id', '=', op.rest.id)
      .where('foods_id', '=', foodsId)
      .executeTakeFirst();
    throw notEnough('foods', num, have?.num ?? 0, foodsId);
  }
  if (row.num === 0 && row.fridge_num === 0 && !row.locked) {
    await op.tx
      .deleteFrom('cupboard_food')
      .where('rest_id', '=', op.rest.id)
      .where('foods_id', '=', foodsId)
      .execute();
  }
  recordChange(op, 'foods', -num, opts, foodsId);
}
