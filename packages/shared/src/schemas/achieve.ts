import { z } from 'zod';

/** 成就（设计稿 2026-10-19）：一条达成记录 */
export interface AchievementGotDto {
  /** 配置里的成就编号（线 key + "." + 档序号） */
  id: string;
  at: string;
  /** 全服首达 */
  first: boolean;
  /** 上线补发的 */
  backfilled: boolean;
}

/** 成就墙：自己的带进度；看别人的只有达成记录和展示柜 */
export interface AchievementsDto {
  restId: number;
  name: string;
  mine: boolean;
  points: number;
  /** 成就点排行的名次；没上榜（不够格、0 点）为 null */
  rank: number | null;
  /** 上榜条件（没上榜时网页写为什么） */
  rankRule: { minLevel: number; minAccountDays: number };
  /** 本周新增成就点（补发的不算） */
  weekPoints: number;
  got: AchievementGotDto[];
  /** 各口径的当前值，键见 achProgressKey；看别人时为空 */
  progress: Record<string, number>;
  /** 展示柜里的奖杯 key（按顺序） */
  shelf: string[];
  shelfSlots: number;
  /** 下一次展示柜加格：到多少点、开到几格；已经最多时 null */
  shelfNext: { points: number; slots: number } | null;
  /** 本区达成这个成就的店的占比（0~1），只列有人达成的 */
  rarity: Record<string, number>;
}

export const achievementShelfBody = z.object({ trophies: z.array(z.string().min(1).max(40)).max(10) });
export type AchievementShelfBody = z.infer<typeof achievementShelfBody>;
