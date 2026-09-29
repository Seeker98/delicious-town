import { GOODS } from '@dt/config';
import { hashSeed, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, runSystemOp, type Op } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';

export type MouseStats = {
  triggered: number;
  escaped: number;
  trapped: number;
  stolen: number;
  nothing: number;
  maps: number;
};

type Outcome = 'escaped' | 'trapped' | 'stolen' | 'nothing';

async function visit(op: Op): Promise<{ outcome: Outcome; map: boolean }> {
  const mt = op.tuning.mouse;
  const agg = await opAgg(op);
  const { sum, rate } = await opLuck(op);
  let outcome: Outcome;
  if (op.rng.chance(rate / mt.luckDivisor)) {
    outcome = 'escaped';
    restLog(op, 'mouse.escape');
  } else if (op.rng.chance(agg.trapRate ?? 0)) {
    outcome = 'trapped';
    const coin = Math.floor(op.rest.level * mt.trapCoinPerLevel * (0.5 + op.rng.next()) + sum);
    gainCoin(op, coin, { source: 'mouse.trap', event: false });
    restLog(op, 'mouse.trap', { coin });
  } else {
    const foods = await op.tx
      .selectFrom('cupboard_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', op.rest.id)
      .where('num', '>', 0)
      .where('locked', '=', false)
      .orderBy('foods_id')
      .execute();
    if (foods.length === 0) {
      outcome = 'nothing';
      restLog(op, 'mouse.nothing');
    } else {
      const pick = foods[op.rng.int(foods.length)]!;
      const num = Math.min(pick.num, op.rng.intMin1(2 * op.rest.star_level + 1));
      await subFoods(op, pick.foods_id, num, { source: 'mouse', event: false });
      outcome = 'stolen';
      restLog(op, 'mouse.steal', { foodsId: pick.foods_id, num });
    }
  }
  const map = op.rng.chance(agg.earnMapRate ?? 0);
  if (map) {
    await grantGoodsOp(op, GOODS.adventureMap, 1, { source: 'mouse', event: false });
    restLog(op, 'mouse.map');
  }
  return { outcome, map };
}

/** 老鼠捣乱（规格书 01 §1.9）：先按固定种子判定触发，只对触发的店加锁处理 */
export async function mouseRound(
  d: GameDeps,
  shardId: number,
  period: string,
  now: Date,
): Promise<MouseStats> {
  const { tuning } = await d.shards.settings(shardId);
  const mt = tuning.mouse;
  const rows = await d.db
    .selectFrom('restaurant')
    .select(['id', 'star_level', 'street_id'])
    .where('shard_id', '=', shardId)
    .orderBy('id')
    .execute();
  const stats: MouseStats = { triggered: 0, escaped: 0, trapped: 0, stolen: 0, nothing: 0, maps: 0 };
  for (const r of rows) {
    const rng = seededRng(hashSeed(shardId, 'mouse', period, r.id));
    const rate = (mt.rateBase - mt.ratePerStar * r.star_level) * (r.street_id === 0 ? mt.newbieFactor : 1);
    if (!rng.chance(rate)) continue;
    stats.triggered += 1;
    const res = await runSystemOp(d, shardId, r.id, { source: 'mouse', now, rng }, visit);
    stats[res.outcome] += 1;
    if (res.map) stats.maps += 1;
  }
  return stats;
}
