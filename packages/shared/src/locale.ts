import { z } from 'zod';

/** 支持的语言（问题记录 272）：简中默认 */
export const LOCALES = ['zh-CN', 'zh-TW', 'en', 'fr', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh-CN';
/** 语言选择里显示的名字（用各自的语言写） */
export const LOCALE_NAMES: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  fr: 'Français',
  es: 'Español',
};
export const localeSchema = z.enum(LOCALES);

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

/** 浏览器语言 → 支持的语言：按顺序取第一个能判断的；都判断不了用英语 */
export function detectLocale(tags: readonly string[]): Locale {
  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(t)) return 'zh-TW';
    if (t === 'zh' || t.startsWith('zh-')) return 'zh-CN';
    if (t === 'fr' || t.startsWith('fr-')) return 'fr';
    if (t === 'es' || t.startsWith('es-')) return 'es';
    if (t === 'en' || t.startsWith('en-')) return 'en';
  }
  return 'en';
}
