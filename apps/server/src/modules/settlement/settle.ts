import { GOODS } from '@dt/config';
import type { Rng } from '@dt/shared';
import { dtTicketDraws } from '../../core/tickets';
import { computeRates } from './rates';
import { allocateTables, type Candidate } from './tables';
import type { Drop, Flags, Rates, SettleGlobals, SettleInput, SettleResult } from './types';

/** 规格书 01 §1.6；负数（白食损失）不吃加成（Review Focus 3） */
export function incomeValue(x: number, r: number): number {
  if (x <= 0 || r === 0) return Math.floor(x);
  return Math.max(1, Math.floor(x * (1 + r)));
}

function mergeDrops(drops: Drop[]): Drop[] {
  const out: Drop[] = [];
  for (const d of drops) {
    const same = out.find((x) => x.goodsId === d.goodsId && x.hours === d.hours);
    if (same) same.num += d.num;
    else out.push({ ...d });
  }
  return out;
}

/** 挑剔消耗食材（规格书 01 §1.8） */
function cookFoods(
  cands: Candidate[],
  input: SettleInput,
  g: SettleGlobals,
  rates: Rates,
  flags: Flags,
  rng: Rng,
): { exp: number; renown: number; drops: Drop[]; foodsUsed: Array<{ foodsId: number; num: number }> } {
  const t = g.tuning.settlement;
  const flag = input.rest.cookfoodsFlag;
  const stock = new Map(input.cupboard ?? []);
  const used = new Map<number, number>();
  const drops: Drop[] = [];
  let exp = 0;
  let renown = 0;
  for (const c of cands) {
    const need = g.needFoods(c.cookbookId, Math.min(c.req, t.cookfoodsNeedGradeCap));
    const ok =
      need.length > 0 &&
      need.every((f) => (stock.get(f.foodsId) ?? 0) >= Math.max(flag * t.cookfoodsPerFlag, f.num));
    if (!ok) continue;
    let price = 0;
    let odds5 = 0;
    let krab = 0;
    for (const f of need) {
      stock.set(f.foodsId, (stock.get(f.foodsId) ?? 0) - f.num);
      used.set(f.foodsId, (used.get(f.foodsId) ?? 0) + f.num);
      const food = g.food(f.foodsId);
      price += food.coin * f.num;
      if (food.level === 5) odds5 += 101 - food.odds;
      krab += food.level * (101 - food.odds);
    }
    exp += Math.floor(
      Math.floor(price / 100) * (1 + rates.expRate.total) * (1 + flags.cookfoodSpExpRate) * t.expMultiplier,
    );
    const times = Math.floor(1 + odds5 / t.dtTicketOddsDivisor);
    const tickets = dtTicketDraws(times, flags.luckRate, g.holidayMultiplier, t, rng).num;
    if (tickets > 0) drops.push({ goodsId: GOODS.dtTicket, num: tickets });
    const curOdd = Math.sqrt(krab) / 100;
    if (
      tickets === 0 &&
      (rng.chance(t.krabCoinBaseRate) ||
        (curOdd > t.krabCoinOddThreshold &&
          rng.chance((curOdd - t.krabCoinOddThreshold) * t.krabCoinOddStep)))
    ) {
      drops.push({ goodsId: GOODS.krabCoin, num: 1 });
    }
    if (flags.pinkBook || rng.chance(t.renownRate) || curOdd > t.renownOddThreshold) renown += 1;
  }
  return { exp, renown, drops, foodsUsed: [...used].map(([foodsId, num]) => ({ foodsId, num })) };
}

/** 一家店的一轮结算：纯函数，不访问数据库、不读时间（设计文档 §4.2） */
export function settleRestaurant(input: SettleInput, g: SettleGlobals, rng: Rng): SettleResult {
  if (input.rest.oil <= 0) {
    return {
      closed: true,
      tables: input.tables,
      coin: 0,
      exp: 0,
      oil: 0,
      customers: {},
      rates: null,
      drops: [],
      renown: 0,
      foodsUsed: [],
      specialUsed: 0,
      logs: [],
      planktonAppeared: false,
    };
  }
  const { rates, flags } = computeRates(input, g, rng);
  const o = allocateTables(input, g, rates, flags, rng);
  const coin = incomeValue(o.coin, rates.coinRate.total);
  let exp = incomeValue(o.exp, rates.expRate.total);
  const oil = Math.min(Math.max(0, incomeValue(o.oil, rates.oilRate.total)), input.rest.oil);
  const drops = [...o.drops];
  let renown = 0;
  let foodsUsed: Array<{ foodsId: number; num: number }> = [];
  if (input.rest.cookfoodsFlag > 0 && input.cupboard && o.candidates.length > 0) {
    const cf = cookFoods(o.candidates, input, g, rates, flags, rng);
    exp += cf.exp;
    renown += cf.renown;
    drops.push(...cf.drops);
    foodsUsed = cf.foodsUsed;
  }
  return {
    closed: false,
    tables: o.tables,
    coin,
    exp,
    oil,
    customers: o.customers,
    rates,
    drops: mergeDrops(drops),
    renown,
    foodsUsed,
    specialUsed: o.specialUsed,
    logs: o.logs,
    planktonAppeared: o.planktonAppeared,
  };
}
