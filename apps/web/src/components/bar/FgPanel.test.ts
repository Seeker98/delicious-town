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
    expect(w.find('[data-testid="fg-streak"]').text()).toContain('1 连胜');
    await w.find('[data-testid="fg-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.barFg).toHaveBeenCalledWith(0);
    expect(w.find('[data-testid="fg-result"]').text()).toBe(
      '你出石头，对方出剪刀：幸运地赢了（2 连胜），得到 银币 200',
    );
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
    expect(w.find('[data-testid="fg-result"]').text()).toBe('你出布，对方出布：平局，得到银币 30');
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
    expect(w.find('[data-testid="fg-result"]').text()).toBe('你出石头，对方出布：你输了');
  });

  it('礼券不够时按钮灰掉并写明原因', () => {
    const w = mount(FgPanel, { props: { data: barData({ tickets: 0 }) } });
    expect(w.find('[data-testid="fg-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('神秘礼券不够');
  });
});
