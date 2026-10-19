import { sql, type Kysely } from 'kysely';
import { addDays, gameDay, weekStart } from '@dt/shared';
import type { Op } from '../../core/op';
import type { BarStateRow, DB } from '../../db/schema';
import type { BarResult } from './rules';
import { raiseCounter } from '../achieve/counters';

export type BarStatePatch = Partial<Omit<BarStateRow, 'rest_id'>>;

/** 取本店的酒吧状态行并锁住；第一次玩时先插入（整个操作已经锁了店） */
export async function lockBarState(o: Op): Promise<BarStateRow> {
  await o.tx
    .insertInto('bar_state')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('bar_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export async function saveBarState(o: Op, patch: BarStatePatch): Promise<void> {
  await o.tx.updateTable('bar_state').set(patch).where('rest_id', '=', o.rest.id).execute();
}

/**
 * 记这一周的最高连胜、连败（问题记录 517：排行按每周最高，输一局不掉榜）。平局不记。
 * 比原来高才更新，时间记第一次达到的那一刻
 */
export async function recordStreak(
  o: Op,
  game: 'fg' | 'cup' | 'num',
  result: BarResult,
  times: number,
): Promise<void> {
  // 成就（2026-10-19）：划拳历史最长连胜、连败、连平，猜酒杯、转数字最长连败（这张表只留 3 周、不记平局）
  if (result === 0) {
    if (game === 'fg') await raiseCounter(o, 'streak.fg.draw', times);
    return;
  }
  if (game === 'fg' || result < 0)
    await raiseCounter(o, `streak.${game}.${result > 0 ? 'win' : 'lose'}`, times);
  await o.tx
    .insertInto('bar_streak_best')
    .values({ rest_id: o.rest.id, game, result, week: weekStart(gameDay(o.now)), times, reached_at: o.now })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'game', 'result', 'week'])
        .doUpdateSet({ times: sql`excluded.times`, reached_at: sql`excluded.reached_at` })
        .where('bar_streak_best.times', '<', sql<number>`excluded.times`),
    )
    .execute();
}

/** 只给隐藏成就记的连续次数（bar_state 的列）：魔鬼辣杯连输、新手桌连输、老虎机连空 */
export type BarRunColumn = 'devil_lose' | 'nim_lose' | 'slot_blank';

/**
 * 隐藏成就的连续次数：hit 时连续数加 add，否则清零；加了就看历史最长（event_counter 的 key）有没有跨过门槛
 */
export async function recordRun(o: Op, col: BarRunColumn, key: string, hit: boolean, add = 1): Promise<void> {
  const s = await lockBarState(o);
  const times = hit ? s[col] + add : 0;
  if (times === s[col]) return;
  await saveBarState(o, { [col]: times });
  if (hit) await raiseCounter(o, key, times);
}

/**
 * 记这一周单局最少几次（问题记录 569：秘制调料最少几次猜中）。和连胜同一张表，result 记 1；
 * 比原来少才更新，时间记第一次达到的那一刻（同样少的先达到的排前面）
 */
export async function recordFewest(o: Op, game: 'spice', times: number): Promise<void> {
  await o.tx
    .insertInto('bar_streak_best')
    .values({
      rest_id: o.rest.id,
      game,
      result: 1,
      week: weekStart(gameDay(o.now)),
      times,
      reached_at: o.now,
    })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'game', 'result', 'week'])
        .doUpdateSet({ times: sql`excluded.times`, reached_at: sql`excluded.reached_at` })
        .where('bar_streak_best.times', '>', sql<number>`excluded.times`),
    )
    .execute();
}

/**
 * 连胜榜只读本周和上周（问题记录 517），三周以前的删掉（517 遗留：原来一直不删）；
 * worker 每 6 小时清一次（streak-best-clean），返回删了几行
 */
export async function pruneStreakBest(db: Kysely<DB>, now: Date): Promise<number> {
  const keepFrom = weekStart(addDays(gameDay(now), -14));
  const r = await db.deleteFrom('bar_streak_best').where('week', '<', keepFrom).executeTakeFirst();
  return Number(r.numDeletedRows);
}
