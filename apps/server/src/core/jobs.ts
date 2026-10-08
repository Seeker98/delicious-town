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
  /**
   * 失败后同一周期再试（稳健性批）：失败 10 分钟后再抢一次，最多 5 次。只给可以重跑、
   * 失败多半是等别的任务的（收购分红要等前一天的收入汇总好），默认不重试
   */
  retry?: boolean;
}
