import type { MapDef, MissileDef, MysteriousCookbook, Seed, Tuning } from '@dt/config';
import { pickWeighted, seededRng, type Rng, type WeightedPool } from '@dt/shared';
import { gameSeed } from '../../core/seed';

export type TempleTuning = Tuning['temple'];

export function guardianHp(star: number, t: TempleTuning): number {
  return t.guardianHpBase + t.guardianHpPerStar * star;
}

/** 击败奖励倍数 = 血量 ÷ guardianRewardHp（用户 2026-10-07 定：奖励跟着血量涨） */
export function guardianScale(star: number, t: TempleTuning): number {
  return guardianHp(star, t) / t.guardianRewardHp;
}

/** 神秘食材个数：期望值的整数部分必得，小数部分按概率再给一个 */
export function guardianRareCount(expected: number, rng: Rng): number {
  const whole = Math.floor(Math.max(0, expected));
  return whole + (rng.next() < expected - whole ? 1 : 0);
}

export interface ShotInput {
  def: MissileDef;
  luckRate: number;
  /** 天气 hitRate */
  hitBonus: number;
  /** 加成 missileCritRate + 天气 missileCrit */
  critBonus: number;
  /** 捕梦网掉玉玺的概率；没有捕梦网为 0 */
  sealRate: number;
}

export interface Shot {
  hit: boolean;
  crit: boolean;
  damage: number;
  /** 暴击掉的神秘礼券张数 */
  ticket: number;
  /** 暴击掉了探险图 */
  map: boolean;
  /** 暴击掉了厨神玉玺 */
  seal: boolean;
}

/** 一枚飞弹（规格书 09 §9.1） */
export function shoot(i: ShotInput, t: TempleTuning, rng: Rng): Shot {
  const miss: Shot = { hit: false, crit: false, damage: 0, ticket: 0, map: false, seal: false };
  if (!(rng.next() < i.def.hitRate + i.luckRate / 4 + i.hitBonus)) return miss;
  const crit = rng.next() < i.def.crit + i.critBonus;
  const [min, max] = i.def.attack;
  let damage = max === min ? min : min + rng.int(max - min);
  if (!crit) return { ...miss, hit: true, damage };
  damage = Math.floor(damage * i.def.critRate);
  const ticket =
    rng.next() < t.missileTicketRate + i.luckRate / 4 ? rng.intMin1(Math.floor(damage / 100)) : 0;
  const map = rng.next() < t.missileMapRate + i.luckRate / 20;
  const seal = i.sealRate > 0 && rng.next() < i.sealRate;
  return { hit: true, crit: true, damage, ticket, map, seal };
}

/** 击败奖励：3、2、1 级食材各 (⌊base/等级⌋ + rand(spread) − spread/2) × 奖励倍数 个，取整 */
export function guardianFoods(t: TempleTuning, rng: Rng, scale = 1): Array<{ level: number; num: number }> {
  return [3, 2, 1].map((level) => ({
    level,
    num: Math.max(
      0,
      Math.round(
        (Math.floor(t.guardianFoodsBase / level) +
          rng.int(t.guardianFoodsSpread) -
          Math.floor(t.guardianFoodsSpread / 2)) *
          scale,
      ),
    ),
  }));
}

/** 探险成功率（不含幸运，规格书 09 §9.2） */
export function exploreRate(def: MapDef, b: { needle: boolean; lostRate: number; suitRate: number }): number {
  let rate = def.rate;
  if (b.needle) rate += (1 - rate) / 2;
  rate -= b.lostRate / (b.needle ? 2 : 1);
  if (b.suitRate > 0) rate += b.suitRate;
  return rate;
}

export function exploreAwardNum(def: MapDef, starKey: boolean, rng: Rng): number {
  const [min, max] = def.num;
  return rng.intMin1(max - min) + min + (starKey ? 2 : 0);
}

/** 按等级分配普通食材：4 级 75%、其他 25%，照源码 ⌊round(x×10)/10⌋ 取整（计划裁定 1） */
export function exploreSplit(def: MapDef, awardNum: number): Array<{ level: number; num: number }> {
  const [min, max] = def.level;
  const out: Array<{ level: number; num: number }> = [];
  for (let level = max; level >= min; level--) {
    const x = awardNum * (level === 4 ? 0.75 : 0.25);
    out.push({ level, num: Math.floor(Math.round(x * 10) / 10) });
  }
  return out;
}

/** getTrial：总和封顶 trialCap（原版 Tools.getTrial） */
export function trialBase(c: number, t: TempleTuning): number {
  const r = 0.05 + Math.min(c, 150) / 750 + (c > 150 ? Math.sqrt(c - 150) / 100 : 0);
  return Math.min(t.trialCap, r);
}

export function foodsTrial(
  mcLevel: number,
  main: { level: number; odds: number },
  sub: { level: number; odds: number },
): number {
  return (main.level - mcLevel) / 80 + (sub.level - mcLevel) / 160 + (200 - main.odds - sub.odds) / 1500;
}

/** 成功时试炼价值 +rand[1,n]（n = 0 不加）、试炼经验 +rand[1,m] */
export function trialGainCaps(mainRare: boolean, subRare: boolean): { n: number; m: number } {
  return {
    n: mainRare ? (subRare ? 2 : 1) : 0,
    m: mainRare ? (subRare ? 4 : 3) : subRare ? 2 : 1,
  };
}

/** 克拉肯今天想吃的菜（设计文档 裁定 2）：按 区服 + 日期 定种子 */
export function krakenTarget(
  pool: WeightedPool<MysteriousCookbook>,
  shardId: number,
  day: string,
): MysteriousCookbook {
  return pickWeighted(pool, seededRng(gameSeed(shardId, 'kraken', day)));
}

export function inFeedHours(hour: number, hours: ReadonlyArray<readonly [number, number]>): boolean {
  return hours.some(([a, b]) => hour >= a && hour < b);
}

export type Relation = 'same' | 'road' | 'other';

export function relationOf(cook: MysteriousCookbook, target: MysteriousCookbook): Relation {
  return cook.id === target.id ? 'same' : cook.road === target.road ? 'road' : 'other';
}

/** 好感度（原版 feedKraken）；k × init 向零截断（计划裁定 5） */
export function krakenFavor(
  i: { num: number; level: number; price: number; grade: number; relation: Relation; luckRate: number },
  t: TempleTuning,
  rng: Rng,
): { init: number; favor: number; luck: number } {
  const rate = t.krakenRates[i.relation];
  const init = Math.floor(Math.sqrt(i.num * (i.level === 6 ? 0.5 : 1) * i.price * rate) / 12);
  const g = i.grade - 1;
  const k = i.relation === 'same' ? -0.06 * g : i.relation === 'road' ? 0.1 - 0.01 * g : 0.2;
  let favor = rng.int(init) - Math.trunc(k * init);
  favor = favor === 0 ? 1 : Math.min(favor, init);
  const luck = i.relation === 'same' ? rng.int(Math.floor((init * i.luckRate) / 5)) : 0;
  return { init, favor: favor + luck, luck };
}

export function seedCount(favor: number): number {
  return Math.floor(Math.sqrt(Math.max(0, favor))) + 2;
}

export function pickSeeds(pool: WeightedPool<Seed>, n: number, rng: Rng): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const s = pickWeighted(pool, rng);
    out.set(s.id, (out.get(s.id) ?? 0) + 1);
  }
  return out;
}

export function pickShopSlots(pool: WeightedPool<MysteriousCookbook>, n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => pickWeighted(pool, rng).id);
}
