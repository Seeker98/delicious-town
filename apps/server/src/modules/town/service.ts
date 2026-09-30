import type { NewsPageDto, NpcKey, ShakeResultDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { createOp, flushOp, runOp, type Op, type OpResult } from '../../core/op';
import { withRestaurants } from '../../db/tx';
import { listNews } from '../news/news';
import { npcIdOf } from '../npc/npc';
import type { WorldService } from '../world/service';
import { broadcast } from './broadcast';
import { shake } from './shake';
import { talk } from './talk';

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
    talk(ctx: RestCtx, b: { npc: NpcKey }) {
      return op(ctx, 'town.talk', (o) => talk(o, b.npc));
    },
    /** 和蟹老板店一起按店号顺序加锁（计划裁定：避免和好友互动的锁顺序相反） */
    async shake(ctx: RestCtx): Promise<OpResult<ShakeResultDto>> {
      const settings = await d.shards.ensureFeature(ctx.shardId, 'town');
      const krabId = await npcIdOf(d.db, ctx.shardId);
      if (krabId === null) throw invalidState('krab_broke');
      return withRestaurants(d.db, [ctx.restaurantId, krabId], async (tx, rests) => {
        const me = createOp(d, tx, rests.get(ctx.restaurantId)!, settings, { source: 'town.shake', ctx });
        const krab = createOp(d, tx, rests.get(krabId)!, settings, {
          source: 'town.shake',
          now: me.now,
          rng: me.rng,
        });
        const data = await shake(me, krab, ctx);
        await flushOp(me);
        await flushOp(krab);
        return { data, events: me.events };
      });
    },
  };
}

export type TownService = ReturnType<typeof createTownService>;
