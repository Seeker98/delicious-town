import { z } from 'zod';

export type ExchangeSide = 'buy' | 'sell';

/** 下单请求（156-1 设计 §6.1）；价格范围、数量上限在服务端按区服数值再查 */
export const exchangeOrderBody = z.object({
  foodsId: z.number().int().positive(),
  side: z.enum(['buy', 'sell']),
  price: z.number().int().min(1).max(100_000_000),
  qty: z.number().int().min(1).max(999),
});

/** 卖给系统（问题记录 244）：price 是玩家看到的系统收购价，系统价低于它就拒绝 */
export const exchangeSellSystemBody = z.object({
  foodsId: z.number().int().positive(),
  price: z.number().int().min(1).max(100_000_000),
  qty: z.number().int().min(1).max(999),
});

export interface ExchangeOrderDto {
  id: number;
  side: ExchangeSide;
  foodsId: number;
  price: number;
  qty: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface ExchangeFoodDto {
  foodsId: number;
  ref: number;
  last: number | null;
  /** 最新成交价相对参考价的涨跌（小数，0.1 = 涨 10%）；没有成交为 null */
  changePct: number | null;
  /** 玩家正在卖、正在收的数量（未成交、未过期的挂单剩余），系统库存（问题记录 282） */
  selling: number;
  buying: number;
  sysStock: number;
}

export interface ExchangeLevelDto {
  price: number;
  qty: number;
  /** 系统做市的一档（156-3） */
  system: boolean;
  /** 系统兜底收购价：低于挂单下限，只能用「卖给系统」成交（问题记录 244） */
  floor?: boolean;
}

export interface ExchangeBookDto {
  foodsId: number;
  ref: number;
  min: number;
  max: number;
  last: number | null;
  volume: number;
  bids: ExchangeLevelDto[];
  asks: ExchangeLevelDto[];
}

export interface ExchangeTradeDto {
  side: ExchangeSide;
  foodsId: number;
  price: number;
  qty: number;
  fee: number;
  /** 和系统成交（156-3） */
  system: boolean;
  createdAt: string;
}

export interface ExchangeMeDto {
  eligible: boolean;
  /** 不满足的那一项：exchange_level / exchange_age / exchange_email；满足为 null */
  reason: string | null;
  need: { level: number; days: number };
  orders: ExchangeOrderDto[];
  wallet: { coin: number; foods: Array<{ foodsId: number; num: number }> };
  trades: ExchangeTradeDto[];
  feeRate: number;
  /** 冻结中（冷静期）的所得 */
  holds: ExchangeHoldDto[];
  /** 交易所被冻结时的原因 */
  frozen: { reason: string } | null;
}

export interface ExchangePlaceDto {
  order: ExchangeOrderDto;
  fills: Array<{ price: number; qty: number; held: boolean }>;
}

export interface ExchangeWithdrawDto {
  coin: number;
  foods: Array<{ foodsId: number; num: number }>;
  left: Array<{ foodsId: number; num: number }>;
}

/** 可疑成交的标记（156-2 设计 §4） */
export const EXCHANGE_FLAGS = {
  same_ip: '同 IP',
  edge_price: '价格贴边',
  repeat_pair: '反复对倒',
  large: '大额',
} as const;
export type ExchangeFlag = keyof typeof EXCHANGE_FLAGS;

export const exchangeFreezeBody = z.object({
  restId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
});
export const exchangeUnfreezeBody = z.object({ restId: z.number().int().positive() });
export const exchangeConfiscateBody = z.union([
  z.object({ tradeId: z.number().int().positive() }).strict(),
  z.object({ restId: z.number().int().positive() }).strict(),
]);
export const exchangeSuspiciousQuery = z.object({
  shardId: z.coerce.number().int().positive(),
  flag: z.enum(['same_ip', 'edge_price', 'repeat_pair', 'large']).optional(),
});

export interface ExchangeHoldDto {
  coin: number;
  foodsId: number | null;
  num: number;
  releaseAt: string;
}

export interface ExchangeSuspiciousSide {
  restId: number;
  restName: string | null;
  accountId: number | null;
  username: string | null;
  /** 这笔成交在这一方名下的冻结记录状态；没有冻结记录为 null */
  hold: 'held' | 'released' | 'confiscated' | null;
}

export interface ExchangeSuspiciousRow {
  tradeId: number;
  at: string;
  foodsId: number;
  price: number;
  ref: number | null;
  qty: number;
  amount: number;
  flags: ExchangeFlag[];
  buyer: ExchangeSuspiciousSide;
  seller: ExchangeSuspiciousSide;
}

export interface ExchangeFrozenRow {
  restId: number;
  restName: string;
  username: string;
  reason: string;
  actor: string | null;
  at: string;
  /** 冻结中的所得合计 */
  heldCoin: number;
  heldFoods: number;
}

/** 后台"系统做市"（156-3 设计 §7） */
export interface ExchangeMakerRow {
  foodsId: number;
  stock: number;
  /** 今天已收 */
  bought: number;
  /** 当前系统买价；低于挂单下限不收为 null */
  bid: number | null;
  ask: number;
}

export interface ExchangeMakerDto {
  /** 区服的 tuning.exchange.maker.enabled：关闭时系统不报价，后台不显示买卖价（backlog 156-3） */
  enabled: boolean;
  foods: ExchangeMakerRow[];
  /** 今天：收购花出（成交额）、卖出收回、卖给系统那一侧的手续费、净回收 = 收回 − 花出 + 手续费 */
  today: { spent: number; earned: number; fee: number; net: number };
}
