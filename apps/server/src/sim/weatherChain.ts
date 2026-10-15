/**
 * 天气链拟合（天气改版设计 §1、附录）：让马尔可夫链的长期占比对上原来按权重独立抽的占比，
 * 写到 packages/config/data/game/weather_chain.json。
 *   pnpm -F @dt/server weather-chain            拟合并写入
 *   pnpm -F @dt/server weather-chain --report   另外打印每种天气的目标和实际占比
 *
 * 规则（留在原地按经营分分档、强度阶梯、特殊天气的前兆、虹、日夜对应、罗盘不出的天气）写在下面的常量里；
 * 拟合只调类型内权重 q、类型矩阵和特殊天气系数。转移用 modules/world/chain.ts 的 chainRow，和游戏里一样。
 * 一天按换天时间分成几个时段为一个周期，迭代到平稳，分别对白天、夜间的目标占比调参数
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBundle,
  createGameConfig,
  defaultDataDir,
  readSourceDir,
  type GameConfig,
  type Weather,
  type WeatherChain,
} from '@dt/config';
import { chainRow, stayOf, weatherScore, WEATHER_TYPES, type ChainRow } from '../modules/world/chain';
import { isNight } from '../modules/world/rules';

/** 经营分模型（设计 §6：线上 4 天、约 7000 轮有星店的收入拟合） */
const SCORE = { at: 0.9, sp: 0.16, k: 4, perTable: 56 };
/** 留在原地：经营分 ≥ 95 是 0.4，70~95 是 0.25，更低 0.1（JSON 没有 -Infinity，最低档写一个够小的数） */
const STAY = [
  { min: 95, p: 0.4 },
  { min: 70, p: 0.25 },
  { min: -1_000_000, p: 0.1 },
];
/** 强度阶梯：雨类 小雨、阵雨 1 → 中雨、雷阵雨、雨夹雪 2 → 大雨 3 → 暴雨、雷雨夹雪 4 → 特大暴雨 5；雪冰类 小雪 1 → 冰雹、中雪 2 → 大雪 3 → 暴雪 4 */
const INTENSITY: Record<string, number> = {
  10: 1,
  17: 1,
  11: 2,
  16: 2,
  14: 2,
  12: 3,
  13: 4,
  25: 4,
  22: 5,
  15: 1,
  19: 2,
  20: 2,
  21: 3,
  23: 4,
  24: 5,
  18: 3,
  27: 4,
};
/** 日夜对应：晴 ↔ 夜间晴、多云 ↔ 夜间多云、雾 ↔ 夜间雾 */
const COUNTER: Array<[number, number]> = [
  [1, 28],
  [3, 29],
  [8, 30],
];
/** 特殊天气 → [前兆, 相对系数]：雷暴、酸雨、冰冻、飓风 */
const PRECURSORS: Record<string, Array<[number, number]>> = {
  24: [
    [22, 1],
    [13, 0.35],
    [25, 0.5],
  ],
  18: [
    [9, 1],
    [4, 0.6],
  ],
  27: [
    [23, 1],
    [21, 0.5],
    [19, 0.35],
  ],
  7: [
    [5, 1],
    [4, 0.6],
  ],
};
/** 虹：白天、雨类转晴类时出 */
const RAINBOW = { id: 6, from: 2, to: 1 };
/** 司天罗盘不出酸雨、冰冻（用户 2026-10-12） */
const COMPASS_BANNED = [18, 27];
/**
 * 写死的留在原地概率（天气加算修正 2026-10-16）：霾的经营分公式按上座 0.9、挑剔不过软上限算，
 * 把挑剔 +35% 算得很值钱（167 分），真实结算里低星店只有五六成，仍按坏天气一闪就过
 */
const STAY_FIXED: Record<string, number> = { 9: 0.1 };
/** 特殊天气的目标占比（白天 / 夜间） */
const SP_TARGET: Record<'day' | 'night', Record<string, number>> = {
  day: { 6: 0.008, 18: 0.004, 27: 0.003, 7: 0.003, 24: 0.003 },
  night: { 18: 0.002, 27: 0.003, 7: 0.003, 24: 0.003 },
};

type Dist = Map<number, number>;

/** 原来独立抽时的权重：夜间专属天气用 nightWeatherOdds，其他用 probability × dayWeightScale */
function baseWeight(config: GameConfig, w: Weather): number {
  const t = config.tuning.world;
  return new Map(t.nightWeatherOdds).get(w.id) ?? (w.probability ?? 0) * t.dayWeightScale;
}

