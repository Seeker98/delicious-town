import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table account add column is_system boolean not null default false`,
    sql`alter table restaurant add column npc boolean not null default false`,
    sql`alter table restaurant add column door smallint not null default 0`,
    sql`alter table restaurant add column avatar smallint`,
    sql`alter table restaurant add column notice text not null default ''`,
    sql`create unique index restaurant_npc_shard on restaurant (shard_id) where npc`,
    sql`create table friend (
      rest_id integer not null references restaurant(id) on delete cascade,
      friend_id integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (rest_id, friend_id)
    )`,
    sql`create index friend_friend on friend (friend_id)`,
    sql`create table friend_request (
      from_rest integer not null references restaurant(id) on delete cascade,
      to_rest integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (from_rest, to_rest)
    )`,
    sql`create index friend_request_to on friend_request (to_rest)`,
    sql`create table dine_dash (
      diner_rest_id integer primary key references restaurant(id) on delete cascade,
      host_rest_id integer not null references restaurant(id) on delete cascade,
      table_no integer not null,
      started_at timestamptz not null
    )`,
    sql`create index dine_dash_host on dine_dash (host_rest_id)`,
    sql`create table cupboard_flip (
      host_rest_id integer not null references restaurant(id) on delete cascade,
      slot_no integer not null,
      by_rest_id integer not null references restaurant(id) on delete cascade,
      cool_until timestamptz not null,
      primary key (host_rest_id, slot_no)
    )`,
    sql`create table thumb (
      day date not null,
      from_rest integer not null references restaurant(id) on delete cascade,
      to_rest integer not null references restaurant(id) on delete cascade,
      ip text,
      returned boolean not null default false,
      created_at timestamptz not null default now(),
      primary key (day, from_rest, to_rest)
    )`,
    sql`create index thumb_to on thumb (day, to_rest)`,
    sql`create unique index thumb_ip on thumb (day, ip, to_rest) where ip is not null`,
    sql`create table rest_icon (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      icon_key text not null,
      shown boolean not null default false,
      granted_at timestamptz not null default now(),
      granted_by integer references account(id),
      unique (rest_id, icon_key)
    )`,
    sql`create table npc_invite (
      rest_id integer primary key references restaurant(id) on delete cascade,
      created_at timestamptz not null default now()
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'npc_invite',
    'rest_icon',
    'thumb',
    'cupboard_flip',
    'dine_dash',
    'friend_request',
    'friend',
  ]) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`drop index if exists restaurant_npc_shard`.execute(db);
  for (const c of ['notice', 'avatar', 'door', 'npc']) {
    await sql`alter table restaurant drop column ${sql.id(c)}`.execute(db);
  }
  await sql`alter table account drop column is_system`.execute(db);
}
