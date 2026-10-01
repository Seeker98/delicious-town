import { z } from 'zod';

const id = z.number().int().positive();

export const npcKey = z.enum(['bigEater', 'wenjie', 'bro13']);
export type NpcKey = z.infer<typeof npcKey>;

export const townNewsQuery = z.object({ before: z.coerce.number().int().positive().optional() });
export const townBroadcastBody = z.object({ text: z.string().max(500) });
export const townTalkBody = z.object({ npc: npcKey });
export const townHammerBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('coin'), type: z.number().int().min(1).max(4) }),
  z.object({ mode: z.literal('diamond') }),
]);
export const townExchangeBody = z.object({ id, num: z.number().int().min(1).max(999) });
export const townLevelTicketBody = z.object({
  level: z.number().int().min(1).max(5),
  picks: z
    .array(z.object({ foodsId: id, num: z.number().int().min(1).max(999) }))
    .min(1)
    .max(30),
});
export const townMysteryTicketBody = z.object({ foodsId: id });
export const townFeastBody = z.object({ foodsId: id.optional() });

export interface NewsDto {
  id: number;
  type: string;
  restId: number | null;
  /** 当前店名；店已不存在时为 null */
  restName: string | null;
  params: Record<string, unknown>;
  createdAt: string;
}

export interface NewsPageDto {
  items: NewsDto[];
  hasMore: boolean;
}

export interface HeadlinesDto {
  news: NewsDto[];
  broadcast: NewsDto | null;
}

/** 小镇玩法获得的东西；银币、钻石的 id 为 null */
export interface TownRewardDto {
  kind: 'foods' | 'goods' | 'seed' | 'coin' | 'diamond';
  id: number | null;
  num: number;
}

export interface TalkResultDto {
  npc: NpcKey | 'mayor';
  talk: string;
  rewards: TownRewardDto[];
}

export interface ShakeResultDto {
  coin: number;
  egg: { goodsId: number; num: number } | null;
}

export interface HammerResultDto {
  from: number;
  to: number;
  gift: { goodsId: number; num: number };
  cooldownUntil: string;
}

export interface TownExchangeResultDto {
  goodsId: number;
  num: number;
}

export interface TicketResultDto {
  foods: Array<{ foodsId: number; num: number }>;
}

export interface BlessDto {
  id: number;
  name: string;
  type: number;
  num: number;
  needAct: number;
  levels: [number, number] | null;
  goodsId: number | null;
  buff: Record<string, number>;
}

export interface WishResultDto {
  bless: BlessDto;
}

export interface FeastResultDto {
  rewards: TownRewardDto[];
}

export interface TownDto {
  now: string;
  star: number;
  coin: number;
  diamond: number;
  talked: Record<NpcKey, boolean>;
  /** 镇长问答（4E-2）：今天是否已经回答过 */
  mayor: { answered: boolean };
  /** 大胃哥的首次礼物已经领过 */
  bigEaterGift: boolean;
  shaken: boolean;
  broadcast: { horns: number; readyAt: string | null; minStar: number; maxLen: number };
  hammer: {
    has: boolean;
    /** 我的冷却结束时间 */
    readyAt: string | null;
    /** 全镇 90 秒间隔结束时间 */
    townReadyAt: string | null;
    coin: number;
    diamond: number;
  };
  weather: { id: number; name: string; until: string };
  bless: {
    today: BlessDto | null;
    restName: string | null;
    hasLamp: boolean;
    activation: number;
    feasted: boolean;
  };
}

export interface TownExchangeItemDto {
  id: number;
  category: string;
  goodsId: number;
  num: number;
  need: Array<{ goodsId: number; num: number; have: number }>;
  /** -1 不限 */
  times: number;
  used: number;
}

export interface TownExchangeDto {
  items: TownExchangeItemDto[];
  /** 下标 0~4 对应一到五级食材兑换券的持有数 */
  levelTickets: number[];
  mysteryTickets: number;
  /** 每级可以用 N 级券换的食材 id（下标 0 = 一级） */
  levelFoods: number[][];
  /** 神秘券可以换的 7 级食材 id */
  mysteryFoods: number[];
  maxNum: number;
}