const allowed = (w: Weather, night: boolean) => (night ? [2, 3] : [1, 3]).includes(w.daytime);

/** 每个时段开始后的分布（一天一个周期，迭代到平稳）；行按时段缓存 */
export function stationary(
  config: GameConfig,
  chain: WeatherChain,
  slots: Array<{ hour: number; night: boolean }>,
): Dist[] {
  const weathers = config.weather;
  const ids = [...weathers.keys()].sort((a, b) => a - b);
  const cache = new Map<string, ChainRow>();
  const rowOf = (id: number, night: boolean) => {
    const k = `${id}:${night}`;
    let r = cache.get(k);
    if (!r) cache.set(k, (r = chainRow(chain, weathers, id, night)));
    return r;
  };
  let dist: Dist = new Map(
    ids.map((id) => [id, allowed(weathers.get(id)!, true) && !weathers.get(id)!.special ? 1 : 0]),
  );
  const s0 = [...dist.values()].reduce((a, b) => a + b, 0);
  for (const k of dist.keys()) dist.set(k, dist.get(k)! / s0);
  let per: Dist[] = [];
  for (let it = 0; it < 300; it++) {
    per = [];
    for (const slot of slots) {
      const nd: Dist = new Map(ids.map((id) => [id, 0]));
      for (const [w, p] of dist)
        if (p > 0) for (const [k, pk] of rowOf(w, slot.night)) nd.set(k, nd.get(k)! + p * pk);
      dist = nd;
      per.push(new Map(dist));
    }
  }
  return per;
}

/** 白天、夜间各自的平均占比 */
export function shares(per: Dist[], slots: Array<{ night: boolean }>): { day: Dist; night: Dist } {
  const day: Dist = new Map();
  const night: Dist = new Map();
  const nDay = slots.filter((s) => !s.night).length;
  const nNight = slots.length - nDay;
  per.forEach((m, i) => {
    const n = slots[i]!.night;
    const tgt = n ? night : day;
    for (const [k, v] of m) tgt.set(k, (tgt.get(k) ?? 0) + v / (n ? nNight : nDay));
  });
  return { day, night };
}

