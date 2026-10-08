import { sql, type Kysely } from 'kysely';

/**
 * 小镇日报（2026-10-08）：每区服每天一行。素材 facts 原样存，方便重新生成和排查；
 * content 是简中、英文、繁中三种语言的标题和正文，没生成成功时为 null
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table town_daily (
    shard_id integer not null references shard(id) on delete cascade,
    day text not null,
    status text not null check (status in ('pending', 'draft', 'published', 'hidden')),
    facts jsonb not null,
    content jsonb,
    model text,
    tokens_in integer not null default 0,
    tokens_out integer not null default 0,
    attempts integer not null default 0,
    regenerations integer not null default 0,
    error text,
    generated_at timestamptz,
    published_at timestamptz,
    published_by integer references account(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (shard_id, day)
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists town_daily`.execute(db);
}
