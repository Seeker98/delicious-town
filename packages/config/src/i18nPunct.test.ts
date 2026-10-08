import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultDataDir } from './source';

/**
 * 配置里法文、西文翻译的标点空格（2026-10-08 整批统一，和网页语言包 frEsPunct.test 同一套规则）：
 * 法文 ; : ! ? % 前、« 后、» 前用窄不换行空格 \u202f；西文数和 % 之间用不换行空格 \u00a0
 */
const BAD: Record<'fr' | 'es', RegExp> = {
  fr: /[ \u00a0][;:!?%]|«[ \u00a0]|[ \u00a0]»|[0-9]%/,
  es: /[ \u202f]%|[0-9]%/,
};

describe('配置翻译的标点空格（法文、西文）', () => {
  for (const lang of ['fr', 'es'] as const) {
    it(`data/i18n/${lang}`, () => {
      const dir = join(defaultDataDir(), 'i18n', lang);
      const bad: string[] = [];
      for (const name of readdirSync(dir)) {
        const walk = (v: unknown, at: string): void => {
          if (typeof v === 'string') {
            if (BAD[lang].test(v)) bad.push(`${name}${at} ${v.slice(0, 50)}`);
          } else if (v && typeof v === 'object') {
            for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
          }
        };
        walk(JSON.parse(readFileSync(join(dir, name), 'utf8')), '');
      }
      expect(bad).toEqual([]);
    });
  }
});
