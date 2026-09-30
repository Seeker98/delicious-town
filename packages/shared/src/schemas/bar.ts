import { z } from 'zod';

const times = z.number().int().min(1).max(99);
/** 0 石头、1 剪刀、2 布 */
export const barFgBody = z.object({ hand: z.number().int().min(0).max(2) });
export const barCupBody = z.object({ cup: z.number().int().min(1).max(3) });
/** 上限由服务端按 tuning.bar.numMax 再查 */
export const barNumBody = z.object({ num: times });
export const barSlotBody = z.object({ times });
export const barExchangeBody = z.object({ num: times });

export type BarResultDto = 'win' | 'draw' | 'lose';

/** 随机奖励（规格书 00 §0.8） */
export interface BarAwardDto {
  kind: 'foods' | 'goods' | 'coin' | 'exp';
  /** 物品或食材 id；银币、经验为 null */
  id: number | null;
  num: number;
  /** 物品、食材因幸运数量翻倍 */
  lucky: boolean;
}

export interface BarGameDto {
  /** 上一局结果；没玩过为 null */
  result: BarResultDto | null;
  /** 上一局结果连续出现的次数 */
  times: number;
}

export interface SlotAwardDto {
  id: number;
  kind: 'empty' | 'foods' | 'goods';
  itemId: number | null;
  /** 每格抽中的概率 */
  rate: number;
  rare: boolean;
}

export interface BarDto {
  tickets: number;
  krabCoins: number;
  fg: BarGameDto;
  /** nextCost：下一局要几张礼券 */
  cup: BarGameDto & { nextCost: number };
  num: BarGameDto & { cost: number; max: number };
  slot: {
    emailVerified: boolean;
    /** 持有有效神灯（提前保底率翻倍） */
    lamp: boolean;
    /** 距离保底还剩几次 */
    floorLeft: number;
    pool: SlotAwardDto[];
    /** 我的统计：每个奖项累计格数（含空格 id 0），按奖项 id 排序 */
    stats: Array<{ awardId: number; num: number }>;
  };
  /** 多少张礼券换 1 个蟹币 */
  krabCoinTickets: number;
}

export interface FgResultDto {
  result: BarResultDto;
  /** 对方出的拳 */
  barHand: number;
  times: number;
  lucky: boolean;
  /** 平局得到的银币 */
  coin: number;
  award: BarAwardDto | null;
}

export interface CupResultDto {
  win: boolean;
  /** 这一局花的礼券 */
  cost: number;
  /** 猜对：当前连胜；猜错：连错次数 */
  times: number;
  lucky: boolean;
  award: BarAwardDto | null;
}

export interface NumResultDto {
  win: boolean;
  /** 转到的数字；中奖时等于猜的数 */
  barNum: number;
  hint: 'close' | 'soft' | 'hard' | null;
  /** 连续中奖 / 连续没中的次数（计划裁定 4） */
  times: number;
  lucky: boolean;
  award: BarAwardDto | null;
}

export interface SlotResultDto {
  /** 每次 3 格的奖项 id */
  spins: number[][];
  /** 合并后的奖励（不含空格），按奖项 id 排序 */
  rewards: Array<{ awardId: number; kind: 'foods' | 'goods'; itemId: number; num: number }>;
  krabCoins: number;
  floorLeft: number;
}

export interface BarExchangeResultDto {
  krabCoins: number;
  tickets: number;
}
