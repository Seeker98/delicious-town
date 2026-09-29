import { ErrorCode } from '@dt/shared';
import { featureAvailable } from '../../core/features';
import { invalidState, limitReached } from '../../core/errors';
import { restLog, setRest, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { openGift } from '../award/award';
import { addFoods } from '../cupboard/foods';
import { consumeGoods, grantGoodsOp } from './goods';

/** 餐桌A：加 num 张桌，不超过餐桌上限和楼层容量（规格书 07 §7.4、02 §2.7） */
export async function addTables(op: Op, num: number): Promise<number> {
  const tr = await op.tx
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  const perFloor = op.tuning.rest.tablesPerFloor;
  const cap = Math.min(op.rest.table_num, (op.rest.star_level + 1) * perFloor);
  const count = tr.tables.length;
  if (count + num > cap) throw limitReached('tables', { cap, have: count });
  const added = Array.from({ length: num }, (_, i) => {
    const no = count + i + 1;
    return { no, floor: Math.floor((no - 1) / perFloor) + 1, customer: 0 };
  });
  await op.tx
    .updateTable('restaurant_tables')
    .set({ tables: JSON.stringify([...tr.tables, ...added]) })
    .where('rest_id', '=', op.rest.id)
    .execute();
  return count + num;
}

/** 使用道具：按构建时推导的用途分派（设计文档 §5.1）。先扣道具，任何一步失败整体回滚 */
export async function useGoods(
  op: Op,
  goodsId: number,
  num: number,
): Promise<{ goodsId: number; num: number }> {
  const g = op.config.requireGoods(goodsId);
  const use = g.use;
  if (!use) throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId });
  if (use.kind === 'towerTicket' && !featureAvailable(op.settings, 'tower'))
    throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId, reason: 'feature' });
  if (num > 1 && use.kind !== 'gift' && !op.tuning.store.batchUsable.includes(goodsId))
    throw invalidState('no_batch', { goodsId });
  await consumeGoods(op, goodsId, num, { source: 'store.use' });
  switch (use.kind) {
    case 'currency':
      gainCoin(op, use.coin * num);
      gainDiamond(op, use.diamond * num);
      break;
    case 'addTable':
      await addTables(op, num);
      break;
    case 'strength':
      gainStrength(op, use.amount * num);
      break;
    case 'mysteryFood': {
      const list = op.config.foodsByLevel.get(use.level) ?? [];
      for (let i = 0; i < num && list.length > 0; i++)
        await addFoods(op, list[op.rng.int(list.length)]!.id, 1);
      break;
    }
    case 'lockSlots':
      setRest(op, 'foods_lock_num', op.rest.foods_lock_num + use.amount * num);
      break;
    case 'resetAttr': {
      const spent = op.rest.attr_cook + op.rest.attr_cutting + op.rest.attr_fire;
      if (spent === 0) throw invalidState('no_points_to_reset');
      setRest(op, 'attr_left', op.rest.attr_left + spent);
      setRest(op, 'attr_cook', 0);
      setRest(op, 'attr_cutting', 0);
      setRest(op, 'attr_fire', 0);
      break;
    }
    case 'bundle':
      await consumeGoods(op, use.goods, use.num * num, { source: 'store.use' });
      await grantGoodsOp(op, use.targetGoods, use.targetNum * num, { source: 'store.use' });
      break;
    case 'foodsMax':
      setRest(op, 'foods_max_num', op.rest.foods_max_num + use.amount * num);
      break;
    case 'storeNum':
      setRest(op, 'store_num', op.rest.store_num + use.amount * num);
      break;
    case 'cupboardNum':
      setRest(op, 'cupboard_num', Math.min(op.rest.cupboard_num + use.amount * num, op.config.foods.size));
      break;
    case 'gift':
      await openGift(op, g, num);
      break;
    case 'towerTicket':
      throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId });
  }
  restLog(op, 'store.use', { goodsId, num });
  return { goodsId, num };
}
