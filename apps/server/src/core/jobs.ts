import type { ShardSettings } from '@dt/config';

export interface JobContext {
  shardId: number;
  /** 当前周期键，例如结算轮次号、`2026-09-30@08` */
  period: string;
  now: Date;
  settings: ShardSettings;
  /** worker 的日志：任务内部单个对象出错时记下来继续处理其他对象 */
  log: { error(obj: object, msg: string): void };
}

/** 周期型任务（设计文档 §6）：period 返回 null 表示此刻不该跑；时点可以随区服 tuning 变化 */
export interface PeriodicJob {
  name: string;
  feature: string;
  period(now: Date, settings: ShardSettings): string | null;
  run(ctx: JobContext): Promise<Record<string, unknown>>;
}
