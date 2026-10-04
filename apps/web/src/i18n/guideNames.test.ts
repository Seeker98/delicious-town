import { describe, expect, it } from 'vitest';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';

describe('游玩指引“缺某种食材怎么办”用游戏里的叫法（问题记录 50 终审）', () => {
  it.each([
    ['zh-CN', zhCN],
    ['zh-TW', zhTW],
    ['en', en],
    ['fr', fr],
    ['es', es],
  ])('%s：大胃哥的名字和界面一致；写了菜场', (_l, m) => {
    const answer = m.guide.faqItems[1]!.a.join('');
    expect(answer).toContain(m.town.npcs.bigEater.name);
    expect(answer).toContain(m.nav.links.exchange);
  });
});
