import { sql, type Kysely } from 'kysely';

/**
 * 大宗认购最后一段停更（问题记录 595）：进入停更那一刻的预计成交价、入围门槛、认购份数、人数，
 * 停更期间看板显示这一刻的数。blind_at 为空 = 还没停更（或这个区服不停更）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table bulk_lot
      add column blind_at timestamptz,
      add column blind_price bigint,
      add column blind_threshold bigint,
      add column blind_demand integer,
      add column blind_bidders integer`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table bulk_lot
      drop column blind_at,
      drop column blind_price,
      drop column blind_threshold,
      drop column blind_demand,
      drop column blind_bidders`.execute(db);
}
