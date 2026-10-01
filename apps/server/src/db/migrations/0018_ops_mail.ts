import { sql, type Kysely } from 'kysely';

/** 子项目 6A：邮箱、公告、兑换码、邀请、命名帽子（设计 §3）。6A-2 用到的兑换码、邀请表也在这里建 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // created_at、expires_at 用数据库时钟：和 restaurant.created_at 比较"发送时已存在的店"（裁定 2）
  await sql`create table mail (
    id serial primary key,
    scope text not null check (scope in ('rest', 'shard', 'all')),
    shard_id integer references shard(id) on delete cascade,
    rest_id integer references restaurant(id) on delete cascade,
    min_level integer,
    title text not null,
    body text not null,
    items jsonb,
    source text not null,
    actor_account_id integer references account(id),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 days'),
    revoked_at timestamptz,
    check (scope <> 'rest' or (rest_id is not null and shard_id is not null)),
    check (scope <> 'shard' or shard_id is not null)
  )`.execute(db);
  await sql`create index mail_rest on mail (rest_id, created_at desc) where scope = 'rest'`.execute(db);
  await sql`create index mail_shard on mail (shard_id, created_at desc) where scope = 'shard'`.execute(db);
  await sql`create index mail_all on mail (created_at desc) where scope = 'all'`.execute(db);
  await sql`create table mail_state (
    mail_id integer not null references mail(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    read_at timestamptz,
    claimed_at timestamptz,
    deleted_at timestamptz,
    primary key (mail_id, rest_id)
  )`.execute(db);

  await sql`create table announcement (
    id serial primary key,
    shard_id integer references shard(id) on delete cascade,
    title text not null,
    body text not null,
    important boolean not null default false,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    actor_account_id integer not null references account(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    check (ends_at > starts_at)
  )`.execute(db);
  await sql`create table announcement_seen (
    account_id integer not null references account(id) on delete cascade,
    announcement_id integer not null references announcement(id) on delete cascade,
    seen_at timestamptz not null default now(),
    primary key (account_id, announcement_id)
  )`.execute(db);

  await sql`create table redeem_code (
    id serial primary key,
    code text not null unique check (code = upper(code)),
    kind text not null check (kind in ('shared', 'single')),
    batch_id integer,
    items jsonb not null,
    shard_id integer references shard(id) on delete cascade,
    min_level integer,
    max_uses integer,
    used_count integer not null default 0,
    starts_at timestamptz,
    ends_at timestamptz,
    note text not null,
    actor_account_id integer not null references account(id),
    created_at timestamptz not null default now(),
    disabled_at timestamptz,
    check (max_uses is null or used_count <= max_uses)
  )`.execute(db);
  await sql`create index redeem_code_batch on redeem_code (batch_id) where batch_id is not null`.execute(db);
  await sql`create table redeem_use (
    id serial primary key,
    code_id integer not null references redeem_code(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    account_id integer not null references account(id) on delete cascade,
    used_at timestamptz not null default now(),
    unique (code_id, rest_id)
  )`.execute(db);

  await sql`create table invite_reward (
    invitee_account_id integer not null references account(id) on delete cascade,
    stage text not null check (stage in ('newbie', 'lv10', 'lv30')),
    inviter_account_id integer references account(id) on delete cascade,
    shard_id integer not null references shard(id) on delete cascade,
    invitee_rest_id integer not null references restaurant(id) on delete cascade,
    status text not null check (status in ('pending', 'sent', 'capped')),
    month text not null,
    mail_id integer references mail(id) on delete set null,
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    primary key (invitee_account_id, stage)
  )`.execute(db);
  await sql`create index invite_reward_inviter on invite_reward (inviter_account_id, month)`.execute(db);

  await sql`alter table equip add column custom_name text, add column xuan_sent_at timestamptz`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table equip drop column if exists custom_name, drop column if exists xuan_sent_at`.execute(
    db,
  );
  for (const t of [
    'invite_reward',
    'redeem_use',
    'redeem_code',
    'announcement_seen',
    'announcement',
    'mail_state',
    'mail',
  ])
    await sql`drop table if exists ${sql.table(t)}`.execute(db);
}
