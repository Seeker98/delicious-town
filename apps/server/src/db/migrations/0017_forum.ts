import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table forum_post (
    id serial primary key,
    shard_id integer not null references shard(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    category text not null check (category in ('chat', 'guide', 'feedback')),
    title text not null,
    content text not null,
    created_at timestamptz not null,
    edited_at timestamptz,
    deleted_at timestamptz,
    pinned_at timestamptz,
    featured_at timestamptz,
    feature_rewarded boolean not null default false,
    read_num integer not null default 0,
    up_num integer not null default 0,
    down_num integer not null default 0,
    reply_count integer not null default 0,
    last_reply_at timestamptz
  )`.execute(db);
  await sql`create index forum_post_active on forum_post
    (shard_id, (coalesce(last_reply_at, created_at)) desc, id desc) where deleted_at is null`.execute(db);
  await sql`create index forum_post_featured on forum_post (shard_id, featured_at desc)
    where featured_at is not null and deleted_at is null`.execute(db);
  await sql`create index forum_post_rest on forum_post (rest_id, created_at)`.execute(db);
  await sql`create table forum_reply (
    id serial primary key,
    post_id integer not null references forum_post(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    floor integer not null,
    reply_to integer,
    anonymous boolean not null default false,
    content text not null,
    created_at timestamptz not null,
    deleted_at timestamptz,
    unique (post_id, floor)
  )`.execute(db);
  await sql`create index forum_reply_rest on forum_reply (rest_id, created_at)`.execute(db);
  await sql`create table forum_reaction (
    post_id integer not null references forum_post(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    kind text not null check (kind in ('up', 'down')),
    created_at timestamptz not null,
    primary key (post_id, rest_id)
  )`.execute(db);
  await sql`create table forum_read (
    post_id integer not null references forum_post(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    times integer not null,
    first_at timestamptz not null,
    last_at timestamptz not null,
    primary key (post_id, rest_id)
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['forum_read', 'forum_reaction', 'forum_reply', 'forum_post'])
    await sql`drop table if exists ${sql.table(t)}`.execute(db);
}
