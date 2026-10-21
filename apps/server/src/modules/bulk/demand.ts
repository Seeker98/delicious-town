import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { gradeOf, padLevels } from '../cookbook/rules';

export interface FoodShort {
  /** 各店缺的份数合计 */
  short: number;
  /** 缺这种食材的店数 */
  rests: number;
}

/**
 * 区服的食材缺口（2026-10-22，大宗认购按缺口挑食材）：sinceDay 起有动作的店（不含 NPC），
 * 本街还没学会的菜按 1 品级要的料汇总，减去橱柜和冰箱里有的，只算不够的部分
 */
export async function shardShortage(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  sinceDay: string,
): Promise<Map<number, FoodShort>> {
  const out = new Map<number, FoodShort>();
  const rests = await db
    .selectFrom('restaurant')
    .innerJoin('restaurant_cookbooks as c', 'c.rest_id', 'restaurant.id')
    .select(['restaurant.id', 'restaurant.street_id', 'c.levels'])
    .where('restaurant.shard_id', '=', shardId)
    .where('restaurant.npc', '=', false)
    .where('restaurant.id', 'in', (eb) =>
      eb.selectFrom('daily_counter').select('rest_id').distinct().where('day', '>=', sinceDay),
    )
    .execute();
  if (rests.length === 0) return out;
  const held = new Map<string, number>();
  const foods = await db
    .selectFrom('cupboard_food')
    .select(['rest_id', 'foods_id', 'num', 'fridge_num'])
    .where(
      'rest_id',
      'in',
      rests.map((r) => r.id),
    )
    .execute();
  for (const f of foods) held.set(`${f.rest_id}:${f.foods_id}`, f.num + f.fridge_num);
  const { slotOf, slots, idsByStreet } = config.cookbookIndex;
  for (const r of rests) {
    const levels = padLevels(new Uint8Array(r.levels), slots);
    const need = new Map<number, number>();
    for (const id of idsByStreet.get(r.street_id) ?? []) {
      if (gradeOf(levels, slotOf, id) > 0) continue;
      for (const x of config.requireCookbook(id).needFoods[1] ?? [])
        need.set(x.foodsId, (need.get(x.foodsId) ?? 0) + x.num);
    }
    for (const [foodsId, n] of need) {
      const s = n - (held.get(`${r.id}:${foodsId}`) ?? 0);
      if (s <= 0) continue;
      const cur = out.get(foodsId) ?? { short: 0, rests: 0 };
      out.set(foodsId, { short: cur.short + s, rests: cur.rests + 1 });
    }
  }
  return out;
}
