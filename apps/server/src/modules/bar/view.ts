import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import type { BarDto } from '@dt/shared';
import type { DB, RestaurantRow } from '../../db/schema';
import { resultDto } from './common';
import { cupRound, slotFloorLeft, type BarResult, type BarTuning } from './rules';

export async function barView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: BarTuning,
  now: Date,
): Promise<BarDto> {
  const s = await db.selectFrom('bar_state').selectAll().where('rest_id', '=', rest.id).executeTakeFirst();
  const items = await db
    .selectFrom('store_item')
    .select(['goods_id', 'num', 'expires_at'])
    .where('rest_id', '=', rest.id)
    .where('goods_id', 'in', [GOODS.mysteryTicket, GOODS.krabCoin, GOODS.magicLamp])
    .execute();
  const have = (id: number) => {
    const r = items.find((x) => x.goods_id === id);
    return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
  };
  const acc = await db
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', rest.account_id)
    .executeTakeFirstOrThrow();
  const stats = await db
    .selectFrom('bar_slot_stat')
    .select(['award_id', 'num'])
    .where('rest_id', '=', rest.id)
    .orderBy('award_id')
    .execute();
  const cupResult = (s?.cup_result ?? null) as BarResult | null;
  const total = config.slotPool.total;
  return {
    tickets: have(GOODS.mysteryTicket),
    krabCoins: have(GOODS.krabCoin),
    fg: { result: resultDto(s?.fg_result ?? null), times: s?.fg_times ?? 0 },
    cup: {
      result: resultDto(cupResult),
      times: s?.cup_times ?? 0,
      nextCost: cupRound(cupResult, s?.cup_times ?? 0),
    },
    num: {
      result: resultDto(s?.num_result ?? null),
      times: s?.num_times ?? 0,
      cost: t.numCost,
      max: t.numMax,
    },
    slot: {
      emailVerified: acc.email_verified_at !== null,
      lamp: have(GOODS.magicLamp) > 0,
      floorLeft: slotFloorLeft(s?.slot_fail ?? 0, t),
      pool: config.slotPool.items.map((a) => ({
        id: a.id,
        kind: a.kind,
        itemId: a.itemId,
        rate: a.odds / total,
        rare: a.rare,
      })),
      stats: stats.map((x) => ({ awardId: x.award_id, num: x.num })),
    },
    krabCoinTickets: t.krabCoinTickets,
  };
}
