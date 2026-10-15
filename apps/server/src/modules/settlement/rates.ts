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

  let cookbook = 0;
  for (let L = 1; L < input.counts.grade.length; L++) {
    const n = input.counts.grade[L] ?? 0;
    if (n > 0) cookbook += n * g.grade(L).atRatePerCookbook * L * st.cookbookAtRate;
  }
  const atFloat = (st.atFloatBase + st.atFloatPerStar * s) * (rng.next() - 0.5);
  const at = part({
    base: rt.atRateBase + rt.atRatePerStar * s,
    cookbook,
    effects: v(a, 'atRate'),
    renown: rest.renown < 0 ? st.negativeRenownAtRate : 0,
    float: atFloat,
  });
  // 溢出转经验按折算前的合计算（街道再平衡第二版）
  const leftAt = (at.total - st.atOverflowThreshold) / (v(a, 'atToExp') > 0 ? 1 : st.atOverflowDivisor);
  // 天气在软上限之后按点数加（天气加算修正 2026-10-16）：好天气不被打成 1/3，高星店也不靠软上限以上的余量抵掉坏天气
  const atCapped = afterCap(atSoftCap(at, st.atSoftCapAt, st.atSoftCapRate), v(w, 'atRate'));
  const atRate = Math.min(Math.max(atCapped.total, 0), 1);

  const spFloat = st.spFloatPerStar * s * (rng.next() - st.spFloatCenter);
  // 学菜（收益模型改版 2026-10-15）：本街学会的道数 ÷ 本街菜数 × spLearnRate，只看道数不看品级，照样走软上限
  const streetTotal = g.cookbooks.idsByStreet.get(rest.streetId)?.length ?? 0;
  const localLearned = input.counts.street[String(rest.streetId)] ?? 0;
  const sp = part({
    base: rt.spRateBase + rt.spRatePerStar * s,
    learn: streetTotal > 0 ? st.spLearnRate * Math.min(1, localLearned / streetTotal) : 0,
    effects: v(a, 'spRate'),
    float: spFloat,
  });

  const coinParts: Record<string, number> = {
    effects: v(a, 'coinRate'),
    plaque: v(a, 'plaqueSum'),
    honor: v(a, 'honorAddCoin'),
    pot: v(a, 'potCoinRate'),
    weather: v(w, 'coinRate'),
  };
  const expParts: Record<string, number> = {
    effects: v(a, 'expRate'),
    starPotential: st.starPotential[s] ?? 0,
    newbie: newbieExpRate(rest.level, st.newbieExp),
    plaque: v(a, 'plaqueSum'),
    honor: v(a, 'honorAddExp'),
    pot: v(a, 'potExpRate'),
    weather: v(w, 'expRate'),
    atOverflow: Math.max(leftAt, 0),
  };
  const coin = part(coinParts);

  const luckSum = rest.luck + v(a, 'luckValue') + v(w, 'luckValue');
  const rates: Rates = {
    atRate: { total: atRate, parts: atCapped.parts },
    spRate: clip01(afterCap(softCap(sp, st.spSoftCapAt, st.spSoftCapRate), v(w, 'spRate'))),
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
    spCoinRate: v(a, 'spCoinRate'),
    mcCoinRate: v(a, 'mcCoinRate'),
    mcExpRate: v(a, 'mcExpRate'),
    roachMul: 1 + v(w, 'roachRate'),
    roachClear: v(a, 'roachClearRate'),
    luckRate: luckRate(luckSum),
  };
  return { rates, flags };
}

/** 天气在软上限之后加（天气加算修正 2026-10-16）：记成分项 weather，合计不截断，截断在外面做 */
export function afterCap(p: RatePart, weather: number): RatePart {
  if (weather === 0) return p;
  return { total: round(p.total + weather), parts: { ...p.parts, weather: round(weather) } };
}

/** 合计截到 0~1，分项不动 */
const clip01 = (p: RatePart): RatePart => ({ ...p, total: Math.min(Math.max(p.total, 0), 1) });

/**
 * 挑剔率截到 0~1，再过软上限（挑剔顾客调整 2026-10-12）：超过 at 的部分只算 rate。
 * 压掉的部分记成负的分项 softCap，分项加起来仍等于合计
 */
export function softCap(sp: RatePart, at: number, rate: number): RatePart {
  const clipped = Math.min(Math.max(sp.total, 0), 1);
  if (clipped <= at) return { total: clipped, parts: sp.parts };
  const total = round(at + (clipped - at) * rate);
  return { total, parts: { ...sp.parts, softCap: round(total - sp.total) } };
}

/**
 * 上座率软上限（街道再平衡第二版 2026-10-14）：超过 at 的部分只算 rate，截到 0~1 在外面做。
 * 压掉的部分记成负的分项 softCap，分项加起来仍等于折算后的合计
 */
export function atSoftCap(p: RatePart, at: number, rate: number): RatePart {
  if (p.total <= at) return p;
  const total = round(at + (p.total - at) * rate);
  return { total, parts: { ...p.parts, softCap: round(total - p.total) } };
}

/** 低等级经验加成（问题记录 378）：1 级 +rate，线性减到 maxLevel 为 0 */
export function newbieExpRate(level: number, t: { maxLevel: number; rate: number }): number {
  if (t.rate <= 0 || level >= t.maxLevel) return 0;
  return (t.rate * (t.maxLevel - Math.max(1, level))) / (t.maxLevel - 1);
}
