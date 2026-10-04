import { describe, expect, it } from 'vitest';
import { routes } from './router';

describe('routes', () => {
  it('游戏资料的页面都不用登录；已开店时显示底部导航；厨具详情跳到道具详情（问题记录 142）', () => {
    const wiki = routes.filter((r) => r.path.startsWith('/wiki') && !r.redirect);
    expect(wiki.map((r) => r.path)).toEqual([
      '/wiki',
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

  it('旧的教室地址跳到广场的教室标签（问题记录 122）', () => {
    expect(routes.find((r) => r.path === '/classroom')?.redirect).toEqual({
      path: '/town',
      query: { tab: 'classroom' },
    });
  });
});
