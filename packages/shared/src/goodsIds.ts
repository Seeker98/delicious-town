/**
 * 前后端都要用到的道具 id。服务端完整清单在 @dt/config 的 GOODS（它引用这里，保持唯一来源）；
 * 前端不能依赖 @dt/config，所以需要的放在这里
 */
export const SHARED_GOODS = {
  mysteryTicket: 1, // 神秘礼券
  krabCoin: 240, // 蟹币
} as const;
