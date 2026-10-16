import { sql, type Kysely } from 'kysely';

/**
 * 事件预测的全服营业银币自动题换成许愿树题（2026-10-16）：区服覆盖和历史版本里删掉
 * tuning.predict.auto.stats、statsCloseHour（保存覆盖时不认识的键会被拒）。
 * 还开着的银币题由判定任务按"题型下线"作废退款，不在这里动
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await stripStatsOverrides(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stripStatsOverrides(db: Kysely<any>): Promise<void> {
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override #- '{tuning,predict,auto,stats}' #- '{tuning,predict,auto,statsCloseHour}'
      where override #> '{tuning,predict,auto}' ?| array['stats', 'statsCloseHour']`.execute(db);
  }
}

/** 删掉的设置回不来；down 不用做什么 */
export async function down(): Promise<void> {}
