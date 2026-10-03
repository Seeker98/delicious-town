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

/** 判定、作废可以带备注，写进审计（backlog 238-1） */
const finishNote = z.string().trim().max(200).optional();
export const predictResolveBody = z.object({ outcome: z.boolean(), note: finishNote });
export const predictVoidBody = z.object({ note: finishNote });

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
  /** 每份到期兑付多少银币（backlog 238-1：页首不再写死 1,000） */
  unit: number;
  yes: number;
  no: number;
  netCost: number;
  /** 已判定：结算所得；已作废：退款；其他为 null */
  payout: number | null;
  /** 系统自动出的题（238-2） */
  auto: boolean;
  /** 判定依据；没有为 null */
  resultNote: string | null;
  /** 题型（krab / hiphop / market / weather / stats；手动题为 manual）和出题参数：前端按语言渲染自动题（问题记录 272） */
  kind: string;
  params: Record<string, unknown>;
  /** 自动题判定依据的参数；旧数据和手动题为 null，显示 resultNote 原文 */
  resultParams: Record<string, unknown> | null;
}

export interface PredictListDto {
  eligible: boolean;
  /** predict_level / predict_age / predict_email / predict_frozen；满足为 null */
  reason: string | null;
  /** 区服是否开着事件合约：关掉时只能看，不能买卖（backlog 238-1） */
  enabled: boolean;
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
  /** 最近 20 笔成交，最新在前，不显示是谁；priceAfter 是成交后"是"的价格（问题记录 264） */
  trades: Array<{
    side: PredictSide;
    dir: PredictDir;
    qty: number;
    amount: number;
    priceAfter: number;
    createdAt: string;
  }>;
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
      priceAfter: number;
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
  /** 系统自动出的题（238-2） */
  auto: boolean;
  /** 判定依据；没有为 null */
  resultNote: string | null;
}
