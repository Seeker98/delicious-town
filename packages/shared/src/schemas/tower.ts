import { z } from 'zod';
import type { BarAwardDto } from './bar';
import type { AttrsDto } from './equip';
import type { DuelJudgeId } from '../rules/duelJudges';

export const towerChallengeBody = z.object({
  floor: z.number().int().min(1).max(10),
  test: z.boolean().default(false),
});
export const rankBody = z.object({ rank: z.number().int().min(1).max(15) });
export const duelBody = z.object({ restId: z.number().int().positive() });
export const renownBuyBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(99),
});

/** 色、香、味、形、养其中一项的评分权重：各属性的系数，mc 是在售特色菜每份价值的系数 */
export interface DuelWeightDto {
  cook: number;
  cutting: number;
  fire: number;
  season: number;
  mc: number;
}

export interface DuelSideDto {
  name: string;
  power: number;
  /** 色、香、味、形、养（五项的和网页不显示，接口也不给；票数相同时服务端按和定胜负） */
  scores: number[];
  /** 拿来比拼的特色菜（问题记录 431）：编号和等级；没有为 null（网页写“无米之炊”） */
  dish: { id: number; level: number } | null;
}

/** 一位上场的评委（问题记录 396）：双方在他关注项目上的和 */
export interface DuelJudgeDto {
  id: DuelJudgeId;
  me: number;
  them: number;
}

export interface DuelResultDto {
  win: boolean;
  me: DuelSideDto;
  them: DuelSideDto;
  /** 按上场顺序；有一方先拿到多数票就结束，后面的评委不上场 */
  judges: DuelJudgeDto[];
  /** [我的票, 对方的票] */
  votes: [number, number];
  /** 这一局请了几位评委（规则说明按它写，backlog 396） */
  judgeCount: number;
  /** 这一局五项的评分权重（规则说明第一段按它写，backlog 396） */
  weights: DuelWeightDto[];
  /** 打赢长老掉的那件厨具（backlog 408：不混在随机奖励里）；没掉或不是厨塔为 null */
  elderDrop: number | null;
  /** 我的声望变化 */
  renown: number;
  awards: BarAwardDto[];
  /** 试打 */
  test: boolean;
  /** 赛厨榜：挑战后我的名次（没上榜为 null）；其他挑战为 null */
  rank: number | null;
}

export interface TowerFloorDto {
  floor: number;
  name: string;
  title: string;
  note: string;
  minLevel: number;
  power: number;
  maxTimes: number;
  /** 我今天还能挑战他几次 */
  left: number;
  unlocked: boolean;
  /** 正式挑战要的体力 */
  cost: number;
  /** 当天的特色菜；1~3 层和还没换菜时为 null */
  mc: { mcId: number; price: number } | null;
  /** 长老的装备和加点（问题记录 408） */
  elder: TowerElderDto;
}

export interface TowerElderDto {
  level: number;
  /** 每件厨具都强化到这一级 */
  stress: number;
  /** 等级属性点 */
  points: { cook: number; cutting: number; fire: number };
  /** 每件厨具的属性（基础 + 强化） */
  pieces: Array<{ id: number; attrs: AttrsDto }>;
  /** 被挑战时的属性：加点 + 厨具，算上套装和防守加成 */
  attrs: AttrsDto;
  /** 打赢可能掉的厨具和概率 */
  drops: number[];
  dropRate: number;
}

export interface TowerDto {
  floors: TowerFloorDto[];
  /** 每局请几位评委（区服数值 tower.duel.judges；规则说明按它写，backlog 396） */
  duelJudges: number;
  /** 五项的评分权重（区服数值 tower.duel.weights） */
  duelWeights: DuelWeightDto[];
  /** 我的进攻厨力 */
  power: number;
  /** 今日厨塔剩余次数、总次数（5 + 用掉的挑战券） */
  left: number;
  dailyTotal: number;
  /** 持有的挑战券 */
  tickets: number;
  bestFloor: number;
  strength: number;
  level: number;
  /** 当前游戏时间的小时；nightFloor 层以上 openHour 点前不能挑战 */
  hour: number;
  nightFloor: number;
  openHour: number;
  /** 试打要的体力 */
  testCost: number;
}

export interface RankSlotDto {
  rank: number;
  restId: number | null;
  name: string | null;
  level: number | null;
}

export interface RankDto {
  /** 每局请几位评委（规则说明按它写，backlog 396） */
  duelJudges: number;
  /** 五项的评分权重 */
  duelWeights: DuelWeightDto[];
  /** 本周一 */
  week: string;
  /** 本周结束（下周一 0 点）的 ISO 时间 */
  weekEnd: string;
  slots: RankSlotDto[];
  myRank: number | null;
  /** 今日赛厨榜剩余次数 */
  left: number;
  /** 今日切磋总次数（好友切磋 + 赛厨榜） */
  spar: number;
  strength: number;
  rankTop: number;
  rankGap: number;
  duelStrength: number;
}

export interface DuelInfoDto {
  /** 今天还能和他切磋几次 */
  left: number;
  spar: number;
  strength: number;
  duelStrength: number;
}

export interface RenownShopItemDto {
  goodsId: number;
  renown: number;
  weeklyLimit: number;
  /** 本周已兑 */
  bought: number;
  rare: boolean;
  /** 稀有品是否已拥有 */
  owned: boolean;
}

export interface RenownShopDto {
  renown: number;
  items: RenownShopItemDto[];
}
