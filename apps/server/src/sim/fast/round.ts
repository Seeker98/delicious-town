import { toSettleInput, type SettleSource } from '../../modules/settlement/globals';
import { settleRestaurant } from '../../modules/settlement/settle';
import { strengthGain } from '../../modules/settlement/strength';
import type { SettleGlobals } from '../../modules/settlement/types';
import { aggOf, gainCoin, gainExp, gainOil, gainRenown, grantGoods, spendCoin, subFoods } from './ops';
import type { FastCtx, FastRest } from './state';

/** 从内存状态组出结算源；字段和 settlement/runner.ts 的 settleOne 一一对应 */
export function fastSettleSource(r: FastRest, agg: Record<string, number>, now: Date): SettleSource {
  return {
    rest: {
      id: r.id,
      level: r.level,
      star: r.star,
      oil: r.oil,
      oilMax: r.oilMax,
      coin: r.coin,
      streetId: r.streetId,
      renown: r.renown,
      luck: r.luck,
      cteOn: r.cteOn,
      cookfoodsFlag: r.cookfoodsFlag,
    },
    tables: r.tables,
    levels: r.levels,
    counts: r.counts,
    agg,
    // 快速模型不卖特色菜（设计 §3）
    special: null,
    cupboard: r.cookfoodsFlag > 0 ? new Map([...r.foods].filter(([, n]) => n > 0)) : null,
    now,
  };
}

/** 一轮结算写回，规则和 settleOne 一致：停业不入账；银币最低到 0；经验升级；掉落进仓库；自动加油 */
export function settleRound(c: FastCtx, r: FastRest, g: SettleGlobals): 'settled' | 'closed' | 'skipped' {
  if (r.state !== 1) return 'skipped';
  const agg = aggOf(c, r);
  const res = settleRestaurant(toSettleInput(fastSettleSource(r, agg, c.now)), g, c.rng);
  if (res.closed) {
    r.state = 2;
    return 'closed';
  }
  r.tables = res.tables;
  gainCoin(c, r, res.coin, 'settlement');
  gainExp(c, r, res.exp, 'settlement');
  if (res.oil > 0) r.oil -= res.oil;
  if (res.renown !== 0) gainRenown(c, r, res.renown);
  for (const d of res.drops) grantGoods(c, r, d.goodsId, d.num, 'settlement', d.hours);
  for (const f of res.foodsUsed) subFoods(c, r, f.foodsId, f.num);
  autoRefuel(c, r, agg);
  return 'settled';
}

/** 自动加油（runner.ts 的 autoRefuel） */
function autoRefuel(c: FastCtx, r: FastRest, agg: Record<string, number>): void {
  if ((agg.autoAddOil ?? 0) <= 0) return;
  if (r.oil >= c.tuning.settlement.autoRefuelThreshold) return;
  const need = r.oilMax - r.oil;
  if (need <= 0 || r.coin < need) return;
  spendCoin(c, r, need, 'oil.auto');
  gainOil(c, r, need);
}

/** 体力恢复（settlement/strength.ts 的 strengthGain） */
export function regenRound(c: FastCtx, r: FastRest): void {
  const g = strengthGain(
    { strength: r.strength, strength_max: r.strengthMax, luck: r.luck },
    aggOf(c, r),
    c.tuning,
    c.rng,
  );
  if (g) r.strength = Math.min(r.strength + g.add, g.cap);
}
