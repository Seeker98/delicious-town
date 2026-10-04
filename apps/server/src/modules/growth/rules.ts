import { checkRestaurantName } from '@dt/shared';
import type { OilNeed, StarNeed } from '@dt/config';
import type { NeedCheckDto } from '@dt/shared';
import type { CookbookCounts } from '../../db/schema';

/** 搬街费（幸运半价之前，240-1）：餐桌数 × 餐桌A 半价 ×（1 + 星级 × 系数） */
export function moveCost(tables: number, tableACoin: number, star: number, moveStarRate: number): number {
  return Math.floor(tables * (tableACoin / 2) * (1 + star * moveStarRate));
}

/** 升到第 star 星要付的银币（240-1）：starCoin 第 star 个数，没写的星不收 */
export function starCoinOf(g: { starCoin: readonly number[] }, star: number): number {
  return g.starCoin[star - 1] ?? 0;
}

export function starChecks(
  rest: { level: number; coin: number },
  counts: CookbookCounts,
  certs: number,
  need: StarNeed,
  coin: number,
): NeedCheckDto[] {
  const checks: NeedCheckDto[] = [
    { key: 'level', need: need.needLevel, have: rest.level, ok: rest.level >= need.needLevel },
    {
      key: 'cookbooks',
      need: need.needCookbooks,
      have: counts.learned,
      ok: counts.learned >= need.needCookbooks,
    },
    { key: 'goods', id: 86, need: need.needCerts, have: certs, ok: certs >= need.needCerts },
  ];
  // 升星银币（240-1）：不收时不显示这一行
  if (coin > 0) checks.push({ key: 'coin', need: coin, have: rest.coin, ok: rest.coin >= coin });
  return checks;
}

export function oilChecks(
  rest: { level: number; star_level: number; coin: number },
  have: (goodsId: number) => number,
  need: OilNeed,
): NeedCheckDto[] {
  const checks: NeedCheckDto[] = [
    { key: 'level', need: need.needLevel, have: rest.level, ok: rest.level >= need.needLevel },
    { key: 'star', need: need.needStar, have: rest.star_level, ok: rest.star_level >= need.needStar },
    { key: 'coin', need: need.needCoin, have: rest.coin, ok: rest.coin >= need.needCoin },
  ];
  for (const g of need.needGoods) {
    const h = have(g.id);
    checks.push({ key: 'goods', id: g.id, need: g.num, have: h, ok: h >= g.num });
  }
  if (need.needPurpleShells > 0) {
    const h = have(610);
    checks.push({
      key: 'goods',
      id: 610,
      need: need.needPurpleShells,
      have: h,
      ok: h >= need.needPurpleShells,
    });
  }
  return checks;
}
const NAME_CHARS = /^[\p{Script=Han}A-Za-z0-9]+$/u;

/** 改名校验（玩家改名和后台强制改名共用）：有问题返回原因，没问题返回 null */
export function renameProblem(name: string, maxLength: number): string | null {
  const check = checkRestaurantName(name);
  if (check !== 'ok') return check;
  if (!NAME_CHARS.test(name)) return 'bad_chars';
  if ([...name].length > maxLength) return 'too_long';
  return null;
}
