import { sql, type Kysely } from 'kysely';

/**
 * 随机事件和问答（设计稿 2026-10-28 §8）：每家店每个时段最多一行；通知抽中即生效，
 * 选择和问答等玩家回答。不重复、连续剧前置都查这张表，每天清掉 retainDays 天前的
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table random_event (
      id bigserial primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      slot text not null,
      kind text not null check (kind in ('notice', 'choice', 'quiz', 'quizNight')),
      ref_id integer not null,
      status text not null check (status in ('pending', 'done', 'expired')),
      choice text,
      outcome jsonb,
      payload jsonb,
      seen boolean not null default false,
      created_at timestamptz not null,
      expires_at timestamptz not null,
      resolved_at timestamptz,
      unique (rest_id, slot)
    )`.execute(db);
  await sql`create index random_event_rest_time on random_event (rest_id, created_at desc)`.execute(db);
  await sql`create index random_event_created on random_event (created_at)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table random_event`.execute(db);
}
