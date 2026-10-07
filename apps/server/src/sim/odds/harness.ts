import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashSeed, seededRng } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createDb } from '../../db';
import { createTestGame, newRestaurant, type NewRestaurantOptions, type TestGame } from '../../../test/game';
import { testEnvWith } from '../../../test/helpers';

/**
 * 概率核对（问题记录 511）：在测试库上用真实的玩法接口跑很多次，和按数值算出的期望比。
 * 每次操作用自己的固定种子（hashSeed('odds', 第几次操作)），同样的次数结果可以复现
 * （并发时哪次操作落到哪家店不固定，统计量不受影响）
 */

/** 次数倍数：ODDS_SCALE=0.1 先快速跑一遍，=5 跑得更准 */
export const SCALE = Number(process.env.ODDS_SCALE ?? 1);
export const times = (n: number) => Math.max(100, Math.round(n * SCALE));

export async function oddsGame(): Promise<TestGame> {
  let seq = 0;
  return createTestGame({
    db: createDb(testEnvWith().DATABASE_URL, 20),
    rng: () => seededRng(hashSeed('odds', seq++)),
  });
}

/** 只加营业额的天气（晴）：免得天气改命中、暴击、探险、试炼这些概率（没有完全不带加成的天气） */
export function calmWeather(t: TestGame): number {
  const w = [...t.deps.config.weather.values()].find((x) =>
    Object.keys(x.effects).every((k) => k === 'atRate'),
  );
  if (!w) throw new Error('no weather with only atRate');
  return w.id;
}

/** 新区服（可带区服数值覆盖，比如把每日次数放开）里开 count 家店；天气固定成没有加成的，店是 300 级 */
export async function shops(
  t: TestGame,
  count: number,
  opts: NewRestaurantOptions = {},
  override: Record<string, unknown> | null = null,
): Promise<RestCtx[]> {
  // 300 级：玩法发的经验不会让店升级，升级会加幸运（每级 luckPerLevel），期望就对不上了
  opts = { ...opts, patch: { level: 300, ...opts.patch } };
  const first = await newRestaurant(t, opts);
  await t.db
    .insertInto('world_state')
    .values({
      shard_id: first.shardId,
      weather_id: calmWeather(t),
      weather_until: new Date(t.clock.now.getTime() + 3650 * 86_400_000),
      krab_street: t.deps.config.tuning.world.krabStreetMin,
      updated_at: t.clock.now,
    })
    .execute();
  if (override)
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: first.shardId, override: JSON.stringify(override) })
      .execute();
  const rest = await Promise.all(
    Array.from({ length: count - 1 }, () => newRestaurant(t, { ...opts, shardId: first.shardId })),
  );
  return [first, ...rest];
}

/**
 * 这家店现在的幸运总值（基础 + 勋章等加成）。酒吧赢了会发红内裤、锦鲤这类加幸运的勋章，
 * 发过以后幸运就变了：和幸运有关的玩法每次操作前读一次，按当时的概率算期望
 */
export async function luckOf(t: TestGame, restId: number): Promise<number> {
  const r = await t.db
    .selectFrom('restaurant')
    .select('luck')
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  const sources = await t.db
    .selectFrom('effect_source')
    .select(['effects', 'expires_at'])
    .where('rest_id', '=', restId)
    .execute();
  const now = t.clock.now.getTime();
  return sources
    .filter((x) => x.expires_at === null || x.expires_at.getTime() > now)
    .reduce((a, x) => a + ((x.effects as Record<string, number>).luckValue ?? 0), r.luck);
}

/** n 局分给 workers 路并发跑；同一路里按顺序 */
export async function parallel(
  workers: number,
  n: number,
  play: (worker: number, i: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      for (let i = next++; i < n; i = next++) await play(w, i);
    }),
  );
}

/** n 局分给几家店并发跑；同一家店里按顺序 */
export function spread(
  ctxs: readonly RestCtx[],
  n: number,
  play: (ctx: RestCtx, i: number) => Promise<void>,
): Promise<void> {
  return parallel(ctxs.length, n, (w, i) => play(ctxs[w]!, i));
}

// ---------- 统计 ----------

export interface Row {
  game: string;
  item: string;
  /** 期望；null = 只报实测（比如回报率，没有设计上的目标值） */
  expected: number | null;
  measured: number;
  n: number;
  /** 实测的标准误 */
  se: number;
  /** 百分比显示 */
  pct: boolean;
}

/** 偏差超过这么多个标准误算偏（检查项多，用 4 免得纯运气标出来） */
export const Z_FLAG = 4;

export const rows: Row[] = [];

/** 比例：hits / n 对比 p */
export function rate(game: string, item: string, hits: number, n: number, p: number | null): Row {
  const m = hits / n;
  const base = p ?? m;
  const row: Row = {
    game,
    item,
    expected: p,
    measured: m,
    n,
    se: Math.sqrt(Math.max(base * (1 - base), 1e-12) / n),
    pct: true,
  };
  rows.push(row);
  return row;
}

