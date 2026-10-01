import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { resolveShardSettings, type GameConfig, type Tuning } from '@dt/config';
import { runFast, type FastOptions, type FastResult } from './run';

/** 一套数值：名字 + 合并、校验后的完整 tuning */
export interface Variant {
  name: string;
  tuning: Tuning;
}

export const MAX_VARIANTS = 8;

/** "a.b.c" + 值 → { a: { b: { c: 值 } } } */
function nest(path: string[], value: unknown): Record<string, unknown> {
  return path.reduceRight<Record<string, unknown>>(
    (acc, k, i) => (i === path.length - 1 ? { [k]: value } : { [k]: acc }),
    {},
  );
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 覆盖里的每个数值路径都必须在当前 tuning 里存在（终审 I-2）：tuning 的 schema 不是严格的，
 * 写错的键会被悄悄丢掉，结果看起来像"这个数值没影响"
 */
function assertKnownPaths(base: unknown, override: unknown, prefix: string, name: string): void {
  if (!isObj(override)) return;
  for (const [k, v] of Object.entries(override)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!isObj(base) || !(k in base)) throw new Error(`数值套「${name}」：tuning 里没有 ${path}，检查拼写`);
    if (isObj(v)) assertKnownPaths(base[k], v, path, name);
  }
}

function resolveTuning(config: GameConfig, name: string, override: unknown): Tuning {
  if (isObj(override)) {
    const extra = Object.keys(override).filter((k) => k !== 'tuning');
    if (extra.length > 0)
      throw new Error(`数值套「${name}」：覆盖文件只能写 { "tuning": {...} }，不支持 ${extra.join('、')}`);
    assertKnownPaths(config.tuning, override.tuning, '', name);
  }
  try {
    return resolveShardSettings(config, override).tuning;
  } catch (e) {
    throw new Error(`数值套「${name}」不合法：${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 组出各套数值（设计 §6）：第一个总是"基准"；--variant 名字=覆盖文件（格式 { tuning: {...} }）；
 * --set 路径=值1,值2（路径可以带 tuning. 前缀）。深合并后用 tuning 的 schema 校验；最多 8 套
 */
export function buildVariants(
  config: GameConfig,
  opts: { variants: string[]; set?: string },
  readJson: (path: string) => unknown,
): Variant[] {
  const out: Variant[] = [{ name: '基准', tuning: resolveTuning(config, '基准', {}) }];
  for (const v of opts.variants) {
    const i = v.indexOf('=');
    if (i <= 0) throw new Error(`--variant 要写成 名字=覆盖文件：${v}`);
    const name = v.slice(0, i);
    out.push({ name, tuning: resolveTuning(config, name, readJson(v.slice(i + 1))) });
  }
  if (opts.set) {
    const i = opts.set.indexOf('=');
    if (i <= 0) throw new Error(`--set 要写成 路径=值1,值2：${opts.set}`);
    const raw = opts.set.slice(0, i);
    const path = raw.replace(/^tuning\./, '').split('.');
    for (const s of opts.set.slice(i + 1).split(',')) {
      const value: unknown = s.trim() !== '' && !Number.isNaN(Number(s)) ? Number(s) : s;
      const name = `${raw.replace(/^tuning\./, '')}=${s}`;
      out.push({ name, tuning: resolveTuning(config, name, { tuning: nest(path, value) }) });
    }
  }
  if (out.length > MAX_VARIANTS)
    throw new Error(`一次最多 ${MAX_VARIANTS} 套数值（含基准），现在 ${out.length} 套`);
  return out;
}

export type RunOptions = Omit<FastOptions, 'tuning'>;

/** 线程之间传的消息：Date 转成 ISO 字符串 */
export interface WorkerInput {
  bundlePath: string;
  name: string;
  options: Omit<FastOptions, 'start'> & { start: string };
}
export type WorkerMessage =
  { kind: 'progress'; name: string; day: number } | { kind: 'done'; result: FastResult };

/**
 * 跑多套数值：parallel 为 false 时在本线程逐套跑（测试用）；
 * 否则每套一个线程，并发数取 CPU 核数和套数的较小值
 */
export async function runVariants(
  vs: Variant[],
  o: RunOptions,
  config: GameConfig,
  parallel: false | { bundlePath: string },
  progress?: (msg: string) => void,
): Promise<FastResult[]> {
  const onDay = (name: string) => (day: number) => {
    if (day % 5 === 0 || day === o.days) progress?.(`[${name}] 第 ${day} 天`);
  };
  if (!parallel) return vs.map((v) => runFast(v.name, { ...o, tuning: v.tuning }, config, onDay(v.name)));
  const results: FastResult[] = new Array(vs.length);
  let next = 0;
  const one = async () => {
    while (next < vs.length) {
      const i = next++;
      const v = vs[i]!;
      const input: WorkerInput = {
        bundlePath: parallel.bundlePath,
        name: v.name,
        options: { ...o, tuning: v.tuning, start: o.start.toISOString() },
      };
      results[i] = await new Promise<FastResult>((resolve, reject) => {
        const w = new Worker(new URL('./worker.ts', import.meta.url), {
          workerData: input,
          execArgv: ['--import', 'tsx'],
        });
        w.on('message', (m: WorkerMessage) => {
          if (m.kind === 'progress') onDay(m.name)(m.day);
          else resolve(m.result);
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          if (code !== 0) reject(new Error(`数值套「${v.name}」的线程异常退出：${code}`));
        });
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(cpus().length, vs.length) }, one));
  return results;
}
