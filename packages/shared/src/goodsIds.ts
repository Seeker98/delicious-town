/**
 * 前后端都要用到的道具 id。服务端完整清单在 @dt/config 的 GOODS（它引用这里，保持唯一来源）；
 * 前端不能依赖 @dt/config，所以需要的放在这里
 */
export const SHARED_GOODS = {
  mysteryTicket: 1, // 神秘礼券
  starPromoHonor: 87, // 升星促销勋章（仓库页单独说明）
  krabCoin: 240, // 蟹币
} as const;

/** 前后端都要用到的食材 id：万能食材 = masterBase + 食材等级（1~5 级）；一级、二级能换稀有食材（重新编号 PR 2） */
export const SHARED_FOODS = {
  masterBase: 466,
  masterLevel1: 467,
  masterLevel2: 468,
} as const;
