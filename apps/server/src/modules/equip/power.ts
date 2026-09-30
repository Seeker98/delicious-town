import type { Kysely } from 'kysely';
import type { SuitDef } from '@dt/config';
import type { DB, RestaurantRow } from '../../db/schema';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs } from './rules';

/** 厨力（烹制份数、以后的厨塔都用）：加点 + 穿戴厨具（含宝石），乘套装百分比（规格书 20 §20.18） */
export async function restPower(
  db: Kysely<DB>,
  rest: RestaurantRow,
  suits: ReadonlyMap<number, SuitDef>,
): Promise<number> {
  const worn = await db
    .selectFrom('equip')
    .selectAll()
    .where('rest_id', '=', rest.id)
    .where('worn', '=', true)
    .execute();
  const gems = await loadGems(
    db,
    worn.map((w) => w.id),
  );
  const gear = worn.reduce((acc, e) => addAttrs(acc, pieceTotal(e, gems.get(e.id) ?? [])), zeroAttrs());
  const points = {
    cook: rest.attr_cook,
    cutting: rest.attr_cutting,
    fire: rest.attr_fire,
    season: rest.attr_season,
    creatives: rest.attr_creatives,
    luck: rest.luck,
  };
  const suitList = activeSuits(
    worn.map((w) => w.suit_id),
    suits,
  );
  return attrSummary(points, gear, suitPct(suitList)).power;
}
