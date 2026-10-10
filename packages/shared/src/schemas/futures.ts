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

/** 后台“期货食材”页的一行（期货设计 §5.3）：1~5 级全部没下架的食材，含不在表里的 */
export interface AdminFuturesFoodDto {
  foodsId: number;
  level: number;
  rare: boolean;
  inList: boolean;
  enabled: boolean;
  /** 单独的额度；null = 按等级默认 */
  dailyQuota: number | null;
  defaultQuota: number;
  /** 菜谱要用它的街道 */
  streets: number[];
  /** 所选区服今天的参考价、等级价、期货单价、已订份数 */
  ref: number;
  levelPrice: number;
  unitPrice: number;
  ordered: number;
}
export const adminFuturesQuery = z.object({ shardId: z.coerce.number().int().positive() });
export const adminFuturesUpdateBody = z.object({
  items: z
    .array(
      z.object({
        foodsId: z.number().int().positive(),
        enabled: z.boolean().optional(),
        dailyQuota: z.number().int().min(0).max(1_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type AdminFuturesUpdateInput = z.infer<typeof adminFuturesUpdateBody>;
