import { sql, type Kysely } from 'kysely';

/**
 * 小镇委员会（2026-10-16）：后台以委员的名义发的公报。shard_id 为空是发给全部区服；
 * 发布时同时给目标区服各写一条 commission.notice 新闻，撤回时软删除并删掉那几条新闻
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table commission_notice (
      id serial primary key,
      shard_id integer references shard(id) on delete cascade,
      member text not null,
      body text not null,
      actor_account_id integer references account(id) on delete set null,
      created_at timestamptz not null default now(),
      deleted_at timestamptz
    )`.execute(db);
  await sql`create index commission_notice_live on commission_notice (id desc) where deleted_at is null`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table commission_notice`.execute(db);
}