/** 累加器：均值和标准误 */
export class Mean {
  n = 0;
  sum = 0;
  sq = 0;
  add(x: number): void {
    this.n++;
    this.sum += x;
    this.sq += x * x;
  }
  get mean(): number {
    return this.n === 0 ? 0 : this.sum / this.n;
  }
  get se(): number {
    if (this.n < 2) return 0;
    const v = (this.sq - (this.sum * this.sum) / this.n) / (this.n - 1);
    return Math.sqrt(Math.max(v, 0) / this.n);
  }
}

/** 比值：每次请求加一对（分子、分母），比如“这次的礼券张数 / 这次的暴击数”；标准误按比值估计 */
export class Ratio {
  private parts: Array<[number, number]> = [];
  add(num: number, den: number): void {
    if (den > 0 || num > 0) this.parts.push([num, den]);
  }
  get num(): number {
    return this.parts.reduce((a, [x]) => a + x, 0);
  }
  get den(): number {
    return this.parts.reduce((a, [, y]) => a + y, 0);
  }
  get value(): number {
    return this.den === 0 ? 0 : this.num / this.den;
  }
  get se(): number {
    const n = this.parts.length;
    if (n < 2 || this.den === 0) return 0;
    const r = this.value;
    const dbar = this.den / n;
    const v = this.parts.reduce((a, [x, y]) => a + (x - r * y) ** 2, 0) / (n - 1);
    return Math.sqrt(v / n) / dbar;
  }
}

export function ratio(game: string, item: string, r: Ratio, expected: number | null): Row {
  const row: Row = { game, item, expected, measured: r.value, n: r.den, se: r.se, pct: false };
  rows.push(row);
  return row;
}

export function mean(game: string, item: string, m: Mean, expected: number | null, pct = false): Row | null {
  if (m.n === 0) return null;
  const row: Row = { game, item, expected, measured: m.mean, n: m.n, se: m.se, pct };
  rows.push(row);
  return row;
}

/** 每次概率不同的成败（比如强化的保底随连续失败涨）：每次记下当时该有的概率 */
export class Trials {
  n = 0;
  hits = 0;
  pSum = 0;
  vSum = 0;
  add(p: number, hit: boolean): void {
    const q = Math.min(1, Math.max(0, p));
    this.n++;
    if (hit) this.hits++;
    this.pSum += q;
    this.vSum += q * (1 - q);
  }
}

export function trials(game: string, item: string, x: Trials): void {
  if (x.n === 0) return;
  rows.push({
    game,
    item,
    expected: x.pSum / x.n,
    measured: x.hits / x.n,
    n: x.n,
    se: Math.sqrt(Math.max(x.vSum, 1e-12)) / x.n,
    pct: true,
  });
}

/** 计数器：key → 次数 */
export class Tally<K> {
  n = 0;
  readonly map = new Map<K, number>();
  add(k: K, w = 1): void {
    this.n += w;
    this.map.set(k, (this.map.get(k) ?? 0) + w);
  }
  get(k: K): number {
    return this.map.get(k) ?? 0;
  }
}

export const zOf = (r: Row): number | null =>
  r.expected === null
    ? null
    : r.se === 0
      ? r.measured === r.expected
        ? 0
        : Infinity
      : (r.measured - r.expected) / r.se;

const fmt = (r: Row, v: number) =>
  r.pct ? `${(v * 100).toFixed(3)}%` : Number(v.toFixed(4)).toLocaleString();

/** 报告：markdown 写到 sim-out/odds/，偏的排在前面 */
export function writeReport(dir = join(process.cwd(), '../../sim-out/odds')): string {
  const flagged = rows.filter((r) => Math.abs(zOf(r) ?? 0) > Z_FLAG);
  const line = (r: Row) => {
    const z = zOf(r);
    return `| ${r.game} | ${r.item} | ${r.expected === null ? '—' : fmt(r, r.expected)} | ${fmt(r, r.measured)} | ±${fmt(r, r.se)} | ${z === null ? '—' : z.toFixed(1)} | ${r.n.toLocaleString()} |`;
  };
  const head = '| 玩法 | 项目 | 期望 | 实测 | 标准误 | 偏差 (σ) | 次数 |\n|---|---|---|---|---|---|---|';
  const text = [
    `# 概率核对（问题记录 511）`,
    '',
    `次数倍数 ${SCALE}；偏差超过 ${Z_FLAG} 个标准误的 ${flagged.length} 项列在最前。`,
    '',
    '## 偏的',
    '',
    flagged.length ? [head, ...flagged.map(line)].join('\n') : '没有。',
    '',
    '## 全部',
    '',
    head,
    ...rows.map(line),
    '',
  ].join('\n');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  writeFileSync(file, text);
  return file;
}
