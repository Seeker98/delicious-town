import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { PlantDto, YardDto } from '@dt/shared';
import type { DB, RestaurantRow, YardPlantRow } from '../../db/schema';
import {
  canWater,
  landBonus,
  landExpNeed,
  landPrice,
  minutesLeft,
  stageMinutes,
  type YardTuning,
} from './rules';

export function plantDto(p: YardPlantRow, config: GameConfig, now: Date): PlantDto {
  const seed = config.seeds.get(p.seed_id);
  return {
    id: p.id,
    seedId: p.seed_id,
    foodsId: p.foods_id,
    level: seed?.level ?? 0,
    stage: p.stage,
    canWater: canWater(p, now),
    minutes: minutesLeft(p, now),
    stageMinutes: stageMinutes(p),
    feedMin: p.feed_min,
    worm: p.worm,
    grass: p.grass,
    dry: p.dry,
    harvestNum: p.harvest_num,
    harvestMax: p.harvest_max,
    baseNum: seed?.harvestNum ?? p.harvest_max,
  };
}

/** 我的菜园（设计文档 §5） */
export async function yardView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: YardTuning,
  now: Date,
): Promise<YardDto> {
  const lands = await db
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', rest.id)
    .orderBy('no')
    .execute();
  const plants = await db.selectFrom('yard_plant').selectAll().where('rest_id', '=', rest.id).execute();
  const byLand = new Map(plants.map((p) => [p.land_id, p]));
  const seeds = await db
    .selectFrom('rest_seed')
    .select(['seed_id', 'num'])
    .where('rest_id', '=', rest.id)
    .where('num', '>', 0)
    .orderBy('seed_id')
    .execute();
  const fertIds = [...config.fertilizers.keys()];
  const held =
    fertIds.length === 0
      ? []
      : await db
          .selectFrom('store_item')
          .select(['goods_id', 'num'])
          .where('rest_id', '=', rest.id)
          .where('goods_id', 'in', fertIds)
          .execute();
  return {
    lands: lands.map((l) => {
      const p = byLand.get(l.id);
      return {
        no: l.no,
        level: l.level,
        exp: l.exp,
        expNext: l.level >= t.landMaxLevel ? null : landExpNeed(l.level),
        bonus: landBonus(l.level, t),
        plant: p ? plantDto(p, config, now) : null,
      };
    }),
    maxLands: t.maxLands,
    nextLandCoin: lands.length >= t.maxLands ? null : landPrice(lands.length + 1, t),
    coin: rest.coin,
    strength: rest.strength,
    renown: rest.renown,
    seeds: seeds.map((s) => ({ seedId: s.seed_id, num: s.num })),
    fertilizers: [...config.fertilizers].map(([goodsId, minutes]) => ({
      goodsId,
      minutes,
      num: held.find((h) => h.goods_id === goodsId)?.num ?? 0,
    })),
  };
}
