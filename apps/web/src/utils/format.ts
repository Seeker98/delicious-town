import { activeLocale, activeMessages } from '../i18n';

const formats = new Map<string, Intl.NumberFormat>();
/** 千分位按当前语言（问题记录 272）：中文沿用逗号；英、法、西用各自的写法 */
export function formatNum(n: number): string {
  const l = activeLocale();
  let f = formats.get(l);
  if (!f) formats.set(l, (f = new Intl.NumberFormat(l === 'zh-CN' || l === 'zh-TW' ? 'en-US' : l)));
  return f.format(n);
}

/** 食材等级的显示名：7 级是神秘食材、9 级是万能食材（问题记录） */
/** 时:分（按当前语言） */
export const timeHM = (iso: string) =>
  new Date(iso).toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });

export function foodLevelLabel(level: number): string {
  return activeMessages().labels.foodLevel(level);
}

/** 排行等大数：≥ 1 亿写 x.xx亿，≥ 1 万写 x.x万，否则千分位 */
export function shortNum(n: number): string {
  return activeMessages().labels.shortNum(n) ?? formatNum(n);
}
