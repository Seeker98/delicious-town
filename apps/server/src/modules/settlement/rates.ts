import { luckRate, type Rng } from '@dt/shared';
import type { Flags, RatePart, Rates, SettleGlobals, SettleInput } from './types';

const v = (o: Record<string, number>, k: string): number => o[k] ?? 0;
const round = (x: number): number => Math.round(x * 1e9) / 1e9;

/** 各来源求和；为 0 的来源不记（income_round 里保存的分项更紧凑） */
function part(parts: Record<string, number>): RatePart {
  const kept: Record<string, number> = {};
  let total = 0;
  for (const [k, x] of Object.entries(parts)) {
    if (x === 0) continue;
    kept[k] = round(x);
    total += x;
  }
  return { total: round(total), parts: kept };
}

/**
 * 各项汇总率（规格书 01 §1.3，设计文档 §4.2）。随机数恰好取两次：先上座浮动，再挑剔浮动。
 * 0 星餐厅不受天气影响。
 */
export function computeRates(input: SettleInput, g: SettleGlobals, rng: Rng): { rates: Rates; flags: Flags } {
  const { rest, agg: a } = input;
  const s = rest.star;
  const rt = g.tuning.rest;
  const st = g.tuning.settlement;
  const w = s === 0 ? {} : g.weather;
  const b = g.bless;

  let cookbook = 0;
  for (let L = 1; L < input.counts.grade.length; L++) {
    const n = input.counts.grade[L] ?? 0;
    if (n > 0) cookbook += n * g.grade(L).atRatePerCookbook * L;
  }
  const atFloat = (st.atFloatBase + st.atFloatPerStar * s) * (rng.next() - 0.5);
  const at = part({
    base: rt.atRateBase + rt.atRatePerStar * s,
    cookbook,
    effects: v(a, 'atRate'),
    weather: v(w, 'atRate'),
    bless: v(b, 'atRate'),
    renown: rest.renown < 0 ? st.negativeRenownAtRate : 0,
    float: atFloat,
  });
  const leftAt = (at.total - st.atOverflowThreshold) / (v(a, 'atToExp') > 0 ? 1 : st.atOverflowDivisor);
  const atRate = Math.min(Math.max(at.total, 0), 1);

  const spFloat = st.spFloatPerStar * s * (rng.next() - st.spFloatCenter);
  const sp = part({
    base: rt.spRateBase + rt.spRatePerStar * s,
    effects: v(a, 'spRate'),
    weather: v(w, 'spRate'),
    float: spFloat,
  });
  const spOverflow = v(a, 'adiao') > 0 && sp.total > 1 ? (sp.total - 1) * st.adiaoOverflowRate : 0;

  const coinParts: Record<string, number> = {
    effects: v(a, 'coinRate'),
    plaque: v(a, 'plaqueSum'),
    honor: v(a, 'honorAddCoin'),
    pot: v(a, 'potCoinRate'),
    painting: v(a, 'paintingCoinRate'),
    weather: v(w, 'coinRate'),
    bless: v(b, 'coinRate'),
    spOverflow,
  };
  const expParts: Record<string, number> = {
    effects: v(a, 'expRate'),
    starPotential: st.starPotential[s] ?? 0,
    plaque: v(a, 'plaqueSum'),
    honor: v(a, 'honorAddExp'),
    pot: v(a, 'potExpRate'),
    painting: v(a, 'paintingExpRate'),
    weather: v(w, 'expRate'),
    bless: v(b, 'expRate'),
    atOverflow: Math.max(leftAt, 0),
  };
  let coin = part(coinParts);
  if (rest.cteOn && coin.total !== 0) {
    expParts.cte = coin.total * st.cteRate;
    coin = part({ ...coinParts, cte: -coin.total });
    coin.total = 0;
  }

  const luckSum = rest.luck + v(a, 'luckValue') + v(w, 'luckValue');
  const rates: Rates = {
    atRate: { total: atRate, parts: at.parts },
    spRate: { total: Math.min(Math.max(sp.total, 0), 1), parts: sp.parts },
    coinRate: coin,
    expRate: part(expParts),
    coinValue: part({ effects: v(a, 'coinValue'), weather: v(w, 'coinValue') }),
    expValue: part({ effects: v(a, 'expValue'), weather: v(w, 'expValue') }),
    oilRate: part({ effects: v(a, 'oilRate'), weather: v(w, 'oilRate') }),
    oilValue: part({ effects: v(a, 'oilValue'), weather: v(w, 'oilValue') }),
    luck: part({ base: rest.luck, effects: v(a, 'luckValue'), weather: v(w, 'luckValue') }),
    seated: Math.round(atRate * input.tables.length),
  };
  const flags: Flags = {
    husky: v(a, 'husky') > 0,
    ali: v(a, 'ali') > 0,
    flute: v(a, 'magicFlute') > 0,
    paintingTop: v(a, 'paintingTop') > 0,
    pinkBook: v(a, 'pinkBook') > 0,
    spCoinRate: v(a, 'spCoinRate'),
    mcCoinRate: v(a, 'mcCoinRate'),
    mcExpRate: v(a, 'mcExpRate'),
    cookfoodSpExpRate: v(a, 'cookfoodSpExpRate'),
    sqExpRate: 1 + v(a, 'squidwardExpRate'),
    roachMul: 1 + v(w, 'roachRate'),
    roachClear: v(a, 'roachClearRate'),
    luckRate: luckRate(luckSum),
  };
  return { rates, flags };
}
