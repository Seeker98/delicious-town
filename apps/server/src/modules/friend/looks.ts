import type { ExpressionBuilder } from 'kysely';
import { gameDay, gameTime, type MyLooksDto } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { Looks } from '@dt/config';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { emitAction } from '../../core/action';
import { opNews, runOp, setRest, type Op, type OpResult } from '../../core/op';
import { spendCoin } from '../../core/resources';

/** 最多同时展示的个性图标数（规格书 02 §2.8） */
export const MAX_SHOWN_ICONS = 5;

/** 公告栏：去掉换行以外的控制字符，再去掉首尾空白（Review Focus 5） */
export function cleanNotice(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}

/** 限时称号（240-2 发展基金）：到期时间为空是永久，过期的当作没有 */
export const iconLive = (now: Date) => (eb: ExpressionBuilder<DB, 'rest_icon'>) =>
  eb.or([eb('rest_icon.expires_at', 'is', null), eb('rest_icon.expires_at', '>', now)]);

/** 称号商店（240-2）：这一天（游戏日期）正在上架的限定称号，上架 [from, to) */
export function iconsOnSale(looks: Looks, day: string): Looks['icons'] {
  return looks.icons.filter((i) => i.shop !== undefined && i.shop.from <= day && day < i.shop.to);
}

/** 餐厅装扮 */
export function createLooks(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'friend', source }, fn);

  return {
    async mine(ctx: RestCtx): Promise<MyLooksDto> {
      const r = await d.db
        .selectFrom('restaurant')
        .select(['door', 'avatar', 'notice'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const defs = new Map(d.config.bundle.looks.icons.map((i) => [i.key, i]));
      const rows = await d.db
        .selectFrom('rest_icon')
        .select(['id', 'icon_key', 'shown', 'expires_at'])
        .where('rest_id', '=', ctx.restaurantId)
        .where(iconLive(d.now()))
        .orderBy('id')
        .execute();
      const owned = new Set(rows.map((x) => x.icon_key));
      const doors = await d.db
        .selectFrom('rest_door')
        .select('door_id')
        .where('rest_id', '=', ctx.restaurantId)
        .execute();
      return {
        door: r.door,
        // 已拥有的门：默认门 0 人人都有（问题记录 350）
        ownedDoors: [0, ...doors.map((x) => x.door_id)].sort((a, b) => a - b),
        avatar: r.avatar,
        notice: r.notice,
        icons: rows.flatMap((x) => {
          const def = defs.get(x.icon_key);
          return def
            ? [
                {
                  id: x.id,
                  key: def.key,
                  title: def.title,
                  desc: def.desc,
                  shown: x.shown,
                  expiresAt: x.expires_at?.toISOString() ?? null,
                },
              ]
            : [];
        }),
        shop: iconsOnSale(d.config.bundle.looks, gameDay(d.now())).map((i) => ({
          key: i.key,
          title: i.title,
          desc: i.desc,
          coin: i.shop!.coin,
          endsAt: gameTime(i.shop!.to, 0).toISOString(),
          owned: owned.has(i.key),
        })),
      };
    },

    /** 买称号商店里正在上架的限定称号（240-2）：扣银币，进我的称号（默认不展示），发小镇新闻 */
    buyIcon(ctx: RestCtx, key: string) {
      return op(ctx, 'icon.buy', async (o) => {
        const def = iconsOnSale(o.config.bundle.looks, gameDay(o.now)).find((i) => i.key === key);
        if (!def) throw invalidState('icon_not_on_sale', { key });
        const had = await o.tx
          .selectFrom('rest_icon')
          .select('id')
          .where('rest_id', '=', o.rest.id)
          .where('icon_key', '=', key)
          .executeTakeFirst();
        if (had) throw invalidState('icon_owned', { key });
        spendCoin(o, def.shop!.coin);
        await o.tx.insertInto('rest_icon').values({ rest_id: o.rest.id, icon_key: key }).execute();
        opNews(o, 'icon.buy', { key, title: def.title });
        await emitAction(o, 'icon.buy');
        return { key };
      });
    },

    door(ctx: RestCtx, door: number) {
      return op(ctx, 'rest.door', async (o) => {
        const def = o.config.bundle.looks.doors.find((x) => x.id === door);
        if (!def) throw invalidState('bad_look');
        if (door === o.rest.door) throw invalidState('same_door');
        // 买过的门永久拥有：第一次换上时付钱，之后换回来免费（问题记录 350）
        if (door !== 0) {
          const bought = await o.tx
            .insertInto('rest_door')
            .values({ rest_id: o.rest.id, door_id: door, acquired_at: o.now })
            .onConflict((oc) => oc.doNothing())
            .returning('door_id')
            .executeTakeFirst();
          if (bought) spendCoin(o, def.coin);
        }
        setRest(o, 'door', door);
        // 支线“社交”（问题记录 515）：换一次门面，换回默认的门也算
        await emitAction(o, 'looks.door');
        return { door };
      });
    },

    avatar(ctx: RestCtx, avatar: number) {
      return op(ctx, 'rest.avatar', async (o) => {
        if (!o.config.bundle.looks.avatars.some((x) => x.id === avatar)) throw invalidState('bad_look');
        setRest(o, 'avatar', avatar);
        return { avatar };
      });
    },

    notice(ctx: RestCtx, text: string) {
      return op(ctx, 'rest.notice', async (o) => {
        const notice = cleanNotice(text);
        setRest(o, 'notice', notice);
        return { notice };
      });
    },

    iconShow(ctx: RestCtx, iconId: number, shown: boolean) {
      return op(ctx, 'rest.icon', async (o) => {
        const row = await o.tx
          .selectFrom('rest_icon')
          .select('shown')
          .where('id', '=', iconId)
          .where('rest_id', '=', o.rest.id)
          .where(iconLive(o.now))
          .executeTakeFirst();
        if (!row) throw invalidState('not_owned');
        if (shown && !row.shown) {
          const n = await o.tx
            .selectFrom('rest_icon')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('rest_id', '=', o.rest.id)
            .where('shown', '=', true)
            .where(iconLive(o.now))
            .executeTakeFirstOrThrow();
          if (Number(n.n) >= MAX_SHOWN_ICONS) throw limitReached('icons', { max: MAX_SHOWN_ICONS });
        }
        await o.tx.updateTable('rest_icon').set({ shown }).where('id', '=', iconId).execute();
        return { iconId, shown };
      });
    },
  };
}
