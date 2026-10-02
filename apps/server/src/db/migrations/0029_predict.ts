import { sql, type Kysely } from 'kysely';

/** 238-1：事件合约的事件、持仓、成交 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table predict_event (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      kind text not null default 'manual',
      title text not null,
      description text not null default '',
      params jsonb not null default '{}',
      b double precision not null check (b > 0),
      unit integer not null check (unit > 0),
      q_yes double precision not null default 0,
      q_no double precision not null default 0,
      p0 double precision not null,
      open_at timestamptz not null,
      close_at timestamptz not null,
      status text not null check (status in ('open', 'closed', 'resolved', 'void')),
      outcome boolean,
      created_by integer,
      resolved_at timestamptz,
      settled_at timestamptz,
      created_at timestamptz not null default now()
    )`.execute(db);
  await sql`create index predict_event_shard on predict_event (shard_id, status, close_at)`.execute(db);
  await sql`
    create table predict_position (
      event_id bigint not null references predict_event(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      yes integer not null default 0 check (yes >= 0),
      no integer not null default 0 check (no >= 0),
      net_cost bigint not null default 0,
      settled boolean not null default false,
      primary key (event_id, rest_id)
    )`.execute(db);
  await sql`create index predict_position_rest on predict_position (rest_id)`.execute(db);
  await sql`
    create table predict_trade (
      id bigserial primary key,
      event_id bigint not null references predict_event(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      side text not null check (side in ('yes', 'no')),
      dir text not null check (dir in ('buy', 'sell')),
      qty integer not null check (qty > 0),
      amount bigint not null,
      fee bigint not null,
      price_after double precision not null,
      created_at timestamptz not null
    )`.execute(db);
  await sql`create index predict_trade_event on predict_trade (event_id, id)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table predict_trade`.execute(db);
  await sql`drop table predict_position`.execute(db);
  await sql`drop table predict_event`.execute(db);
}
