import { DEVICE_TYPE, GOODS_TYPE, type Goods, type Tuning } from '@dt/config';

export function isPlaque(g: Goods): boolean {
  return g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque;
}

/**
 * 出售单价 = 单价 × 0.7 向下取整（规格书 07 §7.6）；勋章、宝石、没有价格的、区服数值 shop.noSell 里的（蟹币）不能卖。
 * 有钻石价的不超过 钻石价 × shop.diamondSellCoin（经济分析 2026-10-08：一番赏的钻石买鞋带卖店，每天能多拿约 490 万）。
 * 先四舍五入到 6 位小数再取整：45000 × 0.7 浮点是 31499.999…，直接取整会少 1
 */
export function sellPrice(g: Goods, tuning: Tuning): number | null {
  if (g.coin <= 0 || g.type === GOODS_TYPE.honor || g.type === GOODS_TYPE.gem) return null;
  if (tuning.shop.noSell.includes(g.id)) return null;
  const price = Math.floor(Math.round(g.coin * tuning.shop.sellRate * 1e6) / 1e6);
  return g.diamond > 0 ? Math.min(price, g.diamond * tuning.shop.diamondSellCoin) : price;
}
