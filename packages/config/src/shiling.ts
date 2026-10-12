import type { Tuning } from './tuning';

/** 兽道（特殊天气当令） */
export const BEAST_ROAD = 7;

/**
 * 当令表的检查（天气改版设计 §3.1）：配置构建和后台保存区服数值都调用。
 * 每种天气都要有；特殊天气只当令兽道；其他天气两道（1~6 不重复）；日夜对应的天气当令相同
 */
export function shilingErrors(
  t: Tuning['shiling'],
  ref: {
    weathers: ReadonlyArray<{ id: number; special: boolean }>;
    counter: ReadonlyArray<[number, number]>;
  },
): string[] {
  const errors: string[] = [];
  const ids = new Set(ref.weathers.map((w) => w.id));
  const roads = new Map<number, number[]>();
  for (const [k, r] of t.roads) {
    if (!ids.has(k)) errors.push(`tuning.shiling roads: unknown weather ${k}`);
    if (roads.has(k)) errors.push(`tuning.shiling roads: weather ${k} listed twice`);
    roads.set(k, r);
  }
  for (const w of ref.weathers) {
    const r = roads.get(w.id);
    if (!r) {
      errors.push(`tuning.shiling roads misses weather ${w.id}`);
      continue;
    }
    if (w.special) {
      if (r.length !== 1 || r[0] !== BEAST_ROAD)
        errors.push(`tuning.shiling roads ${w.id}: special weather must be [${BEAST_ROAD}]`);
    } else if (r.length !== 2 || r[0] === r[1] || r.some((x) => x >= BEAST_ROAD))
      errors.push(`tuning.shiling roads ${w.id}: needs two different roads 1~6`);
  }
  const key = (r: number[] | undefined) => [...(r ?? [])].sort().join(',');
  for (const [a, b] of ref.counter)
    if (key(roads.get(a)) !== key(roads.get(b)))
      errors.push(`tuning.shiling roads ${a} and ${b} (day/night pair) differ`);
  return errors;
}
