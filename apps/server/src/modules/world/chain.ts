import type { Weather, WeatherChain } from '@dt/config';
import type { Rng } from '@dt/shared';

/**
 * 天气马尔可夫链（天气改版设计 §1）：下一轮按当前自然天气转移。
 * 拟合参数（q、类型矩阵、特殊天气系数）在 game/weather_chain.json，由 pnpm -F @dt/server weather-chain 生成；
 * 生成器和这里用同一个 chainRow，长期占比才对得上
 */

/** 天气四大类：1 晴、2 雨、3 雪冰、4 风沙雾 */
export const WEATHER_TYPES = [1, 2, 3, 4] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];

export type ChainRow = Map<number, number>;

/** 经营分（设计 §6）：1 星店每轮银币收入的倍数，100 表示不变；只用来分 stay 档，不给玩家看 */
export function weatherScore(w: Weather, m: WeatherChain['score']): number {
  const g = (k: string) => w.effects[k] ?? 0;
  const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
  const seat0 = clamp(m.at);
  const mix0 = 1 - m.sp + m.sp * m.k;
  const seat = clamp(m.at + g('atRate'));
  const sp = clamp(m.sp + g('spRate'));
  const mix = 1 - sp + sp * m.k;
  return (
    100 *
    ((seat / seat0) * (mix / mix0) * (1 + g('coinRate')) + (g('coinValue') / m.perTable) * (seat / seat0))
  );
}

/** 留在原地的概率：按经营分分档；特殊天气只持续一轮 */
export function stayOf(chain: WeatherChain, w: Weather): number {
  if (w.special) return 0;
  const s = weatherScore(w, chain.score);
  for (const tier of chain.stay) if (s >= tier.min) return tier.p;
  return 0;
}

/** 这一时段能不能出现：夜间用夜间和全天天气，白天用白天和全天天气 */
export function allowedAt(w: Weather, night: boolean): boolean {
  return (night ? [2, 3] : [1, 3]).includes(w.daytime);
}

/** 强度阶梯（只管雨类、雪冰类）：同类相差 1 级以内 ×1、差 2 级 ×0.25、更多不可能；从别的类转入只能落在 2 级以内 */
export function ladder(chain: WeatherChain, from: Weather, to: Weather): number {
  if (to.type !== 2 && to.type !== 3) return 1;
  const it = chain.intensity[String(to.id)] ?? 1;
  if (from.type === to.type) {
    const d = Math.abs((chain.intensity[String(from.id)] ?? 1) - it);
    return d <= 1 ? 1 : d === 2 ? 0.25 : 0;
  }
  return it <= 2 ? 1 : 0;
}

/** 日夜对应天气（晴 ↔ 夜间晴……）；没有为 null */
export function counterOf(chain: WeatherChain, id: number): number | null {
  for (const [a, b] of chain.counter) {
    if (a === id) return b;
    if (b === id) return a;
  }
  return null;
}

/** 当前天气是哪些特殊天气的前兆：[特殊天气, 转入概率] */
export function precursorOf(chain: WeatherChain, id: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [sp, list] of Object.entries(chain.precursors))
    for (const [p, rel] of list) if (p === id) out.push([Number(sp), (chain.spk[sp] ?? 0) * rel]);
  return out;
}

/**
 * 从 from 出发、下一时段（night）各天气的概率（设计 §1.2）：
 * ① 特殊天气（前兆）② 虹（白天、非特殊的雨类）③ 留在原地（跨日夜换成对应天气）④ 按类型矩阵换类型，类型内按 q × 阶梯
 */
export function chainRow(
  chain: WeatherChain,
  weathers: ReadonlyMap<number, Weather>,
  fromId: number,
  night: boolean,
): ChainRow {
  const from = weathers.get(fromId);
  const out: ChainRow = new Map();
  if (!from) return out;
  const add = (k: number, p: number) => out.set(k, (out.get(k) ?? 0) + p);
  let mass = 1;
  for (const [sp, p] of precursorOf(chain, from.id)) {
    const w = weathers.get(sp);
    if (w && allowedAt(w, night)) {
      add(sp, p);
      mass -= p;
    }
  }
  const rb = weathers.get(chain.rainbow.id);
  if (rb && !night && from.type === chain.rainbow.from && !from.special && allowedAt(rb, night)) {
    const p =
      (chain.spk[String(rb.id)] ?? 0) *
      (chain.types[String(chain.rainbow.from)]?.[String(chain.rainbow.to)] ?? 0);
    add(rb.id, p);
    mass -= p;
  }
  const s = stayOf(chain, from);
  if (s > 0) {
    if (allowedAt(from, night)) {
      add(from.id, mass * s);
      mass -= mass * s;
    } else {
      const c = counterOf(chain, from.id);
      const cw = c === null ? undefined : weathers.get(c);
      if (cw && allowedAt(cw, night)) {
        add(cw.id, mass * s);
        mass -= mass * s;
      }
    }
  }
  const tr = chain.types[String(from.type)] ?? {};
  const rows: Array<{ t: number; cands: Weather[]; ws: number[]; sum: number }> = [];
  let tot = 0;
  for (const t of WEATHER_TYPES) {
    const cands = [...weathers.values()]
      .filter((c) => c.id !== from.id && !c.special && c.type === t && allowedAt(c, night))
      .sort((a, b) => a.id - b.id);
    const ws = cands.map((c) => (chain.q[String(c.id)] ?? 0) * ladder(chain, from, c));
    const sum = ws.reduce((a, b) => a + b, 0);
    const pt = tr[String(t)] ?? 0;
    if (sum <= 0 || pt <= 0) continue;
    rows.push({ t, cands, ws, sum });
    tot += pt;
  }
  for (const r of rows) {
    const pt = tr[String(r.t)] ?? 0;
    r.cands.forEach((c, i) => add(c.id, (((mass * pt) / tot) * r.ws[i]!) / r.sum));
  }
  return out;
}

