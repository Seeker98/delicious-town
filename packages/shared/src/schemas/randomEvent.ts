import { z } from 'zod';

/** 随机事件和问答（设计稿 docs/superpowers/specs/2026-10-28-random-events-design.md） */
export type RandomEventKind = 'notice' | 'choice' | 'quiz' | 'quizNight';

/** 实际到账的奖励 */
export interface RandomRewardDto {
  coin: number;
  exp: number;
  /** 神秘礼券 */
  tickets: number;
  foods: Array<{ id: number; num: number }>;
}

/** 一次结果：文字（按语言）、挂上的加成和到期时间、到账的奖励 */
export interface RandomResultDto {
  text: string | null;
  effects: Record<string, number> | null;
  until: string | null;
  reward: RandomRewardDto | null;
}

export interface RandomOptionDto {
  key: string;
  label: string;
  /** 要花的银币；不花钱为 null */
  cost: number | null;
}

/** 一道题：选项按服务端打乱后的顺序；答完才有 answer、explain */
export interface RandomQuestionDto {
  id: number;
  type: 'game' | 'fact' | 'opinion';
  q: string;
  choices: string[];
  /** 现出选项的题（品级）：各选项的品级，前端按 labels.grade 显示 */
  grades: number[] | null;
  /** 我选的（显示顺序的下标）；没答为 null */
  picked: number | null;
  /** 正确的那个（显示顺序的下标）；没答或没有对错的题为 null */
  answer: number | null;
  correct: boolean | null;
  explain: string | null;
}

export interface RandomEventDto {
  /** 这一次出现的编号 */
  id: string;
  kind: RandomEventKind;
  /** 事件编号或题号 */
  refId: number;
  /** 事件标题和正文；问答为 null（前端写“小镇问答”） */
  title: string | null;
  body: string | null;
  status: 'pending' | 'done';
  expiresAt: string;
  options: RandomOptionDto[] | null;
  /** 问答 1 道、问答夜 3 道 */
  questions: RandomQuestionDto[] | null;
  /** 选了哪个选项 */
  chosen: string | null;
  /** 结束了才有：通知、选择的结果；问答的奖励；问答夜按答对几道的结果 */
  result: RandomResultDto | null;
}

export interface RandomEventCurrentDto {
  event: RandomEventDto | null;
}

export const randomEventChooseBody = z.object({ option: z.enum(['a', 'b', 'c']) });
/** index：显示顺序的下标；q：问答夜的第几道（0 起），问答不传 */
export const randomEventAnswerBody = z.object({
  index: z.number().int().min(0).max(3),
  q: z.number().int().min(0).max(2).optional(),
});
