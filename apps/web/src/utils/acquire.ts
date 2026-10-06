/** 对方（原主人、老板）得多少：价格 × (1 − 税率) 向下取整；比例先换成百万分比，和服务端 share 一样 */
export const sellerGets = (price: number, taxRate: number): number =>
  Math.floor((price * Math.round((1 - taxRate) * 1e6)) / 1e6);
