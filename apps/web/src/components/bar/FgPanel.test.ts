import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FgPanel from './FgPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barFg: vi.fn() } }));

describe('FgPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('出拳后显示双方出的拳、胜负和奖励，并通知刷新', async () => {
    vi.mocked(endpoints.barFg).mockResolvedValue({
      result: 'win',
      barHand: 1,
      times: 2,
      lucky: true,
      coin: 0,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
    });
    const w = mount(FgPanel, { props: { data: barData({ fg: { result: 'win', times: 1 } }) } });
    // 当前连胜写在说明卡的副标题里（界面改版 P9）
    expect(w.find('[data-testid="bar-info-sub"]').text()).toContain('1 连胜');
    expect(w.find('[data-testid="fg-result"]').exists()).toBe(false);
    await w.find('[data-testid="fg-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.barFg).toHaveBeenCalledWith(0);
    expect(w.find('[data-testid="fg-me"]').text()).toBe('你 · 石头');
    expect(w.find('[data-testid="fg-bar"]').text()).toBe('调酒师 · 剪刀');
    const res = w.find('[data-testid="fg-result"]');
    expect(res.find('b').text()).toBe('幸运地赢了！2 连胜');
    expect(res.classes()).toContain('is-ok');
    expect(res.findAll('[data-testid="award-chip"]').map((c) => c.text())).toEqual(['银币 200']);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('平局写银币；输了写对方的拳', async () => {
    vi.mocked(endpoints.barFg).mockResolvedValue({
      result: 'draw',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 30,
      award: null,
    });
    const w = mount(FgPanel, { props: { data: barData() } });
    await w.find('[data-testid="fg-2"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="fg-me"]').text()).toBe('你 · 布');
    expect(w.find('[data-testid="fg-bar"]').text()).toBe('调酒师 · 布');
    expect(w.find('[data-testid="fg-result"]').text()).toBe('平局, 得到银币 30');
    expect(w.find('[data-testid="award-chip"]').exists()).toBe(false);
    vi.mocked(endpoints.barFg).mockResolvedValue({
      result: 'lose',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 0,
      award: null,
    });
    await w.find('[data-testid="fg-0"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="fg-me"]').text()).toBe('你 · 石头');
    expect(w.find('[data-testid="fg-bar"]').text()).toBe('调酒师 · 布');
    expect(w.find('[data-testid="fg-result"]').text()).toBe('你输了');
    expect(w.find('[data-testid="fg-result"]').classes()).toContain('is-bad');
  });

  it('礼券不够时按钮灰掉并写明原因', () => {
    const w = mount(FgPanel, { props: { data: barData({ tickets: 0 }) } });
    expect(w.find('[data-testid="fg-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('神秘礼券不够');
  });
});
