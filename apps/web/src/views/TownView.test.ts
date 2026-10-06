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

  it('页面叫"广场"；标签是新闻、居民、兑换、排行、教室、发展基金（问题记录 122、240-2）', async () => {
    const w = await mountAt('/town?tab=news');
    expect(w.find('h5').text()).toBe('广场');
    expect(w.findAll('.nav-link').map((x) => x.text())).toEqual([
      '新闻',
      '居民',
      '兑换',
      '排行',
      '教室',
      '发展基金',
    ]);
  });

  it('区服关掉发展基金：没有这个标签，存下的上次标签和 ?tab=fund 都退回新闻（240-2）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['fund'] } as never;
    localStorage.setItem('dt_town_tab', 'fund');
    const w = await mountAt('/town');
    expect(w.find('[data-testid="tab-fund"]').exists()).toBe(false);
    expect(w.find('[data-testid="tab-news"]').classes()).toContain('active');
    const q = await mountAt('/town?tab=fund');
    expect(q.find('[data-testid="tab-news"]').classes()).toContain('active');
    expect(endpoints.fund).not.toHaveBeenCalled();
  });

  it('餐厅数据后到、区服关了发展基金：当前标签退回新闻（backlog 基金）', async () => {
    vi.mocked(endpoints.fund).mockResolvedValue({
      days: 7,
      returnRate: 0.9,
      earlyRate: 0.7,
      coin: 0,
      deposit: null,
      tiers: [],
    });
    // 餐厅数据一直没回来：手动设
    vi.mocked(endpoints.overview).mockReturnValue(new Promise(() => {}));
    localStorage.setItem('dt_town_tab', 'fund');
    const w = await mountAt('/town');
    expect(w.find('[data-testid="tab-fund"]').classes()).toContain('active');
    useRestaurantStore().rest = { disabledFeatures: ['fund'] } as never;
    await flushPromises();
    expect(w.find('[data-testid="tab-fund"]').exists()).toBe(false);
    expect(w.find('[data-testid="tab-news"]').classes()).toContain('active');
  });

  it('停在发展基金、餐厅数据读失败：写读取失败、带重试，重试成功后显示基金（backlog 第 ⑤ 批）', async () => {
    vi.mocked(endpoints.fund).mockResolvedValue({
      days: 7,
      returnRate: 0.9,
      earlyRate: 0.7,
      coin: 0,
      deposit: null,
      tiers: [],
    });
    vi.mocked(endpoints.overview).mockRejectedValueOnce(new Error('net'));
    const w = await mountAt('/town?tab=fund');
    expect(w.find('[data-testid="fund-rest-failed"]').exists()).toBe(true);
    await w.get('[data-testid="fund-rest-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="fund-rest-failed"]').exists()).toBe(false);
    expect(endpoints.fund).toHaveBeenCalled();
  });

  it('直接从链接进发展基金、区服关了它：餐厅数据读到前不请求基金，也就不弹“功能关闭”（backlog ①a）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: ['fund'] } as never);
    const w = await mountAt('/town?tab=fund');
    expect(endpoints.overview).toHaveBeenCalled();
    expect(endpoints.fund).not.toHaveBeenCalled();
    expect(w.find('[data-testid="tab-news"]').classes()).toContain('active');
  });

  it('停在发展基金、餐厅数据还没回来：不把居民面板显示在基金标签下（质量期 ⑤ 终审）', async () => {
    vi.mocked(endpoints.overview).mockReturnValue(new Promise(() => {}));
    const w = await mountAt('/town?tab=fund');
    expect(w.find('[data-testid="tab-fund"]').classes()).toContain('active');
    expect(w.find('[data-testid="mayor-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(false);
  });

  it('?tab=fund 打开发展基金（240-2）', async () => {
    vi.mocked(endpoints.fund).mockResolvedValue({
      days: 7,
      returnRate: 0.9,
      earlyRate: 0.7,
      coin: 0,
      deposit: null,
      tiers: [],
    });
    const w = await mountAt('/town?tab=fund');
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(true);
  });

  it('?tab=classroom 打开教室（问题记录 122：教室放进广场）', async () => {
    vi.mocked(endpoints.lessons).mockResolvedValue({
      items: [],
      mine: null,
      certs: [],
      canForceClose: false,
      forceCloseCoinPerLevel: 0,
      forgetPerLevel: 3,
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue({ items: [] } as never);
    const w = await mountAt('/town?tab=classroom');
    expect(w.find('[data-testid="tab-classroom"]').classes()).toContain('active');
    expect(w.find('[data-testid="classroom-panel"]').exists()).toBe(true);
    expect(endpoints.lessons).toHaveBeenCalled();
  });
});
