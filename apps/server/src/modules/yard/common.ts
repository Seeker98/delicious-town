import { sql } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { invalidState, notEnough } from '../../core/errors';
import type { Op } from '../../core/op';
import { gainCoin, gainExp, recordChange, spendStrength } from '../../core/resources';
import type { YardPlantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { actionRate, applyLandExp } from './rules';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** 菜园动作 id（income_action） */
export const ACTION = { plant: 50, water: 51, weed: 52, deworm: 53, reap: 54, remove: 55, feed: 56 } as const;

/** 每次菜园操作：扣 1 体力，按动作收益给经验和银币（规格书 20 §20.7）；收获 / 偷菜另加食材等级的经验 */
export function actionIncome(o: Op, actionId: number, own: boolean, extraExp = 0): void {
  spendStrength(o, 1);
  const a = o.config.incomeAction(actionId);
  const r = actionRate(o.rest.level, own);
  gainExp(o, Math.floor(r * a.exp) + extraExp);
  gainCoin(o, Math.floor(r * a.coin));
}

/** 只有自己地里的操作加土地经验 */
export async function addLandExp(o: Op, landId: number, actionId: number): Promise<void> {
  const gain = o.config.incomeAction(actionId).landExp;
  if (gain <= 0) return;
  const land = await o.tx
    .selectFrom('yard_land')
    .select(['level', 'exp'])
    .where('id', '=', landId)
    .executeTakeFirstOrThrow();
  const r = applyLandExp(land.level, land.exp, gain, o.tuning.yard.landMaxLevel);
  await o.tx.updateTable('yard_land').set({ level: r.level, exp: r.exp }).where('id', '=', landId).execute();
}

/** 锁住一株作物（裁定 7：先锁店再锁作物行）；不存在或主人不是 ownerId 时报 no_plant */
export async function lockPlant(o: Op, plantId: number, ownerId: number): Promise<YardPlantRow> {
  const p = await o.tx
    .selectFrom('yard_plant')
    .selectAll()
    .where('id', '=', plantId)
    .where('rest_id', '=', ownerId)
    .forUpdate()
    .executeTakeFirst();
  if (!p) throw invalidState('no_plant');
  return p;
}

/** 枯叶期只能铲除（计划裁定 3） */
export function assertAlive(p: YardPlantRow): void {
  if (p.stage === 5) throw invalidState('withered');
}

/** 收获 / 偷菜前：收获期、无虫、无草 */
export function assertRipe(p: YardPlantRow): void {
  assertAlive(p);
  if (p.stage !== 4) throw invalidState('not_ripe');
  if (p.worm > 0) throw invalidState('has_worm');
  if (p.grass > 0) throw invalidState('has_grass');
}

export async function addBasket(o: Op, foodsId: number, num: number): Promise<void> {
  if (num <= 0) return;
  await o.tx
    .insertInto('yard_basket')
    .values({ rest_id: o.rest.id, foods_id: foodsId, num })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'foods_id']).doUpdateSet({ num: sql<number>`yard_basket.num + ${num}` }),
    )
    .execute();
  recordChange(o, 'basket', num, {}, foodsId);
}

async function basketHave(o: Op, foodsId: number): Promise<number> {
  const r = await o.tx
    .selectFrom('yard_basket')
    .select('num')
    .where('rest_id', '=', o.rest.id)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

/** 从菜篮扣；扣到 0 删行 */
export async function subBasket(o: Op, foodsId: number, num: number): Promise<void> {
  if (num <= 0) return;
  const row = await o.tx
    .updateTable('yard_basket')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', o.rest.id)
    .where('foods_id', '=', foodsId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) throw notEnough('basket', num, await basketHave(o, foodsId), foodsId);
  if (row.num === 0) {
    await o.tx
      .deleteFrom('yard_basket')
      .where('rest_id', '=', o.rest.id)
      .where('foods_id', '=', foodsId)
      .execute();
  }
  recordChange(o, 'basket', -num, {}, foodsId);
}

/** 扣种子（rest_seed）；扣到 0 删行 */
export async function subSeed(o: Op, seedId: number, num: number): Promise<void> {
  if (num <= 0) return;
  const row = await o.tx
    .updateTable('rest_seed')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', o.rest.id)
    .where('seed_id', '=', seedId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) {
    const have = await o.tx
      .selectFrom('rest_seed')
      .select('num')
      .where('rest_id', '=', o.rest.id)
      .where('seed_id', '=', seedId)
      .executeTakeFirst();
    throw notEnough('seed', num, have?.num ?? 0, seedId);
  }
  if (row.num === 0) {
    await o.tx
      .deleteFrom('rest_seed')
      .where('rest_id', '=', o.rest.id)
      .where('seed_id', '=', seedId)
      .execute();
  }
  recordChange(o, 'seed', -num, {}, seedId);
}
