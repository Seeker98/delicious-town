import { GOODS, type MysteriousCookbook } from '@dt/config';
import {
  buildPool,
  gameDay,
  gameParts,
  type KrakenFeedDto,
  type TentacleShopDto,
  type WeightedPool,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import type { TentacleSlot } from '../../db/schema';
import { consumeSpecial, currentCook } from '../mysterious/cook';
import { addRemnant } from '../mysterious/remnant';
import { consumeGoods, countGoods, grantGoodsOp } from '../store/goods';
import { addSeeds, badInput } from './common';
import {
  inFeedHours,
  krakenFavor,
  krakenTarget,
  pickSeeds,
  pickShopSlots,
  relationOf,
  seedCount,
  type TempleTuning,
} from './rules';

/** 负好感度惩罚：扣试炼经验 → 扣试炼价值 → 概率遗忘（设计文档 裁定 10）；这道菜已不在则跳过 */
async function punish(o: Op, mcId: number, t: TempleTuning): Promise<KrakenFeedDto['punish']> {
  const row = await o.tx
    .selectFrom('rest_mc')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('mc_id', '=', mcId)
    .executeTakeFirst();
  if (!row) return null;
  const sub = o.rng.intMin1(3);
  if (row.trial_exp > 0) {
    await o.tx
      .updateTable('rest_mc')
      .set({ trial_exp: Math.max(0, row.trial_exp - sub) })
      .where('rest_id', '=', o.rest.id)
      .where('mc_id', '=', mcId)
      .execute();
    return { kind: 'exp', value: Math.min(sub, row.trial_exp) };
  }
  if (row.trial_worth > 0) {
    await o.tx
      .updateTable('rest_mc')
      .set({ trial_worth: Math.max(0, row.trial_worth - sub) })
      .where('rest_id', '=', o.rest.id)
      .where('mc_id', '=', mcId)
      .execute();
    return { kind: 'worth', value: Math.min(sub, row.trial_worth) };
  }
  if (o.rng.chance(t.forgetRate)) {
    await o.tx.deleteFrom('rest_mc').where('rest_id', '=', o.rest.id).where('mc_id', '=', mcId).execute();
    restLog(o, 'kraken.forget', { mcId });
    return { kind: 'forget', value: 0 };
  }
  return null;
}

/** 投喂克拉肯（规格书 09 §9.5，设计文档 §3.4） */
export async function feedKraken(
  o: Op,
  pool: WeightedPool<MysteriousCookbook>,
  b: { num: number },
): Promise<KrakenFeedDto> {
  const t = o.tuning.temple;
  if (o.rest.star_level < 1) throw requirement('star', { need: 1, have: o.rest.star_level });
  if (!inFeedHours(gameParts(o.now).hour, t.krakenHours)) throw invalidState('not_feed_time');
  const day = gameDay(o.now);
  const fed = await o.tx
    .selectFrom('kraken_feed')
    .select('id')
    .where('rest_id', '=', o.rest.id)
    .where('day', '=', day)
    .executeTakeFirst();
  if (fed) throw invalidState('fed_today');
  const cook = await currentCook(o);
  if (!cook) throw invalidState('no_cooking');
  if (cook.left_num <= b.num) throw invalidState('portions', { left: cook.left_num });

  const target = krakenTarget(pool, o.shardId, day);
  const mc = o.config.requireMc(cook.mc_id);
  const relation = relationOf(mc, target);
  const { rate: luck } = await opLuck(o);
  const { favor } = krakenFavor(
    { num: b.num, level: mc.level, price: cook.price, grade: cook.grade, relation, luckRate: luck },
    t,
    o.rng,
  );
  await consumeSpecial(o, cook.id, b.num, 'sold');
  const n = seedCount(favor);
  const seeds = pickSeeds(o.config.seedPool, n, o.rng);
  for (const [id, k] of seeds) await addSeeds(o, id, k);
  let krabCoin = 0;
  if (n > 5 && o.rng.chance(t.krabCoinRate + luck / 5)) {
    krabCoin = o.rng.intMin1(Math.floor(n / 4));
    await grantGoodsOp(o, GOODS.krabCoin, krabCoin);
  }
  const penalty = favor < 0 ? await punish(o, mc.id, t) : null;
  const tentacle = favor > t.tentacleFavor && o.rng.chance(t.tentacleRate);
  if (tentacle) await grantGoodsOp(o, GOODS.tentacle, 1);
  await o.tx
    .insertInto('kraken_feed')
    .values({
      rest_id: o.rest.id,
      shard_id: o.shardId,
      day,
      mc_id: mc.id,
      target_mc_id: target.id,
      num: b.num,
      favor,
      created_at: o.now,
    })
    .execute();
  await emitAction(o, 'kraken.feed');
  // 神殿支线（问题记录 515）：好感过了掉触手的门槛记一次；拿到触手另记
  if (favor > t.tentacleFavor) await emitAction(o, 'kraken.favorHigh');
  if (tentacle) await emitAction(o, 'kraken.tentacle');
  return {
    relation,
    favor,
    seeds: [...seeds].map(([seedId, num]) => ({ seedId, num })),
    krabCoin,
    tentacle,
    punish: penalty,
  };
}

function shopPool(o: Op): WeightedPool<MysteriousCookbook> {
  const skip = new Set(o.tuning.temple.shopExclude);
  return buildPool(
    o.config.bundle.mysteriousCookbooks.filter((m) => !skip.has(m.id)),
    (m) => m.odds,
  );
}

/** 当天的触手商店；第一次打开时生成（设计文档 裁定 12） */
async function shopRow(o: Op): Promise<{ day: string; refreshes: number; slots: TentacleSlot[] }> {
  const day = gameDay(o.now);
  const row = await o.tx
    .selectFrom('tentacle_shop')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('day', '=', day)
    .executeTakeFirst();
  if (row) return { day, refreshes: row.refreshes, slots: row.slots };
  const slots = pickShopSlots(shopPool(o), o.tuning.temple.shopSlots, o.rng).map((mcId) => ({
    mcId,
    bought: false,
  }));
  await o.tx
    .insertInto('tentacle_shop')
    .values({ rest_id: o.rest.id, day, slots: JSON.stringify(slots) })
    .execute();
  return { day, refreshes: 0, slots };
}

async function shopDto(o: Op, r: { refreshes: number; slots: TentacleSlot[] }): Promise<TentacleShopDto> {
  return {
    slots: r.slots,
    refreshes: r.refreshes,
    refreshCost: r.refreshes === 0 ? 0 : 1,
    tentacles: await countGoods(o, GOODS.tentacle),
  };
}

async function saveShop(o: Op, day: string, refreshes: number, slots: TentacleSlot[]): Promise<void> {
  await o.tx
    .updateTable('tentacle_shop')
    .set({ refreshes, slots: JSON.stringify(slots) })
    .where('rest_id', '=', o.rest.id)
    .where('day', '=', day)
    .execute();
}

export async function tentacleShop(o: Op): Promise<TentacleShopDto> {
  return shopDto(o, await shopRow(o));
}

export async function refreshTentacleShop(o: Op): Promise<TentacleShopDto> {
  const r = await shopRow(o);
  if (r.refreshes > 0) await consumeGoods(o, GOODS.tentacle, 1);
  const slots = pickShopSlots(shopPool(o), o.tuning.temple.shopSlots, o.rng).map((mcId) => ({
    mcId,
    bought: false,
  }));
  await saveShop(o, r.day, r.refreshes + 1, slots);
  return shopDto(o, { refreshes: r.refreshes + 1, slots });
}

export async function exchangeTentacle(o: Op, b: { slot: number }): Promise<TentacleShopDto> {
  const r = await shopRow(o);
  const s = r.slots[b.slot];
  if (!s) throw badInput('bad_slot');
  if (s.bought) throw invalidState('slot_bought');
  const mc = o.config.requireMc(s.mcId);
  await consumeGoods(o, GOODS.tentacle, mc.level);
  await addRemnant(o, mc.id, 1);
  const slots = r.slots.map((x, i) => (i === b.slot ? { ...x, bought: true } : x));
  await saveShop(o, r.day, r.refreshes, slots);
  return shopDto(o, { refreshes: r.refreshes, slots });
}
