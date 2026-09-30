import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { FriendYardDto, PlantDto, StealBlock, YardDto } from '@dt/shared';
import type { DB, RestaurantRow, YardPlantRow } from '../../db/schema';
import {
  canStealLeft,
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

/** 偷菜被挡住的原因（顺序与 stealPlant 的检查一致，声望放最后） */
export function stealBlock(
  p: YardPlantRow,
  stolen: boolean,
  renown: number,
  baseNum: number,
  t: YardTuning,
): StealBlock {
  if (stolen) return 'stolen';
  if (p.stage === 5) return 'withered';
  if (p.stage !== 4) return 'not_ripe';
  if (p.worm > 0) return 'has_worm';
  if (p.grass > 0) return 'has_grass';
  if (!canStealLeft(p.harvest_num, baseNum, t)) return 'steal_left';
  if (renown < 1) return 'renown';
  return null;
}

/** 好友菜园（设计文档 §5）：me 是看的人，them 是菜园主人 */
export async function friendYardView(
  db: Kysely<DB>,
  config: GameConfig,
  me: RestaurantRow,
  them: RestaurantRow,
  t: YardTuning,
  now: Date,
): Promise<FriendYardDto> {
  const lands = await db
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', them.id)
    .orderBy('no')
    .execute();
  const plants = await db.selectFrom('yard_plant').selectAll().where('rest_id', '=', them.id).execute();
  const byLand = new Map(plants.map((p) => [p.land_id, p]));
  const stolen =
    plants.length === 0
      ? new Set<number>()
      : new Set(
          (
            await db
              .selectFrom('yard_steal')
              .select('plant_id')
              .where('rest_id', '=', me.id)
              .where(
                'plant_id',
                'in',
                plants.map((p) => p.id),
              )
              .execute()
          ).map((r) => r.plant_id),
        );
  return {
    restId: them.id,
    name: them.name,
    lands: lands.map((l) => {
      const p = byLand.get(l.id);
      if (!p) return { no: l.no, level: l.level, plant: null };
      const dto = plantDto(p, config, now);
      return {
        no: l.no,
        level: l.level,
        plant: {
          ...dto,
          stolen: stolen.has(p.id),
          stealBlock: stealBlock(p, stolen.has(p.id), me.renown, dto.baseNum, t),
        },
      };
    }),
    strength: me.strength,
    renown: me.renown,
  };
}
