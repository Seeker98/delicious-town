import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeLocale, activeMessages, LOADERS } from '.';
import { useLocaleStore } from '../stores/locale';
import { formatNum } from '../utils/format';

describe('翻译核心（问题记录 272）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    try {
      localStorage.clear();
    } catch {
      // 忽略
    }
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    // 别的测试默认是简中
    await useLocaleStore().set('zh-CN');
  });

  it('默认简中，数字千分位逗号', () => {
    expect(activeLocale()).toBe('zh-CN');
    expect(formatNum(3000000)).toBe('3,000,000');
  });

  it('切换到英语：加载翻译、生效、存进浏览器、设置 <html lang>；数字格式跟着变（法语用空格分千位）', async () => {
    const s = useLocaleStore();
    expect(await s.set('en')).toBe('ok');
    expect(s.locale).toBe('en');
    expect(activeMessages().common.loading).toBe('Loading…');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('dt_locale')).toBe('en');
    await s.set('fr');
    expect(formatNum(3000000).replace(/\s/g, ' ')).toBe('3 000 000');
    await s.set('zh-CN');
    expect(formatNum(3000000)).toBe('3,000,000');
    // 第一次加载英、法语言包时 Vite 现场编译，全量并行跑可能超过默认的 15 秒（backlog 测试不稳定）
  }, 60_000);

  it('初始化：浏览器里存了合法的语言就用它；存的值不合法按浏览器语言判断', async () => {
    localStorage.setItem('dt_locale', 'es');
    const s = useLocaleStore();
    await s.init();
    expect(s.locale).toBe('es');
    localStorage.setItem('dt_locale', 'klingon');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
    setActivePinia(createPinia());
    const s2 = useLocaleStore();
    await s2.init();
    expect(s2.locale).toBe('fr');
  });

  it('加载翻译失败（离线、部署中）：保持原语言，返回 failed', async () => {
    const s = useLocaleStore();
    // 用前面用例没加载过的语言：加载过的有缓存，不会再请求
    vi.spyOn(LOADERS, 'zh-TW').mockRejectedValueOnce(new Error('offline'));
    expect(await s.set('zh-TW')).toBe('failed');
    expect(s.locale).toBe('zh-CN');
    expect(activeLocale()).toBe('zh-CN');
  });
});
