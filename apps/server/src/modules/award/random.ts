import { GOODS, GOODS_TYPE, type Food, type Goods, type Tuning } from '@dt/config';
import { buildPool, pickWeighted } from '@dt/shared';
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
  /** 酒吧小游戏（问题记录 352）：类型比例用 bar.prize.rates，食材按奖励档次出更高级、更稀有的 */
  bar?: boolean;
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

/** 食材池：权重 100（普通食材）且等级 ≤ min(等级, 5)，下架的不算（问题记录 367）；按 id 排序 */
export function awardFoodsPool(foods: readonly Food[], level: number): number[] {
  const max = Math.min(level, 5);
  return foods
    .filter((f) => f.odds === 100 && f.level <= max && !f.retired)
    .map((f) => f.id)
    .sort((a, b) => a - b);
}

export type PrizeFoodTier = Tuning['bar']['prize']['foodTiers'][number];

/** 酒吧奖励的食材档次：minLevel 不超过奖励档次的最后一项（第一项从 1 开始，配置校验保证） */
export function prizeFoodTier(tiers: readonly PrizeFoodTier[], level: number): PrizeFoodTier {
  let tier = tiers[0]!;
  for (const x of tiers) if (x.minLevel <= level) tier = x;
  return tier;
}

/** 酒吧奖励的食材池：等级在 [最低, 最高] 里、没下架的；普通 = 权重 100，稀有 = 权重不到 100（带权重）；按 id 排序 */
export function prizeFoodPools(
  foods: readonly Food[],
  [lo, hi]: readonly [number, number],
): { normal: number[]; rare: Array<{ id: number; odds: number }> } {
  const inRange = foods
    .filter((f) => f.level >= lo && f.level <= hi && !f.retired && f.odds > 0)
    .sort((a, b) => a.id - b.id);
  return {
    normal: inRange.filter((f) => f.odds === 100).map((f) => f.id),
    rare: inRange.filter((f) => f.odds < 100).map((f) => ({ id: f.id, odds: f.odds })),
  };
}

/**
 * 随机奖励（规格书 00 §0.8），当场发放。
 * 随机数顺序：类型（onlyGoods 时没有）→ 幸运翻倍（物品、食材）→ 抽取。物品池空时改发银币。
 * 食材的抽取先判一次是否命中个人缺料（概率为 0 或没有缺料时不耗随机数），命中按缺量抽缺料，没命中按原来的池子抽（问题记录 50）。
 * 酒吧（bar）：缺料限在档次的等级范围里；没命中时先判稀有（一次随机数），再从稀有池按权重或普通池平均抽；
 * 抽中的一边是空的就用另一边
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
    : awardKindOf(
        o.rng.next(),
        luck.rate,
        level,
        opts.bar ? o.tuning.bar.prize.rates : o.tuning.bar.awardRates,
      );
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
  // 个人缺料倾向（问题记录 50、68）：命中时给本街学菜正缺的，可以是稀有食材
  const levelOf = (f: number) => o.config.foods.get(f)?.level ?? 99;
  let id: number;
  if (opts.bar) {
    const tier = prizeFoodTier(o.tuning.bar.prize.foodTiers, level);
    const [lo, hi] = tier.levels;
    id = (await opNeedPick(o))(
      (f) => levelOf(f) >= lo && levelOf(f) <= hi,
      () => {
        const { normal, rare } = prizeFoodPools(o.config.bundle.foods, tier.levels);
        if (normal.length === 0 && rare.length === 0) {
          const pool = awardFoodsPool(o.config.bundle.foods, level);
          return pool[o.rng.int(pool.length)]!;
        }
        const wantRare = o.rng.next() < tier.rare;
        if ((wantRare && rare.length > 0) || normal.length === 0)
          return pickWeighted(
            buildPool(rare, (x) => x.odds),
            o.rng,
          ).id;
        return normal[o.rng.int(normal.length)]!;
      },
    );
  } else {
    const pool = awardFoodsPool(o.config.bundle.foods, level);
    const maxLevel = Math.min(level, 5);
    id = (await opNeedPick(o))(
      (f) => levelOf(f) <= maxLevel,
      () => pool[o.rng.int(pool.length)]!,
    );
  }
  await addFoods(o, id, num, { ...gain, lucky });
  return { kind, id, num, lucky };
}
