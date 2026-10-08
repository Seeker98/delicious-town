import { describe, expect, it } from 'vitest';
import { routes, scrollFor } from './router';

describe('routes', () => {
  it('游戏资料的页面都不用登录；已开店时显示底部导航；厨具详情跳到道具详情（问题记录 142）', () => {
    const wiki = routes.filter((r) => r.path.startsWith('/wiki') && !r.redirect);
    expect(wiki.map((r) => r.path)).toEqual([
      '/wiki',
      '/wiki/guide',
      '/wiki/api',
      '/wiki/goods/:id(\\d+)',
      '/wiki/foods/:id(\\d+)',
      '/wiki/cookbooks/:id(\\d+)',
      '/wiki/streets/:id(\\d+)',
      '/wiki/:kind',
    ]);
    for (const r of wiki) expect(r.meta).toEqual({ public: true, gameChrome: true });
    const eq = routes.find((r) => r.path.startsWith('/wiki/equips'))!;
    expect((eq.redirect as (to: { params: { id: string } }) => string)({ params: { id: '30' } })).toBe(
      '/wiki/goods/30',
    );
  });

  it('旧的 /town?tab=exchange|classroom|fund 在路由里就转到协会（问题记录 441）', () => {
    const town = routes.find((r) => r.path === '/town')!;
    const guard = town.beforeEnter as (to: { query: Record<string, string> }) => unknown;
    expect(guard({ query: { tab: 'exchange' } })).toBe('/society/mayor');
    expect(guard({ query: { tab: 'classroom' } })).toBe('/society/classroom');
    expect(guard({ query: { tab: 'fund' } })).toBe('/society/fund');
    expect(guard({ query: { tab: 'news' } })).toBe(true);
    expect(guard({ query: {} })).toBe(true);
  });

  it('旧的教室地址跳到协会的教室（问题记录 122、441）', () => {
    expect(routes.find((r) => r.path === '/classroom')?.redirect).toBe('/society/classroom');
  });
});

describe('切页面时的滚动位置', () => {
  const loc = (path: string, hash = '') => ({ path, hash }) as never;

  it('换了页面回到顶部：原来不处理，在长页面往下滚后点进别的页，新页面停在同样的高度', async () => {
    expect(await scrollFor(loc('/wiki/guide'), loc('/'), null)).toEqual({ top: 0 });
  });

  it('同一页只改了地址参数（切标签、翻页）不动；后退、前进回到原来的位置', async () => {
    expect(await scrollFor(loc('/town'), loc('/town'), null)).toBe(false);
    expect(await scrollFor(loc('/town'), loc('/'), { left: 0, top: 420 })).toEqual({ left: 0, top: 420 });
  });

  it('带 #锚点：等那一块读出来再滚过去（厨具页的加点框，530 遗留）；等不到就回到顶部', async () => {
    const el = document.createElement('div');
    el.id = 'attr-points';
    setTimeout(() => document.body.appendChild(el), 50);
    expect(await scrollFor(loc('/rest/equip', '#attr-points'), loc('/rest/info'), null)).toEqual({
      el,
      top: 8,
    });
    el.remove();
    expect(await scrollFor(loc('/rest/equip', '#nope'), loc('/rest/info'), null, 100)).toEqual({ top: 0 });
  });
});
