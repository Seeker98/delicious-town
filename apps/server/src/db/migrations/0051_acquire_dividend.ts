import { sql, type Kysely } from 'kysely';

/**
 * 收购 PR 2：打理记录、每家每天的分红、每个老板的累计分红。
 * 打理不再记在 acquire_state.tended_day：00:00~00:05 打理今天会盖掉昨天的标记，分红任务就看不到了
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table acquire_state drop column tended_day`.execute(db);
  await sql`
    create table acquire_tend (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      created_at timestamptz not null,
      primary key (rest_id, day)
    )`.execute(db);
  await sql`
    create table acquire_dividend (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      owner_rest_id integer not null references restaurant(id) on delete cascade,
      coin bigint not null check (coin >= 0),
      tended boolean not null,
      primary key (rest_id, day)
    )`.execute(db);
  await sql`create index acquire_dividend_owner on acquire_dividend (owner_rest_id, day)`.execute(db);
  await sql`
    create table acquire_holder (
      rest_id integer primary key references restaurant(id) on delete cascade,
      dividend_total bigint not null default 0
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table acquire_holder`.execute(db);
  await sql`drop table acquire_dividend`.execute(db);
  await sql`drop table acquire_tend`.execute(db);
  await sql`alter table acquire_state add column tended_day date`.execute(db);
}
