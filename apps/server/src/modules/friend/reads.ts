import { sql, type Kysely } from 'kysely';
import { DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import {
  ErrorCode,
  gameDay,
  type FriendBriefDto,
  type FriendRequestDto,
  type FriendRestDto,
  type FriendsDto,
  type LogPageDto,
  type PageQuery,
  type RestBriefDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { isFriend } from '../../core/pair';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { flipSlots } from '../interact/rules';
import { isEmptyTable } from '../interact/tables';
import { logPage, restNames, tableDto } from '../restaurant/reads';
import { equipDisplayName } from '../equip/hats';
import { iconLive } from './looks';

/** 好友动态：别人对我做的操作（设计文档 §4.10） */
export const FEED_TYPES = [
  'dine.start',
  'dine.expelled',
  'roach.laid',
  'roach.killed',
  'friend.refuel',
  'friend.flip',
  'exchange',
  'thumb',
  'mc.eaten',
  'lesson.taught',
  'friend.apply',
  'friend.accept',
  'yard.helped',
  'yard.stolen',
] as const;
const FEED_DAYS = 3;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function countBy(
  db: Kysely<DB>,
  table: 'dine_dash' | 'cupboard_flip',
  ids: number[],
  now: Date,
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows =
    table === 'dine_dash'
      ? await db
          .selectFrom('dine_dash')
          .select(['host_rest_id as id', sql<number>`count(*)`.as('n')])
          .where('host_rest_id', 'in', ids)
          .groupBy('host_rest_id')
          .execute()
      : await db
          .selectFrom('cupboard_flip')
          .select(['host_rest_id as id', sql<number>`count(*)`.as('n')])
          .where('host_rest_id', 'in', ids)
          .where('cool_until', '>', now)
          .groupBy('host_rest_id')
          .execute();
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

export function createFriendReads(d: GameDeps) {
  async function me(ctx: RestCtx) {
    return d.db
      .selectFrom('restaurant')
      .select(['id', 'shard_id', 'street_id'])
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
  }

  /** 给一批餐厅标上"是否好友 / 是否已申请" */
  async function annotate(
    ctx: RestCtx,
    rows: Array<{ id: number; name: string; level: number; star_level: number; avatar: number | null }>,
  ): Promise<RestBriefDto[]> {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const friends = new Set(
      (
        await d.db
          .selectFrom('friend')
          .select('friend_id')
          .where('rest_id', '=', ctx.restaurantId)
          .where('friend_id', 'in', ids)
          .execute()
      ).map((r) => r.friend_id),
    );
    const requested = new Set(
      (
        await d.db
          .selectFrom('friend_request')
          .select('to_rest')
          .where('from_rest', '=', ctx.restaurantId)
          .where('to_rest', 'in', ids)
          .execute()
      ).map((r) => r.to_rest),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      star: r.star_level,
      avatar: r.avatar,
      isFriend: friends.has(r.id),
      requested: requested.has(r.id),
    }));
  }

  return {
    async list(ctx: RestCtx, sort: 'level' | 'star' | 'recent'): Promise<FriendsDto> {
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.friend;
      const now = d.now();
      const rows = await d.db
        .selectFrom('friend as f')
        .innerJoin('restaurant as r', 'r.id', 'f.friend_id')
        .innerJoin('restaurant_tables as rt', 'rt.rest_id', 'r.id')
        .select([
          'r.id',
          'r.name',
          'r.level',
          'r.star_level',
          'r.avatar',
          'r.npc',
          'r.state',
          'rt.tables',
          'f.created_at',
        ])
        .where('f.rest_id', '=', ctx.restaurantId)
        .execute();
      const ids = rows.map((r) => r.id);
      const diners = await countBy(d.db, 'dine_dash', ids, now);
      const cooling = await countBy(d.db, 'cupboard_flip', ids, now);
      const items: FriendBriefDto[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level,
        star: r.star_level,
        avatar: r.avatar,
        npc: r.npc,
        roaches: r.tables.filter((x) => x.customer === 3).length,
        dineSeat:
          r.state === 1 &&
          r.tables.some(isEmptyTable) &&
          (r.npc || (diners.get(r.id) ?? 0) < t.dine.baseSeats + r.star_level),
        flipReady: Math.max(0, flipSlots(r.star_level, t.flip) - (cooling.get(r.id) ?? 0)),
        since: r.created_at.toISOString(),
      }));
      const key = (x: FriendBriefDto): number =>
        sort === 'star' ? x.star : sort === 'recent' ? Date.parse(x.since) : x.level;
      items.sort((a, b) => Number(b.npc) - Number(a.npc) || key(b) - key(a) || a.id - b.id);
      return { items, count: items.filter((x) => !x.npc).length, max: t.maxFriends };
    },

    async requests(ctx: RestCtx): Promise<FriendRequestDto[]> {
      const rows = await d.db
        .selectFrom('friend_request as q')
        .innerJoin('restaurant as r', 'r.id', 'q.from_rest')
        .select(['r.id', 'r.name', 'r.level', 'r.star_level', 'r.avatar', 'r.npc', 'q.created_at'])
        .where('q.to_rest', '=', ctx.restaurantId)
        .orderBy('q.created_at', 'desc')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level,
        star: r.star_level,
        avatar: r.avatar,
        npc: r.npc,
        at: r.created_at.toISOString(),
      }));
    },

    async search(ctx: RestCtx, q: string): Promise<RestBriefDto[]> {
      const m = await me(ctx);
      const rows = await d.db
        .selectFrom('restaurant')
        .select(['id', 'name', 'level', 'star_level', 'avatar'])
        .where('shard_id', '=', m.shard_id)
        .where('npc', '=', false)
        .where('id', '!=', m.id)
        .where('name', 'ilike', `%${likeEscape(q)}%`)
        .orderBy('level', 'desc')
        .limit(20)
        .execute();
      return annotate(ctx, rows);
    },

    async street(ctx: RestCtx): Promise<RestBriefDto[]> {
      const m = await me(ctx);
      const rows = await d.db
        .selectFrom('restaurant')
        .select(['id', 'name', 'level', 'star_level', 'avatar'])
        .where('shard_id', '=', m.shard_id)
        .where('street_id', '=', m.street_id)
        .where('state', '=', 1)
        .where('npc', '=', false)
        .where('id', '!=', m.id)
        .orderBy(sql`random()`)
        .limit(20)
        .execute();
      return annotate(ctx, rows);
    },

    async detail(ctx: RestCtx, restId: number): Promise<FriendRestDto> {
      const now = d.now();
      const r = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
      if (!r || r.shard_id !== ctx.shardId)
        throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      const tables = (
        await d.db
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', restId)
          .executeTakeFirstOrThrow()
      ).tables;
      const names = await restNames(
        d.db,
        tables.flatMap((x) => (x.freeloader ? [x.freeloader.restId] : [])),
      );
      const iconDefs = new Map(d.config.bundle.looks.icons.map((i) => [i.key, i]));
      const icons = (
        await d.db
          .selectFrom('rest_icon')
          .select('icon_key')
          .where('rest_id', '=', restId)
          .where('shown', '=', true)
          .where(iconLive(d.now()))
          .orderBy('id')
          .execute()
      ).flatMap((i) => {
        const def = iconDefs.get(i.icon_key);
        return def ? [{ key: def.key, title: def.title }] : [];
      });
      const store = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'expires_at'])
        .where('rest_id', '=', restId)
        .where('num', '>', 0)
        .execute();
      const honors = store
        .filter(
          (s) =>
            d.config.goods.get(s.goods_id)?.type === GOODS_TYPE.honor &&
            (s.expires_at === null || s.expires_at > now),
        )
        .map((s) => s.goods_id)
        .sort((x, y) => x - y);
      const plaques = (
        await d.db.selectFrom('restaurant_device').select('goods_id').where('rest_id', '=', restId).execute()
      )
        .map((x) => x.goods_id)
        .filter((id) => {
          const g = d.config.goods.get(id);
          return g?.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque;
        });
      const requested = await d.db
        .selectFrom('friend_request')
        .select('to_rest')
        .where('from_rest', '=', ctx.restaurantId)
        .where('to_rest', '=', restId)
        .executeTakeFirst();
      const thumbed = await d.db
        .selectFrom('thumb')
        .select('to_rest')
        .where('day', '=', gameDay(now))
        .where('from_rest', '=', ctx.restaurantId)
        .where('to_rest', '=', restId)
        .executeTakeFirst();
      const equips = await d.db
        .selectFrom('equip')
        .select(['part', 'goods_id', 'stress', 'custom_name'])
        .where('rest_id', '=', restId)
        .where('worn', '=', true)
        .orderBy('part')
        .execute();
      const cook =
        r.mc_cook_id === null
          ? undefined
          : await d.db
              .selectFrom('mc_cook')
              .select(['id', 'mc_id', 'grade', 'left_num', 'price'])
              .where('id', '=', r.mc_cook_id)
              .executeTakeFirst();
      const ate = cook
        ? await d.db
            .selectFrom('mc_eat')
            .select('cook_id')
            .where('cook_id', '=', cook.id)
            .where('eater_rest_id', '=', ctx.restaurantId)
            .executeTakeFirst()
        : undefined;
      return {
        id: r.id,
        name: r.name,
        level: r.level,
        star: r.star_level,
        streetId: r.street_id,
        renown: r.renown,
        door: r.door,
        avatar: r.avatar,
        notice: r.notice,
        npc: r.npc,
        state: r.state,
        isFriend: restId !== ctx.restaurantId && (await isFriend(d.db, ctx.restaurantId, restId)),
        requested: requested !== undefined,
        icons,
        honors,
        plaques,
        tables: tables.map((x) => tableDto(x, names)),
        thumbedToday: thumbed !== undefined,
        equips: equips.map((e) => ({
          part: e.part,
          goodsId: e.goods_id,
          stress: e.stress,
          name: equipDisplayName(e.goods_id, e.custom_name),
        })),
        special: cook
          ? {
              mcId: cook.mc_id,
              grade: cook.grade,
              leftNum: cook.left_num,
              price: cook.price,
              eaten: ate !== undefined,
            }
          : null,
      };
    },

    feed(ctx: RestCtx, q: PageQuery): Promise<LogPageDto> {
      return logPage(d.db, ctx.restaurantId, q, {
        types: FEED_TYPES,
        since: new Date(d.now().getTime() - FEED_DAYS * 86_400_000),
      });
    },
  };
}
