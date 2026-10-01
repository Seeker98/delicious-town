import { z } from 'zod';

/** 可疑数据（子项目 6B-2，设计 §5）：只读，供协管参考 */
export interface SuspectRest {
  restId: number;
  restName: string;
  accountId: number;
  username: string;
}
export interface SuspiciousBarRow extends SuspectRest {
  perfectSum: number;
  perfectMax: number;
  bullSum: number;
  bullMax: number;
  /** 任一单日最高超过门槛 */
  flagged: boolean;
}
export interface SuspiciousSurgeRow extends SuspectRest {
  /** 当天净增 */
  net: number;
  /** 按来源汇总、绝对值最大的 3 个 */
  topSources: Array<{ source: string; delta: number }>;
}
export interface SuspiciousSurgeDto {
  day: string;
  coin: SuspiciousSurgeRow[];
  diamond: SuspiciousSurgeRow[];
  exp: SuspiciousSurgeRow[];
}
export interface SuspiciousMultiGroup {
  kind: 'ip' | 'device';
  key: string;
  accounts: Array<{
    accountId: number;
    username: string;
    /** 在本区服的店；没有为 null */
    restId: number | null;
    restName: string | null;
    lastSeen: string;
  }>;
}
export interface SuspiciousRedeemRow {
  accountId: number;
  username: string;
  fails: number;
  /** 还要锁多少秒 */
  ttlSec: number;
}
export const suspiciousQuery = z.object({
  shardId: z.coerce.number().int().positive(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
