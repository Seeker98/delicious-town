import type { GoodsUse, Tuning } from '@dt/config';
import { ErrorCode, gameDay, pickWeighted } from '@dt/shared';
import { featureAvailable } from '../../core/features';
import { invalidState, limitReached } from '../../core/errors';
import { restLog, setRest, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { openGift } from '../award/award';
import { incrementDaily } from '../counter/dailyCounter';
import { addFoods } from '../cupboard/foods';
import { drawNeedFoods, opNeedMap, opNeedPick } from '../../core/scarcity';
import { consumeGoods, countGoods, grantGoodsOp } from './goods';
import { KEY } from '../tower/common';

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

/** 不能批量使用的用途：洗点只对当前加点有效；厨塔券在厨塔里一张张用 */
export const NO_BATCH_KINDS: ReadonlySet<string> = new Set(['resetAttr', 'towerTicket']);

export interface UseCapInput {
  /** 现有桌数 */
  tables: number;
  tableNum: number;
  star: number;
  cupboardNum: number;
  foodsTotal: number;
  have: (goodsId: number) => number;
}

/** 一次最多能用几个（不算持有数）；0 = 现在用不了（问题记录：批量上限） */
export function useCap(use: GoodsUse, x: UseCapInput, tuning: Tuning): number {
  const maxBatch = tuning.store.maxBatch;
  if (NO_BATCH_KINDS.has(use.kind)) return 1;
  switch (use.kind) {
    case 'addTable': {
      const cap = Math.min(x.tableNum, (x.star + 1) * tuning.rest.tablesPerFloor);
      return Math.max(0, Math.min(maxBatch, cap - x.tables));
    }
    case 'cupboardNum':
      return Math.max(0, Math.min(maxBatch, Math.ceil((x.foodsTotal - x.cupboardNum) / use.amount)));
    case 'bundle':
      return Math.min(maxBatch, Math.floor(x.have(use.goods) / use.num));
    default:
      return maxBatch;
  }
}

async function opUseCap(op: Op, use: GoodsUse): Promise<number> {
  const tr = await op.tx
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  const bundleHave = use.kind === 'bundle' ? await countGoods(op, use.goods) : 0;
  return useCap(
    use,
    {
      tables: tr.tables.length,
      tableNum: op.rest.table_num,
      star: op.rest.star_level,
      cupboardNum: op.rest.cupboard_num,
      foodsTotal: op.config.foods.size,
      have: () => bundleHave,
    },
    op.tuning,
  );
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
  if (num > 1 && NO_BATCH_KINDS.has(use.kind)) throw invalidState('no_batch', { goodsId });
  if (num > op.tuning.store.maxBatch) throw limitReached('batch', { max: op.tuning.store.maxBatch });
  const cap = await opUseCap(op, use);
  if (use.kind === 'cupboardNum' && cap === 0)
    throw limitReached('cupboard_slots', { max: op.config.foods.size });
  // 餐桌摆满、飞弹不够时让各自的逻辑报更具体的错
  if (cap > 0 && num > cap) throw limitReached('batch', { max: cap });
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
    case 'randomFood': {
      // N 级食材随机券（问题记录 331）：和礼包里的“随机 N 级食材”一样按掉落权重抽，稀有的少
      // 先数好每种抽到几个再一起加：一次用几十张时，同一种食材只写一次、只记一条
      const pool = op.config.foodPools.get(use.level);
      const got = new Map<number, number>();
      // 个人缺料倾向（问题记录 50）
      const needPick = await opNeedPick(op);
      for (let i = 0; i < num && pool && pool.total > 0; i++) {
        const id = needPick(
          (id) => op.config.foods.get(id)?.level === use.level,
          () => pickWeighted(pool, op.rng).id,
        );
        got.set(id, (got.get(id) ?? 0) + 1);
      }
      for (const [id, n] of got) await addFoods(op, id, n);
      break;
    }
    case 'needFood': {
      // 街市补给包（理财设计 §1.1）：按使用时所在街道的缺料清单抽，抽一个扣一个；不缺时同随机食材券
      const pool = op.config.foodPools.get(use.level);
      if (!pool || pool.total === 0) break;
      const got = drawNeedFoods(
        await opNeedMap(op),
        (id) => op.config.foods.get(id)?.level ?? 0,
        use.level,
        num,
        op.rng,
        () => pickWeighted(pool, op.rng).id,
      );
      for (const [id, n] of got) await addFoods(op, id, n);
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
      // 当天厨塔次数 +1（4C-2 设计文档 §3.2）；一次 1 张（NO_BATCH_KINDS）
      await incrementDaily(op.tx, op.rest.id, KEY.ticket, num, gameDay(op.now));
      break;
  }
  restLog(op, 'store.use', { goodsId, num });
  return { goodsId, num };
}
