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
  /** 怎么获得（问题记录 415）：银币商店价、黑市钻石价（不卖为 null）；会不会从随机奖励出；是不是昨日冠军的奖励 */
  shopCoin: number | null;
  blackDiamond: number | null;
  award: boolean;
  champion: boolean;
  /** 神殿守护兽暴击会掉（厨神玉玺，backlog 415） */
  guardian: boolean;
}

export interface McOverviewDto {
  star: number;
  learned: McLearnedDto[];
  remnants: Array<{ mcId: number; num: number }>;
  current: McCookDto | null;
  /** 持有的 1~6 级残卷碎片（下标 0 = 1 级；问题记录 415） */
  fragments: number[];
  /** 几张碎片换 1 张残卷 */
  fragmentPerRemnant: number;
  /** 在售特色菜卖给顾客时每份价值的倍率（问题记录 412）；没有在售为 null */
  saleRate: number | null;
  /** 持有的神秘食谱数 */
  recipes: number;
  tools: McToolDto[];
  cookies: number;
  cookNums: number[];
  /** 有星神之书时鉴定会重抽 */
  starBook: boolean;
}

export interface AppraiseResultDto {
  /** 失败时 text 是中文原文，textId 是序号（问题记录 272），前端按语言显示 */
  results: Array<{
    ok: boolean;
    mcId?: number;
    num?: number;
    blessed?: boolean;
    text?: string;
    textId?: number;
  }>;
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

export const tasteBody = z.object({ restId: id });

export interface TasteResultDto {
  /** 得到的体力 */
  strength: number;
  /** 得到了神秘食谱 */
  recipe: boolean;
  /** 这批剩余份数 */
  left: number;
}

export const lessonOpenBody = z.object({ mcId: id, certId: id });
export const lessonLearnBody = z.object({ type: z.union([z.literal(1), z.literal(2)]) });
export const lessonIdParam = z.object({ id: z.coerce.number().int().positive() });

export interface LessonDto {
  id: number;
  teacherId: number;
  teacherName: string;
  mcId: number;
  level: number;
  maxNum: number;
  learned: number;
  stolen: number;
  endsAt: string;
  /** 我已经试过这门课 */
  tried: boolean;
}

export interface LessonCertDto {
  goodsId: number;
  num: number;
  levels: number[];
  needStrength: number;
  maxNum: number;
  lessonHour: number;
}

export interface LessonsDto {
  items: LessonDto[];
  /** 我正在开的课 */
  mine: LessonDto | null;
  certs: LessonCertDto[];
  /** 持有百世之师，可以强制结束 */
  canForceClose: boolean;
  forceCloseCoinPerLevel: number;
  /** 偷学失败时 等级×forgetPerLevel+1 道食谱各降 forgetGrades 品，降到 0 就忘了（问题记录 424） */
  forgetPerLevel: number;
  forgetGrades: number;
}

export interface LessonLearnDto {
  success: boolean;
  /** 偷学失败时遗忘的普通食谱和特色菜 */
  /** cookbooks：降了品级的食谱；grades：各降几品；lost：其中降到 0 忘掉的道数（问题记录 424） */
  forgot: { cookbooks: number[]; mcId: number | null; grades: number; lost: number };
}
