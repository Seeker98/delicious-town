import type { MapDef, MissileDef, Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';

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

/**
 * 神秘食材的新闻（集束飞弹那次的遗留：原来每个各发一条，同一种可能重复）：同一种合成一条，两个以上带 num
 */
export function guardianRareNews(ids: number[]): Array<{ foodsId: number; num?: number }> {
  const count = new Map<number, number>();
  for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count].map(([foodsId, num]) => (num > 1 ? { foodsId, num } : { foodsId }));
}

export interface ShotInput {
  def: MissileDef;
  luckRate: number;
  /** 天气 hitRate */
  hitBonus: number;
  /** 加成 missileCritRate + 天气 missileCrit */
  critBonus: number;
}

export interface Shot {
  hit: boolean;
  crit: boolean;
  damage: number;
  /** 暴击掉的神秘礼券张数 */
  ticket: number;
  /** 暴击掉了探险图 */
  map: boolean;
}

/** 一枚飞弹（规格书 09 §9.1） */
export function shoot(i: ShotInput, t: TempleTuning, rng: Rng): Shot {
  const miss: Shot = { hit: false, crit: false, damage: 0, ticket: 0, map: false };
  if (!(rng.next() < i.def.hitRate + i.luckRate / 4 + i.hitBonus)) return miss;
  const crit = rng.next() < i.def.crit + i.critBonus;
  const [min, max] = i.def.attack;
  let damage = max === min ? min : min + rng.int(max - min);
  if (!crit) return { ...miss, hit: true, damage };
  damage = Math.floor(damage * i.def.critRate);
  const ticket =
    rng.next() < t.missileTicketRate + i.luckRate / 4 ? rng.intMin1(Math.floor(damage / 100)) : 0;
  const map = rng.next() < t.missileMapRate + i.luckRate / 20;
  return { hit: true, crit: true, damage, ticket, map };
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
export function exploreRate(def: MapDef, b: { lostRate: number; suitRate: number }): number {
  let rate = def.rate;
  rate -= b.lostRate;
  if (b.suitRate > 0) rate += b.suitRate;
  return rate;
}

export function exploreAwardNum(def: MapDef, rng: Rng): number {
  const [min, max] = def.num;
  return rng.intMin1(max - min) + min;
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
