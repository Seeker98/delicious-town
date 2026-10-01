import { z } from 'zod';
import type { TableDto } from './restaurant';

const restId = z.number().int().positive();
export const restIdBody = z.object({ restId });
export const restIdParam = z.object({ restId: z.coerce.number().int().positive() });
export const respondBody = z.object({ restId, accept: z.boolean() });
export const friendListQuery = z.object({ sort: z.enum(['level', 'star', 'recent']).default('level') });
export const friendSearchQuery = z.object({ q: z.string().trim().min(1).max(20) });

export interface FriendBriefDto {
  id: number;
  name: string;
  level: number;
  star: number;
  avatar: number | null;
  npc: boolean;
  /** 桌上的蟑螂数 */
  roaches: number;
  /** 营业中、有空桌、白食人数没满 */
  dineSeat: boolean;
  /** 不在冷却中的橱柜位数 */
  flipReady: number;
  /** 成为好友的时间 */
  since: string;
}

export interface FriendsDto {
  items: FriendBriefDto[];
  /** 好友数（不含蟹老板）和上限 */
  count: number;
  max: number;
}

export interface FriendRequestDto {
  id: number;
  name: string;
  level: number;
  star: number;
  avatar: number | null;
  npc: boolean;
  at: string;
}

export interface RestBriefDto {
  id: number;
  name: string;
  level: number;
  star: number;
  avatar: number | null;
  isFriend: boolean;
  /** 我已经申请过 */
  requested: boolean;
}

export interface FriendRestDto {
  id: number;
  name: string;
  level: number;
  star: number;
  streetId: number;
  renown: number;
  door: number;
  avatar: number | null;
  notice: string;
  npc: boolean;
  /** 1 营业，2 停业 */
  state: number;
  isFriend: boolean;
  /** 我已经向它申请过 */
  requested: boolean;
  /** 展示中的个性图标 */
  icons: Array<{ key: string; title: string }>;
  /** 有效勋章（道具 id） */
  honors: number[];
  /** 摆着的牌匾（道具 id） */
  plaques: number[];
  tables: TableDto[];
  /** 我今天已经给它点过赞 */
  thumbedToday: boolean;
  /** 对方穿着的厨具（子项目 2B）；name 是命名帽子的显示名，普通厨具为 null */
  equips: Array<{ part: number; goodsId: number; stress: number; name: string | null }>;
  /** 对方当前在售的特色菜（子项目 4A）；eaten = 这一批我已经吃过 */
  special: { mcId: number; grade: number; leftNum: number; price: number; eaten: boolean } | null;
}

const tableNo = z.number().int().min(1).max(500);
export const dineStartBody = z.object({ restId, tableNo });
export const tableBody = z.object({ tableNo });
/** restId 为自己时表示自己店 */
export const restTableBody = z.object({ restId, tableNo });

export interface DineCurrentDto {
  hostRestId: number;
  hostName: string;
  tableNo: number;
  startedAt: string;
  minutes: number;
  /** 已满最短时长，可以结束 */
  canEnd: boolean;
}

export interface DineRewardDto {
  coin: number;
  exp: number;
  strength: number;
}

export interface KillResultDto {
  strength: number;
  coin: number;
  exp: number;
  /** 捡到的神秘礼券 */
  tickets: number;
}

export const refuelBody = z.object({
  restId,
  /** -1 = 加满 */
  num: z.union([z.literal(-1), z.number().int().min(1).max(100_000_000)]),
});
export const flipBody = z.object({ restId, slotNo: z.number().int().min(1).max(200) });

export interface FlipSlotsDto {
  slots: number;
  cooling: Array<{ slotNo: number; until: string }>;
  /** 我今天已经翻了几次（超过 100 次每次 2 体力） */
  todayTimes: number;
}

export type FlipOutcome = 'food' | 'ticket' | 'nothing' | 'caught' | 'escaped';

export interface FlipResultDto {
  outcome: FlipOutcome;
  foodsId: number | null;
  /** 被夹时掉的银币 */
  coin: number;
  strength: number;
  dtTickets: number;
}

const foodsId = z.number().int().positive();
export const foodsExchangeBody = z.object({ restId, giveFoodsId: foodsId, takeFoodsId: foodsId });
export const exchangeFoodsQuery = z.object({ level: z.coerce.number().int().min(1).max(5) });

export interface ExchangeFoodsDto {
  level: number;
  /** 对方这个等级的食材；fee = 换它要付的手续费 */
  theirs: Array<{ foodsId: number; num: number; locked: boolean; fee: number }>;
  /** 我这个等级的食材 */
  mine: Array<{ foodsId: number; num: number }>;
  /** 今天和它还能换几次 */
  left: number;
  /** 飓风天：可以换对方锁定的食材 */
  storm: boolean;
  npc: boolean;
}

export interface ExchangeResultDto {
  /** caught = 飓风天偷换锁定食材被抓 */
  result: 'ok' | 'caught';
  fee: number;
  /** 对方有红内裤时我额外损失的食材 */
  redPantsFoodsId: number | null;
}

export interface ThumbResultDto {
  /** 我今天第几次点赞 */
  count: number;
  /** 前 10 次有奖励，之后每次扣 1 声望 */
  rewarded: boolean;
  tickets: number;
  strength: number;
}

export interface ThumbTodayDto {
  restId: number;
  name: string;
  avatar: number | null;
  at: string;
  /** 我已经回赞 */
  returned: boolean;
}

export interface ReturnAllDto {
  ok: number[];
  failed: Array<{ restId: number; code: string }>;
}

export const doorBody = z.object({ door: z.number().int().min(0).max(1000) });
export const avatarBody = z.object({ avatar: z.number().int().min(1).max(1000) });
export const noticeBody = z.object({ text: z.string().max(200) });
export const iconShowBody = z.object({ iconId: z.number().int().positive(), shown: z.boolean() });

export interface MyLooksDto {
  door: number;
  avatar: number | null;
  notice: string;
  icons: Array<{ id: number; key: string; title: string; desc: string; shown: boolean }>;
}
