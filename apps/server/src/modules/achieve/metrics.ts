import { sql, type Kysely } from 'kysely';
import { NON_SUIT_IDS, type AchLine, type AchTier, type GameConfig } from '@dt/config';
import { achProgressKey, gameDay, weekStart } from '@dt/shared';
import type { DB, RestaurantRow } from '../../db/schema';
import { gradeOf } from '../cookbook/rules';
import { normalizeCounts } from '../settlement/globals';

/** “都玩过”数的十个酒吧游戏（计数 bar.<游戏>） */
export const BAR_GAMES = [
  'fg',
  'cup',
  'num',
  'slot',
  'devil',
  'memory',
  'darts',
  'nim',
  'spice',
  'deal',
] as const;
/** 能聊天的镇民（计数 town.talk.<镇民>，和 NpcKey 一致） */
export const TALK_NPCS = ['bigEater', 'wenjie', 'bro13', 'carmen'] as const;

/** 这家店各口径的当前值：键见 achProgressKey（计数是 counter:<键>，状态是 state:<名>[:参数][@街道]） */
export type AchValues = Map<string, number>;

type Rest = Pick<
  RestaurantRow,
  'id' | 'account_id' | 'level' | 'star_level' | 'renown' | 'street_id' | 'cookbook_counts'
>;

/**
 * 读一家店算成就要的全部计数和状态（一条查询读完，和任务快照一样；可能在调用方的事务里跑，不能并发）。
 * 只算配置里用到的口径
 */
