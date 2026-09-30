import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import type { SeedsDto } from '@dt/shared';
import { invalidState } from '../../core/errors';
import type { Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { consumeGoods } from '../store/goods';
import { addSeeds } from '../temple/common';
import { badInput } from './common';
import { seedPrice, type YardTuning } from './rules';

/** 神秘种子（7 级）不在商店卖（裁定 1） */
const SHOP_MAX_LEVEL = 5;

/** 种子页（设计文档 §3.6） */
export async function seedsView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: YardTuning,
): Promise<SeedsDto> {
  const stock = await db
    .selectFrom('rest_seed')
    .select(['seed_id', 'num'])
    .where('rest_id', '=', rest.id)
    .where('num', '>', 0)
    .orderBy('seed_id')
    .execute();
  const essence = await db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', rest.id)
    .where('goods_id', '=', GOODS.formulaEssence)
    .executeTakeFirst();
  return {
    stock: stock.map((s) => ({ seedId: s.seed_id, num: s.num })),
    shop: {
      open: t.seedShop,
      items: config.bundle.seeds
        .filter((s) => s.level <= SHOP_MAX_LEVEL)
        .map((s) => ({ seedId: s.id, price: seedPrice(s.coin, t) })),
    },
    exchange: config.bundle.seedExchange.map((e) => ({ ...e })),
    essence: essence?.num ?? 0,
    coin: rest.coin,
  };
}

/** 种子商店（裁定 1）：单价 × 数量银币 */
export async function buySeed(o: Op, b: { seedId: number; num: number }): Promise<{ coin: number }> {
  const t = o.tuning.yard;
  if (!t.seedShop) throw invalidState('seed_shop_closed');
  const seed = o.config.seeds.get(b.seedId);
  if (!seed) throw badInput('no_seed');
  if (seed.level > SHOP_MAX_LEVEL) throw invalidState('seed_not_sold');
  const coin = seedPrice(seed.coin, t) * b.num;
  spendCoin(o, coin);
  await addSeeds(o, seed.id, b.num);
  return { coin };
}

/** 配方精华换种子（规格书 20 §20.8，裁定 5）：精华不足一律不能换 */
export async function exchangeSeed(o: Op, b: { seedId: number; times: number }): Promise<{ seeds: number }> {
  const e = o.config.seedExchange.get(b.seedId);
  if (!e) throw badInput('no_exchange');
  await consumeGoods(o, GOODS.formulaEssence, e.essence * b.times);
  const seeds = e.seedNum * b.times;
  await addSeeds(o, e.seedId, seeds);
  return { seeds };
}
