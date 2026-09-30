import { GOODS } from '@dt/config';
import { ErrorCode, type ReapResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { feedLog, type PairOp } from '../../core/pair';
import { gainRenown } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoods, subFoods } from '../cupboard/foods';
import { hasValidHonor } from '../store/goods';
import { ACTION, actionIncome, addBasket, assertRipe, lockPlant } from './common';
import { canStealLeft, stealNum } from './rules';

/** 边牧：从我的橱柜（数量 > 0、未锁定，按食材 id 排序）随机拿 1 个给对方；橱柜空时返回 null（计划裁定 12） */
async function punish(p: PairOp): Promise<number | null> {
  const rows = await p.me.tx
    .selectFrom('cupboard_food')
    .select('foods_id')
    .where('rest_id', '=', p.me.rest.id)
    .where('num', '>', 0)
    .where('locked', '=', false)
    .orderBy('foods_id')
    .execute();
  if (rows.length === 0) return null;
  const foodsId = rows[p.me.rng.int(rows.length)]!.foods_id;
  await subFoods(p.me, foodsId, 1);
  await addFoods(p.them, foodsId, 1);
  return foodsId;
}

/** 偷好友的菜（规格书 08 §8.3，裁定 4、10）：进我的菜篮；对方剩余产量减去偷走的（不含 reapAddNum） */
export async function stealPlant(p: PairOp, plantId: number): Promise<ReapResultDto> {
  const { me, them } = p;
  const t = me.tuning.yard;
  const plant = await lockPlant(me, plantId, them.rest.id);
  assertRipe(plant);
  const done = await me.tx
    .selectFrom('yard_steal')
    .select('plant_id')
    .where('plant_id', '=', plant.id)
    .where('rest_id', '=', me.rest.id)
    .executeTakeFirst();
  if (done) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'steal' });
  const seed = me.config.seeds.get(plant.seed_id);
  if (!canStealLeft(plant.harvest_num, seed?.harvestNum ?? plant.harvest_max, t))
    throw invalidState('steal_left');
  if (me.rest.renown < 1) throw requirement('renown', { need: 1 });
  actionIncome(me, ACTION.reap, false, me.config.requireFood(plant.foods_id).level);
  gainRenown(me, -1);
  const num = stealNum(seed?.level ?? 1, plant.harvest_num, me.rng, t);
  await me.tx
    .updateTable('yard_plant')
    .set({ harvest_num: plant.harvest_num - num })
    .where('id', '=', plant.id)
    .execute();
  await me.tx.insertInto('yard_steal').values({ plant_id: plant.id, rest_id: me.rest.id }).execute();
  const total = num + ((await opAgg(me)).reapAddNum ?? 0);
  await addBasket(me, plant.foods_id, total);
  const collie = await hasValidHonor(them, GOODS.borderCollie);
  const punished = collie && me.rng.chance(t.reapPunishRate) ? await punish(p) : null;
  feedLog(p, 'yard.stolen', { foodsId: plant.foods_id, num, punished });
  await emitAction(me, 'yard.steal');
  return { foodsId: plant.foods_id, num: total, stolen: true, punished };
}
