import type { Award, GiftItem, Goods } from '@dt/config';
import { pickWeighted } from '@dt/shared';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp, gainRenown } from '../../core/resources';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';

export interface AwardOptions {
  source?: string;
  lucky?: boolean;
  /** 所有数量乘以这个倍数（活跃奖励翻倍等） */
  multiplier?: number;
}

/** 发放奖励（规格书 00 §0.7）；经验走 gainExp，会触发升级 */
export async function grantAward(op: Op, award: Award, opts: AwardOptions = {}): Promise<void> {
  const m = opts.multiplier ?? 1;
  const o = { source: opts.source, lucky: opts.lucky };
  if (award.coin) gainCoin(op, Math.floor(award.coin * m), o);
  if (award.exp) gainExp(op, Math.floor(award.exp * m), o);
  if (award.diamond) gainDiamond(op, Math.floor(award.diamond * m), o);
  if (award.renown) gainRenown(op, Math.floor(award.renown * m), o);
  for (const g of award.goods ?? []) await grantGoodsOp(op, g.id, g.num * m, o);
  for (const f of award.foods ?? []) await addFoods(op, f.id, f.num * m, o);
}

/** [min, max) 的整数 */
function randRange(op: Op, min: number, max: number): number {
  return max > min ? min + op.rng.int(max - min) : min;
}

function pickRandomGoods(op: Op, level: number): number | null {
  const pool = op.config.randomGoodsIds(level);
  return pool.length === 0 ? null : pool[op.rng.int(pool.length)]!;
}

/** 礼包里的食材项：指定 id；flag=master 为万能食材；flag 为数字时是该等级的普通食材 */
function pickGiftFood(op: Op, item: Extract<GiftItem, { type: 'foods' }>): number | null {
  if (item.id !== undefined && item.id > 0) return item.id;
  if (item.flag === 'master') {
    return op.config.masterFoodPool.total > 0 ? pickWeighted(op.config.masterFoodPool, op.rng).id : null;
  }
  const pool = op.config.foodPools.get(Number(item.flag));
  return pool && pool.total > 0 ? pickWeighted(pool, op.rng).id : null;
}

/** 打开礼包 times 次（规格书 07 §7.5）：每项独立按 rate + 幸运率判定，超出 rate 的部分算"幸运" */
export async function openGift(
  op: Op,
  goods: Goods,
  times: number,
  opts: { source?: string } = {},
): Promise<void> {
  const items = goods.gift ?? [];
  const { rate: lr } = await opLuck(op);
  const source = opts.source ?? `gift.${goods.id}`;
  for (let i = 0; i < times; i++) {
    for (const item of items) {
      const roll = op.rng.next();
      if (roll >= item.rate + lr) continue;
      const o = { source, lucky: roll >= item.rate };
      switch (item.type) {
        case 'goods': {
          const id = item.id > 0 ? item.id : pickRandomGoods(op, item.level ?? 1);
          if (id !== null) await grantGoodsOp(op, id, item.num, o);
          break;
        }
        case 'foods': {
          const id = pickGiftFood(op, item);
          if (id !== null) await addFoods(op, id, item.num, o);
          break;
        }
        case 'coin':
          gainCoin(op, randRange(op, item.min, item.max), o);
          break;
        case 'exp':
          gainExp(op, randRange(op, item.min, item.max), o);
          break;
        case 'diamond':
          gainDiamond(op, randRange(op, item.min, item.max), o);
          break;
        case 'renown':
          gainRenown(op, item.num, o);
          break;
      }
    }
  }
}
