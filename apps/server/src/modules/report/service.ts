import type { ReportInput } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp } from '../../core/op';
import { reportOp } from './report';

/** 举报（子项目 6B-1） */
export function createReportService(d: GameDeps) {
  return {
    report: (ctx: RestCtx, b: ReportInput) =>
      runOp(d, ctx, { feature: 'report', source: 'report' }, (o) => reportOp(o, ctx, b)),
  };
}
export type ReportService = ReturnType<typeof createReportService>;