/** 按行抽一个；行是空的（配置缺失）返回 null */
export function pickRow(row: ChainRow, rng: Rng): number | null {
  const list = [...row].filter(([, p]) => p > 0).sort((a, b) => a[0] - b[0]);
  const total = list.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return null;
  let x = rng.next() * total;
  for (const [id, p] of list) {
    x -= p;
    if (x < 0) return id;
  }
  return list[list.length - 1]![0];
}

/** 预报：下一轮各大类的概率（设计 §1.6，只给四类、不给具体天气） */
export function typeShares(
  row: ChainRow,
  weathers: ReadonlyMap<number, Weather>,
): Record<WeatherType, number> {
  const out: Record<WeatherType, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const [id, p] of row) {
    const t = weathers.get(id)?.type as WeatherType | undefined;
    if (t && t in out) out[t] += p;
  }
  return out;
}

/**
 * 司天罗盘（设计 §2.2）：选一类，类内按 q × 阶梯以当前自然天气为起点抽；当前是前兆时，特殊天气按链上的转入概率并入它的类。
 * 不含当前天气、tool.compassBanned（酸雨、冰冻）。只能选从当前类型在矩阵上转得过去的类型；返回这一类各天气的概率（和为 1），选不了为空
 */
export function compassRow(
  chain: WeatherChain,
  weathers: ReadonlyMap<number, Weather>,
  fromId: number,
  type: number,
  night: boolean,
): ChainRow {
  const from = weathers.get(fromId);
  const out: ChainRow = new Map();
  if (!from || (chain.types[String(from.type)]?.[String(type)] ?? 0) <= 0) return out;
  const banned = new Set(chain.compassBanned);
  const cands = [...weathers.values()]
    .filter(
      (c) => c.id !== from.id && !c.special && c.type === type && allowedAt(c, night) && !banned.has(c.id),
    )
    .sort((a, b) => a.id - b.id);
  const ws = cands.map((c) => (chain.q[String(c.id)] ?? 0) * ladder(chain, from, c));
  const sum = ws.reduce((a, b) => a + b, 0);
  // 前兆带出的特殊天气：按它在链上那一行的份额，和普通天气按“非特殊部分”的份额放在一起
  const row = chainRow(chain, weathers, fromId, night);
  const special = [...row].filter(([id]) => {
    const w = weathers.get(id);
    return w?.special && w.type === type && !banned.has(id) && id !== from.id;
  });
  const spMass = special.reduce((s, [, p]) => s + p, 0);
  if (sum <= 0 && spMass <= 0) return out;
  const rest = Math.max(0, 1 - spMass);
  // 阶梯上到不了的（权重 0）不列
  if (sum > 0) cands.forEach((c, i) => ws[i]! > 0 && out.set(c.id, (rest * ws[i]!) / sum));
  for (const [id, p] of special) out.set(id, p);
  const total = [...out.values()].reduce((s, p) => s + p, 0);
  for (const [k, v] of out) out.set(k, v / total);
  return out;
}

/** 晴雨签（设计 §2.3）：从当前那一行（含特殊天气）不放回抽两个不同的候选，排除当前天气和它的日夜对应天气 */
export function drawLots(
  chain: WeatherChain,
  weathers: ReadonlyMap<number, Weather>,
  fromId: number,
  night: boolean,
  rng: Rng,
): number[] {
  const row = chainRow(chain, weathers, fromId, night);
  const counter = counterOf(chain, fromId);
  row.delete(fromId);
  if (counter !== null) row.delete(counter);
  const out: number[] = [];
  for (let i = 0; i < 2; i++) {
    const id = pickRow(row, rng);
    if (id === null) break;
    out.push(id);
    row.delete(id);
  }
  return out;
}
