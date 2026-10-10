import { sql, type Kysely } from 'kysely';

/**
 * 期货设计 §5.2 的初始列表：1~5 级、没下架、有菜谱用得到的食材里，稀有的全部（123 种）加 2 级普通的（62 种）。
 * 2026-10-10 按配置算出写死在这里，以后配置里新加的食材不会自动进表，要在后台加
 */
export const FUTURES_INITIAL: readonly number[] = [
  1001, 1002, 1003, 1004, 1007, 1010, 1014, 1015, 1016, 1019, 1027, 2001, 2002, 2003, 2004, 2005, 2006, 2007,
  2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
  2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043,
  2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2055, 2056, 2057, 2058, 2059, 2061, 2062, 2063,
  2064, 2065, 2066, 2067, 2068, 2069, 2070, 2071, 2072, 2073, 2074, 2075, 2076, 2077, 2078, 2079, 2080, 2081,
  2082, 2083, 2084, 2085, 2086, 2087, 2088, 2089, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010,
  3011, 3012, 3013, 3025, 3026, 3027, 3028, 3032, 3057, 3069, 3070, 3071, 3072, 3073, 3074, 3075, 3076, 3077,
  3078, 3079, 3080, 3081, 3082, 3083, 3084, 3085, 3086, 3087, 3088, 3089, 3090, 4001, 4002, 4003, 4004, 4005,
  4006, 4007, 4016, 4017, 4020, 4021, 4028, 4034, 4036, 4037, 4038, 4039, 4040, 4041, 4042, 4043, 4044, 4045,
  4046, 4047, 4048, 4049, 4050, 4051, 4052, 4054, 4055, 4056, 4057, 4058, 4059, 4060, 5001, 5002, 5003, 5004,
  5005, 5006, 5007, 5008, 5023,
];

/** 食材期货（期货设计 2026-10-10）：期货食材列表（全服一份）、期货单、区服每天每种的已订份数 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table futures_food (
      foods_id integer primary key,
      enabled boolean not null default true,
      daily_quota integer check (daily_quota >= 0),
      updated_at timestamptz not null default now(),
      updated_by integer references account(id) on delete set null
    )`.execute(db);
  await sql`
    create table futures_contract (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      qty integer not null check (qty > 0),
      unit_price bigint not null,
      deposit bigint not null,
      balance bigint not null,
      created_at timestamptz not null,
      due_at timestamptz not null,
      status text not null default 'open' check (status in ('open', 'delivered', 'defaulted', 'cancelled')),
      settled_at timestamptz,
      to_cupboard integer not null default 0,
      to_wallet integer not null default 0
    )`.execute(db);
  await sql`create index futures_contract_due on futures_contract (shard_id, due_at) where status = 'open'`.execute(
    db,
  );
  await sql`create index futures_contract_rest on futures_contract (rest_id, created_at desc)`.execute(db);
  await sql`
    create table futures_quota (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      day date not null,
      used integer not null default 0,
      primary key (shard_id, foods_id, day)
    )`.execute(db);
  await db
    .insertInto('futures_food')
    .values(FUTURES_INITIAL.map((id) => ({ foods_id: id })))
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table futures_quota`.execute(db);
  await sql`drop table futures_contract`.execute(db);
  await sql`drop table futures_food`.execute(db);
}
