import { activeLocale } from '../i18n';

const formats = new Map<string, Intl.NumberFormat>();
/** 千分位按当前语言（问题记录 272）：中文沿用逗号；英、法、西用各自的写法 */
export function formatNum(n: number): string {
  const l = activeLocale();
  let f = formats.get(l);
  if (!f) formats.set(l, (f = new Intl.NumberFormat(l === 'zh-CN' || l === 'zh-TW' ? 'en-US' : l)));
  return f.format(n);
}

/** 食材等级的显示名：7 级是神秘食材、9 级是万能食材（问题记录） */
export function foodLevelLabel(level: number): string {
  if (level === 7) return '神秘';
  if (level === 9) return '万能';
  return `${level} 级`;
}

/** 排行等大数：≥ 1 亿写 x.xx亿，≥ 1 万写 x.x万，否则千分位 */
export function shortNum(n: number): string {
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return formatNum(n);
}
