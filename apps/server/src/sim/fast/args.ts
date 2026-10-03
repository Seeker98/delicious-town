import { parseArgs } from 'node:util';
import type { Persona } from '../bot';

const PERSONA_KEYS: readonly string[] = ['diligent', 'normal', 'casual'];

export interface FastArgs {
  calibrate: boolean;
  days: number;
  bots: number;
  seed: number;
  personas: Persona['key'][];
  variants: string[];
  sets: string[];
  side: string | undefined;
  out: string | undefined;
  stuckDays: number;
  start: Date;
}

const positiveInt = (name: string, raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} 要填正整数：${raw}`);
  return n;
};

/**
 * pnpm sim:fast 的参数（快速模拟设计 §6）。backlog 快速模拟：
 * --calibrate 只在没写 --days、--bots 时才用 5；数字、画像名、开始时间都校验；--set 可以写多次
 */
export function parseFastArgs(args: string[]): FastArgs {
  const { values } = parseArgs({
    args,
    options: {
      days: { type: 'string' },
      bots: { type: 'string' },
      seed: { type: 'string', default: '1' },
      personas: { type: 'string', default: 'diligent,normal,casual' },
      variant: { type: 'string', multiple: true, default: [] },
      set: { type: 'string', multiple: true, default: [] },
      side: { type: 'string' },
      out: { type: 'string' },
      'stuck-days': { type: 'string', default: '5' },
      start: { type: 'string', default: '2026-10-01T00:00:00+08:00' },
      calibrate: { type: 'boolean', default: false },
    },
  });
  const calibrate = values.calibrate;
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) throw new Error(`--seed 要填整数：${values.seed}`);
  const personas = values.personas.split(',').map((p) => p.trim());
  const bad = personas.filter((p) => !PERSONA_KEYS.includes(p));
  if (bad.length > 0 || personas.length === 0)
    throw new Error(`--personas 只能是 ${PERSONA_KEYS.join('、')}：${bad.join('、')}`);
  const start = new Date(values.start);
  if (Number.isNaN(start.getTime())) throw new Error(`--start 不是有效的时间：${values.start}`);
  return {
    calibrate,
    days: values.days === undefined ? (calibrate ? 5 : 30) : positiveInt('--days', values.days),
    bots: values.bots === undefined ? (calibrate ? 5 : 20) : positiveInt('--bots', values.bots),
    seed,
    personas: personas as Persona['key'][],
    variants: values.variant,
    sets: values.set,
    side: values.side,
    out: values.out,
    stuckDays: positiveInt('--stuck-days', values['stuck-days']),
    start,
  };
}
