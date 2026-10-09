import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { townData } from '../components/town/testData';
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

  it('页面叫"广场"；标签只剩新闻、居民、排行（问题记录 441：教室、兑换、发展基金搬到协会）', async () => {
    const w = await mountAt('/town?tab=news');
    expect(w.find('h5').text()).toBe('广场');
    expect(w.findAll('.nav-link').map((x) => x.text())).toEqual(['新闻', '居民', '排行']);
  });

  it.each([
    ['exchange', '/society/mayor'],
    ['classroom', '/society/classroom'],
    ['fund', '/society/fund'],
  ])('旧链接 ?tab=%s 转到协会 %s（问题记录 441）', async (tab, to) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/town', component: TownView },
        { path: '/society/:npc', component: { template: '<div />' } },
      ],
    });
    await router.push(`/town?tab=${tab}`);
    mount(TownView, { global: { plugins: [router] } });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(to);
  });

  it('上次停在已经搬走的标签（存的是 exchange）：打开新闻', async () => {
    localStorage.setItem('dt_town_tab', 'exchange');
    const w = await mountAt('/town');
    expect(w.find('[data-testid="tab-news"]').classes()).toContain('active');
  });
});
