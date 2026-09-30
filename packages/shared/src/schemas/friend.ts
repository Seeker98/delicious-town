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
