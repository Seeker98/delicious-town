import { sql } from 'kysely';
import type { MysteriousCookbook } from '@dt/config';
import { ErrorCode, pickWeighted } from '@dt/shared';
import type { Op } from '../../core/op';
import type { NeedPick } from '../../core/scarcity';
import { recordChange } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoodsMany } from '../cupboard/foods';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

export function bump(m: Map<number, number>, id: number, n = 1): void {
  m.set(id, (m.get(id) ?? 0) + n);
}

export const toList = (m: Map<number, number>): Array<{ foodsId: number; num: number }> =>
  [...m].map(([foodsId, num]) => ({ foodsId, num }));

/** 按权重抽一个该等级的食材；needPick 带个人缺料倾向（问题记录 50） */
export function pickFood(o: Op, level: number, needPick: NeedPick): number {
  const pool = o.config.foodPools.get(level);
  if (!pool) throw new Error(`no foods of level ${level}`);
  return needPick(
    (id) => o.config.foods.get(id)?.level === level,
    () => pickWeighted(pool, o.rng).id,
  );
}

/** 合并后一次发放（同一种食材只有一个事件、一条流水；只查、写一次橱柜） */
export async function addFoodsMerged(o: Op, foods: Map<number, number>): Promise<void> {
  await addFoodsMany(o, foods);
}

export async function addSeeds(o: Op, seedId: number, num: number): Promise<void> {
  if (num <= 0) return;
  await o.tx
    .insertInto('rest_seed')
    .values({ rest_id: o.rest.id, seed_id: seedId, num })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'seed_id']).doUpdateSet({ num: sql<number>`rest_seed.num + ${num}` }),
    )
    .execute();
  recordChange(o, 'seed', num, {}, seedId);
}

/** 已学的、等级不超过 maxLevel 的特色菜 */
export async function learnedUpTo(o: Op, maxLevel: number): Promise<MysteriousCookbook[]> {
  const rows = await o.tx.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', o.rest.id).execute();
  return rows.flatMap((r) => {
    const m = o.config.mysterious.get(r.mc_id);
    return m && m.level <= maxLevel ? [m] : [];
  });
}
