import type { Updateable } from 'kysely';
import type { ReapResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState } from '../../core/errors';
import { opAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { feedLog, type PairOp } from '../../core/pair';
import type { YardPlantRow, YardPlantTable } from '../../db/schema';
import { consumeGoods } from '../store/goods';
import { addSeeds } from '../temple/common';
import {
  ACTION,
  actionIncome,
  addBasket,
  addLandExp,
  assertAlive,
  assertRipe,
  badInput,
  lockPlant,
  subSeed,
} from './common';
import { canWater, dryWaterMinutes, feedUseful, harvestNumOf, landBonus } from './rules';

type StageCol = 'infancy' | 'maturity' | 'autumn';
const STAGE_COL: Partial<Record<number, StageCol>> = { 1: 'infancy', 2: 'maturity', 3: 'autumn' };

/** 作物的主人：好友操作时是 pair.them，自己的地 pair = null */
const ownerOf = (o: Op, pair: PairOp | null): number => pair?.them.rest.id ?? o.rest.id;

/** 播种（规格书 08 §8.3）：产量 = ⌊种子产量 × (100 + 土地加成) / 100⌋ */
export async function plantSeed(o: Op, b: { landNo: number; seedId: number }): Promise<{ plantId: number }> {
  const seed = o.config.seeds.get(b.seedId);
  if (!seed) throw badInput('no_seed');
  const land = await o.tx
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('no', '=', b.landNo)
    .executeTakeFirst();
  if (!land) throw invalidState('no_land');
  const busy = await o.tx
    .selectFrom('yard_plant')
    .select('id')
    .where('land_id', '=', land.id)
    .executeTakeFirst();
  if (busy) throw invalidState('land_busy');
  await subSeed(o, seed.id, 1);
  actionIncome(o, ACTION.plant, true);
  const num = harvestNumOf(seed.harvestNum, landBonus(land.level, o.tuning.yard));
  const row = await o.tx
    .insertInto('yard_plant')
    .values({
      rest_id: o.rest.id,
      shard_id: o.shardId,
      land_id: land.id,
      seed_id: seed.id,
      foods_id: seed.foodsId,
      stage: 1,
      stage_at: o.now,
      infancy: seed.infancy,
      maturity: seed.maturity,
      autumn: seed.autumn,
      harvest: seed.harvest,
      harvest_num: num,
      harvest_max: num,
      planted_at: o.now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await addLandExp(o, land.id, ACTION.plant);
  await emitAction(o, 'yard.plant');
  return { plantId: row.id };
}

/** 照料之后：自己的地加土地经验，好友的地写对方动态；活跃计数 */
async function afterCare(
  o: Op,
  pair: PairOp | null,
  p: YardPlantRow,
  actionId: number,
  what: 'water' | 'weed' | 'deworm',
): Promise<void> {
  if (pair) feedLog(pair, 'yard.helped', { what, foodsId: p.foods_id });
  else await addLandExp(o, p.land_id, actionId);
  await emitAction(o, `yard.${what}`);
}

/** 浇水（自己或好友）：干涸时只解除干涸并缩短本阶段（收获期不缩短，计划裁定 4）；否则进入下一阶段 */
export async function waterPlant(o: Op, pair: PairOp | null, plantId: number): Promise<{ stage: number }> {
  const p = await lockPlant(o, plantId, ownerOf(o, pair));
  assertAlive(p);
  let patch: Updateable<YardPlantTable>;
  if (p.dry > 0) {
    patch = { dry: 0 };
    const col = STAGE_COL[p.stage];
    if (col) {
      const seed = o.config.seeds.get(p.seed_id);
      if (seed) patch[col] = dryWaterMinutes(p[col], seed[col], o.tuning.yard);
    }
  } else {
    if (p.stage === 4) throw invalidState('no_water');
    if (p.worm > 0) throw invalidState('has_worm');
    if (p.grass > 0) throw invalidState('has_grass');
    if (!canWater(p, o.now)) throw invalidState('no_water');
    patch = { stage: p.stage + 1, stage_at: o.now, feed_min: 0 };
  }
  actionIncome(o, ACTION.water, pair === null);
  await o.tx.updateTable('yard_plant').set(patch).where('id', '=', p.id).execute();
  await afterCare(o, pair, p, ACTION.water, 'water');
  return { stage: typeof patch.stage === 'number' ? patch.stage : p.stage };
}

/** 除草：清零 */
export async function weedPlant(o: Op, pair: PairOp | null, plantId: number): Promise<{ plantId: number }> {
  const p = await lockPlant(o, plantId, ownerOf(o, pair));
  assertAlive(p);
  if (p.grass <= 0) throw invalidState('no_grass');
  actionIncome(o, ACTION.weed, pair === null);
  await o.tx.updateTable('yard_plant').set({ grass: 0 }).where('id', '=', p.id).execute();
  await afterCare(o, pair, p, ACTION.weed, 'weed');
  return { plantId: p.id };
}

/** 除虫：一次 −1 */
export async function dewormPlant(o: Op, pair: PairOp | null, plantId: number): Promise<{ plantId: number }> {
  const p = await lockPlant(o, plantId, ownerOf(o, pair));
  assertAlive(p);
  if (p.worm <= 0) throw invalidState('no_worm');
  actionIncome(o, ACTION.deworm, pair === null);
  await o.tx
    .updateTable('yard_plant')
    .set({ worm: p.worm - 1 })
    .where('id', '=', p.id)
    .execute();
  await afterCare(o, pair, p, ACTION.deworm, 'deworm');
  return { plantId: p.id };
}

/** 施肥（只能给自己的作物）：本阶段剩余时间要大于肥料分钟数 */
export async function feedPlant(
  o: Op,
  b: { plantId: number; goodsId: number },
): Promise<{ feedMin: number }> {
  const minutes = o.config.fertilizers.get(b.goodsId);
  if (minutes === undefined) throw badInput('not_fertilizer');
  const p = await lockPlant(o, b.plantId, o.rest.id);
  assertAlive(p);
  if (!feedUseful(p, minutes)) throw invalidState('feed_useless');
  await consumeGoods(o, b.goodsId, 1);
  actionIncome(o, ACTION.feed, true);
  const feedMin = p.feed_min + minutes;
  await o.tx.updateTable('yard_plant').set({ feed_min: feedMin }).where('id', '=', p.id).execute();
  await addLandExp(o, p.land_id, ACTION.feed);
  return { feedMin };
}

/** 铲除（任何阶段）：removeSeedRate 概率返还 1 颗种子 */
export async function removePlant(o: Op, plantId: number): Promise<{ seedBack: boolean }> {
  const p = await lockPlant(o, plantId, o.rest.id);
  actionIncome(o, ACTION.remove, true);
  const seedBack = o.rng.chance(o.tuning.yard.removeSeedRate);
  if (seedBack) await addSeeds(o, p.seed_id, 1);
  await o.tx.deleteFrom('yard_plant').where('id', '=', p.id).execute();
  await addLandExp(o, p.land_id, ACTION.remove);
  return { seedBack };
}

/** 收获自己的作物：剩余产量 + reapAddNum 进菜篮，删除作物（裁定 6、10） */
export async function reapPlant(o: Op, plantId: number): Promise<ReapResultDto> {
  const p = await lockPlant(o, plantId, o.rest.id);
  assertRipe(p);
  actionIncome(o, ACTION.reap, true, o.config.requireFood(p.foods_id).level);
  const num = p.harvest_num + ((await opAgg(o)).reapAddNum ?? 0);
  await addBasket(o, p.foods_id, num);
  await o.tx.deleteFrom('yard_plant').where('id', '=', p.id).execute();
  await addLandExp(o, p.land_id, ACTION.reap);
  await emitAction(o, 'yard.harvest');
  return { foodsId: p.foods_id, num, stolen: false, punished: null };
}
