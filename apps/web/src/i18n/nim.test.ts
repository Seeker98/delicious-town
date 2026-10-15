import { describe, expect, it } from 'vitest';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import zhCN from './locales/zh-CN';
import clEn from './changelog/en';
import clEs from './changelog/es';
import clFr from './changelog/fr';
import clZh from './changelog/zh-CN';

describe('最后一颗糖的文案（审查）', () => {
  it.each([
    ['zh-CN', zhCN, clZh.nim1007],
    ['en', en, clEn.nim1007],
    ['es', es, clEs.nim1007],
    ['fr', fr, clFr.nim1007],
  ])('%s：规则和更新记录里不出现字母 k（玩家看不懂）', (_l, m, cl) => {
    expect(m.bar.rules.nim.join(' ')).not.toMatch(/\bk\b/);
    expect(cl).not.toMatch(/\bk\b/);
  });

  it('西语和酒吧其他文案同一套叫法：声望 renombre、调酒师 barman', () => {
    const all = JSON.stringify(
      Object.values(es.bar.nim).map((v) => (typeof v === 'function' ? String(v) : v)),
    );
    const text = all + clEs.nim1007;
    expect(text).not.toMatch(/reputación|camarero/);
    expect(text).toMatch(/renombre/);
    expect(text).toMatch(/barman/);
  });
});
