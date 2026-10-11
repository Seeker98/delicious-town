import type { ArtName } from '../art/generated/names';

/**
 * 道具小类的编号段（和 packages/config/data/game/goods_groups.json 一致，测试会比对）：
 * 道具编号 = 小类 base 起的整百段，按编号就能知道小类，不用目录多带字段
 */
export const GOODS_GROUPS: ReadonlyArray<readonly [key: string, base: number, size: number]> = [
  ['currency', 10000, 100],
  ['levelTicket', 10100, 100],
  ['foodVoucher', 10200, 100],
  ['pass', 10300, 100],
  ['card', 10400, 100],
  ['growth', 10500, 100],
  ['forge', 10600, 100],
  ['temple', 10700, 100],
  ['mysterious', 10800, 100],
  ['yard', 10900, 100],
  ['giftDaily', 20000, 100],
  ['giftStar', 20100, 100],
  ['giftShop', 20200, 100],
  ['giftRank', 20300, 100],
  ['giftJob', 20400, 100],
  ['poster', 30000, 100],
  ['trophy', 30100, 100],
  ['oilSaver', 30200, 100],
  ['mouseTrap', 30300, 100],
  ['roach', 30400, 100],
  ['plaque', 30500, 100],
  ['suit0', 40000, 100],
  ['suit3', 40100, 100],
  ['suit4', 40200, 100],
  ['suit5', 40300, 100],
  ['suit6', 40400, 100],
  ['suit7', 40500, 100],
  ['suit80', 40600, 100],
  ['suit81', 40700, 100],
  ['suit82', 40800, 100],
  ['suit100', 40900, 100],
  ['suit90', 41000, 100],
  ['suit99', 41100, 100],
  ['gem1', 50000, 100],
  ['gem2', 50100, 100],
  ['gem3', 50200, 100],
  ['gem4', 50300, 100],
  ['gem5', 50400, 100],
  ['gem6', 50500, 100],
  ['streetMedal', 60000, 100],
  ['honorBeta', 60100, 100],
  ['honorShop', 60200, 100],
  ['honorLucky', 60300, 100],
  ['honorJob', 60400, 100],
  ['honorTown', 60500, 100],
  ['honorPet', 60600, 100],
  ['honorPot', 60700, 100],
  ['honorDecor', 60800, 100],
  ['honorChef', 60900, 100],
  ['honorMatch', 61000, 100],
  ['honorDelicious', 61100, 100],
  ['honorPainting', 61200, 100],
  ['honorZodiac', 61300, 100],
  ['honorFunc', 61400, 100],
  ['honorAchieve', 61500, 100],
  ['honorStatue', 61600, 100],
  ['honorTeach', 61700, 100],
  ['honorChefSpirit', 61800, 100],
  ['honorMisc', 61900, 100],
  ['honorExclusiveDecor', 62000, 100],
  ['honorExclusive', 62100, 200],
  ['festival', 70000, 100],
  ['kujiFirst', 70100, 100],
  ['kujiMonthly', 71000, 200],
];

/** 小类 → 图形；没列的（新小类）按前缀猜，再不行画通用的箱子 */
const ART: Record<string, ArtName> = {
  currency: 'goods-token',
  levelTicket: 'goods-voucher',
  foodVoucher: 'goods-voucher',
  pass: 'goods-ticket',
  card: 'goods-card',
  growth: 'goods-cert',
  forge: 'goods-stone',
  temple: 'goods-scroll',
  mysterious: 'goods-scroll',
  yard: 'goods-seed',
  poster: 'goods-poster',
  plaque: 'goods-poster',
  trophy: 'goods-trophy',
  oilSaver: 'goods-oil',
  mouseTrap: 'goods-trap',
  roach: 'goods-bait',
};
const PREFIX: Array<[string, ArtName]> = [
  ['gift', 'goods-gift'],
  ['gem', 'goods-gem'],
  ['streetMedal', 'goods-medal'],
  ['honor', 'goods-medal'],
  ['festival', 'goods-souvenir'],
  ['kuji', 'goods-souvenir'],
];

export function goodsGroup(id: number): string | null {
  return GOODS_GROUPS.find(([, base, size]) => id >= base && id < base + size)?.[0] ?? null;
}

/** 宝石六种颜色（gem1~gem6：智慧、红晶、黄玉、蓝冥、绿玄、天机） */
const GEM_TYPES = ['wisdom', 'ruby', 'topaz', 'sapphire', 'emerald', 'astral'] as const;

/**
 * 道具的图形（界面改版 P7 仓库格子）：按编号所在小类给图。
 * 宝石按种类分颜色，一~三阶（原石、灵石、神石）是切面宝石，四~六阶（原玉、灵玉、神玉）是圆润的玉（P7 用户反馈：原来都是一张图）
 */
export function goodsArt(id: number): ArtName {
  const g = goodsGroup(id);
  if (!g) return 'goods-misc';
  const gem = /^gem([1-6])$/.exec(g);
  if (gem) {
    const type = GEM_TYPES[Number(gem[1]) - 1]!;
    const tier = id % 100;
    return (tier >= 4 ? `goods-jade-${type}` : `goods-gem-${type}`) as ArtName;
  }
  return ART[g] ?? PREFIX.find(([p]) => g.startsWith(p))?.[1] ?? 'goods-misc';
}
