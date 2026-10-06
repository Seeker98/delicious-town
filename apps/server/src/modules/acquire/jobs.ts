import { addDays, gameDay, gameParts } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { aggregateIncomeDay, INCOME_KEEP_DAYS, incomeSums, pruneIncomeDays } from './income';
import { basePrice, decayHeat, type T } from './rules';
import { priceWindow } from './state';

/** 游戏时间 00:05 以后才跑（前一天最后一轮结算已经写完）；返回当天的游戏日 */
function after0005(now: Date): string | null {
  const p = gameParts(now);
  return p.hour === 0 && p.minute < 5 ? null : gameDay(now);
}

/**
 * 每天一次（收购 PR 1）：汇总前一天收入 → 重算基础身价（2 星以上、或已经有行的店）→ 热度回落 → 清掉到期挂牌。
 * 汇总是覆盖、基础身价按同一区间重算，重跑结果一样；热度回落靠周期键保证一天一次
 */
export async function runAcquireDay(
  d: GameDeps,
  shardId: number,
  now: Date,
  t: T,
): Promise<{ income: number; bases: number; decayed: number; unlisted: number }> {
  const today = gameDay(now);
  const income = await aggregateIncomeDay(d.db, shardId, addDays(today, -1));
  const rests = await d.db
    .selectFrom('restaurant as r')
    .leftJoin('acquire_state as s', 's.rest_id', 'r.id')
    .select('r.id')
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where((eb) => eb.or([eb('r.star_level', '>=', t.minStar), eb('s.rest_id', 'is not', null)]))
    .execute();
  const ids = rests.map((r) => r.id);
  const w = priceWindow(today, t);
  const sums = await incomeSums(d.db, ids, w.from, w.to);
  for (const id of ids) {
    const base = basePrice(sums.get(id) ?? 0, t);
    await d.db
      .insertInto('acquire_state')
      .values({ rest_id: id, shard_id: shardId, base, heat: 1 })
      .onConflict((oc) => oc.column('rest_id').doUpdateSet({ base }))
      .execute();
  }
  const hot = await d.db
    .selectFrom('acquire_state')
    .select(['rest_id', 'heat'])
    .where('shard_id', '=', shardId)
    .where('heat', '>', 1)
    .execute();
  for (const h of hot)
    await d.db
      .updateTable('acquire_state')
      .set({ heat: decayHeat(h.heat, t) })
      .where('rest_id', '=', h.rest_id)
      .execute();
  const un = await d.db
    .updateTable('acquire_state')
    .set({ list_rate: null, list_until: null })
    .where('shard_id', '=', shardId)
    .where('list_until', '<=', now)
    .executeTakeFirst();
  return { income, bases: ids.length, decayed: hot.length, unlisted: Number(un.numUpdatedRows) };
}

export function acquireJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 收入汇总挂在结算上：收购关着也照常攒，开的时候身价就有 7 天的数
      name: 'income-day',
      feature: 'settlement',
      period: (now) => {
        const day = after0005(now);
        return day === null ? null : `income-day-${day}`;
      },
      run: async ({ shardId, now }) => {
        const day = addDays(gameDay(now), -1);
        const income = await aggregateIncomeDay(d.db, shardId, day);
        const pruned = await pruneIncomeDays(d.db, addDays(day, -INCOME_KEEP_DAYS));
        return { income, pruned };
      },
    },
    {
      name: 'acquire-day',
      feature: 'acquire',
      period: (now) => {
        const day = after0005(now);
        return day === null ? null : `acquire-day-${day}`;
      },
      run: async ({ shardId, now, settings }) => runAcquireDay(d, shardId, now, settings.tuning.acquire),
    },
  ];
}
