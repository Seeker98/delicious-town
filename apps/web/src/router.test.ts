import { describe, expect, it, vi } from 'vitest';
import zhCN from './i18n/locales/zh-CN';
import { parentPath } from './nav/routeMeta';
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
    // 基金后来又搬到银行（界面改版 P2b）
    expect(guard({ query: { tab: 'fund' } })).toBe('/bank?tab=fund');
    expect(guard({ query: { tab: 'news' } })).toBe(true);
    expect(guard({ query: {} })).toBe(true);
  });

  it('旧的教室地址跳到协会的教室（问题记录 122、441）', () => {
    expect(routes.find((r) => r.path === '/classroom')?.redirect).toBe('/society/classroom');
  });

  it('旧的签到和活跃页跳到任务页的“今日”（界面改版 P2b）', () => {
    expect(routes.find((r) => r.path === '/rest/activation')?.redirect).toBe('/rest/tasks?tab=today');
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
    // 顶栏吸顶 48px（界面改版 P2a 终审 I3）：锚点停在顶栏下面 8px
    expect(await scrollFor(loc('/rest/equip', '#attr-points'), loc('/rest/info'), null)).toEqual({
      el,
      top: 56,
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

describe('并进别的页面的旧地址（界面改版 P2b）', () => {
  it('银行：协会的基金、理财旧地址跳过去；在小镇下面', () => {
    expect(routes.find((r) => r.path === '/society/fund')?.redirect).toBe('/bank?tab=fund');
    expect(routes.find((r) => r.path === '/society/wealth')?.redirect).toBe('/bank?tab=wealth');
    const bank = routes.find((r) => r.path === '/bank')!;
    expect(bank.meta?.section).toBe('map');
    expect(bank.meta?.parent).toBe('/map');
    expect(bank.meta?.needRestaurant).toBe(true);
    expect(bank.meta?.title?.(zhCN)).toBe('银行');
    expect(routes.find((r) => r.path.startsWith('/society/:npc'))!.path).not.toMatch(/fund|wealth/);
  });
  it('/rest/gem 跳到厨具页的宝石标签', () => {
    expect(routes.find((r) => r.path === '/rest/gem')?.redirect).toBe('/rest/equip?tab=gem');
  });
  it('/mc 跳到 /cookbooks?tab=mc', () => {
    expect(routes.find((r) => r.path === '/mc')?.redirect).toBe('/cookbooks?tab=mc');
  });
  it('/cookbooks/progress 带着原来的街、页码跳到 tab=progress', () => {
    const r = routes.find((x) => x.path === '/cookbooks/progress')!;
    const go = r.redirect as (to: { query: Record<string, string> }) => unknown;
    expect(go({ query: { street: '2', page: '3' } })).toEqual({
      path: '/cookbooks',
      query: { street: '2', page: '3', tab: 'progress' },
    });
  });
});

describe('资料库详情的返回（backlog 第 ⑧ 批；界面改版 P2a 起由顶栏返回负责）', () => {
  const at = (path: string, fullPath = path) => {
    const r = routes.find((x) => x.path.startsWith(path.replace(/\/\d+$/, '/')) && x.path.includes(':id'))!;
    return { path: fullPath, fullPath, meta: r.meta, params: { id: '1' } } as never;
  };
  it('回到进来前的列表地址（带搜索、筛选）；从别处进来时回列表首页', () => {
    expect(parentPath(at('/wiki/foods/1001'), '/wiki/foods?f=2&q=%E7%B1%B3')).toBe(
      '/wiki/foods?f=2&q=%E7%B1%B3',
    );
    expect(parentPath(at('/wiki/foods/1001'), '/home')).toBe('/wiki/foods');
    expect(parentPath(at('/wiki/foods/1001'), null)).toBe('/wiki/foods');
    expect(parentPath(at('/wiki/cookbooks/5'), '/wiki/cookbooks?street=2')).toBe('/wiki/cookbooks?street=2');
    expect(parentPath(at('/wiki/streets/3'), undefined)).toBe('/wiki/streets');
  });
  it('道具详情：从厨具列表进来回厨具列表，否则回道具列表', () => {
    expect(parentPath(at('/wiki/goods/30'), '/wiki/equips?part=2')).toBe('/wiki/equips?part=2');
    expect(parentPath(at('/wiki/goods/30'), '/wiki/goods?q=x')).toBe('/wiki/goods?q=x');
    expect(parentPath(at('/wiki/goods/30'), null)).toBe('/wiki/goods');
  });
});

describe('“我”里的页面属于同一个入口（界面改版 P2a 终审 I4）', () => {
  it('上一级一路走到 /me 的页面，底部导航都亮“餐厅”（头像就是店名第一个字）', () => {
    const byPath = new Map(routes.map((r) => [r.path, r]));
    const chain = (p: string): string[] => {
      const r = byPath.get(p);
      const parent = r?.meta?.parent;
      return typeof parent === 'string' ? [parent, ...chain(parent)] : [];
    };
    const under = routes.filter((r) => r.path === '/me' || chain(r.path).includes('/me'));
    expect(under.map((r) => r.path)).toEqual(
      expect.arrayContaining(['/me', '/account', '/help', '/store', '/rest/info']),
    );
    for (const r of under) expect(r.meta?.section, r.path).toBe('home');
  });
});
