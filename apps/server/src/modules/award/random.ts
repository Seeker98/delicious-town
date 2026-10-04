import { GOODS, GOODS_TYPE, type Food, type Goods } from '@dt/config';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { opNeedPick } from '../../core/scarcity';
import { gainCoin, gainExp } from '../../core/resources';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';

export type RandomAwardKind = 'foods' | 'goods' | 'coin' | 'exp';
const KINDS: readonly RandomAwardKind[] = ['foods', 'goods', 'coin', 'exp'];

export interface RandomAward {
  kind: RandomAwardKind;
  /** 物品或食材 id；银币、经验为 null */
  id: number | null;
  num: number;
  /** 物品、食材因幸运数量翻倍 */
  lucky: boolean;
}

export interface RandomAwardOptions {
  level: number;
  /** 厨具档：物品池里放进奖励等级 ≤ 它的厨具；经验、银币 × (厨具档 + 1) */
  equipFlag?: number;
  onlyGoods?: boolean;
  /** 酒吧的奖励不出神秘礼券 */
  noTicket?: boolean;
  source?: string;
}

/** 奖励类型（规格书 00 §0.8）：起点 −(幸运率/1000 + 等级/100000)，依次累加食材、物品、银币、经验；都没中是食材 */
export function awardKindOf(
  r: number,
  luckRate: number,
  level: number,
  rates: Record<RandomAwardKind, number>,
): RandomAwardKind {
  let acc = -(luckRate / 1000 + level / 100000);
  for (const k of KINDS) {
    acc += rates[k];
    if (r < acc) return k;
  }
  return 'foods';
}

/** 经验 = (50 + 幸运总值) × 等级 × (厨具档 + 1)，不为负（计划裁定 2）；银币是它的 2 倍 */
export function awardExp(luckSum: number, level: number, equipFlag: number): number {
  return Math.max(0, 50 + luckSum) * level * (equipFlag + 1);
}

/** 物品池：非厨具且 等级−4 ≤ 奖励等级 ≤ 等级，或厨具且奖励等级 ≤ 厨具档；按 id 排序 */
export function awardGoodsPool(
  goods: readonly Goods[],
  level: number,
  equipFlag: number,
  noTicket: boolean,
): number[] {
  return goods
    .filter((g) => {
      if (g.awardFlag === null) return false;
      if (noTicket && g.id === GOODS.mysteryTicket) return false;
      return g.type === GOODS_TYPE.equip
        ? g.awardFlag <= equipFlag
        : g.awardFlag >= level - 4 && g.awardFlag <= level;
    })
    .map((g) => g.id)
    .sort((a, b) => a - b);
}

/** 食材池：权重 100（普通食材）且等级 ≤ min(等级, 5)；按 id 排序 */
export function awardFoodsPool(foods: readonly Food[], level: number): number[] {
  const max = Math.min(level, 5);
  return foods
    .filter((f) => f.odds === 100 && f.level <= max)
    .map((f) => f.id)
    .sort((a, b) => a - b);
}

/**
 * 随机奖励（规格书 00 §0.8），当场发放。
 * 随机数顺序：类型（onlyGoods 时没有）→ 幸运翻倍（物品、食材）→ 抽取（物品、食材）。物品池空时改发银币
 */
export async function randomAward(o: Op, opts: RandomAwardOptions): Promise<RandomAward> {
  const { level } = opts;
  const equipFlag = opts.equipFlag ?? 0;
  const luck = await opLuck(o);
  const gain = { source: opts.source };
  const coinOrExp = (kind: 'coin' | 'exp'): RandomAward => {
    const exp = awardExp(luck.sum, level, equipFlag);
    const num = kind === 'coin' ? exp * 2 : exp;
    if (kind === 'coin') gainCoin(o, num, gain);
    else gainExp(o, num, gain);
    return { kind, id: null, num, lucky: false };
  };

  const kind = opts.onlyGoods
    ? 'goods'
    : awardKindOf(o.rng.next(), luck.rate, level, o.tuning.bar.awardRates);
  if (kind === 'coin' || kind === 'exp') return coinOrExp(kind);
  const lucky = o.rng.next() < luck.rate;
  const num = lucky ? 2 : 1;
  if (kind === 'goods') {
    const pool = awardGoodsPool(o.config.bundle.goods, level, equipFlag, opts.noTicket ?? false);
    if (pool.length === 0) return coinOrExp('coin');
    const id = pool[o.rng.int(pool.length)]!;
    // 勋章只能有 1 个，不翻倍；返回实际到账的数量（持有上限会丢掉超出的部分）
    const want = o.config.requireGoods(id).type === GOODS_TYPE.honor ? 1 : num;
    const granted = await grantGoodsOp(o, id, want, { ...gain, lucky: lucky && want > 1 });
    return { kind, id, num: granted, lucky: lucky && granted > 1 };
  }
  const pool = awardFoodsPool(o.config.bundle.foods, level);
  // 个人缺料倾向（问题记录 50、68）：命中时给本街学菜正缺的，可以是稀有食材
  const maxLevel = Math.min(level, 5);
  const id = (await opNeedPick(o))(
    (f) => (o.config.foods.get(f)?.level ?? 99) <= maxLevel,
    () => pool[o.rng.int(pool.length)]!,
  );
  await addFoods(o, id, num, { ...gain, lucky });
  return { kind, id, num, lucky };
}
