import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { foodsNeedFor, padLevels, streetTargetGrade } from '../cookbook/rules';

/**
 * 本街的菜还要哪些食材、各几个（按食材 id 汇总，不减去已有的）：
 * 橱柜、冰箱（问题记录 465）和 13 哥的食材兑换券页（问题记录 491）共用
 */
export async function streetNeeds(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  streetId: number,
  maxGrade: number,
): Promise<{ targetGrade: number; needMap: Map<number, number> }> {
  const cb = await db
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', restId)
    .executeTakeFirstOrThrow();
  const levels = padLevels(new Uint8Array(cb.levels), config.cookbookIndex.slots);
  const streetIds = config.cookbookIndex.idsByStreet.get(streetId) ?? [];
  const targetGrade = streetTargetGrade(levels, config.cookbookIndex.slotOf, streetIds, maxGrade);
  const needOf = (id: number, grade: number) => config.requireCookbook(id).needFoods[grade] ?? [];
  const needMap = foodsNeedFor(streetIds, levels, config.cookbookIndex.slotOf, targetGrade, needOf);
  return { targetGrade, needMap };
}
