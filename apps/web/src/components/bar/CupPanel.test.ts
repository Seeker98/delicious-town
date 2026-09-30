import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import CupPanel from './CupPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barCup: vi.fn() } }));

describe('CupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('写明这一局要几张礼券和当前连胜；猜对显示连胜和奖励', async () => {
    vi.mocked(endpoints.barCup).mockResolvedValue({
      win: true,
      cost: 3,
      times: 3,
      lucky: false,
      award: { kind: 'exp', id: null, num: 300, lucky: false },
    });
    const w = mount(CupPanel, {
      props: { data: barData({ cup: { result: 'win', times: 2, nextCost: 3 } }) },
    });
    expect(w.find('[data-testid="cup-cost"]').text()).toBe('3');
    expect(w.find('[data-testid="cup-streak"]').text()).toContain('2 连胜');
    await w.find('[data-testid="cup-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.barCup).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="cup-result"]').text()).toBe('猜对了！3 连胜，得到 经验 300');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('猜错写连错次数', async () => {
    vi.mocked(endpoints.barCup).mockResolvedValue({
      win: false,
      cost: 1,
      times: 2,
      lucky: false,
      award: null,
    });
    const w = mount(CupPanel, { props: { data: barData() } });
    await w.find('[data-testid="cup-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="cup-result"]').text()).toBe('猜错了，已经连错 2 次。下一局从 1 张礼券开始');
  });

  it('礼券不够这一局时按钮灰掉并写明原因', () => {
    const w = mount(CupPanel, {
      props: { data: barData({ tickets: 2, cup: { result: 'win', times: 2, nextCost: 3 } }) },
    });
    expect(w.find('[data-testid="cup-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('这一局要 3 张');
  });
});
