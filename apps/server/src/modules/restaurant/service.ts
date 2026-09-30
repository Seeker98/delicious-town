import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import {
  checkRestaurantName,
  ErrorCode,
  type PageQuery,
  type RestaurantDto,
  type TableDto,
} from '@dt/shared';
import { uniqueViolation } from '../../db/errors';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { AppError } from '../../http/errors';
import type { LoadedSession } from '../../security/session';
import type { SessionStore } from '../../security/sessionStore';
import { listActiveEffects } from '../effects/service';
import { headlines } from '../news/news';
import { recordLedger } from '../ledger/ledger';
import { postNews } from '../news/news';
import type { ShardService } from '../shard/service';
import { grantGoods } from '../store/grant';
import type { WorldService } from '../world/service';
import { buffsOf, deviceSlots, incomePage, lastRound, logPage, restNames, tableDto } from './reads';
import { emptyCookbookLevels, initialTables, newRestaurantValues, toRestaurantDto } from './rules';

export interface RestaurantDeps {
  db: Kysely<DB>;
  config: GameConfig;
  bus: EventBus;
  sessions: SessionStore;
  now: () => Date;
}

export function createRestaurantService(d: RestaurantDeps, shards: ShardService, world: WorldService) {
  async function shownIcons(restId: number): Promise<Array<{ key: string; title: string }>> {
    const defs = new Map(d.config.bundle.looks.icons.map((i) => [i.key, i]));
    const rows = await d.db
      .selectFrom('rest_icon')
      .select('icon_key')
      .where('rest_id', '=', restId)
      .where('shown', '=', true)
      .orderBy('id')
      .execute();
    return rows.flatMap((i) => {
      const def = defs.get(i.icon_key);
      return def ? [{ key: def.key, title: def.title }] : [];
    });
  }

  async function overview(restId: number): Promise<RestaurantDto> {
    const row = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
    if (!row) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    const tables = await d.db
      .selectFrom('restaurant_tables')
      .select('tables')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    const now = d.now();
    const effects = await listActiveEffects(d.db, restId, now);
    const snap = await world.ensure(row.shard_id, now);
    const growth = (await shards.settings(row.shard_id)).tuning.growth;
    return toRestaurantDto(row, tables.tables, effects, d.config, {
      devices: await deviceSlots(d.db, d.config, row, now),
      lastRound: await lastRound(d.db, restId),
      weather: { id: snap.weather.id, name: snap.weather.name },
      isPlanktonHost: snap.planktonRestId === restId,
      icons: await shownIcons(restId),
      plaque2Cost: { star: growth.plaque2Star, coin: growth.plaque2Coin, diamond: growth.plaque2Diamond },
      headlines: await headlines(d.db, row.shard_id),
    });
  }

  /** 开店（不碰会话）：HTTP 的 create 和模拟器共用 */
  async function open(accountId: number, shardId: number, rawName: string): Promise<number> {
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
    return d.db.transaction().execute(async (tx) => {
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
        if (constraint === 'restaurant_shard_name') throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
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
      // 新店橱柜是空的，开局食材直接放进去（种类远少于橱柜格数）
      if (defaults.giftFoods.length > 0)
        await tx
          .insertInto('cupboard_food')
          .values(defaults.giftFoods.map((f) => ({ rest_id: id, foods_id: f.id, num: f.num })))
          .execute();
      await recordLedger(
        tx,
        [
          ...defaults.giftGoods.map((g) => ({
            restId: id,
            kind: 'goods' as const,
            itemId: g.id,
            delta: g.num,
            source: 'restaurant.create',
          })),
          ...defaults.giftFoods.map((f) => ({
            restId: id,
            kind: 'foods' as const,
            itemId: f.id,
            delta: f.num,
            source: 'restaurant.create',
          })),
        ],
        now,
      );
      await postNews(tx, { shardId, type: 'restaurant.open', restId: id, params: { name } }, now);
      await d.bus.emit(tx, { name: 'restaurant.created', shardId, restId: id });
      return id;
    });
  }

  return {
    overview,
    async create(session: LoadedSession, rawName: string): Promise<RestaurantDto> {
      const { accountId, shardId } = session.data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      const restId = await open(accountId, shardId, rawName);
      // 区服和餐厅成对写回：期间其他标签页切了区服也不会配错
      await d.sessions.update(session.token, { shardId, restaurantId: restId });
      return overview(restId);
    },

    open,
    async floor(restId: number): Promise<TableDto[]> {
      const r = await d.db
        .selectFrom('restaurant_tables')
        .select('tables')
        .where('rest_id', '=', restId)
        .executeTakeFirstOrThrow();
      const ids = r.tables.flatMap((t) => (t.freeloader ? [t.freeloader.restId] : []));
      const names = await restNames(d.db, ids);
      return r.tables.map((t) => tableDto(t, names));
    },
    income: (restId: number, q: PageQuery) => incomePage(d.db, restId, q),
    buffs: (restId: number) => buffsOf(d.db, d.config, restId, d.now()),
    log: (restId: number, q: PageQuery) => logPage(d.db, restId, q),
  };
}

export type RestaurantService = ReturnType<typeof createRestaurantService>;
