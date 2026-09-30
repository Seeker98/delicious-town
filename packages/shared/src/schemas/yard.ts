import { z } from 'zod';

const id = z.number().int().positive();
const times = z.number().int().min(1).max(99);
export const yardPlantBody = z.object({ landNo: z.number().int().min(1).max(99), seedId: id });
export const yardPlantIdBody = z.object({ plantId: id });
export const yardFeedBody = z.object({ plantId: id, goodsId: id });
export const basketStoreBody = z.object({ foodsId: id, num: z.number().int().min(1).max(1_000_000) });
export const formulaAppraiseBody = z.object({ toolId: id, times });
export const formulaIdBody = z.object({ formulaId: id });
export const formulaDecomposeBody = z.object({
  formulaId: id,
  part: z.enum(['main', 'sub']),
  num: z.number().int().min(1).max(9999),
});
export const formulaComposeBody = z.object({ formulaId: id, num: times });
export const seedBuyBody = z.object({ seedId: id, num: times });
export const seedExchangeBody = z.object({ seedId: id, times });

export interface PlantDto {
  id: number;
  seedId: number;
  foodsId: number;
  /** 种子（食材）等级 */
  level: number;
  /** 1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期 */
  stage: number;
  canWater: boolean;
  /** 生长期：还要几分钟能浇水（0 = 现在就能）；收获期：还有几分钟枯萎；枯叶期 0 */
  minutes: number;
  /** 本阶段时长、本阶段已施肥抵扣（分钟） */
  stageMinutes: number;
  feedMin: number;
  worm: number;
  grass: number;
  dry: number;
  harvestNum: number;
  harvestMax: number;
  /** 种子原产量（偷菜门槛的基数） */
  baseNum: number;
}

export interface LandDto {
  no: number;
  level: number;
  exp: number;
  /** 升到下一级所需经验；满级 null */
  expNext: number | null;
  /** 产量加成（%） */
  bonus: number;
  plant: PlantDto | null;
}

export interface YardDto {
  lands: LandDto[];
  maxLands: number;
  /** 下一块地的开垦价；满了 null */
  nextLandCoin: number | null;
  coin: number;
  strength: number;
  renown: number;
  seeds: Array<{ seedId: number; num: number }>;
  fertilizers: Array<{ goodsId: number; minutes: number; num: number }>;
}

/** 偷菜被挡住的原因；null = 可以偷 */
export type StealBlock =
  'stolen' | 'withered' | 'not_ripe' | 'has_worm' | 'has_grass' | 'steal_left' | 'renown' | null;

export interface FriendPlantDto extends PlantDto {
  stolen: boolean;
  stealBlock: StealBlock;
}

export interface FriendYardDto {
  restId: number;
  name: string;
  lands: Array<{ no: number; level: number; plant: FriendPlantDto | null }>;
  /** 我的体力和声望 */
  strength: number;
  renown: number;
}

/** 收获或偷菜的结果：num 含 reapAddNum；punished = 被边牧扣掉的食材 id */
export interface ReapResultDto {
  foodsId: number;
  num: number;
  stolen: boolean;
  punished: number | null;
}

export interface BasketDto {
  items: Array<{ foodsId: number; num: number }>;
}

export interface FormulaDto {
  id: number;
  name: string;
  mainFoodsId: number;
  subFoodsId: number;
  addFoodsId: number;
  resFoodsId: number;
  mainNum: number;
  subNum: number;
  learned: boolean;
  /** 主料在菜篮、辅料和添加料在橱柜的持有 */
  have: { main: number; sub: number; add: number };
  /** 最多能合成几份（已学才有；受原料、体力和 99 限制） */
  maxCompose: number;
}

export interface FormulasDto {
  formulas: FormulaDto[];
  /** 配方鉴定道具（value 里有 formulaRate） */
  tools: Array<{ goodsId: number; num: number; rate: number }>;
  /** 玄奥配方持有 */
  scrolls: number;
  /** 配方精华持有 */
  essence: number;
  strength: number;
  composeStrength: number;
}

export interface FormulaAppraiseResultDto {
  results: Array<{ ok: boolean; formulaId?: number; part?: 'main' | 'sub'; upgraded?: boolean }>;
}

export interface ComposeResultDto {
  foodsId: number;
  num: number;
  extra: number;
}

export interface SeedsDto {
  stock: Array<{ seedId: number; num: number }>;
  shop: { open: boolean; items: Array<{ seedId: number; price: number }> };
  exchange: Array<{ seedId: number; seedNum: number; essence: number }>;
  essence: number;
  coin: number;
}
