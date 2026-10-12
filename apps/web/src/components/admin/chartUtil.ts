import { formatNum } from '../../utils/format';

/** 后台图表的五种固定颜色（界面改版 P12）：紫、琥珀、蓝、绿、灰，色值在 tokens.css */
export const CHART_COLORS = [1, 2, 3, 4, 5].map((i) => `var(--dt-chart-${i})`);
export const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length]!;

/** 纵轴刻度的数：上万写“万”、上亿写“亿”，保留一位小数；负数用减号“−” */
export function shortNum(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  const one = (n: number) => String(Math.round(n * 10) / 10);
  if (a >= 1e8) return `${sign}${one(a / 1e8)} 亿`;
  if (a >= 1e4) return `${sign}${one(a / 1e4)} 万`;
  return `${sign}${formatNum(Math.round(a))}`;
}
