import { z } from 'zod';

export const cookbookListQuery = z.object({
  street: z.coerce.number().int().min(0).max(50),
  page: z.coerce.number().int().min(1).default(1),
  filter: z.enum(['all', 'learnable', 'unlearned', 'learned']).default('all'),
});
export type CookbookListQuery = z.infer<typeof cookbookListQuery>;

export const cookbookIdParam = z.object({ id: z.coerce.number().int().positive() });
export const learnBody = z.object({ cookbookId: z.number().int().positive() });

export const foodsNeedQuery = z.object({
  street: z.coerce.number().int().min(0).max(50).optional(),
  target: z.coerce.number().int().min(1).max(10),
  foodLevel: z.coerce.number().int().min(1).max(9).optional(),
});
export type FoodsNeedQuery = z.infer<typeof foodsNeedQuery>;

/** 学习类型（规格书 03 §3.7）：'0' 可以直接学；'1'~'5' 需要该级万能食材补一种；'z' 不能学；'max' 已是最高品级 */
export type LearnType = 'max' | 'z' | '0' | '1' | '2' | '3' | '4' | '5';

export interface NeedFoodDto {
  foodsId: number;
  num: number;
  have: number;
}

export interface CookbookRowDto {
  id: number;
  name: string;
  grade: number;
  next: NeedFoodDto[] | null;
  learn: LearnType;
}

export interface CookbookListDto {
  street: number;
  page: number;
  pageSize: number;
  total: number;
  items: CookbookRowDto[];
  learned: number;
  streetLearned: number;
  streetTotal: number;
  gradeCounts: number[];
}

export interface CookbookDetailDto {
  id: number;
  name: string;
  streetId: number;
  streetName: string;
  taste: number[];
  coin: number;
  level: number;
  desc: string;
  grade: number;
  learn: LearnType;
  grades: Array<{ grade: number; name: string; foods: NeedFoodDto[] }>;
}

export interface FoodsNeedDto {
  target: number;
  items: Array<{ foodsId: number; need: number; have: number; lack: number }>;
}

export interface LearnResultDto {
  cookbookId: number;
  grade: number;
  learnType: LearnType;
}
