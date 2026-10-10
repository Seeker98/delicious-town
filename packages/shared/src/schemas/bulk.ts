import { z } from 'zod';

/** 特许大宗认购（大宗认购设计 2026-10-10）：第一次出价和改出价都用这个 */
export const bulkBidBody = z.object({
  lotId: z.number().int().positive(),
  price: z.number().int().min(1).max(1_000_000_000),
  qty: z.number().int().min(1).max(10_000),
});
export type BulkBidInput = z.infer<typeof bulkBidBody>;

export type BulkLotStatus = 'open' | 'settled' | 'failed' | 'cancelled';

/** 进行中的批次和竞价中公开的数据（设计 §1.3）；不含真正的收盘时刻 */
export interface BulkLotDto {
  id: number;
  foodsId: number;
  level: number;
  qty: number;
  reserve: number;
  /** 每人上限、成团份数 */
  cap: number;
  groupQty: number;
  opensAt: string;
  /** 名义结束时间：真正收盘在它之前 closeWindowMin 分钟内 */
  endsAt: string;
  /** 预计成交价：照现在的出价收盘时的价格 */
  price: number;
  /** 入围门槛：至少出多少才能挤进前 n 份 */
  threshold: number;
  /** 认购份数合计、参与人数 */
  demand: number;
  bidders: number;
  grouped: boolean;
}

export interface BulkMineDto {
  price: number;
  qty: number;
  frozen: number;
  /** 照现在收盘能中几份、大约付多少 */
  won: number;
  estimate: number;
  /** 还要等几秒才能再出价；0 = 现在可以 */
  cooldownLeft: number;
}

export interface BulkResultDto {
  id: number;
  foodsId: number;
  level: number;
  qty: number;
  sold: number;
  price: number | null;
  demand: number;
  status: Exclude<BulkLotStatus, 'open'>;
  endsAt: string;
  /** 我参与了才有；结算第二段还没处理到我时 paid / refunded 为 null */
  mine: {
    qty: number;
    won: number;
    paid: number | null;
    refunded: number | null;
    consolation: boolean;
  } | null;
}

/** 大宗认购标签（GET /bulk） */
export interface BulkDto {
  /** 本区服大宗认购和交易所都开着 */
  enabled: boolean;
  blocked: 'exchange_level' | 'exchange_age' | 'exchange_email' | 'exchange_frozen' | null;
  needLevel: number;
  needDays: number;
  cooldownSec: number;
  minRaise: number;
  closeWindowMin: number;
  openHour: number;
  lot: BulkLotDto | null;
  mine: BulkMineDto | null;
  /** 最近 7 批已结束的，新的在前 */
  recent: BulkResultDto[];
}

/** 后台“大宗认购”页的一行：1~5 级全部没下架的食材，含不在清单里的 */
export interface AdminBulkFoodDto {
  foodsId: number;
  level: number;
  rare: boolean;
  inList: boolean;
  enabled: boolean;
  /** 期货清单里是否启用；不在期货清单里为 null */
  futuresEnabled: boolean | null;
  /** 按所选区服今天的参考价算的起拍价 */
  reserve: number;
}

export const adminBulkQuery = z.object({ shardId: z.coerce.number().int().positive() });
export const adminBulkUpdateBody = z.object({
  items: z
    .array(z.object({ foodsId: z.number().int().positive(), enabled: z.boolean() }))
    .min(1)
    .max(500),
});
export type AdminBulkUpdateInput = z.infer<typeof adminBulkUpdateBody>;

export interface AdminBulkLotDto {
  id: number;
  day: string;
  foodsId: number;
  level: number;
  qty: number;
  reserve: number;
  opensAt: string;
  endsAt: string;
  /** 真正的收盘时刻（只在后台显示） */
  closeAt: string;
  status: BulkLotStatus;
  price: number | null;
  sold: number | null;
  bidders: number;
  demand: number;
}
