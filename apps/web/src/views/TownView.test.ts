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
    townExchange: vi.fn(),
    rank: vi.fn(),
    catalog: vi.fn(),
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
});
