import { z } from 'zod';
import type { PredictDir, PredictSide } from '../predict';

/** 买卖（238-1 设计 §6.1）；单笔上限在服务端按区服数值再查 */
export const predictTradeBody = z.object({
  side: z.enum(['yes', 'no']),
  dir: z.enum(['buy', 'sell']),
  qty: z.number().int().min(1).max(999),
  /** 滑点保护：买入最多付多少、卖出至少得多少（含手续费）；不传不检查 */
  limit: z.number().int().min(0).optional(),
});

/** 后台出题（238-1 设计 §7.3）；截止时间晚于现在在服务端检查 */
export const predictCreateBody = z.object({
  shardId: z.number().int().positive(),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(''),
  closeAt: z.string().datetime({ offset: true }),
  p0: z.number().int().min(5).max(95),
  b: z.number().int().min(10).max(10000).optional(),
});

export const predictResolveBody = z.object({ outcome: z.boolean() });

export type PredictStatus = 'open' | 'closed' | 'resolved' | 'void';

export interface PredictEventDto {
  id: number;
  title: string;
  /** "是"的价格（0~1） */
  price: number;
  closeAt: string;
  /** 截止时间已过但任务还没跑时也显示为 closed */
  status: PredictStatus;
  outcome: boolean | null;
  yes: number;
  no: number;
  netCost: number;
  /** 已判定：结算所得；已作废：退款；其他为 null */
  payout: number | null;
}

export interface PredictListDto {
  eligible: boolean;
  /** predict_level / predict_age / predict_email；满足为 null */
  reason: string | null;
  need: { level: number; days: number };
  feeRate: number;
  maxHold: number;
  maxTrade: number;
  events: PredictEventDto[];
}

export interface PredictDetailDto {
  event: PredictEventDto & {
    description: string;
    b: number;
    unit: number;
    qYes: number;
    qNo: number;
    openAt: string;
  };
  /** 最近 20 笔成交，最新在前，不显示是谁 */
  trades: Array<{ side: PredictSide; dir: PredictDir; qty: number; amount: number; createdAt: string }>;
  /** 价格走势："是"的价格，最早在前；第一个是开题时的初始价格 */
  points: number[];
  /** 我这一局的收支（问题记录 254）：买入共花（含手续费）、卖出共得（已扣手续费）、手续费合计、作废退款比例、最近 100 笔成交 */
  mine: {
    bought: number;
    sold: number;
    fees: number;
    voidRatio: number | null;
    trades: Array<{
      side: PredictSide;
      dir: PredictDir;
      qty: number;
      amount: number;
      fee: number;
      createdAt: string;
    }>;
  };
}

export interface PredictTradeDto {
  side: PredictSide;
  dir: PredictDir;
  qty: number;
  amount: number;
  fee: number;
  total: number;
  /** 成交后"是"的价格 */
  price: number;
  yes: number;
  no: number;
}

export interface PredictAdminRow {
  id: number;
  title: string;
  status: PredictStatus;
  outcome: boolean | null;
  closeAt: string;
  price: number;
  trades: number;
  holders: number;
  fees: number;
  /** 结果为"是"/"否"时系统的收支（净成交额 − 要付的结算，不含手续费） */
  ifYes: number;
  ifNo: number;
  creator: string | null;
}
