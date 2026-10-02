import { sql, type Kysely } from 'kysely';

/** 156-1 终审 I2：交易所列表页每种食材取最新一笔成交，走 (shard_id, foods_id, id) 索引 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create index exchange_trade_last on exchange_trade (shard_id, foods_id, id)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index exchange_trade_last`.execute(db);
}
