import { gameTime, latestSlot, parseSlotKey } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { opNews, restLog, runSystemOp } from '../../core/op';
import { BOARD_SOURCES } from '../rank/boards';
import { rankRows } from '../rank/ranking';
import { grantGoodsOp } from '../store/goods';
import { bumpCounters } from '../achieve/counters';

/**
 * 昨日特色菜榜发奖（规格书 16，设计文档 §4.7；2026-10-19 改成前几名）：day 为今天（区服时区），统计昨天开始烹制的批次。
 * 名次和城镇排行榜的“昨日特色菜”同一个数据源、同一套排名（只算玩家店，同值同名次）；
 * 第 n 名得 championNums[n-1] 个 championGoodsId，名次超出长度的不给。第 1 名照旧发新闻。
 * 每家单独一个事务，某家出错只记日志、别家照发（和塔榜周奖一样）
 */
export async function awardChampion(
  d: GameDeps,
  shardId: number,
  day: string,
  now: Date,
  log?: { error(obj: object, msg: string): void },
): Promise<{ winners: number; value: number; awarded: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const t = tuning.mysterious;
  const ranked = rankRows(
    await BOARD_SOURCES['mc.yesterday']!({ db: d.db, shardId, now: gameTime(day, 0), config: d.config }),
  );
  if (ranked.length === 0) return { winners: 0, value: 0, awarded: 0, failed: 0 };
  const top = ranked[0]!.value;
  let awarded = 0;
  let failed = 0;
  for (const row of ranked) {
    const num = t.championNums[row.rank - 1];
    if (num === undefined) break;
    try {
      await runSystemOp(d, shardId, row.restId, { source: 'mc.champion', now }, async (op) => {
        await grantGoodsOp(op, tuning.mysterious.championGoodsId, num);
        restLog(op, 'mc.champion', {
          day,
          rank: row.rank,
          value: row.value,
          goodsId: t.championGoodsId,
          num,
        });
        if (row.rank === 1) {
          opNews(op, 'mc.champion', { value: top });
          await bumpCounters(op, [['mc.champion', 1]]);
        }
      });
      awarded += 1;
    } catch (err) {
      failed += 1;
      log?.error({ err, shardId, day, rank: row.rank, restId: row.restId }, 'mc champion award failed');
    }
  }
  return { winners: ranked.filter((r) => r.rank === 1).length, value: top, awarded, failed };
}

export function mysteriousJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'mc-champion',
      feature: 'mysterious',
      period: (now, s) => latestSlot(now, [s.tuning.mysterious.championHour]).key,
      run: ({ shardId, period, now, log }) => awardChampion(d, shardId, parseSlotKey(period).day, now, log),
    },
  ];
}
