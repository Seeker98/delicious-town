import type { Award, GiftItem, Goods } from '@dt/config';
import { pickWeighted } from '@dt/shared';
import { opLuck } from '../../core/luck';
import { opNeedPick, type NeedPick } from '../../core/scarcity';
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

/** 礼包里的食材项：指定 id；flag=master 为万能食材；flag 为数字时是该等级的食材（带个人缺料倾向，问题记录 50） */
function pickGiftFood(op: Op, item: Extract<GiftItem, { type: 'foods' }>, needPick: NeedPick): number | null {
  if (item.id !== undefined && item.id > 0) return item.id;
  if (item.flag === 'master') {
    return op.config.masterFoodPool.total > 0 ? pickWeighted(op.config.masterFoodPool, op.rng).id : null;
  }
  const lv = Number(item.flag);
  const pool = op.config.foodPools.get(lv);
  if (!pool || pool.total <= 0) return null;
  return needPick(
    (id) => op.config.foods.get(id)?.level === lv,
    () => pickWeighted(pool, op.rng).id,
  );
}

/**
 * 打开礼包 times 次（规格书 07 §7.5）：每项独立按 rate + 幸运率判定，超出 rate 的部分算"幸运"。
 * 道具和食材先按（类型, id, 是否幸运）累加，最后一次发放：结果不变，查询和事件少很多（问题记录：批量开礼包慢）
 */
export async function openGift(
  op: Op,
  goods: Goods,
  times: number,
  opts: { source?: string } = {},
): Promise<void> {
  const items = goods.gift ?? [];
  const { rate: lr } = await opLuck(op);
  // 只有按等级随机给食材的项目才用得上缺料倾向：只给银币、道具的礼包不去读菜谱等级和橱柜（质量期 ③）。
  // 准备抽取器不耗随机数，不用时随机结果不变
  const byLevel = items.some(
    (i) => i.type === 'foods' && !(i.id !== undefined && i.id > 0) && i.flag !== 'master',
  );
  const needPick: NeedPick = byLevel ? await opNeedPick(op) : (_accept, fallback) => fallback();
  const source = opts.source ?? `gift.${goods.id}`;
  const pending = new Map<string, { type: 'goods' | 'foods'; id: number; num: number; lucky: boolean }>();
  const add = (type: 'goods' | 'foods', id: number, num: number, lucky: boolean) => {
    const key = `${type}:${id}:${lucky}`;
    const cur = pending.get(key);
    if (cur) cur.num += num;
    else pending.set(key, { type, id, num, lucky });
  };
  for (let i = 0; i < times; i++) {
    for (const item of items) {
      const roll = op.rng.next();
      if (roll >= item.rate + lr) continue;
      const o = { source, lucky: roll >= item.rate };
      switch (item.type) {
        case 'goods': {
          const id = item.id > 0 ? item.id : pickRandomGoods(op, item.level ?? 1);
          if (id !== null) add('goods', id, item.num, o.lucky);
          break;
        }
        case 'foods': {
          const id = pickGiftFood(op, item, needPick);
          if (id !== null) add('foods', id, item.num, o.lucky);
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
  for (const x of pending.values()) {
    const o = { source, lucky: x.lucky };
    if (x.type === 'goods') await grantGoodsOp(op, x.id, x.num, o);
    else await addFoods(op, x.id, x.num, o);
  }
}
