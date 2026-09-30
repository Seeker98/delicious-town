import type { NewsPageDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { listNews } from '../news/news';
import type { WorldService } from '../world/service';
import { broadcast } from './broadcast';

export function createTownService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'town', source }, fn);
  void world;

  return {
    async news(ctx: RestCtx, q: { before?: number }): Promise<NewsPageDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'town');
      const size = s.tuning.town.news.pageSize;
      const items = await listNews(d.db, ctx.shardId, { before: q.before, limit: size + 1 });
      return { items: items.slice(0, size), hasMore: items.length > size };
    },
    broadcast(ctx: RestCtx, b: { text: string }) {
      return op(ctx, 'town.broadcast', (o) => broadcast(o, b.text));
    },
  };
}

export type TownService = ReturnType<typeof createTownService>;
