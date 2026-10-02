import { DEFAULT_LOCALE, type Locale } from '@dt/shared';
import zhCN from './locales/zh-CN';

/** 简中的翻译对象是类型来源：其他语言必须结构完全一致（问题记录 272） */
export type Messages = typeof zhCN;

/** 各语言翻译包的加载器：简中打进主包，其他语言按需加载 */
export const LOADERS: Record<Exclude<Locale, 'zh-CN'>, () => Promise<{ default: Messages }>> = {
  'zh-TW': () => import('./locales/zh-TW'),
  en: () => import('./locales/en'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
};
const cache = new Map<Locale, Messages>([['zh-CN', zhCN]]);

export async function loadMessages(l: Locale): Promise<Messages> {
  const hit = cache.get(l);
  if (hit) return hit;
  const m = (await LOADERS[l as Exclude<Locale, 'zh-CN'>]()).default;
  cache.set(l, m);
  return m;
}

let current: { locale: Locale; messages: Messages } = { locale: DEFAULT_LOCALE, messages: zhCN };
/** 普通函数（报错、新闻、日志文案，数字格式）用：当前语言的翻译 */
export const activeMessages = (): Messages => current.messages;
export const activeLocale = (): Locale => current.locale;
export function setActive(locale: Locale, messages: Messages): void {
  current = { locale, messages };
}
