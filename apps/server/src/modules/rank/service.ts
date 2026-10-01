import { ErrorCode, RANK_KEYS, type LeaderboardDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { AppError } from '../../http/errors';
import { BOARD_SOURCES } from './boards';
import { rankRows, type RankedRow } from './ranking';

/**
 * 排行榜（设计文档 §2.6）：打开时现查，整区排序结果按（区服, 榜）缓存在进程内。
 * 缓存的是计算中的 Promise：过期时同时进来的请求共用一次计算；算失败就删掉，下次重算（终审 I2）
 */
export function createRankService(d: GameDeps) {
  const cache = new Map<string, { at: number; rows: Promise<RankedRow[]> }>();
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
        const entry = {
          at: now.getTime(),
          rows: source({ db: d.db, shardId: ctx.shardId, now, config: d.config }).then(rankRows),
        };
        entry.rows.catch(() => {
          if (cache.get(ck) === entry) cache.delete(ck);
        });
        cache.set(ck, entry);
        hit = entry;
      }
      const rows = await hit.rows;
      const mine = rows.find((r) => r.restId === ctx.restaurantId);
      return {
        key,
        rows: rows.slice(0, t.top).map(({ rank, restId, name, value }) => ({ rank, restId, name, value })),
        me: mine ? { rank: mine.rank, value: mine.value } : null,
        updatedAt: new Date(hit.at).toISOString(),
      };
    },
  };
}

export type RankService = ReturnType<typeof createRankService>;
