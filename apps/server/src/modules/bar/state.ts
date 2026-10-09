import { sql, type Kysely } from 'kysely';
import { addDays, gameDay, weekStart } from '@dt/shared';
import type { Op } from '../../core/op';
import type { BarStateRow, DB } from '../../db/schema';
import type { BarResult } from './rules';

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
  if (result === 0) return;
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
