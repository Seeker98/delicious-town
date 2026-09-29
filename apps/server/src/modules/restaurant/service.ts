import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { checkRestaurantName, ErrorCode, type RestaurantDto } from '@dt/shared';
import { uniqueViolation } from '../../db/errors';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { AppError } from '../../http/errors';
import type { LoadedSession } from '../../security/session';
import type { SessionStore } from '../../security/sessionStore';
import { listActiveEffects } from '../effects/service';
import { recordLedger } from '../ledger/ledger';
import { postNews } from '../news/news';
import type { ShardService } from '../shard/service';
import { grantGoods } from '../store/grant';
import { emptyCookbookLevels, initialTables, newRestaurantValues, toRestaurantDto } from './rules';

export interface RestaurantDeps {
  db: Kysely<DB>;
  config: GameConfig;
  bus: EventBus;
  sessions: SessionStore;
  now: () => Date;
}

export function createRestaurantService(d: RestaurantDeps, shards: ShardService) {
  async function overview(restId: number): Promise<RestaurantDto> {
    const row = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
    if (!row) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    const tables = await d.db
      .selectFrom('restaurant_tables')
      .select('tables')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    const effects = await listActiveEffects(d.db, restId, d.now());
    return toRestaurantDto(row, tables.tables, effects, d.config);
  }

  return {
    overview,

    async create(session: LoadedSession, rawName: string): Promise<RestaurantDto> {
      const { accountId, shardId } = session.data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      await shards.assertOpen(shardId);
      const settings = await shards.ensureFeature(shardId, 'restaurant');

      const existing = await d.db
        .selectFrom('restaurant')
        .select('id')
        .where('shard_id', '=', shardId)
        .where('account_id', '=', accountId)
        .executeTakeFirst();
      if (existing) throw new AppError(ErrorCode.RESTAURANT_EXISTS, 409);

      const name = rawName.trim();
      const check = checkRestaurantName(name);
      if (check !== 'ok') throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: check });

      const defaults = settings.restaurant;
      const now = d.now();
      const restId = await d.db.transaction().execute(async (tx) => {
        let id: number;
        try {
          const row = await tx
            .insertInto('restaurant')
            .values(newRestaurantValues(shardId, accountId, name, defaults))
            .returning('id')
            .executeTakeFirstOrThrow();
          id = row.id;
        } catch (e) {
          const constraint = uniqueViolation(e);
          if (constraint === 'restaurant_shard_account') throw new AppError(ErrorCode.RESTAURANT_EXISTS, 409);
          if (constraint === 'restaurant_shard_name')
            throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
          throw e;
        }
        await tx
          .insertInto('restaurant_tables')
          .values({ rest_id: id, tables: JSON.stringify(initialTables(defaults.tableNum)) })
          .execute();
        await tx
          .insertInto('restaurant_cookbooks')
          .values({ rest_id: id, levels: emptyCookbookLevels(d.config.maxCookbookId) })
          .execute();
        for (const gift of defaults.giftGoods) await grantGoods(tx, d.config, id, gift.id, gift.num, now);
        await recordLedger(
          tx,
          defaults.giftGoods.map((g) => ({
            restId: id,
            kind: 'goods' as const,
            itemId: g.id,
            delta: g.num,
            source: 'restaurant.create',
          })),
        );
        await postNews(tx, { shardId, type: 'restaurant.open', restId: id, params: { name } });
        await d.bus.emit(tx, { name: 'restaurant.created', shardId, restId: id });
        return id;
      });

      await d.sessions.update(session.token, { restaurantId: restId });
      return overview(restId);
    },
  };
}

export type RestaurantService = ReturnType<typeof createRestaurantService>;
