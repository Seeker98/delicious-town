import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { townData } from '../components/town/testData';
import { useRestaurantStore } from '../stores/restaurant';
import TownView from './TownView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    town: vi.fn(),
    townNews: vi.fn(),
    townDaily: vi
      .fn()
      .mockResolvedValue({ day: '2026-10-08', days: [], article: null, fallback: [], rests: {} }),
    townExchange: vi.fn(),
    rank: vi.fn(),
    catalog: vi.fn(),
    lessons: vi.fn(),
    mc: vi.fn(),
    fund: vi.fn(),
    overview: vi.fn(),
    wishTree: vi.fn(),
    wishTreeWish: vi.fn(),
  },
}));

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/town', component: TownView }],
  });
  await router.push(path);
  const w = mount(TownView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('TownView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.town).mockResolvedValue(townData());
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: [] } as never);
    vi.mocked(endpoints.catalog).mockResolvedValue({
      version: '1',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    });
  });

  it('没指定时记住上次的标签', async () => {
    localStorage.setItem('dt_town_tab', 'town');
    const w = await mountAt('/town');
    expect(w.find('[data-testid="tab-town"]').classes()).toContain('active');
  });

  it('从首页"更多"进来（?tab=news）总是打开新闻，不管上次停在哪（问题记录 106）', async () => {
    localStorage.setItem('dt_town_tab', 'exchange');
    const w = await mountAt('/town?tab=news');
    expect(w.find('[data-testid="tab-news"]').classes()).toContain('active');
  });

  it('?tab=rank 打开排行（4E-2）', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue({
      key: 'income.coin.today',
      rows: [],
      me: null,
      updatedAt: '2026-10-01T04:00:00.000Z',
    });
    const w = await mountAt('/town?tab=rank');
    expect(w.find('[data-testid="rank-panel"]').exists()).toBe(true);
    expect(endpoints.rank).toHaveBeenCalledWith('income.coin.today');
  });

  it('切换标签时地址跟着变，刷新后停在当前标签（PR27 遗留）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/town', component: TownView }],
    });
    await router.push('/town?tab=news');
    const w = mount(TownView, { global: { plugins: [router] } });
    await flushPromises();
    await w.find('[data-testid="tab-town"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('town');
  });

  it('页面叫"广场"；标签是新闻、居民、排行、许愿树（问题记录 441：教室、兑换、发展基金搬到协会）', async () => {
    const w = await mountAt('/town?tab=news');
    // 标题“广场”在顶栏（路由元数据，界面改版 P2a）
    expect(w.find('h5').exists()).toBe(false);
    expect(w.findAll('.nav-link').map((x) => x.text())).toEqual(['新闻', '居民', '排行', '许愿树']);
  });

  // 旧链接 ?tab=exchange|classroom|fund 转到协会、银行：由路由的 beforeEnter 处理，测试在 router.test.ts（界面改版 P2b）

  it('没带参数进来、切换标签：也写进网址（界面改版 P2b：标签统一写进网址，能分享、后退）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/town', component: TownView }],
    });
    await router.push('/town');
    const w = mount(TownView, { global: { plugins: [router] } });
    await flushPromises();
    await w.find('[data-testid="tab-town"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('town');
    expect(w.find('[data-testid="tab-town"]').attributes('role')).toBe('tab');
  });

  it('上次停在已经搬走的标签（存的是 exchange）：打开新闻', async () => {
    localStorage.setItem('dt_town_tab', 'exchange');
    const w = await mountAt('/town');
    expect(w.find('[data-testid="tab-news"]').classes()).toContain('active');
  });

  it('许愿树标签：?tab=wishtree 直接打开；区服关了不显示，地址指定时退回新闻', async () => {
    vi.mocked(endpoints.wishTree).mockResolvedValue({
      enabled: true,
      hour: 20,
      minLevel: 10,
      level: 12,
      titleDays: 3,
      round: null,
      wished: false,
      recent: [],
    });
    const w = await mountAt('/town?tab=wishtree');
    expect(w.find('[data-testid="tab-wishtree"]').classes()).toContain('active');
    expect(w.find('[data-testid="wt-none"]').exists()).toBe(true);

    useRestaurantStore().rest = { disabledFeatures: ['wishtree'] } as never;
    const off = await mountAt('/town?tab=wishtree');
    expect(off.find('[data-testid="tab-wishtree"]').exists()).toBe(false);
    expect(off.find('[data-testid="tab-news"]').classes()).toContain('active');
  });
});
