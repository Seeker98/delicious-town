import { z } from 'zod';

/** 论坛（子项目 4E-3） */
export const FORUM_CATEGORIES = ['chat', 'guide', 'feedback'] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export const FORUM_CATEGORY_NAMES: Record<ForumCategory, string> = {
  chat: '闲聊',
  guide: '攻略',
  feedback: '建议反馈',
};
export const FORUM_TABS = ['all', 'chat', 'guide', 'feedback', 'featured'] as const;
export type ForumTab = (typeof FORUM_TABS)[number];

export const forumListQuery = z.object({
  tab: z.enum(FORUM_TABS).default('all'),
  q: z.string().max(50).optional(),
  cursor: z.string().max(80).optional(),
});
export type ForumListQuery = z.infer<typeof forumListQuery>;

export const forumPostBody = z.object({
  category: z.enum(FORUM_CATEGORIES),
  title: z.string().max(200),
  content: z.string().max(20000),
});
export type ForumPostBody = z.infer<typeof forumPostBody>;

export const forumReplyBody = z.object({
  content: z.string().max(5000),
  replyTo: z.number().int().positive().optional(),
  anonymous: z.boolean().default(false),
});
export type ForumReplyBody = z.infer<typeof forumReplyBody>;

export const forumReactBody = z.object({ kind: z.enum(['up', 'down']) });
export const FORUM_ADMIN_ACTIONS = ['pin', 'unpin', 'feature', 'unfeature'] as const;
export type ForumAdminAction = (typeof FORUM_ADMIN_ACTIONS)[number];
export const forumAdminBody = z.object({ action: z.enum(FORUM_ADMIN_ACTIONS) });
export const forumIdParam = z.object({ id: z.coerce.number().int().positive() });

export type ForumReaction = 'up' | 'down';

export interface ForumPostItemDto {
  id: number;
  category: ForumCategory;
  title: string;
  excerpt: string;
  restId: number;
  restName: string;
  createdAt: string;
  /** 最后动态时间：有回复是最后回复时间，否则是发帖时间 */
  activeAt: string;
  readNum: number;
  upNum: number;
  downNum: number;
  replyCount: number;
  pinned: boolean;
  featured: boolean;
}

export interface ForumListDto {
  pinned: ForumPostItemDto[];
  items: ForumPostItemDto[];
  nextCursor: string | null;
  me: { canPost: boolean; isAdmin: boolean; postReadyAt: string | null; replyReadyAt: string | null };
}

export interface ForumReplyDto {
  id: number;
  floor: number;
  replyTo: number | null;
  /** 匿名回复对他人为 null / '匿名'；管理员和本人看到真名 */
  restId: number | null;
  restName: string;
  anonymous: boolean;
  /** 已删除时为空串 */
  content: string;
  createdAt: string;
  deleted: boolean;
  canDelete: boolean;
}

export interface ForumPostDetailDto {
  post: ForumPostItemDto & { content: string; editedAt: string | null };
  mine: ForumReaction | null;
  can: { edit: boolean; delete: boolean; admin: boolean; reads: boolean; reply: boolean };
  replies: ForumReplyDto[];
  replyReadyAt: string | null;
}

export interface ForumReactDto {
  mine: ForumReaction | null;
  up: number;
  down: number;
}

export interface ForumReadsDto {
  items: Array<{
    restId: number;
    name: string;
    times: number;
    /** 最后阅读的游戏日：只给到日，避免和匿名回复的时间对出真名（终审 I1） */
    lastDay: string;
    reaction: ForumReaction | null;
  }>;
}

export interface ForumAdminDto {
  pinned: boolean;
  featured: boolean;
  /** 本次是否给作者发了加精奖励 */
  rewarded: boolean;
}
