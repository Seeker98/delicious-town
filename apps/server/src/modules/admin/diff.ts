const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 两份覆盖之间改动过的叶子路径（数组整体算一个叶子），按字母序；审计和历史页展示用 */
export function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  const aObj = isObj(a);
  const bObj = isObj(b);
  if ((aObj || a === undefined) && (bObj || b === undefined) && (aObj || bObj)) {
    const x = aObj ? a : {};
    const y = bObj ? b : {};
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    return keys.flatMap((k) => diffPaths(x[k], y[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}
