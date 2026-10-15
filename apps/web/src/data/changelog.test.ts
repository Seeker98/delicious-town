import { describe, expect, it } from 'vitest';
import { LOCALES } from '@dt/shared';
import { cachedChangelog, loadChangelog } from '../i18n/changelog';
import { CHANGELOG } from './changelog';

describe('更新记录数据（问题记录 348）', () => {
  it('按日期从新到旧；id 不重复；每条在五种语言里都有文案', async () => {
    const dates = CHANGELOG.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(CHANGELOG.map((x) => x.id)).size).toBe(CHANGELOG.length);
    for (const l of LOCALES) {
      const texts = (await import(`../i18n/changelog/${l}.ts`)).default as Record<string, string>;
      for (const x of CHANGELOG) expect(texts[x.id]?.trim(), `${l} ${x.id}`).toBeTruthy();
      expect(Object.keys(texts).sort(), l).toEqual(CHANGELOG.map((x) => x.id).sort());
    }
  });

  it('按语言加载，加载过的直接从缓存拿', async () => {
    expect(cachedChangelog('en')).toBeUndefined();
    const en = await loadChangelog('en');
    expect(en[CHANGELOG[0]!.id]).not.toBe((await loadChangelog('zh-CN'))[CHANGELOG[0]!.id]);
    expect(cachedChangelog('en')).toBe(en);
  });
});
