import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewsDto } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import { logText } from '../utils/events';
import { newsText } from '../utils/news';
import zhCN from './locales/zh-CN';

const names = {
  goodsName: (id: number) => `G${id}`,
  foodName: (id: number) => `F${id}`,
  mcName: (id: number) => `M${id}`,
  weatherName: (id: number) => `W${id}`,
  streetName: (id: number) => `S${id}`,
};
const at = '2026-10-11T00:00:00Z';
const lost = (award: Record<string, unknown>) =>
  logText({ type: 'wishtree.lost', params: { roundId: 1, goodsId: 7, num: 5, award }, at }, names);
const win = (entries: number) =>
  newsText(
    {
      id: 1,
      type: 'wishtree.win',
      restId: 1,
      restName: 'Bob',
      params: { goodsId: 7, num: 5, entries },
      createdAt: at,
    } as NewsDto,
    names,
  );

describe('许愿树文案（终审）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('没中的日志写明安慰奖是什么（设计 §3.2）', async () => {
    expect(lost({ kind: 'coin', id: null, num: 1400, lucky: false })).toContain('1,400 银币');
    expect(lost({ kind: 'foods', id: 3, num: 2, lucky: false })).toContain('F3×2');
    expect(lost({ kind: 'goods', id: 4, num: 1, lucky: false })).toContain('G4×1');
    expect(lost({ kind: 'exp', id: null, num: 300, lucky: false })).toContain('300 经验');
    for (const l of ['en', 'fr', 'es'] as const) {
      await useLocaleStore().set(l);
      expect(lost({ kind: 'foods', id: 3, num: 2, lucky: false })).toContain('F3');
      expect(lost({ kind: 'coin', id: null, num: 14000, lucky: false })).toMatch(/14.000/);
    }
  });

  it('只有 1 人许愿时英法西新闻用单数', async () => {
    await useLocaleStore().set('en');
    expect(win(1)).toContain('(1 wish)');
    expect(win(3)).toContain('(3 wishes)');
    await useLocaleStore().set('fr');
    expect(win(1)).toContain('(1 vœu)');
    expect(win(3)).toContain('(3 vœux)');
    await useLocaleStore().set('es');
    expect(win(1)).toContain('(1 deseo)');
    expect(win(3)).toContain('(3 deseos)');
  });

  it('简中更新记录：括号挨着中文引号时不留空格', () => {
    expect(zhCN.site.changelog.wishtree1011).not.toMatch(/[”」] \(/);
  });
});
