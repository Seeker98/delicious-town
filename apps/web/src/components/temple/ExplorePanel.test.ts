import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ExplorePanel from './ExplorePanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { templeExplore: vi.fn(), templeMissile: vi.fn() } }));

describe('ExplorePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.templeExplore).mockResolvedValue({
      success: 1,
      fail: 1,
      rare: [],
      foods: [],
      exp: 0,
    });
  });

  it('体力按千分位显示（问题记录 296）', () => {
    const w = mount(ExplorePanel, { props: { data: templeData({ strength: 9848 }) } });
    expect(w.text()).toContain('体力 9,848');
  });

  it('次数不超过 持有 / 体力÷每次体力 / 99', async () => {
    const w = mount(ExplorePanel, { props: { data: templeData({ strength: 5 }) } });
    await w.find('[data-testid="times"]').setValue('9');
    await w.find('[data-testid="explore"]').trigger('click');
    await flushPromises();
    expect(endpoints.templeExplore).toHaveBeenCalledWith(170, 2);
    expect(w.find('[data-testid="explore-result"]').text()).toContain('迷路 1 次');
  });

  it('体力不够：按钮灰掉并写明原因', () => {
    const w = mount(ExplorePanel, { props: { data: templeData({ strength: 1 }) } });
    expect(w.find('[data-testid="explore"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('体力不够');
  });
});
