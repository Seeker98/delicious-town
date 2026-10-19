import { sql, type Kysely } from 'kysely';

/**
 * 成就 PR②（设计稿 2026-10-19-achievements-design.md）：新计数、隐藏成就
 * - ach_shard.version：补发到第几版。代码里的 ACH_BACKFILL_VERSION 加一以后，补发任务把区服再算一遍（记成补发）
 * - bar_state 加三个连续次数：魔鬼辣杯连输、最后一颗糖新手桌连输、老虎机连着全空
 * - 新计数能从还保留的明细补的先补（event_counter，greatest 合并）：动态留 30 天（开服以来的都还在）、
 *   每轮营业记录只留 3 天；预测、菜场猜价、一番赏、挂单这些表不清理，全量补。补不了的从上线起计
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table ach_shard add column version integer not null default 1`.execute(db);
  await sql`alter table bar_state
    add column devil_lose integer not null default 0,
    add column nim_lose integer not null default 0,
    add column slot_blank integer not null default 0`.execute(db);
  await backfillCounters2(db);
}

/** 只给测试用：限定店（测试库是共用的）；迁移本身不传，处理全部 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfillCounters2(db: Kysely<any>, restIds: number[] | null = null): Promise<void> {
  const only = (col: string) =>
    restIds === null
      ? sql``
      : restIds.length > 0
        ? sql` and ${sql.raw(col)} in (${sql.join(restIds)})`
        : sql` and false`;
  // select 出 (rest_id, key, count)；蟹老板的店不记
  const put = (select: ReturnType<typeof sql>) =>
    sql`
    insert into event_counter (rest_id, key, count)
    select x.rest_id, x.key, x.n from (${select}) as x(rest_id, key, n) join restaurant r on r.id = x.rest_id
    where not r.npc
    on conflict (rest_id, key) do update set count = greatest(event_counter.count, excluded.count)`.execute(
      db,
    );
  /** 动态里某一类的条数 */
  const logCount = (key: string, type: string, where = sql``) =>
    put(sql`select rest_id, ${key}::text, count(*) from rest_log
      where type = ${type}${where}${only('rest_id')} group by rest_id`);
  /** 一个游戏日里某一类动态满 n 条的天数 */
  const logDays = (key: string, type: string, n: number, by = sql`rest_id`, where = sql``) =>
    put(sql`select rid, ${key}::text, count(*) from (
      select ${by} as rid from rest_log where type = ${type}${where}${only('rest_id')}
      group by ${by}, (created_at at time zone 'Asia/Shanghai')::date having count(*) >= ${n}
    ) d where rid is not null group by rid`);

  await logCount('rest.noOil', 'rest.closed', sql` and params->>'reason' = 'no_oil'`);
  await logCount('dine.victim', 'dine.start');
  await logCount('mouse.steal', 'mouse.steal');
  await logCount('krab.angry', 'krab.angry');
  await logCount('hygiene.bad', 'hygiene.report', sql` and (params->>'roachHours')::float >= 24`);
  await logCount('cupboard.flipped', 'friend.flip');
  await logCount('foods.taken', 'exchange', sql` and params->>'result' = 'ok'`);
  await logCount('acquire.taken', 'acquire.taken');
  await logCount('acquire.redeem', 'acquire.redeemed');
  await logCount('takeaway.fail', 'takeaway.claim', sql` and params->>'success' = 'false'`);
  await logCount('bar.cup.won', 'bar.cup', sql` and params->>'result' in ('stop', 'clear')`);
  await logCount(
    'bar.memory.won',
    'bar.memory',
    sql` and params->>'level' = '1' and params->>'correct' = 'true'`,
  );
  await logCount(
    'bar.memory.zero',
    'bar.memory',
    sql` and params->>'level' = '1' and params->>'correct' = 'false'`,
  );
  await logCount('bar.darts.miss', 'bar.darts', sql` and params->'throws' = '[0,0,0]'::jsonb`);
  // 翻橱柜被抓记在被翻的店的动态里（by 是翻的人）
  await put(sql`select (params->>'by')::int, 'flip.caught', count(*) from rest_log
    where type = 'friend.flip' and params->>'outcome' = 'caught' and params ? 'by'${only("(params->>'by')::int")}
    group by 1`);
  await logDays(
    'flip.caughtDay',
    'friend.flip',
    3,
    sql`(params->>'by')::int`,
    sql` and params->>'outcome' = 'caught'`,
  );
  await logDays('roach.laidOnDay', 'roach.laid', 20);
  await logDays('rest.moveDay', 'rest.move', 3);
  // 同一天蟹老板既开心又生气
  await put(sql`select rest_id, 'krab.mood', count(*) from (
    select rest_id from rest_log where type in ('krab.happy', 'krab.angry')${only('rest_id')}
    group by rest_id, (created_at at time zone 'Asia/Shanghai')::date having count(distinct type) = 2
  ) d group by rest_id`);
  // 搬回住过的街：这次搬去的街，是以前哪次搬家搬出的街
  await put(sql`select m2.rest_id, 'rest.moveBack', count(*) from rest_log m2
    where m2.type = 'rest.move'${only('m2.rest_id')} and exists (
      select 1 from rest_log m1 where m1.rest_id = m2.rest_id and m1.type = 'rest.move'
        and m1.created_at <= m2.created_at and m1.params->>'from' = m2.params->>'to')
    group by m2.rest_id`);
  // 每轮营业记录（3 天）
  for (const [key, cond] of [
    [
      'round.full',
      sql`coalesce((customers->>'0')::int, 0) + coalesce((customers->>'-2')::int, 0)
      + coalesce((customers->>'-3')::int, 0) = 0`,
    ],
    ['round.oneOil', sql`oil = 1`],
    ['round.negative', sql`coin < 0`],
    [
      'round.bikini',
      sql`(customers->>'8')::int > 0 and (customers->>'6')::int > 0 and (customers->>'7')::int > 0`,
    ],
    [
      'round.disaster',
      sql`(customers->>'9')::int > 0 and (customers->>'3')::int > 0 and (customers->>'7')::int > 0`,
    ],
    ['plankton.stay', sql`(customers->>'7')::int > 0`],
  ] as const)
    await put(
      sql`select rest_id, ${key}::text, count(*) from income_round where ${cond}${only('rest_id')} group by rest_id`,
    );
  await put(sql`select rest_id, 'picky.left.day', count(*) from (
    select rest_id from income_round where true${only('rest_id')}
    group by rest_id, (created_at at time zone 'Asia/Shanghai')::date
    having sum(coalesce((customers->>'-2')::int, 0)) >= 100
  ) d group by rest_id`);
  // 特色菜倒掉（批次表不清理）
  await put(
    sql`select rest_id, 'mc.dump', count(*) from mc_cook where end_reason = 'dumped'${only('rest_id')} group by rest_id`,
  );
  // 一番赏：A 赏张数、最后赏次数；同一天许愿树中奖、抽到 A 赏的天数
  await put(sql`select drawn_by, 'kuji.anyA', count(*) from kuji_ticket
    where tier = 'A' and drawn_by is not null${only('drawn_by')} group by drawn_by`);
  await put(sql`select last_rest_id, 'kuji.anyLast', count(*) from kuji_pool
    where last_rest_id is not null${only('last_rest_id')} group by last_rest_id`);
  await put(sql`select w.winner_rest_id, 'luck.chosen', count(distinct (w.drawn_at at time zone 'Asia/Shanghai')::date)
    from wish_round w join kuji_ticket k on k.drawn_by = w.winner_rest_id and k.tier = 'A'
      and (k.drawn_at at time zone 'Asia/Shanghai')::date = (w.drawn_at at time zone 'Asia/Shanghai')::date
    where w.winner_rest_id is not null${only('w.winner_rest_id')} group by w.winner_rest_id`);
  // 预测：押中开盘不到 10% 的一边、押了开盘 90% 以上的一边却输了、同一事件两边都买过
  await put(sql`select p.rest_id, 'predict.blackSwan', count(*) from predict_position p
    join predict_event e on e.id = p.event_id
    where e.status = 'resolved' and p.settled${only('p.rest_id')}
      and ((e.outcome and p.yes > 0 and e.p0 < 0.1) or (not e.outcome and p.no > 0 and e.p0 > 0.9))
    group by p.rest_id`);
  await put(sql`select p.rest_id, 'predict.reverse', count(*) from predict_position p
    join predict_event e on e.id = p.event_id
    where e.status = 'resolved' and p.settled${only('p.rest_id')}
      and ((not e.outcome and p.yes > 0 and e.p0 >= 0.9) or (e.outcome and p.no > 0 and e.p0 <= 0.1))
    group by p.rest_id`);
  await put(sql`select rest_id, 'predict.both', count(*) from (
    select rest_id from predict_trade where dir = 'buy'${only('rest_id')}
    group by event_id, rest_id having count(distinct side) = 2
  ) d group by rest_id`);
  // 菜场猜价：选满 6 种时全中、差一个、一个没中
  for (const [key, cond] of [
    ['market.guess.all', sql`hits = cardinality(foods_ids)`],
    ['market.guess.almost', sql`hits = cardinality(foods_ids) - 1`],
    ['market.guess.none', sql`hits = 0`],
  ] as const)
    await put(sql`select rest_id, ${key}::text, count(*) from market_guess
      where hits is not null and cardinality(foods_ids) >= 6 and ${cond}${only('rest_id')} group by rest_id`);
  // 挂单到期没卖完（关掉的等级强制下架的 closed_at 早于到期，不算）
  await put(sql`select rest_id, 'exchange.expired', count(*) from exchange_order
    where status = 'expired' and closed_at >= expires_at${only('rest_id')} group by rest_id`);
  // 酒吧：猜酒杯、转数字最长连败（每周最高只留 3 周，加上现在的连续）；划拳现在的连平；老虎机有过奖
  for (const game of ['cup', 'num'] as const)
    await put(sql`select rest_id, ${`streak.${game}.lose`}::text, max(times) from (
      select rest_id, times from bar_streak_best where game = ${game} and result = -1${only('rest_id')}
      union all
      select rest_id, ${sql.ref(`${game}_times`)} from bar_state where ${sql.ref(`${game}_result`)} = -1${only('rest_id')}
    ) x group by rest_id`);
  await put(
    sql`select rest_id, 'streak.fg.draw', fg_times from bar_state where fg_result = 0${only('rest_id')}`,
  );
  await put(sql`select rest_id, 'bar.slot.won', 1 from bar_slot_stat
    where award_id <> 0 and num > 0${only('rest_id')} group by rest_id`);
  // 厨具：现在每件的连续强化失败（以前断过的查不到）
  await put(sql`select rest_id, 'equip.failStreak', max(fail_streak) from equip
    where fail_streak > 0${only('rest_id')} group by rest_id`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table bar_state drop column devil_lose, drop column nim_lose, drop column slot_blank`.execute(
    db,
  );
  await sql`alter table ach_shard drop column version`.execute(db);
}
