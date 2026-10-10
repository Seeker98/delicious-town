import { describe, expect, it, vi } from 'vitest';
import zhCN from './i18n/locales/zh-CN';
import { ROOT_PATHS } from './nav/sections';
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
    for (const r of wiki) expect(r.meta).toMatchObject({ public: true, gameChrome: true });
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
  /** 页面高度（jsdom 里默认是 0） */
  const pageHeight = (h: number) =>
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => h });

  it('换了页面回到顶部：原来不处理，在长页面往下滚后点进别的页，新页面停在同样的高度', async () => {
    expect(await scrollFor(loc('/wiki/guide'), loc('/'), null)).toEqual({ top: 0 });
  });

  it('同一页只改了地址参数（切标签、翻页）不动', async () => {
    expect(await scrollFor(loc('/town'), loc('/town'), null)).toBe(false);
  });

  it('后退、前进：等页面数据读回来、够高了再回到原来的位置（终审：太早滚会被截到底）；这时已经不在这页就不动', async () => {
    pageHeight(300);
    setTimeout(() => pageHeight(5000), 60);
    const start = Date.now();
    expect(await scrollFor(loc('/town'), loc('/'), { left: 0, top: 420 })).toEqual({ left: 0, top: 420 });
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
    expect(await scrollFor(loc('/town'), loc('/'), { left: 0, top: 420 }, { current: () => false })).toBe(
      false,
    );
  });

  it('带 #锚点：先回到顶部，等那一块读出来再滚过去（厨具页的加点框，530 遗留）；等不到就留在顶部', async () => {
    const top = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const el = document.createElement('div');
    el.id = 'attr-points';
    setTimeout(() => document.body.appendChild(el), 50);
    expect(await scrollFor(loc('/rest/equip', '#attr-points'), loc('/rest/info'), null)).toEqual({
      el,
      top: 8,
    });
    expect(top).toHaveBeenCalledWith(0, 0);
    el.remove();
    expect(await scrollFor(loc('/rest/equip', '#nope'), loc('/rest/info'), null, { wait: 100 })).toBe(false);
    top.mockRestore();
  });

  it('等的时候用户已经去了别的页（比如点了后退）：不再滚，免得把那一页拉走（终审 I2）', async () => {
    const top = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const el = document.createElement('div');
    el.id = 'attr-points';
    document.body.appendChild(el);
    expect(
      await scrollFor(loc('/rest/equip', '#attr-points'), loc('/rest/info'), null, { current: () => false }),
    ).toBe(false);
    el.remove();
    top.mockRestore();
  });
});

describe('开发用图库（界面改版 P1）', () => {
  it('测试环境（DEV）注册了 /dev/art，不用登录', () => {
    const r = routes.find((x) => x.path === '/dev/art');
    expect(r?.meta).toEqual({ public: true });
  });
});

describe('导航元数据（界面改版 P2a，设计 §4.2）', () => {
  /** 游戏内页面：要开店的，或已开店时显示导航的 */
  const game = routes.filter((r) => !r.redirect && (r.meta?.needRestaurant || r.meta?.gameChrome));
  it('每个游戏内页面都有所属入口和标题', () => {
    for (const r of game) {
      expect(r.meta?.section, r.path).toBeTruthy();
      expect(typeof r.meta?.title, r.path).toBe('function');
      expect(r.meta!.title!(zhCN), r.path).toBeTruthy();
    }
  });
  it('除了底部 6 个入口，每个游戏内页面都有上一级', () => {
    for (const r of game) {
      if (ROOT_PATHS.has(r.path)) expect(r.meta?.parent, r.path).toBeUndefined();
      else expect(r.meta?.parent, r.path).toBeTruthy();
    }
  });
  it('新增小镇、我、帮助中心；旧的“更多”跳到小镇', () => {
    for (const p of ['/map', '/me', '/help']) expect(routes.some((r) => r.path === p)).toBe(true);
    expect(routes.find((r) => r.path === '/more')?.redirect).toBe('/map');
  });
});
