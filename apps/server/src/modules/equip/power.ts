import type { Kysely } from 'kysely';
import { isFeatureEnabled, type EquipAttrs, type ShardSettings, type SuitDef } from '@dt/config';
import type { DB, RestaurantRow } from '../../db/schema';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs, type ActiveSuit } from './rules';

/** 区服关掉了厨具功能（backlog 411~413，用户定：穿戴厨具的幸运、收益加成和套装加成都不生效） */
export function equipOff(settings: Pick<ShardSettings, 'features'>): boolean {
  return !isFeatureEnabled(settings, 'equip');
}

/**
 * 餐厅属性合计（加点 + 穿戴厨具含宝石，乘套装百分比）、厨力、激活的套装（规格书 20 §20.18）。
 * off：区服关掉厨具功能时没有激活的套装（厨具本身的属性照算）
 */
export async function restGear(
  db: Kysely<DB>,
  rest: RestaurantRow,
  suits: ReadonlyMap<number, SuitDef>,
  off = false,
): Promise<{ total: EquipAttrs; power: number; suits: ActiveSuit[] }> {
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
  const list = off
    ? []
    : activeSuits(
        worn.map((w) => w.suit_id),
        suits,
      );
  const { total, power } = attrSummary(points, gear, suitPct(list));
  return { total, power, suits: list };
}

/** 厨力（烹制份数、以后的厨塔都用） */
export async function restPower(
  db: Kysely<DB>,
  rest: RestaurantRow,
  suits: ReadonlyMap<number, SuitDef>,
  off = false,
): Promise<number> {
  return (await restGear(db, rest, suits, off)).power;
}

/** 激活档位里某个效果键之和（如 exploreSuccessRate，不进加成汇总的套装键） */
export function suitEffect(list: ActiveSuit[], key: string): number {
  let sum = 0;
  for (const s of list)
    s.suit.tiers.forEach((tier, i) => (sum += s.active[i] ? (tier.effects[key] ?? 0) : 0));
  return sum;
}
