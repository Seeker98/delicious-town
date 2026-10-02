import { describe, expect, it } from 'vitest';
import { detectLocale, isLocale, LOCALES } from './locale';

describe('语言（问题记录 272）', () => {
  it('五种语言，默认简中', () => {
    expect(LOCALES).toEqual(['zh-CN', 'zh-TW', 'en', 'fr', 'es']);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
  it('按浏览器语言判断：繁体地区 → zh-TW，其他中文 → zh-CN，法西各自，其余英语；取第一个能判断的', () => {
    expect(detectLocale(['zh-TW'])).toBe('zh-TW');
    expect(detectLocale(['zh-HK'])).toBe('zh-TW');
    expect(detectLocale(['zh-Hant-MO'])).toBe('zh-TW');
    expect(detectLocale(['zh-CN'])).toBe('zh-CN');
    expect(detectLocale(['zh'])).toBe('zh-CN');
    expect(detectLocale(['fr-CA', 'en'])).toBe('fr');
    expect(detectLocale(['es-MX'])).toBe('es');
    expect(detectLocale(['de-DE', 'es'])).toBe('es');
    expect(detectLocale(['de-DE'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
