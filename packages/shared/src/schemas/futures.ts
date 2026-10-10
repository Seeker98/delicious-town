import { z } from 'zod';

/** 期货下单（期货设计 §9）：unitPrice 是玩家看到的单价，服务端重算，不一样就拒绝 */
export const futuresOrderBody = z.object({
  foodsId: z.number().int().positive(),
  qty: z.number().int().min(1).max(999),
  unitPrice: z.number().int().min(1).max(1_000_000_000),
});
export type FuturesOrderInput = z.infer<typeof futuresOrderBody>;

export type FuturesStatus = 'open' | 'delivered' | 'defaulted' | 'cancelled';

/** 可下单的一种食材：单价（今天的）、区服今天还剩几份 */
export interface FuturesFoodDto {
  foodsId: number;
  level: number;
  rare: boolean;
  unitPrice: number;
  left: number;
}

export interface FuturesContractDto {
  id: number;
  foodsId: number;
  qty: number;
  unitPrice: number;
  deposit: number;
  balance: number;
  createdAt: string;
  dueAt: string;
  status: FuturesStatus;
  settledAt: string | null;
  /** 交割时进橱柜（含冰箱）、进交易所账户各几份 */
  toCupboard: number;
  toWallet: number;
}

/** 期货标签（GET /futures） */
export interface FuturesDto {
  /** 本区服期货和交易所都开着，能下单 */
  enabled: boolean;
  /** 不能下单的原因（门槛、交易所冻结）；能下单为 null */
  blocked: 'exchange_level' | 'exchange_age' | 'exchange_email' | 'exchange_frozen' | null;
  needLevel: number;
  needDays: number;
  foods: FuturesFoodDto[];
  personDaily: number;
  personLeft: number;
  deliverHours: number;
  depositRate: number;
  /** 进行中的全部，已结束的最近 30 张；新的在前 */
  contracts: FuturesContractDto[];
}
