import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLocale, LOCALES } from '@dt/shared';
import { fillLocaleChunks, localeChunks, PLACEHOLDER } from './localePreload';

const chunk = (facadeModuleId: string | null, imports: string[] = [], isEntry = false) => ({
  type: 'chunk' as const,
  facadeModuleId,
  imports,
  isEntry,
});

describe('语言包提前下载（性能 2026-10-31）：构建时的文件表', () => {
  it('每种语言：语言包自己和它引用的分包；入口和入口已经引用的不算；网址带 base', () => {
    const map = localeChunks(
      {
        'assets/index-main.js': chunk('/r/apps/web/index.html', ['assets/vue.js'], true),
        'assets/vue.js': chunk(null),
        'assets/index-zh.js': chunk('C:\\r\\apps\\web\\src\\i18n\\locales\\zh-CN\\index.ts', [
          'assets/helpers.js',
          'assets/vue.js',
        ]),
        'assets/helpers.js': chunk(null, ['assets/ids.js']),
        'assets/ids.js': chunk(null),
        'assets/index-en.js': chunk('/r/apps/web/src/i18n/locales/en/index.ts', ['assets/helpers.js']),
        // 更新记录也按语言分包，但不是语言包，不提前下载
        'assets/zh-CN-log.js': chunk('/r/apps/web/src/i18n/changelog/zh-CN.ts'),
        'assets/index.css': { type: 'asset' as const },
      },
      '/',
    );
    expect(map).toEqual({
      'zh-CN': ['/assets/index-zh.js', '/assets/helpers.js', '/assets/ids.js'],
      en: ['/assets/index-en.js', '/assets/helpers.js', '/assets/ids.js'],
    });
  });

  it('填进 index.html 的空位（引号转义）；index.html 里没有空位时报错，不悄悄失效', () => {
    const html = `<head><meta charset="UTF-8" />${PLACEHOLDER}<script src="/theme-init.js"></script></head>`;
    const out = fillLocaleChunks(html, { en: ['/assets/a&b.js'] });
    expect(out).toContain(
      '<meta name="dt-locale-chunks" content="{&quot;en&quot;:[&quot;/assets/a&amp;b.js&quot;]}" />',
    );
    expect(() => fillLocaleChunks('<head></head>', {})).toThrow(/index\.html/);
  });

  it('index.html 里有空位，排在 charset 后面、theme-init.js 前面', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    const at = html.indexOf(PLACEHOLDER);
    expect(at).toBeGreaterThan(html.indexOf('charset'));
    expect(at).toBeLessThan(html.indexOf('<script src="/theme-init.js">'));
  });
});

describe('语言包提前下载：页面头部按语言挑（public/theme-init.js）', () => {
  const src = readFileSync(resolve(__dirname, '../../public/theme-init.js'), 'utf8');
  const map = Object.fromEntries(LOCALES.map((l) => [l, [`/assets/${l}.js`, '/assets/helpers.js']]));

  /** 跑一遍 theme-init.js，返回提前下载了哪些文件 */
  function run(content: string | null): string[] {
    document.head.innerHTML = '';
    if (content !== null) {
      const meta = document.createElement('meta');
      meta.name = 'dt-locale-chunks';
      meta.content = content;
      document.head.appendChild(meta);
    }
    new Function(src)();
    return [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((l) =>
      l.getAttribute('href')!,
    );
  }
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.head.innerHTML = '';
  });

  it('存过语言（dt_locale）就下载它的', () => {
    localStorage.setItem('dt_locale', 'fr');
    expect(run(JSON.stringify(map))).toEqual(['/assets/fr.js', '/assets/helpers.js']);
  });

  it('没存过、存的不合法：按浏览器语言，和应用里的 detectLocale 判断一样', () => {
    const cases = [
      ['zh-CN'],
      ['zh-HK'],
      ['zh-Hant-TW'],
      ['zh'],
      ['fr-CA'],
      ['es'],
      ['de', 'en-GB'],
      ['ja'],
      ['de', 'fr'],
    ];
    localStorage.setItem('dt_locale', 'toString');
    for (const tags of cases) {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(tags);
      expect(run(JSON.stringify(map))[0], tags.join()).toBe(`/assets/${detectLocale(tags)}.js`);
    }
  });

  it('开发时（空位没填）、内容坏了：什么也不做', () => {
    expect(run('')).toEqual([]);
    expect(run('{bad')).toEqual([]);
    expect(run(null)).toEqual([]);
  });
});
