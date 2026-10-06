import { activeLocale, activeMessages } from '../i18n';

const formats = new Map<string, Intl.NumberFormat>();
/** 千分位按当前语言（问题记录 272）：中文沿用逗号；英、法、西用各自的写法 */
export function formatNum(n: number): string {
  const l = activeLocale();
  let f = formats.get(l);
  if (!f) formats.set(l, (f = new Intl.NumberFormat(l === 'zh-CN' || l === 'zh-TW' ? 'en-US' : l)));
  return f.format(n);
}

const pctFormats = new Map<string, Intl.NumberFormat>();
/**
 * 百分数按当前语言（视觉第三轮）：x 是比例（0.408 → 40.8%）。中文沿用英文写法；
 * 法文、西文用小数逗号，百分号前是不换行的空格。digits 最多几位小数，min 至少几位，sign 正数也写 +
 */
export function formatPct(x: number, o: { digits?: number; min?: number; sign?: boolean } = {}): string {
  const l = activeLocale();
  const digits = o.digits ?? 1;
  const min = Math.min(o.min ?? 0, digits);
  const key = `${l}:${digits}:${min}:${o.sign ? 1 : 0}`;
  let f = pctFormats.get(key);
  if (!f)
    pctFormats.set(
      key,
      (f = new Intl.NumberFormat(l === 'zh-CN' || l === 'zh-TW' ? 'en-US' : l, {
        style: 'percent',
        maximumFractionDigits: digits,
        minimumFractionDigits: min,
        signDisplay: o.sign ? 'exceptZero' : 'auto',
      })),
    );
  const s = f.format(x);
  // 0 也写 +0%，和原来的写法一致
  return o.sign && !/^[+\-−]/.test(s) ? `+${s}` : s;
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
