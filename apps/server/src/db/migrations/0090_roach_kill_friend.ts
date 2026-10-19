import { sql, type Kysely } from 'kysely';

/**
 * 午夜蟑螂杀手的周奖励、灭蟑螂排行只算在真实好友店里灭的蟑螂（用户 2026-10-19：蟹老板的店不限次数，刷得出来）。
 * 新的每日计数 roach.killFriend 从上线起记；之前的按好友店里的“灭蟑螂”动态补（动态里 by 是灭的人，
 * 每日计数留 30 天，补 30 天就够），蟹老板的店不算，自己的店不写这条动态
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await backfillRoachKillFriend(db);
}

/** 只给测试用：限定灭蟑螂的店（测试库是共用的）；迁移本身不传，处理全部 */
export async function backfillRoachKillFriend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  restIds: number[] | null = null,
): Promise<void> {
  const only =
    restIds === null
      ? sql``
      : restIds.length > 0
        ? sql` and (l.params->>'by')::int in (${sql.join(restIds)})`
        : sql` and false`;
  await sql`
    insert into daily_counter (rest_id, day, key, count)
    select by_id, day, 'roach.killFriend', n from (
      select (l.params->>'by')::int as by_id,
        (l.created_at at time zone 'Asia/Shanghai')::date as day,
        count(*)::int as n
      from rest_log l join restaurant host on host.id = l.rest_id
      where l.type = 'roach.killed' and l.params ? 'by' and not host.npc
        and l.created_at >= now() - interval '30 days'${only}
      group by 1, 2
    ) x
    where exists (select 1 from restaurant r where r.id = x.by_id)
    on conflict (rest_id, day, key) do update set count = greatest(daily_counter.count, excluded.count)`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from daily_counter where key = 'roach.killFriend'`.execute(db);
}
