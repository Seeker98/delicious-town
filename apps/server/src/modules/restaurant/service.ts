import { sql, type Kysely } from 'kysely';
import { isFeatureEnabled, NEWBIE, type GameConfig } from '@dt/config';
import {
  addDays,
  checkRestaurantName,
  ErrorCode,
  gameDay,
  gameTime,
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
import { activeBoosts } from '../activity/boosts';
import { listActiveEffects } from '../effects/service';
import { shownEffects } from '../effects/aggregate';
import { equipOff } from '../equip/power';
import { headlines } from '../news/news';
import { todayBless } from '../town/bless';
import { recordLedger } from '../ledger/ledger';
import { postNews } from '../news/news';
import { npcAccountId } from '../npc/npc';
import type { ShardService } from '../shard/service';
import { grantGoods } from '../store/grant';
import { iconLive } from '../friend/looks';
import { normalizeCounts } from '../settlement/globals';
import type { WorldService } from '../world/service';
import { buffsOf, deviceSlots, incomePage, lastRound, logPage, restNames, tableDto } from './reads';
import { emptyCookbookLevels, initialTables, newRestaurantValues, toRestaurantDto } from './rules';
import { iconDefs } from '../icons/defs';

export interface RestaurantDeps {
  db: Kysely<DB>;
  config: GameConfig;
  bus: EventBus;
  sessions: SessionStore;
  now: () => Date;
}

export function createRestaurantService(d: RestaurantDeps, shards: ShardService, world: WorldService) {
  async function shownIcons(restId: number): Promise<Array<{ key: string; title: string }>> {
    const rows = await d.db
      .selectFrom('rest_icon')
      .select('icon_key')
      .where('rest_id', '=', restId)
      .where('shown', '=', true)
      .where(iconLive(d.now()))
      .orderBy('id')
      .execute();
    const defs = await iconDefs(
      d.db,
      d.config,
      rows.map((i) => i.icon_key),
    );
    return rows.flatMap((i) => {
      const def = defs.get(i.icon_key);
      return def ? [{ key: def.key, title: def.title }] : [];
    });
  }

  async function overview(restId: number): Promise<RestaurantDto> {
    // 被收购时的老板（收购 PR 3：首页提示）、在售特色菜和名下的店身价合计（问题记录 447）一起读出来，不多查询
    const joined = await d.db
      .selectFrom('restaurant as r')
      .leftJoin('acquire_state as s', 's.rest_id', 'r.id')
      .leftJoin('restaurant as o', 'o.id', 's.owner_rest_id')
      .leftJoin('mc_cook as c', 'c.id', 'r.mc_cook_id')
      .selectAll('r')
      .select([
        's.owner_rest_id as acquire_owner_id',
        'o.name as acquire_owner_name',
        'c.mc_id as special_id',
        'c.level as special_level',
        'c.left_num as special_left',
        'c.ended_at as special_ended',
        // 和投资榜一样：每家身价先四舍五入（floor(x + 0.5)，和 JS 的 Math.round 一致）再加
        (eb) =>
          eb
            .selectFrom('acquire_state as h')
            .select(sql<string>`coalesce(sum(floor(h.base * h.heat + 0.5)), 0)`.as('v'))
            .whereRef('h.owner_rest_id', '=', 'r.id')
            .as('acquire_assets'),
      ])
      .where('r.id', '=', restId)
      .executeTakeFirst();
    if (!joined) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    const {
      acquire_owner_id: ownerId,
      acquire_owner_name: ownerName,
      special_id: specialId,
      special_level: specialLevel,
      special_left: specialLeft,
      special_ended: specialEnded,
      acquire_assets: assets,
      ...row
    } = joined;
    const now = d.now();
    // 其余十来条查询互不依赖，一起发（质量期 ③：首页最常用的接口，原来一条接一条，查询时间占了八成）
    const settingsP = shards.settings(row.shard_id);
    const [tables, effects, snap, settings, devices, last, icons, news, boosts, today] = await Promise.all([
      d.db
        .selectFrom('restaurant_tables')
        .select('tables')
        .where('rest_id', '=', restId)
        .executeTakeFirstOrThrow(),
      listActiveEffects(d.db, restId, now),
      world.ensure(row.shard_id, now),
      settingsP,
      deviceSlots(d.db, d.config, row, now),
      lastRound(d.db, restId),
      shownIcons(restId),
      settingsP.then((st) =>
        headlines(d.db, row.shard_id, {
          daily: isFeatureEnabled(st, 'daily'),
          now,
          broadcastHours: st.tuning.town.broadcast.homeHours,
        }),
      ),
      // 正在生效的全服加成单独列（问题记录 294）；区服关掉限时活动时加成也不生效，不列
      settingsP.then((st) => (isFeatureEnabled(st, 'activity') ? activeBoosts(d.db, row.shard_id, now) : [])),
      todayBless(d.db, d.config, row.shard_id, now),
    ]);
    const tuning = settings.tuning;
    const growth = tuning.growth;
    const dto = toRestaurantDto(row, tables.tables, shownEffects(effects, equipOff(settings)), d.config, {
      devices,
      lastRound: last,
      weather: { id: snap.weather.id, name: snap.weather.name },
      isPlanktonHost: snap.planktonRestId === restId,
      icons,
      plaque2Cost: { star: growth.plaque2Star, coin: growth.plaque2Coin, diamond: growth.plaque2Diamond },
      cookfoodsPerFlag: tuning.settlement.cookfoodsPerFlag,
      headlines: news,
      boosts: boosts.map((b) => ({
        id: b.id,
        title: b.title,
        items: b.items,
        endsAt: b.endsAt.toISOString(),
      })),
      acquireOwner:
        ownerId !== null && isFeatureEnabled(settings, 'acquire')
          ? { restId: ownerId, name: ownerName ?? '' }
          : null,
      assets: isFeatureEnabled(settings, 'acquire') ? Number(assets ?? 0) : null,
      cookbooks: { learned: normalizeCounts(row.cookbook_counts).learned, total: d.config.cookbooks.size },
      // 和赛厨一样：卖完或倒掉的不算在售（tower/sides.ts mcOf）
      special:
        specialId !== null && specialLevel !== null && (specialLeft ?? 0) > 0 && specialEnded === null
          ? { id: specialId, level: specialLevel }
          : null,
      disabledFeatures: Object.entries(settings.features)
        .filter(([, on]) => on === false)
        .map(([k]) => k)
        .sort(),
    });
    if (today)
      dto.effects.unshift({
        sourceType: 'bless',
        sourceId: today.bless.id,
        // 只给星愿名，"今日星愿："前缀由前端按语言加（问题记录 272）
        name: today.bless.name,
        effects: today.bless.buff,
        expiresAt: gameTime(addDays(gameDay(now), 1), 0).toISOString(),
      });
    return dto;
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
        .values({ rest_id: id, levels: emptyCookbookLevels(d.config.cookbookIndex.slots) })
        .execute();
      for (const gift of defaults.giftGoods) await grantGoods(tx, d.config, id, gift.id, gift.num, now);
      // 开局送了新手大礼包时，老店补领的新手码记成本店已领（问题记录 331）：大礼包一次只能拿一个，
      // 不拆就兑换会被丢掉，拆了再兑换又多拿一份。不加已用次数，后台看到的是补领的店数
      if (defaults.giftGoods.some((g) => g.id === NEWBIE.pack)) {
        const code = await tx
          .selectFrom('redeem_code')
          .select('id')
          .where('code', '=', NEWBIE.packCode)
          .where('actor_account_id', '=', await npcAccountId(d.db))
          .executeTakeFirst();
        if (code)
          await tx
            .insertInto('redeem_use')
            .values({ code_id: code.id, rest_id: id, account_id: accountId })
            .execute();
      }
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
    income: (restId: number, q: PageQuery) => incomePage(d.db, restId, q, d.now()),
    buffs: async (ctx: { shardId: number; restaurantId: number }) =>
      buffsOf(d.db, d.config, ctx.restaurantId, d.now(), equipOff(await shards.settings(ctx.shardId))),
    log: (restId: number, q: PageQuery) => logPage(d.db, restId, q),
  };
}

export type RestaurantService = ReturnType<typeof createRestaurantService>;
