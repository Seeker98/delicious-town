import type { Kysely } from 'kysely';
import type { BasketDto } from '@dt/shared';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { addFoods } from '../cupboard/foods';
import { subBasket } from './common';

export async function basketView(db: Kysely<DB>, restId: number): Promise<BasketDto> {
  const rows = await db
    .selectFrom('yard_basket')
    .select(['foods_id', 'num'])
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .orderBy('foods_id')
    .execute();
  return { items: rows.map((r) => ({ foodsId: r.foods_id, num: r.num })) };
}

/** 存进橱柜（设计文档 §3.4）：格子满进冰箱，冰箱满丢弃（addFoods 记日志）；菜篮照扣 num */
export async function storeBasket(
  o: Op,
  b: { foodsId: number; num: number },
): Promise<{ stored: number; dropped: number }> {
  await subBasket(o, b.foodsId, b.num);
  const plan = await addFoods(o, b.foodsId, b.num);
  return { stored: plan.toCupboard + plan.toFridge, dropped: plan.dropped };
}
