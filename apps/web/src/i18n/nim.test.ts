import { describe, expect, it } from 'vitest';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import zhCN from './locales/zh-CN';

describe('最后一颗糖的文案（审查）', () => {
  it.each([
    ['zh-CN', zhCN],
    ['en', en],
    ['es', es],
    ['fr', fr],
  ])('%s：规则和更新记录里不出现字母 k（玩家看不懂）', (_l, m) => {
    expect(m.bar.nim.rule).not.toMatch(/\bk\b/);
    expect(m.site.changelog.nim1007).not.toMatch(/\bk\b/);
  });

  it('西语和酒吧其他文案同一套叫法：声望 renombre、调酒师 barman', () => {
    const all = JSON.stringify(
      Object.values(es.bar.nim).map((v) => (typeof v === 'function' ? String(v) : v)),
    );
    const text = all + es.site.changelog.nim1007;
    expect(text).not.toMatch(/reputación|camarero/);
    expect(text).toMatch(/renombre/);
    expect(text).toMatch(/barman/);
  });
});
