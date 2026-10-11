import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ExplorePanel from './ExplorePanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { templeExplore: vi.fn(), templeMissile: vi.fn() } }));

/** 数量面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（同 ShopView.test） */
const mountPanel = (data = templeData()) =>
  mount(ExplorePanel, { props: { data }, global: { stubs: { teleport: true } } });

describe('ExplorePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.templeExplore).mockResolvedValue({
      success: 1,
      fail: 1,
      rare: [],
      foods: [{ foodsId: 1, num: 2 }],
      exp: 0,
    });
  });

  it('体力按千分位显示（问题记录 296）', () => {
    const w = mountPanel(templeData({ strength: 9848 }));
    expect(w.find('[data-testid="strength"]').text()).toContain('体力 9,848');
  });

  it('次数不超过 持有 / 体力÷每次体力 / 99', async () => {
    const w = mountPanel(templeData({ strength: 5 }));
    expect(w.find('[data-testid="map-170"]').text()).toContain('持有 10 · 每次体力 2');
    await w.find('[data-testid="explore-open-170"]').trigger('click');
    await w.find('[data-testid="times"]').setValue('9');
    await w.find('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.templeExplore).toHaveBeenCalledWith(170, 2);
    const res = w.find('[data-testid="explore-result"]');
    expect(res.text()).toContain('迷路 1 次');
    expect(res.findAll('[data-testid="award-chip"]')).toHaveLength(1);
    expect(w.emitted('reload')).toBeTruthy();
  });

  it('体力不够：按钮灰掉并写明原因', async () => {
    const w = mountPanel(templeData({ strength: 1 }));
    await w.find('[data-testid="explore-open-170"]').trigger('click');
    expect(w.find('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="qty-reason"]').text()).toContain('体力不够');
  });
});
