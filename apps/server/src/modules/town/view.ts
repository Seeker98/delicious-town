import { GOODS } from '@dt/config';
import { gameDay, type NpcKey, type TownDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import type { WorldService } from '../world/service';
import { goodsCounts } from './exchange';
import { mayorView } from './mayor';

const NPCS: NpcKey[] = ['bigEater', 'wenjie', 'bro13', 'carmen'];
const later = (at: Date | null, ms: number, now: Date): string | null =>
  at && at.getTime() + ms > now.getTime() ? new Date(at.getTime() + ms).toISOString() : null;

/** 小镇概览（设计文档 §3.8）：只读，不加锁 */
export async function townView(d: GameDeps, world: WorldService, ctx: RestCtx): Promise<TownDto> {
  const s = await d.shards.ensureFeature(ctx.shardId, 'town');
  const t = s.tuning.town;
  const now = d.now();
  const day = gameDay(now);
  const restId = ctx.restaurantId;
  const snapP = world.ensure(ctx.shardId, now);
  // 互不依赖的查询一起发（性能第二轮：原来一条接一条，开发服 16 毫秒左右）
  const [rest, counterRows, tr, shaken, goods, snap, mayor] = await Promise.all([
    d.db
      .selectFrom('restaurant')
      .select(['star_level', 'coin', 'diamond'])
      .where('id', '=', restId)
      .executeTakeFirstOrThrow(),
    d.db
      .selectFrom('daily_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', restId)
      .where('day', '=', day)
      .where('key', 'like', 'town.%')
      .execute(),
    d.db
      .selectFrom('town_rest')
      .select(['broadcast_at', 'big_eater_gift'])
      .where('rest_id', '=', restId)
      .executeTakeFirst(),
    d.db
      .selectFrom('town_shake')
      .select('id')
      .where('shard_id', '=', ctx.shardId)
      .where('day', '=', day)
      .where('rest_id', '=', restId)
      .executeTakeFirst(),
    goodsCounts(d.db, restId, [GOODS.horn], now),
    snapP,
    // 世界状态和上面共用一次读（原来镇长这里又读一遍）
    mayorView(d.db, world, ctx.shardId, restId, now, snapP),
  ]);
  const counters = new Map(counterRows.map((r) => [r.key, r.count]));
  const talked = Object.fromEntries(NPCS.map((n) => [n, (counters.get(`town.talk.${n}`) ?? 0) > 0]));
  return {
    now: now.toISOString(),
    star: rest.star_level,
    coin: rest.coin,
    diamond: rest.diamond,
    talked: talked as Record<NpcKey, boolean>,
    mayor,
    bigEaterGift: tr?.big_eater_gift ?? false,
    shaken: shaken !== undefined,
    broadcast: {
      horns: goods.get(GOODS.horn) ?? 0,
      readyAt: later(tr?.broadcast_at ?? null, t.broadcast.cooldownSec * 1000, now),
      minStar: t.broadcast.minStar,
      maxLen: t.broadcast.maxLen,
    },
    weather: { id: snap.weather.id, name: snap.weather.name, until: snap.weatherUntil.toISOString() },
  };
}
