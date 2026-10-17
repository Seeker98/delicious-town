import { goodsGroup } from './goodsArt';

/** 商店筛选胶囊的大类（界面改版 P8）：按道具编号所在小类归并，商店接口不用多带字段 */
export const SHOP_CATS = [
  'card',
  'growth',
  'forge',
  'temple',
  'promo',
  'art',
  'facility',
  'equip',
  'other',
] as const;
export type ShopCat = (typeof SHOP_CATS)[number];

const BY_GROUP: Record<string, ShopCat> = {
  currency: 'card',
  levelTicket: 'card',
  foodVoucher: 'card',
  pass: 'card',
  card: 'card',
  growth: 'growth',
  forge: 'forge',
  temple: 'temple',
  mysterious: 'temple',
  poster: 'promo',
  trophy: 'promo',
  plaque: 'promo',
  oilSaver: 'facility',
  mouseTrap: 'facility',
  roach: 'facility',
  // 艺术品设施（乐台、屏风，2026-10-17）
  artMusic: 'art',
  artPainting: 'art',
};

/** 道具归哪一类：宝石算强化，厨具套装算厨具，没列的算其他 */
export function shopCat(goodsId: number): ShopCat {
  const g = goodsGroup(goodsId);
  if (!g) return 'other';
  if (g.startsWith('gem')) return 'forge';
  if (g.startsWith('suit')) return 'equip';
  return BY_GROUP[g] ?? 'other';
}
