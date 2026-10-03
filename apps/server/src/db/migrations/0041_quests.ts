import { sql, type Kysely } from 'kysely';

/** 问题记录 318：章节主线、支线完成记录；每周任务计数和领取；老号换算标记 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table quest_done (
    rest_id integer not null references restaurant(id) on delete cascade,
    quest_id integer not null,
    done_at timestamptz not null default now(),
    primary key (rest_id, quest_id)
  )`.execute(db);
  await sql`create table weekly_counter (
    rest_id integer not null references restaurant(id) on delete cascade,
    week date not null,
    key text not null,
    count integer not null default 0,
    primary key (rest_id, week, key)
  )`.execute(db);
  await sql`create table weekly_claim (
    rest_id integer not null references restaurant(id) on delete cascade,
    week date not null,
    quest_id integer not null,
    claimed_at timestamptz not null default now(),
    primary key (rest_id, week, quest_id)
  )`.execute(db);
  await sql`alter table restaurant add column quest_version integer not null default 0`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column quest_version`.execute(db);
  await sql`drop table weekly_claim`.execute(db);
  await sql`drop table weekly_counter`.execute(db);
  await sql`drop table quest_done`.execute(db);
}
