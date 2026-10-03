import { getActivePinia } from 'pinia';
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
/**
 * 语言 store 的响应式状态（不 import store，免得循环引用）。读它的 computed 会跟着语言变：
 * 以前只读普通变量，组件里用它算好的文字（剩余时间、顾客类型、食材等级等）切换语言后不重算，
 * 要刷新页面才变（问题记录 314）
 */
function storeState(): { locale: Locale; messages: Messages } | undefined {
  return getActivePinia()?.state.value.locale as { locale: Locale; messages: Messages } | undefined;
}
/** 普通函数（报错、新闻、日志文案，数字格式）用：当前语言的翻译 */
export const activeMessages = (): Messages => storeState()?.messages ?? current.messages;
export const activeLocale = (): Locale => storeState()?.locale ?? current.locale;
export function setActive(locale: Locale, messages: Messages): void {
  current = { locale, messages };
}
