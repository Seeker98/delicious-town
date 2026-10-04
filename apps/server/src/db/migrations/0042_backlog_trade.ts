import { sql, type Kysely } from 'kysely';

/** backlog 长尾第 ② 批：交易所最新玩家成交价、全服合力名次的索引；事件预测已判定必须有结果 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // 最新成交价跳过系统成交：只有系统成交的食材原来每次都扫完全部历史（backlog 156-3）
  await sql`create index exchange_trade_last_player on exchange_trade (shard_id, foods_id, id) where not system`.execute(
    db,
  );
  // 我的名次、贡献榜按活动和积分查（backlog 148-3）
  await sql`create index activity_counter_rank on activity_counter (activity_id, key, count)`.execute(db);
  await sql`alter table predict_event add constraint predict_event_resolved_outcome
    check (status <> 'resolved' or outcome is not null)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table predict_event drop constraint predict_event_resolved_outcome`.execute(db);
  await sql`drop index activity_counter_rank`.execute(db);
  await sql`drop index exchange_trade_last_player`.execute(db);
}
