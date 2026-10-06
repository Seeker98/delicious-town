import { GOODS } from '@dt/config';
import { gameDay, type NpcKey, type TownDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import type { WorldService } from '../world/service';
import { blessDto, todayBless } from './bless';
import { activationPoints } from './common';
import { goodsCounts } from './exchange';
import { hiphopDay } from '../hiphop/day';

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
  // 互不依赖的查询一起发（性能第二轮：原来一条接一条，开发服 16 毫秒左右）
  const [rest, counterRows, tr, shaken, goods, snap, today, hiphop, activation] = await Promise.all([
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
      .select(['hammer_at', 'broadcast_at', 'big_eater_gift'])
      .where('rest_id', '=', restId)
      .executeTakeFirst(),
    d.db
      .selectFrom('town_shake')
      .select('id')
      .where('shard_id', '=', ctx.shardId)
      .where('day', '=', day)
      .where('rest_id', '=', restId)
      .executeTakeFirst(),
    goodsCounts(d.db, restId, [GOODS.horn, GOODS.thorHammer, GOODS.magicLamp], now),
    world.ensure(ctx.shardId, now),
    todayBless(d.db, d.config, ctx.shardId, now),
    hiphopDay(d.db, ctx.shardId, now),
    activationPoints(d.db, d.config, restId, day),
  ]);
  const counters = new Map(counterRows.map((r) => [r.key, r.count]));
  // 新区服要等 ensure 建好 world_state 那一行再读；许愿的店名要等今天的星愿
  const [ws, blessRest] = await Promise.all([
    d.db
      .selectFrom('world_state')
      .select('weather_changed_at')
      .where('shard_id', '=', ctx.shardId)
      .executeTakeFirstOrThrow(),
    today
      ? d.db.selectFrom('restaurant').select('name').where('id', '=', today.restId).executeTakeFirst()
      : undefined,
  ]);
  const talked = Object.fromEntries(NPCS.map((n) => [n, (counters.get(`town.talk.${n}`) ?? 0) > 0]));
  return {
    now: now.toISOString(),
    star: rest.star_level,
    coin: rest.coin,
    diamond: rest.diamond,
    talked: talked as Record<NpcKey, boolean>,
    // 嘻哈男孩今天还没出来时镇长那里先写明几点出来，不让人选完才报错（问题记录 333）
    mayor: {
      answered: (counters.get('town.talk.mayor') ?? 0) > 0,
      hiphopOut: hiphop !== null,
      hour: s.tuning.hiphop.hour,
    },
    bigEaterGift: tr?.big_eater_gift ?? false,
    shaken: shaken !== undefined,
    broadcast: {
      horns: goods.get(GOODS.horn) ?? 0,
      readyAt: later(tr?.broadcast_at ?? null, t.broadcast.cooldownSec * 1000, now),
      minStar: t.broadcast.minStar,
      maxLen: t.broadcast.maxLen,
    },
    hammer: {
      has: (goods.get(GOODS.thorHammer) ?? 0) > 0,
      readyAt: later(tr?.hammer_at ?? null, t.hammer.cooldownHours * 3600_000, now),
      townReadyAt: later(ws.weather_changed_at, t.hammer.gapSec * 1000, now),
      coin: t.hammer.coin,
      diamond: t.hammer.diamond,
    },
    weather: { id: snap.weather.id, name: snap.weather.name, until: snap.weatherUntil.toISOString() },
    bless: {
      today: today ? blessDto(today.bless) : null,
      restName: blessRest?.name ?? null,
      hasLamp: (goods.get(GOODS.magicLamp) ?? 0) > 0,
      activation,
      feasted: (counters.get('town.feast') ?? 0) > 0,
    },
  };
}
