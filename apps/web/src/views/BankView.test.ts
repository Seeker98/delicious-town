import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
import BankView from './BankView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { fund: vi.fn(), wealth: vi.fn(), overview: vi.fn() },
}));

async function mountAt(path = '/bank') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/bank', component: BankView }],
  });
  await router.push(path);
  const w = mount(BankView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('银行：盖乐瑞的基金和理财（界面改版 P2b，原来在协会）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useRestaurantStore().rest = { disabledFeatures: [] } as never;
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: [] } as never);
    vi.mocked(endpoints.fund).mockResolvedValue({
      days: 7,
      returnRate: 0.9,
      returnBase: 0.9,
      returnCard: null,
      earlyRate: 0.7,
      coin: 0,
      deposit: null,
      tiers: [],
    });
    vi.mocked(endpoints.wealth).mockReturnValue(new Promise(() => undefined));
  });

  it('两个标签：基金、理财；默认基金', async () => {
    const w = await mountAt();
    expect(w.findAll('[role="tab"]').map((x) => x.text())).toEqual(['基金', '理财']);
    expect(w.get('[data-testid="npc-gary"]').text()).toContain('盖乐瑞');
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(true);
  });

  it('?tab=wealth 打开理财：盖乐瑞讲理财的台词和理财面板', async () => {
    const w = await mountAt('/bank?tab=wealth');
    expect(w.get('[data-testid="npc-garyWealth"]').text()).toContain('盖乐瑞');
    expect(w.find('[data-testid="wealth-panel"]').exists()).toBe(true);
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(false);
  });

  it('只关理财：只有基金，不显示标签栏', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['wealth'] } as never;
    const w = await mountAt('/bank?tab=wealth');
    expect(w.find('[role="tablist"]').exists()).toBe(false);
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(true);
    expect(endpoints.wealth).not.toHaveBeenCalled();
  });

  it('两个都关：写暂未开放', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['fund', 'wealth'] } as never;
    const w = await mountAt();
    expect(w.find('[data-testid="bank-off"]').exists()).toBe(true);
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(false);
  });

  it('直接从链接进来：先读餐厅数据，区服关了就不请求功能接口（240-2 backlog ①a）', async () => {
    useRestaurantStore().rest = null;
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: ['fund', 'wealth'] } as never);
    const w = await mountAt();
    expect(endpoints.overview).toHaveBeenCalled();
    expect(endpoints.fund).not.toHaveBeenCalled();
    expect(w.find('[data-testid="bank-off"]').exists()).toBe(true);
  });

  it('餐厅数据还没回来：不挂面板、不请求；读失败写读取失败、带重试（backlog 第 ⑤ 批）', async () => {
    useRestaurantStore().rest = null;
    vi.mocked(endpoints.overview).mockRejectedValueOnce(new Error('net'));
    const w = await mountAt();
    expect(endpoints.fund).not.toHaveBeenCalled();
    expect(w.find('[data-testid="bank-rest-failed"]').exists()).toBe(true);
    await w.get('[data-testid="bank-rest-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="bank-rest-failed"]').exists()).toBe(false);
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(true);
  });
});
