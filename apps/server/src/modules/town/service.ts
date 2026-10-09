import type {
  DailyDto,
  HiphopPlace,
  NewsPageDto,
  NpcKey,
  ShakeResultDto,
  TownDto,
  TownExchangeDto,
  TownExchangePart,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { createOp, flushOp, runOp, type Op, type OpResult } from '../../core/op';
import { withRestaurants } from '../../db/tx';
import { readDaily } from '../daily/read';
import { listNews } from '../news/news';
import { npcIdOf } from '../npc/npc';
import type { HammerPick } from '../world/rules';
import type { WorldService } from '../world/service';
import { feast, wish } from './bless';
import { broadcast } from './broadcast';
import { doExchange, exchangeView, useLevelTicket, useMysteryTicket } from './exchange';
import { useHammer } from './hammer';
import { shake } from './shake';
import { askMayor } from './mayor';
import { talk } from './talk';
import { townView } from './view';

export function createTownService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'town', source }, fn);

  return {
    overview(ctx: RestCtx): Promise<TownDto> {
      return townView(d, world, ctx);
    },
    async news(ctx: RestCtx, q: { before?: number }): Promise<NewsPageDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'town');
      const size = s.tuning.town.news.pageSize;
      const items = await listNews(d.db, ctx.shardId, { before: q.before, limit: size + 1 });
      return { items: items.slice(0, size), hasMore: items.length > size };
    },
    /** 小镇日报（2026-10-08）：不带日期取最近一份已发布的 */
    async daily(ctx: RestCtx, day: string | undefined): Promise<DailyDto> {
      await d.shards.ensureFeature(ctx.shardId, 'daily');
      return readDaily(d.db, ctx.shardId, day, d.now());
    },
    broadcast(ctx: RestCtx, b: { text: string }) {
      return op(ctx, 'town.broadcast', (o) => broadcast(o, b.text));
    },
    mayor(ctx: RestCtx, place: HiphopPlace) {
      return op(ctx, 'town.mayor', (o) => askMayor(o, place));
    },
    talk(ctx: RestCtx, b: { npc: NpcKey }) {
      return op(ctx, 'town.talk', (o) => talk(o, b.npc));
    },
    async exchangeView(ctx: RestCtx, part?: TownExchangePart): Promise<TownExchangeDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'town');
      return exchangeView(d.db, d.config, s.tuning, ctx.restaurantId, d.now(), part);
    },
    exchange(ctx: RestCtx, b: { id: number; num: number }) {
      return op(ctx, 'town.exchange', (o) => doExchange(o, b.id, b.num));
    },
    levelTicket(ctx: RestCtx, b: { level: number; picks: Array<{ foodsId: number; num: number }> }) {
      return op(ctx, 'town.levelTicket', (o) => useLevelTicket(o, b.level, b.picks));
    },
    mysteryTicket(ctx: RestCtx, b: { foodsId: number }) {
      return op(ctx, 'town.mysteryTicket', (o) => useMysteryTicket(o, b.foodsId));
    },
    wish(ctx: RestCtx) {
      return op(ctx, 'town.wish', (o) => wish(o));
    },
    feast(ctx: RestCtx, b: { foodsId?: number }) {
      return op(ctx, 'town.feast', (o) => feast(o, b.foodsId));
    },
    hammer(ctx: RestCtx, pick: HammerPick) {
      return op(ctx, 'town.hammer', async (o) => {
        await world.ensure(o.shardId, o.now, o.tx);
        return useHammer(o, pick);
      });
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
