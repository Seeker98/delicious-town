import { DEVICE_TYPE, GOODS_TYPE, type Goods, type Tuning } from '@dt/config';

export function isPlaque(g: Goods): boolean {
  return g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque;
}

/** 出售价 = 单价 × 0.7（规格书 07 §7.6）；勋章、宝石、没有价格的不能卖 */
export function sellPrice(g: Goods, tuning: Tuning): number | null {
  if (g.coin <= 0 || g.type === GOODS_TYPE.honor || g.type === GOODS_TYPE.gem) return null;
  return Math.floor(g.coin * tuning.shop.sellRate);
}
