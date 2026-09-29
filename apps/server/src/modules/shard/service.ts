import type { Kysely } from 'kysely';
import { isFeatureEnabled, resolveShardSettings, type GameConfig, type ShardSettings } from '@dt/config';
import { ErrorCode, type SelectShardResult, type ShardDto } from '@dt/shared';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import type { LoadedSession } from '../../security/session';
import type { SessionStore } from '../../security/sessionStore';

const SETTINGS_CACHE_MS = 30_000;

export function createShardService(d: { db: Kysely<DB>; sessions: SessionStore; config: GameConfig }) {
  const cache = new Map<number, { expires: number; settings: ShardSettings }>();

  async function settings(shardId: number): Promise<ShardSettings> {
    const hit = cache.get(shardId);
    const nowMs = Date.now();
    if (hit && hit.expires > nowMs) return hit.settings;
    const row = await d.db
      .selectFrom('shard_config')
      .select('override')
      .where('shard_id', '=', shardId)
      .executeTakeFirst();
    const resolved = resolveShardSettings(d.config, row?.override ?? {});
    cache.set(shardId, { expires: nowMs + SETTINGS_CACHE_MS, settings: resolved });
    return resolved;
  }

  async function assertOpen(shardId: number): Promise<void> {
    const shard = await d.db
      .selectFrom('shard')
      .select('status')
      .where('id', '=', shardId)
      .executeTakeFirst();
    if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
    if (shard.status !== 'open') throw new AppError(ErrorCode.SHARD_CLOSED, 403);
  }

  return {
    settings,
    assertOpen,

    /** 区服配置被后台修改后清掉缓存；下一次读取从库里重新解析 */
    invalidate(shardId: number): void {
      cache.delete(shardId);
    },

    async list(accountId: number): Promise<ShardDto[]> {
      const rows = await d.db
        .selectFrom('shard')
        .leftJoin('restaurant', (join) =>
          join.onRef('restaurant.shard_id', '=', 'shard.id').on('restaurant.account_id', '=', accountId),
        )
        .select(['shard.id', 'shard.name', 'shard.status', 'shard.opened_at', 'restaurant.id as rest_id'])
        .orderBy('shard.id')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        openedAt: r.opened_at.toISOString(),
        hasRestaurant: r.rest_id !== null,
      }));
    },

    async select(session: LoadedSession, shardId: number): Promise<SelectShardResult> {
      await assertOpen(shardId);
      const rest = await d.db
        .selectFrom('restaurant')
        .select('id')
        .where('shard_id', '=', shardId)
        .where('account_id', '=', session.data.accountId)
        .executeTakeFirst();
      const restaurantId = rest?.id ?? null;
      await d.sessions.update(session.token, { shardId, restaurantId });
      return { shardId, restaurantId };
    },

    async ensureFeature(shardId: number, feature: string): Promise<ShardSettings> {
      const s = await settings(shardId);
      if (!isFeatureEnabled(s, feature)) throw new AppError(ErrorCode.FEATURE_DISABLED, 403, { feature });
      return s;
    },
  };
}

export type ShardService = ReturnType<typeof createShardService>;
