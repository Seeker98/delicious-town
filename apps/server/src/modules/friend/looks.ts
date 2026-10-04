import { gameDay, gameTime, type MyLooksDto } from '@dt/shared';
import type { Looks } from '@dt/config';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, runOp, setRest, type Op, type OpResult } from '../../core/op';
import { spendCoin } from '../../core/resources';

/** 最多同时展示的个性图标数（规格书 02 §2.8） */
export const MAX_SHOWN_ICONS = 5;

/** 公告栏：去掉换行以外的控制字符，再去掉首尾空白（Review Focus 5） */
export function cleanNotice(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}

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
        .select(['id', 'icon_key', 'shown'])
        .where('rest_id', '=', ctx.restaurantId)
        .orderBy('id')
        .execute();
      const owned = new Set(rows.map((x) => x.icon_key));
      return {
        door: r.door,
        avatar: r.avatar,
        notice: r.notice,
        icons: rows.flatMap((x) => {
          const def = defs.get(x.icon_key);
          return def ? [{ id: x.id, key: def.key, title: def.title, desc: def.desc, shown: x.shown }] : [];
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
        return { key };
      });
    },

    door(ctx: RestCtx, door: number) {
      return op(ctx, 'rest.door', async (o) => {
        const def = o.config.bundle.looks.doors.find((x) => x.id === door);
        if (!def) throw invalidState('bad_look');
        if (door === o.rest.door) throw invalidState('same_door');
        spendCoin(o, def.coin);
        setRest(o, 'door', door);
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
          .executeTakeFirst();
        if (!row) throw invalidState('not_owned');
        if (shown && !row.shown) {
          const n = await o.tx
            .selectFrom('rest_icon')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('rest_id', '=', o.rest.id)
            .where('shown', '=', true)
            .executeTakeFirstOrThrow();
          if (Number(n.n) >= MAX_SHOWN_ICONS) throw limitReached('icons', { max: MAX_SHOWN_ICONS });
        }
        await o.tx.updateTable('rest_icon').set({ shown }).where('id', '=', iconId).execute();
        return { iconId, shown };
      });
    },
  };
}
