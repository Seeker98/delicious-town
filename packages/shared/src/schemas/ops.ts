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
  /** 这一组一共几个账号；accounts 最多列 50 个（backlog 6B-2） */
  total: number;
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
/** 收购时被拦下的关联账号（收购 PR 3） */
export interface SuspiciousAcquireRow {
  at: string;
  reason: 'device' | 'ip';
  buyer: { restId: number; name: string; accountId: number };
  target: { restId: number; name: string; accountId: number };
}
export const suspiciousQuery = z.object({
  shardId: z.coerce.number().int().positive(),
  // 不存在的日期（如 2026-02-30）在这里拦下报 400，不再进到查询里报 500（backlog 6B-2）
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'invalid_date')
    .optional(),
});

/** 道具整理只读页（问题记录 429）：和本地道具整理工具同一份分析（apps/server/src/items/analyze.ts） */
export interface AdminItemTag {
  where: string;
  n: number;
  /** 这处本身是已下架的道具 */
  retired?: true;
  /** 这处是礼包或道具，但它自己哪里都拿不到 */
  dead?: true;
}
export interface AdminItemRow {
  kind: 'goods' | 'foods';
  id: number;
  name: string;
  category: string;
  level: number;
  desc: string;
  gives: AdminItemTag[];
  uses: AdminItemTag[];
  /** 代码里直接用到 */
  code: boolean;
  noSource: boolean;
  noUse: boolean;
  notes: string[];
  retired: boolean;
}
export interface AdminItemGradeRow {
  grade: number;
  name: string;
  open: boolean;
  foodLevels: Record<number, number>;
}
export interface AdminItemsDto {
  maxGrade: number;
  grades: AdminItemGradeRow[];
  rows: AdminItemRow[];
}
