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
