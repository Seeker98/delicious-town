import { describe, expect, it } from 'vitest';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';

describe('文案里写的入口路径和界面一致（界面改版 P2a：“更多”换成了小镇和“我”）', () => {
  it.each([
    ['zh-CN', zhCN],
    ['zh-TW', zhTW],
    ['en', en],
    ['fr', fr],
    ['es', es],
  ])('%s：不再写“更多 → 其他”；兑换码、游玩指引按“我”里的叫法写', (_l, m) => {
    expect(JSON.stringify(m)).not.toMatch(/更多 → 其他|更多 → 其它|More → Other|Plus → Autres|Más → Otros/);
    const redeem = m.guide.faqItems.map((x) => x.a.join('')).join('\n');
    expect(redeem).toContain(`${m.nav.titles.me} → ${m.nav.me.redeem}`);
    expect(JSON.stringify(m.market)).toContain(`${m.nav.titles.me} → ${m.nav.me.help} → ${m.nav.help.guide}`);
  });
});
