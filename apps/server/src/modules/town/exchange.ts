import { sql, type Kysely } from 'kysely';
import { GOODS, type GameConfig, type Tuning } from '@dt/config';
import type { TicketResultDto, TownExchangeDto, TownExchangeResultDto } from '@dt/shared';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { addFoods, addFoodsMany } from '../cupboard/foods';
import { assertStoreRoom, consumeGoods, grantGoodsOp } from '../store/goods';
import { levelFoodIds, mysteryFoodIds } from './rules';

/** 持有数（过期的勋章算 0） */
export async function goodsCounts(
  db: Kysely<DB>,
  restId: number,
  ids: number[],
  now: Date,
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom('store_item')
    .select(['goods_id', 'num', 'expires_at'])
    .where('rest_id', '=', restId)
    .where('goods_id', 'in', ids)
    .execute();
  return new Map(rows.map((r) => [r.goods_id, r.expires_at !== null && r.expires_at <= now ? 0 : r.num]));
}

/** 兑换页（设计文档 §3.6） */
export async function exchangeView(
  db: Kysely<DB>,
  config: GameConfig,
  town: Tuning['town'],
  restId: number,
  now: Date,
): Promise<TownExchangeDto> {
  const list = [...config.goodsExchange.values()].sort((a, b) => a.id - b.id);
  const levels = [1, 2, 3, 4, 5];
  const ids = new Set<number>([GOODS.mysteryFoodExchange, ...levels.map((l) => GOODS.levelTicketBase + l)]);
  for (const e of list) for (const n of e.need) ids.add(n.goodsId);
  const have = await goodsCounts(db, restId, [...ids], now);
  const usedRows = await db
    .selectFrom('town_exchange_use')
    .select(['exchange_id', 'times'])
    .where('rest_id', '=', restId)
    .execute();
  const used = new Map(usedRows.map((r) => [r.exchange_id, r.times]));
  return {
    items: list.map((e) => ({
      id: e.id,
      category: e.category,
      goodsId: e.goodsId,
      num: e.num,
      need: e.need.map((n) => ({ goodsId: n.goodsId, num: n.num, have: have.get(n.goodsId) ?? 0 })),
      times: e.times,
      used: used.get(e.id) ?? 0,
    })),
    levelTickets: levels.map((l) => have.get(GOODS.levelTicketBase + l) ?? 0),
    mysteryTickets: have.get(GOODS.mysteryFoodExchange) ?? 0,
    levelFoods: levels.map((l) => levelFoodIds(config, town, l)),
    mysteryFoods: mysteryFoodIds(config, town),
    maxNum: town.exchangeMaxNum,
  };
}

/** 镇长兑换：检查顺序 兑换项 → 份数上限 → 限兑次数 → 仓库空位 → 扣材料（不够整单回滚）→ 给道具 */
export async function doExchange(o: Op, id: number, num: number): Promise<TownExchangeResultDto> {
  const e = o.config.goodsExchange.get(id);
  if (!e) throw invalidState('no_exchange');
  const max = o.tuning.town.exchangeMaxNum;
  if (num > max) throw limitReached('batch', { max });
  const row = await o.tx
    .selectFrom('town_exchange_use')
    .select('times')
    .where('rest_id', '=', o.rest.id)
    .where('exchange_id', '=', id)
    .executeTakeFirst();
  const used = row?.times ?? 0;
  if (e.times > 0 && used + num > e.times) throw limitReached('exchange', { max: e.times, used });
  await assertStoreRoom(o, e.goodsId);
  for (const n of e.need) await consumeGoods(o, n.goodsId, n.num * num);
  const got = e.num * num;
  await grantGoodsOp(o, e.goodsId, got);
  await o.tx
    .insertInto('town_exchange_use')
    .values({ rest_id: o.rest.id, exchange_id: id, times: num })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'exchange_id'])
        .doUpdateSet({ times: sql<number>`town_exchange_use.times + ${num}` }),
    )
    .execute();
  if (e.news) opNews(o, 'town.exchange', { exchangeId: id, goodsId: e.goodsId, num: got });
  restLog(o, 'town.exchange', { exchangeId: id, num });
  return { goodsId: e.goodsId, num: got };
}

/** N 级食材兑换券：同一种食材的多次选择合并；合计扣券 */
export async function useLevelTicket(
  o: Op,
  level: number,
  picks: Array<{ foodsId: number; num: number }>,
): Promise<TicketResultDto> {
  const allowed = new Set(levelFoodIds(o.config, o.tuning.town, level));
  const merged = new Map<number, number>();
  for (const p of picks) {
    if (!allowed.has(p.foodsId)) throw invalidState('foods_not_allowed', { foodsId: p.foodsId });
    merged.set(p.foodsId, (merged.get(p.foodsId) ?? 0) + p.num);
  }
  const total = [...merged.values()].reduce((s, x) => s + x, 0);
  await consumeGoods(o, GOODS.levelTicketBase + level, total);
  await addFoodsMany(o, merged);
  restLog(o, 'town.levelTicket', { level, total });
  return { foods: [...merged].map(([foodsId, num]) => ({ foodsId, num })) };
}

/** 神秘食材兑换券：1 张换 1 个 7 级食材 */
export async function useMysteryTicket(o: Op, foodsId: number): Promise<TicketResultDto> {
  if (!mysteryFoodIds(o.config, o.tuning.town).includes(foodsId))
    throw invalidState('foods_not_allowed', { foodsId });
  await consumeGoods(o, GOODS.mysteryFoodExchange, 1);
  await addFoods(o, foodsId, 1);
  restLog(o, 'town.mysteryTicket', { foodsId });
  return { foods: [{ foodsId, num: 1 }] };
}