export async function achValues(
  db: Kysely<DB>,
  config: GameConfig,
  rest: Rest,
  now: Date,
): Promise<AchValues> {
  const fullIds = config.bundle.weeklyGroups.map((g) => g.fullId);
  const thisWeek = weekStart(gameDay(now));
  const f = await db
    .selectNoFrom([
      sql<
        Record<string, number>
      >`coalesce((select jsonb_object_agg(key, count) from event_counter where rest_id = ${rest.id}), '{}'::jsonb)`.as(
        'counters',
      ),
      sql<number | null>`(select best from signin_streak where rest_id = ${rest.id})`.as('signinBest'),
      sql<number>`(select count(*) from weekly_claim where rest_id = ${rest.id}
        and quest_id in (${sql.join(fullIds.length > 0 ? fullIds : [-1])}))`.as('weeklyFull'),
      sql<number>`(select count(*) from quest_done where rest_id = ${rest.id} and quest_id > 100000)`.as(
        'chapters',
      ),
      sql<number>`(select count(*) from wish_round where winner_rest_id = ${rest.id})`.as('wishWins'),
      // 猜天气最长连中：一天里猜的都对才算这天对，连着的日子算一段
      sql<number>`(select coalesce(max(c), 0) from (
        select count(*) as c from (
          select day::date - (row_number() over (order by day))::int as grp from (
            select day from mayor_guess where rest_id = ${rest.id} and "right" is not null
            group by day having bool_and("right")
          ) d
        ) g group by grp
      ) x)`.as('mayorStreak'),
      sql<number>`(select count(*) from rest_mc where rest_id = ${rest.id})`.as('mcLearned'),
      sql<number | null>`(select max(curlevel) from rest_mc where rest_id = ${rest.id})`.as('mcLevel'),
      // 好友：10 级以上、验证过邮箱（小号不算），不算蟹老板
      sql<number>`(select count(*) from friend f join restaurant r on r.id = f.friend_id
        join account a on a.id = r.account_id
        where f.rest_id = ${rest.id} and not r.npc and r.level >= 10 and a.email_verified_at is not null)`.as(
        'friends',
      ),
      sql<number>`(select count(distinct invitee_account_id) from invite_reward
        where inviter_account_id = ${rest.account_id} and stage = 'lv30')`.as('invite30'),
      sql<number | null>`(select best_floor from tower_state where rest_id = ${rest.id})`.as('towerFloor'),
      // 赛厨周榜：只算过完的周
      sql<
        Array<{ rank: number; n: number }>
      >`coalesce((select json_agg(json_build_object('rank', rank, 'n', 1))
        from tower_rank where rest_id = ${rest.id} and week < ${thisWeek}), '[]'::json)`.as('towerRanks'),
      sql<
        Array<{ suit: number; parts: number }>
      >`coalesce((select json_agg(json_build_object('suit', suit_id, 'parts', parts))
        from (select suit_id, count(distinct part) as parts from equip where rest_id = ${rest.id} group by suit_id) s),
        '[]'::json)`.as('suits'),
      sql<number>`(select count(distinct event_id) from predict_position where rest_id = ${rest.id})`.as(
        'predictEvents',
      ),
      sql<Record<string, number>>`coalesce((select jsonb_object_agg(tier, n) from (select tier, count(*) as n
        from fund_deposit where rest_id = ${rest.id} and status = 'claimed' group by tier) t), '{}'::jsonb)`.as(
        'fund',
      ),
      sql<Uint8Array | null>`(select levels from restaurant_cookbooks where rest_id = ${rest.id})`.as(
        'levels',
      ),
    ])
    .executeTakeFirstOrThrow();

  const v: AchValues = new Map();
  const counters = f.counters;
  for (const [k, n] of Object.entries(counters)) v.set(`counter:${k}`, Number(n));
  const counts = normalizeCounts(rest.cookbook_counts);
  v.set('state:level', rest.level);
  v.set('state:star', rest.star_level);
  v.set('state:renown', rest.renown);
  v.set('state:signinBest', f.signinBest ?? 0);
  v.set('state:weeklyFull', Number(f.weeklyFull));
  v.set('state:chapters', Number(f.chapters));
  const streets = new Set([rest.street_id]);
  // 开过店的街：搬家时记的 street.seen.<街>（搬出和搬入的都记），加上任务记的 rest.moveTo.<街>、现在这条街
  for (const k of Object.keys(counters)) {
    if (k.startsWith('street.seen.')) streets.add(Number(k.slice(12)));
    else if (k.startsWith('rest.moveTo.')) streets.add(Number(k.slice(12)));
  }
  v.set('state:streets', streets.size);
  v.set('state:wishWins', Number(f.wishWins));
  v.set('state:mayorStreak', Number(f.mayorStreak));
  v.set('state:cookLearned', counts.learned);
  for (let g = 1; g <= 10; g++)
    v.set(
      `state:grade:${g}`,
      counts.grade.slice(g).reduce((a, b) => a + b, 0),
    );
  v.set('state:mcLearned', Number(f.mcLearned));
  v.set('state:mcLevel', f.mcLevel ?? 0);
  v.set('state:friends', Number(f.friends));
  v.set('state:invite30', Number(f.invite30));
  v.set('state:towerFloor', f.towerFloor ?? 0);
  for (const top of [1, 3, 15])
    v.set(`state:towerWeeks:${top}`, f.towerRanks.filter((r) => r.rank <= top).length);
  v.set(
    'state:suits',
    f.suits.filter(
      (s) => !NON_SUIT_IDS.has(s.suit) && s.parts >= (config.suits.get(s.suit)?.maxNum ?? Infinity),
    ).length,
  );
  v.set('state:predictEvents', Number(f.predictEvents));
  for (const t of ['A', 'B', 'C']) v.set(`state:fund:${t}`, Number(f.fund[t] ?? 0));
  v.set('state:talkAll', TALK_NPCS.filter((n) => (counters[`town.talk.${n}`] ?? 0) > 0).length);
  v.set('state:barPlayed', BAR_GAMES.filter((g) => (counters[`bar.${g}`] ?? 0) > 0).length);
  // 菜系：这条街的食谱是不是全部学会（1）、全部 ≥ 金牌（5）、全部佳肴（7）
  const levels = f.levels ? new Uint8Array(f.levels) : new Uint8Array(0);
  const idx = config.cookbookIndex;
  for (const s of config.bundle.streets) {
    const ids = idx.idsByStreet.get(s.id) ?? [];
    for (const g of [1, 5, 7]) {
      const all = ids.length > 0 && ids.every((id) => gradeOf(levels, idx.slotOf, id) >= g);
      v.set(achProgressKey(`state:cuisine:${g}`, s.id), all ? 1 : 0);
    }
  }
  return v;
}

/** 这一档的口径当前值 */
export function valueOf(v: AchValues, line: AchLine, tier: AchTier): number {
  return (
    v.get(achProgressKey(tier.metric, tier.metric.startsWith('state:cuisine') ? line.streetId : null)) ?? 0
  );
}
