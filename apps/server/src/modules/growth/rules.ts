import type { OilNeed, StarNeed } from '@dt/config';
import type { NeedCheckDto } from '@dt/shared';
import type { CookbookCounts } from '../../db/schema';

export function starChecks(
  rest: { level: number },
  counts: CookbookCounts,
  certs: number,
  need: StarNeed,
): NeedCheckDto[] {
  return [
    { key: 'level', need: need.needLevel, have: rest.level, ok: rest.level >= need.needLevel },
    {
      key: 'cookbooks',
      need: need.needCookbooks,
      have: counts.learned,
      ok: counts.learned >= need.needCookbooks,
    },
    { key: 'goods', id: 86, need: need.needCerts, have: certs, ok: certs >= need.needCerts },
  ];
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