export function fitChain(config: GameConfig): { chain: WeatherChain; report: string[] } {
  const weathers = config.weather;
  const list = [...weathers.values()].sort((a, b) => a.id - b.id);
  const tw = config.tuning.world;
  const slots = tw.weatherHours.map((hour) => ({ hour, night: isNight(hour, tw) }));
  const nDay = slots.filter((s) => !s.night).length;
  const nNight = slots.length - nDay;
  // 目标：原来独立抽的占比，留出特殊天气的份额
  const target = { day: new Map<number, number>(), night: new Map<number, number>() };
  for (const n of ['day', 'night'] as const) {
    const night = n === 'night';
    const pool = list.filter((w) => !w.special && allowed(w, night));
    const spTot = Object.values(SP_TARGET[n]).reduce((a, b) => a + b, 0);
    const s = pool.reduce((a, w) => a + baseWeight(config, w), 0);
    for (const w of pool) target[n].set(w.id, (baseWeight(config, w) / s) * (1 - spTot));
    for (const [id, v] of Object.entries(SP_TARGET[n])) target[n].set(Number(id), v);
  }
  const chain: WeatherChain = {
    note: '天气马尔可夫链（天气改版设计 §1）：由 pnpm -F @dt/server weather-chain 生成，别手改；规则改 apps/server/src/sim/weatherChain.ts',
    score: SCORE,
    stay: STAY,
    stayFixed: STAY_FIXED,
    intensity: INTENSITY,
    counter: COUNTER,
    precursors: PRECURSORS,
    rainbow: RAINBOW,
    compassBanned: COMPASS_BANNED,
    types: {
      1: { 1: 0.45, 2: 0.35, 3: 0, 4: 0.2 },
      2: { 1: 0.4, 2: 0.4, 3: 0.1, 4: 0.1 },
      3: { 1: 0.15, 2: 0.35, 3: 0.45, 4: 0.05 },
      4: { 1: 0.45, 2: 0.25, 3: 0.05, 4: 0.25 },
    },
    spk: { 24: 0.12, 18: 0.06, 27: 0.12, 7: 0.04, 6: 0.05 },
    q: Object.fromEntries(list.map((w) => [String(w.id), baseWeight(config, w)])),
  };
  // 全天加权：白天时段数 × 白天占比 + 夜间时段数 × 夜间占比
  const whole = (d: Dist, n: Dist, id: number) => (d.get(id) ?? 0) * nDay + (n.get(id) ?? 0) * nNight;
  const typeTotal = (f: (id: number) => number) => {
    const o: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const w of list) o[w.type] = (o[w.type] ?? 0) + f(w.id);
    return o;
  };
  for (let it = 0; it < 120; it++) {
    const sh = shares(stationary(config, chain, slots), slots);
    for (const w of list) {
      if (w.special) continue;
      const td = whole(target.day, target.night, w.id);
      const ad = whole(sh.day, sh.night, w.id);
      if (ad > 0 && td > 0) chain.q[String(w.id)] = chain.q[String(w.id)]! * Math.pow(td / ad, 0.6);
    }
    const tt = typeTotal((id) => whole(target.day, target.night, id));
    const at = typeTotal((id) => whole(sh.day, sh.night, id));
    for (const f of WEATHER_TYPES) {
      const row = chain.types[String(f)]!;
      for (const t of WEATHER_TYPES) row[String(t)] = row[String(t)]! * Math.pow(tt[t]! / at[t]!, 0.3);
      // 晴天不直接转雪冰（平滑）
      chain.types['1']!['3'] = 0;
      const s = WEATHER_TYPES.reduce((a, t) => a + row[String(t)]!, 0);
      for (const t of WEATHER_TYPES) row[String(t)] = row[String(t)]! / s;
    }
    for (const w of list) {
      if (!w.special) continue;
      const td = (SP_TARGET.day[String(w.id)] ?? 0) * nDay + (SP_TARGET.night[String(w.id)] ?? 0) * nNight;
      const ad = whole(sh.day, sh.night, w.id);
      if (ad > 0) chain.spk[String(w.id)] = (chain.spk[String(w.id)] ?? 0) * Math.pow(td / ad, 0.6);
    }
  }
  // 存盘的数字取 4 位有效小数，免得 JSON 里一长串
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  for (const k of Object.keys(chain.q)) chain.q[k] = r4(chain.q[k]!);
  for (const k of Object.keys(chain.spk)) chain.spk[k] = r4(chain.spk[k]!);
  for (const row of Object.values(chain.types)) for (const k of Object.keys(row)) row[k] = r4(row[k]!);
  // 拟合结果按存盘后的数再算一遍报告
  const sh = shares(stationary(config, chain, slots), slots);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const report: string[] = [];
  for (const n of ['day', 'night'] as const) {
    const m = sh[n];
    const types = typeTotal((id) => m.get(id) ?? 0);
    const avg = [...m].reduce((a, [id, v]) => a + v * weatherScore(weathers.get(id)!, SCORE), 0);
    report.push(
      `${n === 'day' ? '白天' : '夜间'}：晴 ${pct(types[1]!)} 雨 ${pct(types[2]!)} 雪冰 ${pct(types[3]!)} 风沙雾 ${pct(types[4]!)}；平均经营分 ${avg.toFixed(1)}`,
    );
  }
  for (const w of list)
    report.push(
      `${w.id} ${w.name} stay ${stayOf(chain, w)} q ${chain.q[String(w.id)]} | 白天 ${pct(target.day.get(w.id) ?? 0)} → ${pct(sh.day.get(w.id) ?? 0)} | 夜间 ${pct(target.night.get(w.id) ?? 0)} → ${pct(sh.night.get(w.id) ?? 0)} | 经营分 ${Math.round(weatherScore(w, SCORE))}`,
    );
  return { chain, report };
}

function main(): void {
  const built = buildBundle(readSourceDir(defaultDataDir()), { ignoreWeatherChain: true });
  if (!built.bundle) throw new Error(built.errors.join('\n'));
  const { chain, report } = fitChain(createGameConfig(built.bundle));
  const lines = process.argv.includes('--report') ? report : report.slice(0, 2);
  for (const l of lines) console.log(l);
  const out = join(defaultDataDir(), 'game/weather_chain.json');
  writeFileSync(out, JSON.stringify(chain, null, 2) + '\n');
  console.log(`写入 ${out}`);
}

if (process.argv[1]?.endsWith('weatherChain.ts')) main();
