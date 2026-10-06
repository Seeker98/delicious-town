import { z } from 'zod';

const times = z.number().int().min(1).max(99);
/** 0 石头、1 剪刀、2 布 */
export const barFgBody = z.object({ hand: z.number().int().min(0).max(2) });
export const barCupBody = z.object({ cup: z.number().int().min(1).max(3) });
/** 上限由服务端按 tuning.bar.numMax 再查 */
export const barNumBody = z.object({ num: times });
export const barSlotBody = z.object({ times });
export const barExchangeBody = z.object({ num: times });

// ---------- 酒吧扩展（子项目 4C-3） ----------
/** 押注是否在可选范围由服务端按 tuning 再查 */
export const barDevilStartBody = z.object({ stake: z.number().int().min(1).max(1000) });
export const barDevilDrinkBody = z.object({ cup: z.number().int().min(0).max(99) });
/** 配料编号 0~7；长度由服务端按本关配方再查 */
export const barMemoryAnswerBody = z.object({
  answer: z.array(z.number().int().min(0).max(99)).min(1).max(20),
});
/** 上限放到 1 天：瞄准后放久了再投也按服务端时间判分，不报参数错误（PR28 遗留） */
export const barDartsThrowBody = z.object({ elapsedMs: z.number().int().min(0).max(86_400_000) });

// ---------- 最后一颗糖（问题记录 427-1） ----------
export const barNimStartBody = z.object({ table: z.enum(['novice', 'expert']) });
export const barNimFirstBody = z.object({ who: z.enum(['me', 'bartender']) });
/** 上限由服务端按本局的 k 和剩余再查 */
export const barNimTakeBody = z.object({ num: z.number().int().min(1).max(99) });

// ---------- 秘制调料（问题记录 427-2） ----------
/** 调料编号；长度、不重复、上限由服务端按数值再查 */
export const barSpiceGuessBody = z.object({ guess: z.array(z.number().int().min(0).max(99)).min(1).max(10) });

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
    /** 最多再抽几次必出保底（稀有） */
    floorLeft: number;
    pool: SlotAwardDto[];
    /** 我的统计：每个奖项累计格数（含空格 id 0），按奖项 id 排序 */
    stats: Array<{ awardId: number; num: number }>;
  };
  /** 多少张礼券换 1 个蟹币 */
  krabCoinTickets: number;
  devil: { stakes: number[]; round: DevilDto | null };
  memory: {
    cost: number;
    played: number;
    max: number;
    flashMs: number;
    gapMs: number;
    /** 进行中的局；本关没答对时带配方和剩余作答毫秒，刷新页面后可以接着玩（终审 I2） */
    round: { level: number; passed: boolean; seq: number[] | null; leftMs: number | null } | null;
  };
  darts: { cost: number; played: number; max: number; round: DartsDto | null };
  /** 最后一颗糖：两张桌子合计的次数；进行中的局（全部公开） */
  nim: { played: number; max: number; tables: Record<NimTable, NimTableInfoDto>; round: NimDto | null };
  /** 秘制调料：kinds 种调料里 length 种的排列，最多 tries 次；进行中的局不含配方 */
  spice: {
    cost: number;
    played: number;
    max: number;
    kinds: number;
    length: number;
    tries: number;
    tiers: SpiceTierDto[];
    round: SpiceDto | null;
  };
}

export interface SpiceGuessDto {
  guess: number[];
  /** 调料和位置都对 */
  a: number;
  /** 调料对、位置不对 */
  b: number;
}

export interface SpiceTierDto {
  /** 第几次以内猜中算这一档 */
  maxTries: number;
  awardLevel: number;
  renown: number;
}

/** 秘制调料的局面；配方只在结束时给出 */
export interface SpiceDto {
  guesses: SpiceGuessDto[];
  /** 还能猜几次 */
  left: number;
  result: 'win' | 'lose' | null;
  secret: number[] | null;
  /** 猜中的档位，0 是大奖；没猜中为 null */
  tier: number | null;
  renown: number;
  award: BarAwardDto | null;
}

export type NimTable = 'novice' | 'expert';

/** 一张桌子给前端看的数值（不含调酒师的失手概率） */
export interface NimTableInfoDto {
  cost: number;
  /** 每次最多拿几颗的范围 */
  k: [number, number];
  /** 开局糖果数的范围 */
  pile: [number, number];
  renown: number;
  awardLevel: number;
  /** choose = 玩家自己选先后，coin = 抛硬币 */
  first: 'choose' | 'coin';
}

export interface NimMoveDto {
  who: 'me' | 'bartender';
  take: number;
}

/** 最后一颗糖的局面 */
export interface NimDto {
  table: NimTable;
  k: number;
  /** 开局的糖果数 */
  pile: number;
  left: number;
  log: NimMoveDto[];
  /** 新手桌还没选先后 */
  needFirst: boolean;
  /** 高手桌抛硬币的结果；新手桌为 null */
  coin: 'me' | 'bartender' | null;
  /** 结束时的输赢；进行中为 null */
  result: 'win' | 'lose' | null;
  renown: number;
  award: BarAwardDto | null;
}

/** 魔鬼辣杯的局面；特辣酒位置只在结束时给出 */
export interface DevilDto {
  stake: number;
  /** 每杯是谁喝的；null 还没人喝 */
  cups: Array<'me' | 'bartender' | null>;
  /** 玩家活过的杯数 */
  survived: number;
  /** 结束时的输赢；进行中为 null */
  result: 'win' | 'lose' | null;
  spiked: number | null;
  /** 赢得的礼券 */
  payout: number;
  /** 输了时宿醉到什么时候 */
  hangoverUntil: string | null;
  /** 这一回合调酒师喝的杯 */
  lastBartender: number | null;
}

export interface MemoryRoundDto {
  level: number;
  /** 配方：配料编号 */
  seq: number[];
  flashMs: number;
  gapMs: number;
  /** 展示结束后还有多少毫秒可以作答 */
  answerMs: number;
}

export interface MemoryAnswerDto {
  correct: boolean;
  /** 答错的原因：太早交、太晚交、记错；答对为 null（终审 I3） */
  reason: 'early' | 'late' | 'wrong' | null;
  level: number;
  award: BarAwardDto | null;
  /** 答对且还有下一关 */
  canNext: boolean;
  /** 本局结束 */
  finished: boolean;
}

export interface DartsDto {
  /** 已投的每一镖得分 */
  throws: number[];
  /** 已瞄准、等待投掷 */
  aiming: boolean;
}

export interface DartsAimDto {
  period: number;
  phase: number;
}

export interface DartsThrowDto {
  /** 落点；超出时间窗为 null（记 0 分） */
  x: number | null;
  score: number;
  throws: number[];
  finished: boolean;
  boss: number[] | null;
  result: BarResultDto | null;
  award: BarAwardDto | null;
  refund: number;
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
