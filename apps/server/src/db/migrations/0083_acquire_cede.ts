import { sql, type Kysely } from 'kysely';

/**
 * 收购改版（2026-10-16）：分红不再由系统增发，改成被收购的店每轮结算让一份给老板（acquire_due，00:05 发）；
 * 打理改成老板点（acquire_tend 重建，记老板、成本、补给包）；交易记录多记店得的和销毁的；挂牌最高 5 倍。
 * 线上已有的被收购店：打理时间记成前一天，免得按收购那天算“几天没打理”一上线就停了抽成、自动放手
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table acquire_state add column tended_at timestamptz`.execute(db);
  await sql`update acquire_state set tended_at = now() - interval '1 day' where owner_rest_id is not null`.execute(
    db,
  );
  await sql`alter table acquire_state drop constraint acquire_state_list_rate_check`.execute(db);
  await sql`alter table acquire_state add constraint acquire_state_list_rate_check
    check (list_rate > 0 and list_rate <= 5)`.execute(db);
  await sql`alter table acquire_log add column store_got bigint not null default 0`.execute(db);
  await sql`alter table acquire_log add column burn bigint not null default 0`.execute(db);
  await sql`alter table income_round add column ceded bigint not null default 0`.execute(db);
  await sql`drop table acquire_tend`.execute(db);
  await sql`
    create table acquire_tend (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      owner_rest_id integer not null references restaurant(id) on delete cascade,
      cost bigint not null,
      packs integer not null,
      created_at timestamptz not null,
      primary key (rest_id, day, owner_rest_id)
    )`.execute(db);
  await sql`drop table acquire_dividend`.execute(db);
  await sql`
    create table acquire_due (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      owner_rest_id integer not null references restaurant(id) on delete cascade,
      coin bigint not null default 0 check (coin >= 0),
      tended boolean not null default false,
      paid_at timestamptz,
      refunded boolean not null default false,
      primary key (rest_id, day, owner_rest_id)
    )`.execute(db);
  await sql`create index acquire_due_owner on acquire_due (owner_rest_id, day)`.execute(db);
  await sql`create index acquire_due_unpaid on acquire_due (day) where paid_at is null`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // 还没发的让渡（结算时已经从店里扣下了）先退回店里，不然连表一起丢（代码审查 2026-10-19）
  await sql`update restaurant r set coin = r.coin + d.coin
    from (select rest_id, sum(coin)::bigint as coin from acquire_due where paid_at is null group by rest_id) d
    where r.id = d.rest_id`.execute(db);
  await sql`drop table acquire_due`.execute(db);
  await sql`
    create table acquire_dividend (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      owner_rest_id integer not null references restaurant(id) on delete cascade,
      coin bigint not null check (coin >= 0),
      tended boolean not null,
      primary key (rest_id, day)
    )`.execute(db);
  await sql`drop table acquire_tend`.execute(db);
  await sql`
    create table acquire_tend (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      created_at timestamptz not null,
      primary key (rest_id, day)
    )`.execute(db);
  await sql`alter table income_round drop column ceded`.execute(db);
  await sql`alter table acquire_log drop column burn`.execute(db);
  await sql`alter table acquire_log drop column store_got`.execute(db);
  await sql`update acquire_state set list_rate = null, list_until = null where list_rate > 1`.execute(db);
  await sql`alter table acquire_state drop constraint acquire_state_list_rate_check`.execute(db);
  await sql`alter table acquire_state add constraint acquire_state_list_rate_check
    check (list_rate > 0 and list_rate <= 1)`.execute(db);
  await sql`alter table acquire_state drop column tended_at`.execute(db);
}
