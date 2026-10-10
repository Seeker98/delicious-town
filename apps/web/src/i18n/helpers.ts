/** 翻译文件共用的小工具（问题记录 272）：只处理参数，不含文字 */
export type P = Record<string, unknown>;
/** 参数取数字（缺省 0） */
export const num = (x: unknown) => Number(x ?? 0);
/** 参数里的某个键取数字 */
export const n = (p: P, k: string) => Number(p[k] ?? 0);
/** 参数取字符串（不是字符串时为空） */
export const str = (x: unknown) => (typeof x === 'string' ? x : '');
/** 参数取数组 */
export const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
/** 统一签名的函数表：K 是键，值都是同一种函数（其他语言照着写，不用的参数可以省略） */
export const table =
  <F>() =>
  <K extends string>(x: Record<K, F>): Record<K, F> =>
    x;
/** 排行等大数的缩写（≥ 1 万才缩写，否则 null 用千分位）：百万以上保留两位小数，以下一位 */
export const compactNum = (locale: string, n: number): string | null =>
  Math.abs(n) >= 1e4
    ? new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: Math.abs(n) >= 1e6 ? 2 : 1,
      }).format(n)
    : null;
/**
 * 英法西的单复数（质量期 ④，backlog #116）：按数字选名词的单数或复数。传原始数字，不要传格式化后的“1,000”。
 * 英文、西文只有 1 用单数（0 也用复数）；法文 0 和 1 都用单数
 */
export const plEn = (x: unknown, one: string, many: string): string =>
  Math.abs(Number(x)) === 1 ? one : many;
export const plEs = plEn;
export const plFr = (x: unknown, one: string, many: string): string => (Math.abs(Number(x)) < 2 ? one : many);

/** 日志参数里的一份随机奖励（kind / id / num，许愿树安慰奖等）写成文字；没有时为空串 */
export function awardWords(
  x: unknown,
  names: { goodsName(id: number): string; foodName(id: number): string },
  w: { coin: (n: string) => string; exp: (n: string) => string; qty: (name: string, n: number) => string },
  fmt: (n: number) => string,
): string {
  const a = (x ?? null) as { kind?: string; id?: number | null; num?: number } | null;
  if (!a?.num) return '';
  if (a.kind === 'goods') return w.qty(names.goodsName(Number(a.id)), a.num);
  if (a.kind === 'foods') return w.qty(names.foodName(Number(a.id)), a.num);
  return a.kind === 'exp' ? w.exp(fmt(a.num)) : w.coin(fmt(a.num));
}
