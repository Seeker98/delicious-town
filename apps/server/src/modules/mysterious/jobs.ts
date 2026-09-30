import { sql } from 'kysely';
import { addDays, gameTime, latestSlot, parseSlotKey } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { opNews, runSystemOp } from '../../core/op';
import { grantGoodsOp } from '../store/goods';

/** 昨日特色菜冠军（规格书 16，设计文档 §4.7）：day 为今天（区服时区），统计昨天开始烹制的批次 */
export async function awardChampion(
  d: GameDeps,
  shardId: number,
  day: string,
  now: Date,
): Promise<{ winners: number; value: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const rows = await d.db
    .selectFrom('mc_cook')
    .select(['rest_id', sql<number>`max(total_num::float8 * price)`.as('v')])
    .where('shard_id', '=', shardId)
    .where('created_at', '>=', gameTime(addDays(day, -1), 0))
    .where('created_at', '<', gameTime(day, 0))
    .groupBy('rest_id')
    .execute();
  if (rows.length === 0) return { winners: 0, value: 0 };
  const top = Math.max(...rows.map((r) => Number(r.v)));
  const winners = rows.filter((r) => Number(r.v) === top).map((r) => r.rest_id);
  for (const restId of winners) {
    await runSystemOp(d, shardId, restId, { source: 'mc.champion', now }, async (op) => {
      await grantGoodsOp(op, tuning.mysterious.championGoodsId, 1);
      opNews(op, 'mc.champion', { value: top });
    });
  }
  return { winners: winners.length, value: top };
}

export function mysteriousJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'mc-champion',
      feature: 'mysterious',
      period: (now, s) => latestSlot(now, [s.tuning.mysterious.championHour]).key,
      run: ({ shardId, period, now }) => awardChampion(d, shardId, parseSlotKey(period).day, now),
    },
  ];
}
