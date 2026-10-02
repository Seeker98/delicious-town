import { GOODS_TYPE } from './ids';
import type { Goods } from './types';

/** 占不占仓库格：勋章和纪念品不占（148-2 设计 §6.2）；配置里没有的道具不算 */
export function takesStoreSlot(g: Goods | undefined): boolean {
  return g !== undefined && g.type !== GOODS_TYPE.honor && g.type !== GOODS_TYPE.souvenir;
}
