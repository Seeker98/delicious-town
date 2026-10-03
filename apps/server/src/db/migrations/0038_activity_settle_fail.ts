import { sql, type Kysely } from 'kysely';

/**
 * backlog 148-1：补发时一家店一直出错，以前这个区服永远写不了补发完成记录（每分钟重跑所有参与店）。
 * 记下每家店的出错次数，到上限就放弃这家，并留下最后一次的错误供排查
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table activity_settle_fail (
    activity_id integer not null references activity(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    fails integer not null default 0,
    last_error text not null default '',
    updated_at timestamptz not null default now(),
    primary key (activity_id, rest_id)
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table activity_settle_fail`.execute(db);
}
