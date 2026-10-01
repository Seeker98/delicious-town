import { toSettleInput, type SettleSource } from '../../modules/settlement/globals';
import { settleRestaurant } from '../../modules/settlement/settle';
import { strengthGain } from '../../modules/settlement/strength';
import type { SettleGlobals } from '../../modules/settlement/types';
import { GOODS } from '@dt/config';
import {
  aggOf,
  gainCoin,
  gainExp,
  gainOil,
  gainRenown,
  grantGoods,
  luckOf,
  spendCoin,
  subFoods,
} from './ops';
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

/**
 * 老鼠捣乱一次（settlement/mouse.ts 的 visit）：按幸运逃走；有捕鼠夹按概率抓住给银币；
 * 否则从数量大于 0 的食材里随机偷 1~(2×星级+1) 个（快速模型的机器人不锁食材）；另有概率掉探险图
 */
export function mouseVisit(c: FastCtx, r: FastRest): 'escaped' | 'trapped' | 'stolen' | 'nothing' {
  const mt = c.tuning.mouse;
  const agg = aggOf(c, r);
  const { sum, rate } = luckOf(c, r);
  let out: 'escaped' | 'trapped' | 'stolen' | 'nothing';
  if (c.rng.chance(rate / mt.luckDivisor)) out = 'escaped';
  else if (c.rng.chance(agg.trapRate ?? 0)) {
    gainCoin(c, r, Math.floor(r.level * mt.trapCoinPerLevel * (0.5 + c.rng.next()) + sum), 'mouse.trap');
    out = 'trapped';
  } else {
    const foods = [...r.foods].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]);
    if (foods.length === 0) out = 'nothing';
    else {
      const [id, have] = foods[c.rng.int(foods.length)]!;
      subFoods(c, r, id, Math.min(have, c.rng.intMin1(2 * r.star + 1)));
      out = 'stolen';
    }
  }
  if (c.rng.chance(agg.earnMapRate ?? 0)) grantGoods(c, r, GOODS.adventureMap, 1, 'mouse');
  return out;
}
