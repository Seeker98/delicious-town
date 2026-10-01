import { sql } from 'kysely';
import type { ActivitySpec } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { EventBus } from '../../events/bus';

export interface ActiveActivity {
  id: number;
  shardId: number | null;
  title: string;
  minLevel: number;
  startsAt: Date;
  endsAt: Date;
  spec: ActivitySpec;
}

const TTL_MS = 30_000;
/** 结束后还在缓存里留一会儿：事件时间按游戏时钟精确判断窗口，这里只是粗筛 */
const KEEP_AFTER_END_MS = 10 * 60_000;

export interface ActivityCache {
  forShard(shardId: number): Promise<ActiveActivity[]>;
  invalidate(): void;
}

/** 每个事件总线一份缓存：计数处理器和后台写操作共用，后台改动立即清掉（设计 §4.2） */
const caches = new WeakMap<EventBus, ActivityCache>();

export function activityCacheFor(bus: EventBus, d: Pick<GameDeps, 'db' | 'now'>): ActivityCache {
  const hit = caches.get(bus);
  if (hit) return hit;
  const byShard = new Map<number, { expires: number; list: ActiveActivity[] }>();
  const cache: ActivityCache = {
    async forShard(shardId) {
      const c = byShard.get(shardId);
      if (c && c.expires > Date.now()) return c.list;
      const rows = await d.db
        .selectFrom('activity')
        .select(['id', 'shard_id', 'kind', 'title', 'min_level', 'starts_at', 'ends_at', 'def'])
        .where('deleted_at', 'is', null)
        .where((eb) => eb.or([eb('shard_id', '=', shardId), eb('shard_id', 'is', null)]))
        .where('ends_at', '>', sql<Date>`${new Date(d.now().getTime() - KEEP_AFTER_END_MS)}`)
        .execute();
      const list = rows.map((r) => ({
        id: r.id,
        shardId: r.shard_id,
        title: r.title,
        minLevel: r.min_level,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        spec: { kind: r.kind, def: r.def } as ActivitySpec,
      }));
      byShard.set(shardId, { expires: Date.now() + TTL_MS, list });
      return list;
    },
    invalidate() {
      byShard.clear();
    },
  };
  caches.set(bus, cache);
  return cache;
}
