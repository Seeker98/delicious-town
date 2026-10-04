import { GOODS, type GameConfig } from '@dt/config';
import type { ExploreResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opLuck } from '../../core/luck';
import { opNeedPick } from '../../core/scarcity';
import { opNews, type Op } from '../../core/op';
import { gainExp, spendStrength } from '../../core/resources';
import { restGear, suitEffect } from '../equip/power';
import { consumeGoods, hasValidHonor } from '../store/goods';
import { addFoodsMerged, badInput, bump, pickFood, toList } from './common';
import { exploreAwardNum, exploreRate, exploreSplit } from './rules';

/** 本街勋章上的神秘食材概率（摩洛哥街 +2%，问题记录 284）；店一直持有所在街道的勋章 */
export function streetMysteriousRate(config: GameConfig, streetId: number): number {
  return config.requireGoods(config.streetMedalId(streetId)).effects.mysteriousRate ?? 0;
}

/** 探险（规格书 09 §9.2，设计文档 §3.2） */
export async function exploreMaps(
  o: Op,
  weather: Record<string, number>,
  b: { goodsId: number; times: number },
): Promise<ExploreResultDto> {
  const def = o.config.maps.get(b.goodsId);
  if (!def) throw badInput('not_map');
  await consumeGoods(o, b.goodsId, b.times);
  spendStrength(o, def.needStrength * b.times);
  const { rate: luck } = await opLuck(o);
  const needle = await hasValidHonor(o, GOODS.needle);
  const lamp = await hasValidHonor(o, GOODS.lamp);
  const card = await hasValidHonor(o, GOODS.securityCard);
  const starKey = await hasValidHonor(o, GOODS.starKey);
  const book = b.goodsId === GOODS.mapHigh && (await hasValidHonor(o, GOODS.exploreBook));
  const eff = (id: number, key: string) => o.config.requireGoods(id).effects[key] ?? 0;
  const gear = await restGear(o.tx, o.rest, o.config.suits);
  const rate = exploreRate(def, {
    needle,
    lostRate: weather.mapLostRate ?? 0,
    suitRate: suitEffect(gear.suits, 'exploreSuccessRate'),
  });
  const rareRate =
    def.mysteriousRate +
    (lamp ? eff(GOODS.lamp, 'mysteriousRate') : 0) +
    (needle ? eff(GOODS.needle, 'mysteriousRate') : 0) +
    (card ? eff(GOODS.securityCard, 'mysteriousRate') : 0) +
    streetMysteriousRate(o.config, o.rest.street_id) +
    (weather.mysteriousRate ?? 0);
  const level3 = book ? eff(GOODS.exploreBook, 'mapL3FoodsNumAdd') : 0;

  let success = 0;
  let fail = 0;
  const rare = new Map<number, number>();
  const foods = new Map<number, number>();
  // 个人缺料倾向（问题记录 50）
  const needPick = await opNeedPick(o);
  for (let i = 0; i < b.times; i++) {
    if (!o.rng.chance(rate + luck / 12)) {
      fail += 1;
      continue;
    }
    success += 1;
    if (o.rng.chance(rareRate + luck / 20)) {
      const id = pickFood(o, 7, needPick);
      bump(rare, id, starKey && o.rng.chance(0.5) ? 2 : 1);
    }
    for (const x of exploreSplit(def, exploreAwardNum(def, starKey, o.rng)))
      for (let k = 0; k < x.num; k++) bump(foods, pickFood(o, x.level, needPick));
    for (let k = 0; k < level3; k++) bump(foods, pickFood(o, 3, needPick));
  }
  await addFoodsMerged(o, rare);
  await addFoodsMerged(o, foods);
  const exp = lamp ? def.needStrength * o.rest.level * (success * 5 + fail * 2) : 0;
  if (exp > 0) gainExp(o, exp);
  if (rare.size > 0) opNews(o, 'temple.explore.rare', { foods: toList(rare) });
  await emitAction(o, 'temple.explore', b.times);
  return { success, fail, rare: toList(rare), foods: toList(foods), exp };
}
