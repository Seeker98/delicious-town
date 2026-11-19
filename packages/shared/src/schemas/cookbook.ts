import { z } from 'zod';

export const cookbookListQuery = z.object({
  street: z.coerce.number().int().min(0).max(50),
  page: z.coerce.number().int().min(1).default(1),
  filter: z.enum(['all', 'learnable', 'upgradable', 'unlearned', 'learned']).default('all'),
});
export type CookbookListQuery = z.infer<typeof cookbookListQuery>;

export const cookbookIdParam = z.object({ id: z.coerce.number().int().positive() });
export const learnBody = z.object({ cookbookId: z.number().int().positive() });

export interface FoodsNeedQuery {
  street?: number;
  target: number;
  foodLevel?: number;
}

/** 学习类型（规格书 03 §3.7）：'0' 可以直接学；'1'~'5' 需要该级万能食材补一种；'z' 不能学；'max' 已是最高品级 */
/** street：不在这道菜的街道上，不能学也不能升级（问题记录 312） */
export type LearnType = 'max' | 'street' | 'z' | '0' | '1' | '2' | '3' | '4' | '5';

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
  /** 列表左边的食材图：一级所需的第一种食材，和详情页头图一样（满级的菜 next 为空，原来只能用通用图，backlog P7）；旧服务端没有 */
  art?: number;
  /**
   * 学会（没学时）或升一品（已学时）能加多少厨艺值（收益模型改版 2026-11-19）：
   * 没学 = 菜价 × (1 + 1 品加成)，已学 L 品 = 菜价 × (L+1 品加成 − L 品加成)；满级没有。旧服务端没有
   */
  fameAdd?: number;
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
  /** 全部食谱数（所有街道） */
  allTotal: number;
  gradeCounts: number[];
  /** 店现在的厨艺值 K：全部学会的菜（不分街）Σ 菜价 × (1 + 品级加成)（收益模型改版 2026-11-19）；旧服务端没有 */
  fame?: number;
}

/** 食谱进度一览（问题记录：食谱页加进度一览）：每条街的总数和各品级及以上的道数 */
export interface CookbookProgressDto {
  /** 开放到第几品级（区服数值 rest.cookbookMaxGrade） */
  maxGrade: number;
  /** 店现在所在的街 */
  street: number;
  /** 按街道表的顺序，只列有菜的街；atLeast[i] = 品级 ≥ i+1 的道数 */
  streets: Array<{ streetId: number; total: number; atLeast: number[] }>;
}

export interface CookbookDetailDto {
  id: number;
  name: string;
  streetId: number;
  streetName: string;
  taste: number[];
  /** 外卖、参考用的菜价（菜价 × 区服菜价倍率）；收益模型改版 2026-11-19 以后堂食顾客不按它付钱 */
  coin: number;
  level: number;
  desc: string;
  grade: number;
  learn: LearnType;
  grades: Array<{ grade: number; name: string; foods: NeedFoodDto[] }>;
  /** 店现在的厨艺值 K（同 CookbookListDto.fame）；旧服务端没有 */
  fame?: number;
  /** 学会或升一品能加多少厨艺值（同 CookbookRowDto.fameAdd）；满级没有 */
  fameAdd?: number;
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
