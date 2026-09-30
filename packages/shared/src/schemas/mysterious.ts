import { z } from 'zod';

const id = z.number().int().positive();
export const mcIdParam = z.object({ id: z.coerce.number().int().positive() });
export const appraiseBody = z.object({
  toolId: id,
  times: z.number().int().min(1).max(99),
  /** 勾选"低于 5 级不重抽" */
  noRetry: z.boolean().default(false),
});
export const remnantBody = z.object({ mcId: id, num: z.number().int().min(1).max(9999) });
export const mcLearnBody = z.object({ mcId: id });

export interface McLearnedDto {
  mcId: number;
  curlevel: number;
  levelName: string;
  /** 累计熟练度 */
  curexp: number;
  /** 升到下一级需要的累计熟练度；满级为 null */
  expNext: number | null;
  trialWorth: number;
  trialExp: number;
  /** 1 残卷 / 2 课程 / 3 偷学 */
  way: number;
}

export interface McCookDto {
  id: number;
  mcId: number;
  grade: number;
  totalNum: number;
  leftNum: number;
  /** 每份价值 */
  price: number;
  luck: boolean;
  eatCount: number;
  createdAt: string;
}

export interface McToolDto {
  goodsId: number;
  num: number;
  min: number;
  max: number;
  rate: number;
  /** 每次成功得到的残卷张数上限 */
  perNum: number;
}

export interface McOverviewDto {
  star: number;
  learned: McLearnedDto[];
  remnants: Array<{ mcId: number; num: number }>;
  current: McCookDto | null;
  /** 持有的神秘食谱数 */
  recipes: number;
  tools: McToolDto[];
  cookies: number;
  cookNums: number[];
  /** 有星神之书时鉴定会重抽 */
  starBook: boolean;
}

export interface AppraiseResultDto {
  results: Array<{ ok: boolean; mcId?: number; num?: number; blessed?: boolean; text?: string }>;
}
export const mcCookBody = z.object({
  mcId: id,
  cookNum: z.number().int().min(1).max(50),
  cookie: z.boolean().default(false),
});

export interface McPreviewDto {
  mcId: number;
  learned: boolean;
  /** 已经有在售的特色菜 */
  cooking: boolean;
  foods: Array<{ foodsId: number; have: number }>;
  cookNums: Array<{ n: number; ok: boolean }>;
  cookies: number;
}

export interface CookResultDto {
  cook: McCookDto;
  /** 本次增加的熟练度 */
  proficiency: number;
  curlevel: number;
  levelUp: boolean;
  /** 海绵宝宝点赞 */
  bob: boolean;
  /** 试炼经验带来的餐厅经验 */
  restExp: number;
}
