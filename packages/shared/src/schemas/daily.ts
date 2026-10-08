import { z } from 'zod';
import type { NewsDto } from './town';

/** 小镇日报（2026-10-08）：AI 写简中、翻英文，繁中由简中转；西语、法语看英文 */
export type DailyLang = 'zh-CN' | 'en' | 'zh-TW';
export type DailyStatus = 'pending' | 'draft' | 'published' | 'hidden';

export interface DailyArticleDto {
  title: string;
  /** 段落之间空一行；里面的 {r:id} {g:id} {f:id} {m:id} {s:id} {w:id} 由网页换成名字 */
  body: string;
}

export const dailyQuery = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export interface DailyDto {
  day: string;
  /** 最近 7 天里有日报（含没发布的）的日期，新的在前 */
  days: string[];
  /** 已发布才有 */
  article: Record<DailyLang, DailyArticleDto> | null;
  /** 没发布时的“今日要闻”：素材里排在前面的 5 条新闻 */
  fallback: NewsDto[];
  /** 正文里的店：现在的名字；店已不存在为 null */
  rests: Record<string, string | null>;
}

/** 首页新闻卡片第一行：昨天的日报已发布时才有 */
export interface DailyHeadDto {
  day: string;
  title: Record<DailyLang, string>;
}

/** 后台（admin）：列表一行 */
export interface AdminDailyRowDto {
  shardId: number;
  day: string;
  status: DailyStatus;
  /** 简中标题；还没生成成功为 null */
  title: string | null;
  tokensIn: number;
  tokensOut: number;
  attempts: number;
  regenerations: number;
  error: string | null;
  generatedAt: string | null;
  publishedAt: string | null;
}

export interface AdminDailyDetailDto extends AdminDailyRowDto {
  /** 素材，原样 */
  facts: unknown;
  content: Record<DailyLang, DailyArticleDto> | null;
  rests: Record<string, string | null>;
}

export const adminDailyListQuery = z.object({ shardId: z.coerce.number().int().positive() });
export const adminDailyParams = z.object({
  shardId: z.coerce.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const articleBody = z.object({ title: z.string().max(200), body: z.string().max(5000) });
/** 后台手改：简中、英文；繁中由简中重新转 */
export const adminDailyEditBody = z.object({ zh: articleBody, en: articleBody });
export type AdminDailyEditBody = z.infer<typeof adminDailyEditBody>;
