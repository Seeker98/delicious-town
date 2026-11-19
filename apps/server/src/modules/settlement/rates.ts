import { luckRate, type Rng } from '@dt/shared';
import { streetLearnRate } from './fame';
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

  // 收益模型改版 2026-11-19：上座率、挑剔率是“经营状态”，各星级一个固定底数；原来的食谱加成上座率、本街学菜加挑剔率取消，
  // 学菜的成长改由厨艺钱（tables.ts）和银币率里的“本街学菜”承担
  const atFloat = (st.atFloatBase + st.atFloatPerStar * s) * (rng.next() - 0.5);
  const at = part({
    base: rt.atRateBase + rt.atRatePerStar * s,
    effects: v(a, 'atRate'),
    renown: rest.renown < 0 ? st.negativeRenownAtRate : 0,
    float: atFloat,
  });
  // 溢出转经验按折算前的合计算（街道再平衡第二版）
  const leftAt = (at.total - st.atOverflowThreshold) / (v(a, 'atToExp') > 0 ? 1 : st.atOverflowDivisor);
  // 天气在软上限之后按点数加（天气加算修正 2026-10-16）：好天气不被打成 1/3，高星店也不靠软上限以上的余量抵掉坏天气
  // 艺术品设施（2026-10-17）：乐台、屏风的道具能把两个软上限的拐点往上抬（atSoftCapAdd / spSoftCapAdd），拐点不超过 1
  const atCapAt = Math.min(1, st.atSoftCapAt + v(a, 'atSoftCapAdd'));
  const spCapAt = Math.min(1, st.spSoftCapAt + v(a, 'spSoftCapAdd'));
  const atCapped = afterCap(atSoftCap(at, atCapAt, st.atSoftCapRate), v(w, 'atRate'));
  const atRate = Math.min(Math.max(atCapped.total, 0), 1);

  const spFloat = (st.spFloatBase + st.spFloatPerStar * s) * (rng.next() - st.spFloatCenter);
  const sp = part({
    base: rt.spRateBase + rt.spRatePerStar * s,
    effects: v(a, 'spRate'),
    float: spFloat,
  });

  // 本街学菜（收益模型改版 2026-11-19）：本街学会的道数 ÷ 本街菜数 × streetLearnCoinRate，只看道数不看品级；搬家时只丢这一项
  const streetTotal = g.cookbooks.idsByStreet.get(rest.streetId)?.length ?? 0;
  const localLearned = input.counts.street[String(rest.streetId)] ?? 0;
  const coinParts: Record<string, number> = {
    learn: streetLearnRate(localLearned, streetTotal, st.streetLearnCoinRate),
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
    spRate: clip01(afterCap(softCap(sp, spCapAt, st.spSoftCapRate), v(w, 'spRate'))),
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
    flute: v(a, 'magicFlute') > 0,
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

/** 天气在软上限之后加（天气加算修正 2026-10-16）：记成分项 weather，合计不截断，截断在外面做 */
export function afterCap(p: RatePart, weather: number): RatePart {
  if (weather === 0) return p;
  return { total: round(p.total + weather), parts: { ...p.parts, weather: round(weather) } };
}

/** 合计截到 0~1，分项不动 */
const clip01 = (p: RatePart): RatePart => ({ ...p, total: Math.min(Math.max(p.total, 0), 1) });

/**
 * 挑剔率超过 1 的先截到 1，再过软上限（挑剔顾客调整 2026-10-12）：超过 at 的部分只算 rate。
 * 压掉的部分记成负的分项 softCap，分项加起来仍等于合计。
 * 负数原样留着、截到 0 在加完天气之后做：痞老板勋章（-120%）的店遇到霾也不该来挑剔顾客（代码审查 2026-10-19）
 */
export function softCap(sp: RatePart, at: number, rate: number): RatePart {
  const clipped = Math.min(sp.total, 1);
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
