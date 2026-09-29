import { z } from 'zod';

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
