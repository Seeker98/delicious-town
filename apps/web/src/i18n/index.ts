import { getActivePinia } from 'pinia';
import { DEFAULT_LOCALE, type Locale } from '@dt/shared';
import type zhCN from './locales/zh-CN';

/** 简中的翻译对象是类型来源：其他语言必须结构完全一致（问题记录 272），所以各语言包都是全的，缺字不用拿简中补 */
export type Messages = typeof zhCN;

/**
 * 各语言翻译包的加载器：都按需加载（性能 2026-10-31：简中原来打进主包，压缩后约 28 KB，别的语言的玩家也要下）。
 * 页面头部按存的语言或浏览器语言提前 modulepreload 选中的那个（public/theme-init.js、src/build/localePreload.ts），
 * 和入口 JS 一起下载，不多等一轮
 */
export const LOADERS: Record<Locale, () => Promise<{ default: Messages }>> = {
  'zh-CN': () => import('./locales/zh-CN'),
  'zh-TW': () => import('./locales/zh-TW'),
  en: () => import('./locales/en'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
};
const cache = new Map<Locale, Messages>();

export async function loadMessages(l: Locale): Promise<Messages> {
  const hit = cache.get(l);
  if (hit) return hit;
  const m = (await LOADERS[l]()).default;
  cache.set(l, m);
  return m;
}

/** 启动时第一个翻译包到之前 messages 是空的：应用等它到了才挂载（main.ts），挂载前不读文案 */
let current: { locale: Locale; messages: Messages | undefined } = {
  locale: DEFAULT_LOCALE,
  messages: undefined,
};
/**
 * 语言 store 的响应式状态（不 import store，免得循环引用）。读它的 computed 会跟着语言变：
 * 以前只读普通变量，组件里用它算好的文字（剩余时间、顾客类型、食材等级等）切换语言后不重算，
 * 要刷新页面才变（问题记录 314）
 */
function storeState(): { locale: Locale; messages: Messages | undefined } | undefined {
  return getActivePinia()?.state.value.locale as
    { locale: Locale; messages: Messages | undefined } | undefined;
}
/** 普通函数（报错、新闻、日志文案，数字格式）用：当前语言的翻译 */
export const activeMessages = (): Messages => (storeState()?.messages ?? current.messages)!;
export const activeLocale = (): Locale => storeState()?.locale ?? current.locale;
/** 已经加载过的某种语言的翻译包（没加载过为 undefined） */
export const cachedMessages = (l: Locale): Messages | undefined => cache.get(l);
export function setActive(locale: Locale, messages: Messages): void {
  current = { locale, messages };
}
/** 测试用：直接放进一个已经加载好的翻译包并设为当前（testSetup.ts 预先放简中，组件测试不用每条都等加载） */
export function primeMessages(locale: Locale, messages: Messages): void {
  cache.set(locale, messages);
  setActive(locale, messages);
}
