import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { routes } from '../router';
import { usePageTitleStore } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import AppHeader from './AppHeader.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { mailUnread: vi.fn(), serverTime: vi.fn(), overview: vi.fn() },
}));

const stub = { template: '<div/>' };
/** 用真实路由表（元数据要真的），页面换成空组件 */
const stubbed = (rs: RouteRecordRaw[]): RouteRecordRaw[] =>
  rs.map((r) =>
    'component' in r ? { ...r, component: stub, children: r.children && stubbed(r.children) } : r,
  ) as RouteRecordRaw[];
async function mountHeader(path: string, inGame = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: stubbed(routes) });
  await router.push(path);
  const w = mount(AppHeader, { props: { inGame }, global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 0 });
  vi.mocked(endpoints.serverTime).mockResolvedValue({ now: new Date().toISOString() });
  vi.mocked(endpoints.overview).mockResolvedValue({ name: '不会玩', disabledFeatures: ['bar'] } as never);
  useSessionStore().me = { restaurantId: 1, role: 'player' } as never;
});

describe('顶栏（界面改版 P2a，设计 §4.2）', () => {
  it('显示当前页的标题；根页面没有返回', async () => {
    const { w } = await mountHeader('/cookbooks');
    expect(w.get('[data-testid="page-title"]').text()).toBe('食谱');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
  });

  it('返回去逻辑上一级，没有浏览历史也一样（不回首页、不退出网站）', async () => {
    const { w, router } = await mountHeader('/friends/9/flip');
    await w.get('[data-testid="back"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/friends/9');
  });

  it('页面写了动态标题就用它（帖子标题、店名），没写用路由标题', async () => {
    const { w } = await mountHeader('/forum/3');
    expect(w.get('[data-testid="page-title"]').text()).toBe('帖子');
    usePageTitleStore().title = '新手怎么赚钱';
    await flushPromises();
    expect(w.get('[data-testid="page-title"]').text()).toBe('新手怎么赚钱');
  });

  it('标题一行截断，不把右边的邮件、“我”挤出去', async () => {
    const { w } = await mountHeader('/bar');
    expect(w.get('[data-testid="page-title"]').classes()).toContain('dt-clamp1');
    expect(w.find('[data-testid="mail-link"]').exists()).toBe(true);
    expect(w.get('[data-testid="me-link"]').attributes('href')).toBe('/me');
  });

  it('没登录看公开页：有标题，没有返回、邮件和“我”；登录页只显示游戏名', async () => {
    useSessionStore().me = null;
    const { w } = await mountHeader('/wiki', false);
    expect(w.get('[data-testid="page-title"]').text()).toBe('游戏资料');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
    expect(w.find('[data-testid="mail-link"]').exists()).toBe(false);
    expect(w.find('[data-testid="me-link"]').exists()).toBe(false);
    const login = await mountHeader('/login', false);
    expect(login.w.get('[data-testid="page-title"]').text()).toBe('美味小镇');
  });

  it('游戏内每次换页刷新一次邮箱未读数', async () => {
    const { router } = await mountHeader('/');
    await router.push('/bar');
    await flushPromises();
    expect(endpoints.mailUnread).toHaveBeenCalled();
  });

  it('直接打开首页以外的页面（餐厅数据还没读）：顶栏读一次，头像有字、关掉的功能也认得出（截图自查）', async () => {
    const { w } = await mountHeader('/map');
    expect(endpoints.overview).toHaveBeenCalledTimes(1);
    expect(w.get('[data-testid="me-link"]').text()).toBe('不');
    expect(useRestaurantStore().featureOn('bar')).toBe(false);
  });

  it('已经读过餐厅数据就不重复读', async () => {
    useRestaurantStore().rest = { name: '甲' } as never;
    await mountHeader('/map');
    expect(endpoints.overview).not.toHaveBeenCalled();
  });
});
