import type { Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';

type F = Tuning['friend'];

/** 白食体力 = min(整小时 × 每小时, 上限)，激动的心再乘倍数 */
export function dineStrength(hours: number, heart: boolean, t: F['dine']): number {
  const base = Math.min(Math.floor(hours) * t.strengthPerHour, t.strengthMax);
  return Math.floor(base * (heart ? t.heartStrengthMul : 1));
}

const hasHeart = (agg: Record<string, number>) => (agg.excitedHeart ?? 0) > 0;

/** 白食者自己结束（规格书 13 §13.3）：累计的银币照拿，经验有激动的心时 ×3 */
export function dineEndReward(
  acc: { coin: number; exp: number },
  hours: number,
  agg: Record<string, number>,
  t: F['dine'],
): { coin: number; exp: number; strength: number } {
  const heart = hasHeart(agg);
  return {
    coin: acc.coin,
    exp: Math.floor(acc.exp * (heart ? t.heartExpMul : 1)),
    strength: dineStrength(hours, heart, t),
  };
}

/** 被店主请走：店主拿 2 倍被吃掉的银币，白食者赔这些银币；经验只在有激动的心时给（设计文档 裁定 3） */
export function expelReward(
  acc: { coin: number; exp: number },
  hours: number,
  dinerAgg: Record<string, number>,
  t: F['dine'],
): { hostCoin: number; dinerLoss: number; dinerExp: number; dinerStrength: number } {
  const heart = hasHeart(dinerAgg);
  return {
    hostCoin: acc.coin * 2,
    dinerLoss: acc.coin,
    dinerExp: heart ? Math.floor(acc.exp * t.heartExpMul) : 0,
    dinerStrength: dineStrength(hours, heart, t),
  };
}

export function layReward(level: number, t: F['roach']): { coin: number; exp: number } {
  const m = 1 + t.layLevelRate * level;
  return { coin: Math.floor(t.layCoin * m), exp: Math.floor(t.layExp * m) };
}

export type KillPlace = 'self' | 'friend' | 'npc';

/** 灭蟑螂体力（规格书 20 §20.18）；午夜蟑螂杀手在 23~7 点、其他时段各有上限（计划裁定 6） */
export function killStrength(
  place: KillPlace,
  agg: Record<string, number>,
  hour: number,
  t: F['roach'],
): number {
  const base = t.killStrength[place];
  const night = hour === 23 || hour < 7;
  const cap = night ? (agg.killRoachONightNS ?? 0) : (agg.killRoachODayNS ?? 0);
  return cap > 0 ? Math.min(base, cap) : base;
}

export function killReward(
  level: number,
  place: KillPlace,
  agg: Record<string, number>,
  t: F['roach'],
): { coin: number; exp: number } {
  const rate = place === 'self' ? t.killSelfRate : 1 + (agg.cockroachIncomeRate ?? 0);
  return {
    coin: Math.round(t.killCoin * (1 + t.killCoinLevelRate * level) * rate),
    exp: Math.round(t.killExp * (1 + level) * rate),
  };
}

export function flipSlots(star: number, t: F['flip']): number {
  return t.baseSlots + t.slotsPerStar * star;
}

export function flipCoolMs(npc: boolean, rng: Rng, t: F['flip']): number {
  const hours = npc ? t.npcCoolHours : t.coolHours;
  return (hours * 3600 + rng.int(Math.round(t.coolRandHours * 3600))) * 1000;
}

/** 翻橱被老鼠夹夹住掉的银币（规格书 05 §5.7；设计文档 裁定 10） */
export function caughtCoin(level: number, star: number, npc: boolean, rng: Rng, t: F['flip']): number {
  let coin: number;
  if (npc) coin = star * t.npcCaughtCoinPerStar;
  else {
    const half = Math.floor((t.caughtCoinPerLevel * level) / 2);
    coin = half + rng.int(half);
  }
  return star < 2 ? Math.floor(coin / 2) : coin;
}

export function exchangeFee(food: { coin: number; odds: number }, locked: boolean, t: F['exchange']): number {
  return Math.floor(food.coin * t.feeRate * (100 / food.odds) * (locked ? t.lockedFeeMul : 1));
}

export function bangleRate(level: number, odds: number, t: F['exchange']): number {
  return t.bangleBase + level * (105 - odds) * t.bangleFactor;
}

export function exchangeLimits(
  myStar: number,
  theirStar: number,
  t: F['exchange'],
): { perFriend: number; total: number; taken: number; npc: number } {
  const perFriend = t.base - Math.floor(myStar / 2);
  return {
    perFriend,
    total: perFriend * t.perDayTotalMul,
    taken: t.takenBase + theirStar,
    npc: t.npcBase - myStar,
  };
}

/** 帮好友加油的美味券次数，按实际加的油算（设计文档 裁定 4） */
export function refuelDraws(added: number, oilMax: number, t: F['refuel']): number {
  const chunk = oilMax >= t.bigTank ? t.bigTank : t.bigTank / 2;
  return Math.floor(added / chunk) * t.drawsPerChunk;
}
