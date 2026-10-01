import { ErrorCode, RANK_KEYS, type LeaderboardDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { AppError } from '../../http/errors';
import { BOARD_SOURCES } from './boards';
import { rankRows, type RankedRow } from './ranking';

/** 排行榜（设计文档 §2.6）：打开时现查，整区排序结果按（区服, 榜）缓存在进程内 */
export function createRankService(d: GameDeps) {
  const cache = new Map<string, { at: number; rows: RankedRow[] }>();
  return {
    /** 测试用 */
    clearCache(): void {
      cache.clear();
    },

    async board(ctx: RestCtx, key: string): Promise<LeaderboardDto> {
      const source = RANK_KEYS.has(key) ? BOARD_SOURCES[key] : undefined;
      if (!source) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { key });
      const { tuning } = await d.shards.ensureFeature(ctx.shardId, 'town');
      const t = tuning.rank;
      const now = d.now();
      const ttl = (key === 'power' ? t.powerCacheSeconds : t.cacheSeconds) * 1000;
      const ck = `${ctx.shardId}:${key}`;
      let hit = cache.get(ck);
      if (!hit || now.getTime() - hit.at >= ttl) {
        const rows = rankRows(await source({ db: d.db, shardId: ctx.shardId, now, config: d.config }));
        hit = { at: now.getTime(), rows };
        cache.set(ck, hit);
      }
      const mine = hit.rows.find((r) => r.restId === ctx.restaurantId);
      return {
        key,
        rows: hit.rows
          .slice(0, t.top)
          .map(({ rank, restId, name, value }) => ({ rank, restId, name, value })),
        me: mine ? { rank: mine.rank, value: mine.value } : null,
        updatedAt: new Date(hit.at).toISOString(),
      };
    },
  };
}

export type RankService = ReturnType<typeof createRankService>;
