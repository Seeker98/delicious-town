import { z } from 'zod';
import { REPORT_REASONS, REPORT_TARGETS, type ReportReason, type ReportTarget } from '../enums';
import { limitedText } from './mail';

export const reportBody = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
  detail: limitedText(100).optional(),
});
export type ReportInput = z.infer<typeof reportBody>;

const banDays = z.union([z.literal(0), z.literal(1), z.literal(7)]);
export const resolveReportBody = z.object({
  note: z.string().trim().min(1).max(200),
  banDays: banDays.optional(),
  newName: z.string().trim().min(1).max(32).optional(),
});
export const rejectReportBody = z.object({ note: z.string().trim().min(1).max(200) });
export const reportListQuery = z.object({
  shardId: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'resolved', 'rejected']).optional(),
});
export const banBody = z.object({ reason: z.string().trim().min(1).max(200), days: banDays.optional() });

export type ReportStatus = 'open' | 'resolved' | 'rejected';
export interface ReportCaseDto {
  id: number;
  shardId: number;
  targetType: ReportTarget;
  targetId: number;
  targetRestId: number;
  targetRestName: string;
  targetAccountId: number;
  targetUsername: string;
  snapshot: string;
  status: ReportStatus;
  reporterCount: number;
  createdAt: string;
  updatedAt: string;
  handledBy: string | null;
  handledAt: string | null;
  action: string | null;
  banDays: number | null;
  note: string | null;
}
export interface ReportDetailDto extends ReportCaseDto {
  /** 现在的内容；已删除为 null */
  current: string | null;
  entries: Array<{ restName: string; reason: ReportReason; detail: string; createdAt: string }>;
  /** 这个账号以前被处理过几次 */
  priorCases: number;
}
