import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { gameDay, type RenownShopDto } from '@dt/shared';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opNews, type Op } from '../../core/op';
import { gainRenown } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { mondayOf } from '../friend/weekly';
import { countGoods, grantGoodsOp } from '../store/goods';
import { KEY, badInput } from './common';
import { shopOnSale } from './rules';

export async function shopView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  now: Date,
): Promise<RenownShopDto> {
  const day = gameDay(now);
  const items = shopOnSale(config.bundle.renownShop, day);
  if (items.length === 0) return { renown: rest.renown, items: [] };
  const counts = await db
    .selectFrom('daily_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', rest.id)
    .where('day', '=', mondayOf(day))
    .where('key', 'like', 'renownShop:%')
    .execute();
  const held = await db
    .selectFrom('store_item')
    .select(['goods_id', 'expires_at'])
    .where('rest_id', '=', rest.id)
    .where('num', '>', 0)
    .where(
      'goods_id',
      'in',
      items.map((x) => x.goodsId),
    )
    .execute();
  return {
    renown: rest.renown,
    items: items.map((x) => ({
      goodsId: x.goodsId,
      renown: x.renown,
      weeklyLimit: x.weeklyLimit,
      bought: counts.find((c) => c.key === KEY.shop(x.goodsId))?.count ?? 0,
      rare: x.rare,
      owned:
        x.rare && held.some((h) => h.goods_id === x.goodsId && (h.expires_at === null || h.expires_at > now)),
    })),
  };
}

/** 兑换（设计文档 §3.5）：本周在售；稀有品一次 1 个且没有拥有（计划裁定 2）；每周限兑；扣声望 */
export async function buyShop(o: Op, goodsId: number, num: number): Promise<{ renown: number }> {
  const day = gameDay(o.now);
  const item = shopOnSale(o.config.bundle.renownShop, day).find((x) => x.goodsId === goodsId);
  if (!item) throw invalidState('not_on_sale');
  if (item.rare) {
    if (num !== 1) throw badInput('num');
    if ((await countGoods(o, goodsId)) > 0) throw limitReached('owned');
  }
  const week = mondayOf(day);
  const bought = await getDaily(o.tx, o.rest.id, KEY.shop(goodsId), week);
  if (bought + num > item.weeklyLimit) throw limitReached('weekly', { max: item.weeklyLimit });
  const cost = item.renown * num;
  if (o.rest.renown < cost) throw notEnough('renown', cost, o.rest.renown);
  gainRenown(o, -cost);
  await grantGoodsOp(o, goodsId, num);
  await incrementDaily(o.tx, o.rest.id, KEY.shop(goodsId), num, week);
  if (item.rare) opNews(o, 'tower.shop.rare', { goodsId });
  return { renown: o.rest.renown };
}
