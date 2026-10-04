import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en';
import es from '../i18n/locales/es';
import fr from '../i18n/locales/fr';
import zhCN from '../i18n/locales/zh-CN';
import zhTW from '../i18n/locales/zh-TW';
import { CHANGELOG } from './changelog';

describe('更新记录数据（问题记录 348）', () => {
  it('按日期从新到旧；id 不重复；每条在五种语言里都有文案', () => {
    const dates = CHANGELOG.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(CHANGELOG.map((x) => x.id)).size).toBe(CHANGELOG.length);
    for (const m of [zhCN, zhTW, en, fr, es]) {
      const texts = m.site.changelog as Record<string, string>;
      for (const x of CHANGELOG) expect(texts[x.id]?.trim(), `${x.id}`).toBeTruthy();
      expect(Object.keys(texts).sort()).toEqual(CHANGELOG.map((x) => x.id).sort());
    }
  });
});
