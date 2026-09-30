import type { RenownShopItem, TowerFloor, Tuning } from '@dt/config';

export type TowerTuning = Tuning['tower'];

/** 体力：试打 testStrength，否则 层 × strengthPerFloor + strengthBase */
export function towerStrength(floor: number, test: boolean, t: TowerTuning): number {
  return test ? t.testStrength : floor * t.strengthPerFloor + t.strengthBase;
}

/** 解锁：等级 ≥ 最低等级，且打赢过下一层（设计文档裁定 4） */
export function floorUnlocked(f: TowerFloor, level: number, bestFloor: number): boolean {
  return level >= f.minLevel && bestFloor >= f.floor - 1;
}

/** nightFloor 层以上、游戏时间 openHour 点以前不能挑战 */
export function towerNight(floor: number, hour: number, t: TowerTuning): boolean {
  return floor > t.nightFloor && hour < t.openHour;
}

export function towerDailyTotal(tickets: number, t: TowerTuning): number {
  return t.dailyBase + tickets;
}

/** 胜 = 层 + winRenownBase，负 = loseRenown（设计文档裁定 13） */
export function towerRenown(floor: number, win: boolean, t: TowerTuning): number {
  return win ? floor + t.winRenownBase : t.loseRenown;
}

/** 切磋奖励（裁定 7）：before = 本次之前的今日切磋总次数 */
export function sparAward(before: number, t: TowerTuning): { times: number; level: number } {
  for (const [lt, times, level] of t.sparAwards) if (before < lt) return { times, level };
  const last = t.sparAwards[t.sparAwards.length - 1]!;
  return { times: last[1], level: last[2] };
}

export type DuelTier = 'weak' | 'strong' | 'normal';

/** 按厨力分档（裁定 8）：对方 > 我 × strongRate 以弱胜强，< 我 × weakRate 以强凌弱 */
export function duelTier(mine: number, theirs: number, t: TowerTuning): DuelTier {
  if (theirs > mine * t.duelStrongRate) return 'strong';
  if (theirs < mine * t.duelWeakRate) return 'weak';
  return 'normal';
}

/** 好友切磋声望（裁定 7、8）：正声望按今日切磋总次数封顶，以弱胜强不受影响；负声望照扣 */
export function duelRenown(tier: DuelTier, win: boolean, before: number, t: TowerTuning): number {
  const [w, l] = t.duelRenown[tier];
  const r = win ? w : l;
  if (r <= 0 || tier === 'strong') return r;
  if (before >= t.sparMaxAt) return 0;
  if (before >= t.sparFullAt) return t.sparFullRenown;
  return r;
}

/** 挑战名次 target 的问题（设计文档 §3.3）；null = 可以。格子有没有人、是不是自己由调用方先判断 */
export function rankChallengeError(
  myRank: number | null,
  target: number,
  t: TowerTuning,
): { reason: string; need?: number } | null {
  if (myRank !== null && myRank <= target) return { reason: 'rank_not_better' };
  if (target <= t.rankTop && (myRank === null || myRank - target > t.rankGap))
    return { reason: 'rank_gap', need: target + t.rankGap };
  return null;
}

/** 占位（裁定 14）：没上榜随便占；在榜上只能往前 */
export function rankOccupyError(myRank: number | null, target: number): string | null {
  return myRank !== null && myRank <= target ? 'rank_not_better' : null;
}

/** 名次礼包：rankGifts 里第一个"名次 ≤ 上限"的礼包 */
export function rankGift(rank: number, t: TowerTuning): number | null {
  for (const [max, id] of t.rankGifts) if (rank <= max) return id;
  return null;
}

/** ISO 8601 周数（周一开始；每年第一个周四所在的周是第 1 周） */
export function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((d.getTime() - first.getTime()) / (7 * 86_400_000));
}

/** 本周在售（裁定 12）：没有前置条件，且常驻或轮到本周 */
export function shopOnSale(items: readonly RenownShopItem[], day: string): RenownShopItem[] {
  const group = (isoWeek(day) % 4) + 1;
  return items.filter((x) => x.require === null && (x.weekGroup === 0 || x.weekGroup === group));
}
