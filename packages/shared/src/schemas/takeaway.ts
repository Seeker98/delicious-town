import { z } from 'zod';

const id = z.number().int().positive();
export const takeawayOpenBody = z.object({ way: z.enum(['ticket', 'coin']) });
export const takeawayDeliverBody = z.object({ orderId: id, riderId: id, double: z.boolean().default(false) });
export const takeawayClaimBody = z.object({ deliveryId: id, drone: z.boolean().default(false) });
export const takeawayHireBody = z.object({ restId: id });
export const takeawayRiderBody = z.object({ riderId: id });

export interface TakeawayOrderDto {
  id: number;
  cookbookId: number;
  cookbookName: string;
  /** 单品级 1 普通 … 7 佳肴 */
  grade: number;
  needMinutes: number;
  needRenown: number;
  expiresAt: string;
  /** 我的私人单 */
  private: boolean;
  /** 按我这道菜的品级要的食材（没学会按品级 1），need 已乘单品级 */
  foods: Array<{ foodsId: number; need: number; have: number }>;
  /** 不能接的原因；可以接为 null（加料另算） */
  block: 'not_learned' | 'renown' | 'foods' | null;
}

export interface TakeawayDeliveryDto {
  id: number;
  orderId: number;
  cookbookId: number;
  cookbookName: string;
  grade: number;
  private: boolean;
  double: boolean;
  riderId: number;
  riderName: string;
  arriveAt: string;
  arrived: boolean;
  /** 用无人机要的钻石 */
  drone: number;
}

export interface TakeawayRiderDto {
  id: number;
  /** 骑手店 */
  restId: number;
  name: string;
  self: boolean;
  level: number;
  exp: number;
  needExp: number;
  timeSub: number;
  expAdd: number;
  coinAdd: number;
  renownAdd: number;
  /** 成功率 ‰ */
  odds: number;
  maxNum: number;
  /** 正在送几单 */
  busy: number;
  /** 解雇要花的银币、得到的经验（自己为 0） */
  dismissCoin: number;
  dismissExp: number;
}

export interface TakeawayOpenInfoDto {
  needStar: number;
  needRenown: number;
  needCoin: number;
  needDiamond: number;
  /** 持有的外卖券 */
  tickets: number;
}

export interface TakeawayDto {
  opened: boolean;
  open: TakeawayOpenInfoDto;
  orders: TakeawayOrderDto[];
  deliveries: TakeawayDeliveryDto[];
  riders: TakeawayRiderDto[];
  riderCap: number;
  /** 持有使命必达，可以加料 */
  canDouble: boolean;
  /** 私人刷新：这一次的费用、有没有有效的商店工作证 */
  refresh: { cost: number; hasJob: boolean };
  star: number;
  renown: number;
  coin: number;
  diamond: number;
  /** 服务器时间 */
  now: string;
}

export interface TakeawayClaimDto {
  deliveryId: number;
  success: boolean;
  /** 边牧把失败改判成功 */
  forced: boolean;
  drone: boolean;
  /** 失败原因（中文原文，旧记录只有这个） */
  reason: string | null;
  /** 失败原因的序号（问题记录 272）：前端按语言显示 */
  reasonId?: number | null;
  coin: number;
  exp: number;
  renown: number;
  goods: { id: number; num: number } | null;
  riderExp: number;
  riderLevel: number;
  /** 神秘顾客给的道具 */
  customer: number | null;
}

export interface RiderCandidateDto {
  restId: number;
  name: string;
  level: number;
  star: number;
  /** 不能雇的原因 */
  block: 'target_npc' | 'star' | 'mine' | 'hired' | null;
}
