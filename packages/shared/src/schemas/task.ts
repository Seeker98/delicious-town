import { z } from 'zod';
import type { AwardDto } from './growth';

export const claimTaskBody = z.object({ taskId: z.number().int().positive() });
export const claimChapterBody = z.object({ chapterId: z.number().int().positive() });
export const claimActivationBody = z.object({ points: z.number().int().positive() });

/** 主线、支线、每周任务（问题记录 318） */
export interface QuestDto {
  id: number;
  name: string;
  href: string;
  key: string;
  target: number;
  progress: number;
  /** 达成（进度够了） */
  done: boolean;
  /** 已领奖 */
  claimed: boolean;
  award: AwardDto;
  /** 名字里 {n} 代入的数（按区服数值，515 支线扩充 B 遗留）；名字里没有 {n} 的不带 */
  vars?: { n: number };
}

export interface QuestsDto {
  /** 当前章；主线全做完时为 null。锁定时 main 为空，按 needLevel / needStar 显示解锁条件 */
  chapter: {
    id: number;
    name: string;
    needLevel: number;
    needStar: number;
    locked: boolean;
    award: AwardDto;
    /** 本章任务都领了，可以领章末奖励 */
    claimable: boolean;
    total: number;
    claimedCount: number;
    /** 本章已完成（含已领）的任务数：章末按钮据此写"还差几个"或"先领完上面的任务"（backlog 318） */
    doneCount: number;
  } | null;
  main: QuestDto[];
  /** 章末领过的章里后来补出来的任务（领章末时功能关着）：单独列出、照常能领，不算本章进度（backlog 318） */
  leftover: QuestDto[];
  allMainDone: boolean;
  /** 已开启的支线，各显示当前一档；quest 为 null 表示这条支线做完了 */
  lines: Array<{
    id: number;
    name: string;
    quest: QuestDto | null;
    /** 当前档要求的星级还没到时是要求的星级 */
    lockedStar: number | null;
    doneCount: number;
    total: number;
  }>;
  /** 本周任务（按当前星级分组）；任务功能都关掉时为 null */
  weekly: {
    group: string;
    /** 本周一（YYYY-MM-DD） */
    week: string;
    /** 下周一 0 点刷新 */
    endsAt: string;
    quests: QuestDto[];
    full: { id: number; award: AwardDto; claimable: boolean; claimed: boolean };
  } | null;
}

/** 活跃项眼下做不了的原因（等级、星级、区服关闭之外的） */
export type ActivationBlock = 'days' | 'email' | 'frozen' | 'noActivity' | null;

export interface ActivationDto {
  total: number;
  signedIn: boolean;
  /** 餐厅星级、等级（活跃项按 needStar、needLevel 判断是否开放） */
  star: number;
  level: number;
  /**
   * needLevel：功能本身的等级门槛（交易所、事件预测，问题记录 360），没有为 0；
   * off：本区服关掉了这个功能
   */
  items: Array<{
    id: number;
    name: string;
    points: number;
    limit: number;
    count: number;
    needStar: number;
    needLevel: number;
    /** 注册满几天才能做（交易所、事件预测），没有为 0 */
    needDays: number;
    /** 眼下做不了的其他原因（backlog 第 ⑥ 批）：注册天数不够、邮箱没验证、没有能领奖的限时活动 */
    blocked: ActivationBlock;
    off: boolean;
  }>;
  rewards: Array<{ points: number; award: AwardDto; claimed: boolean; multiplier: number }>;
  /** 领哪一档另送一番赏抽赏券、送几张；区服关掉一番赏或不送时为 null（backlog 一番赏） */
  kujiTicket: { points: number; num: number } | null;
}
