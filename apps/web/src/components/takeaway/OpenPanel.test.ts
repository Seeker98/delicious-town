import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import OpenPanel from './OpenPanel.vue';
import { takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { takeawayOpen: vi.fn() } }));

const closed = (patch = {}) => takeawayData({ opened: false, orders: [], riders: [], riderCap: 0, ...patch });

describe('OpenPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayOpen).mockResolvedValue({ opened: true });
  });

  it('条件不满足时两个按钮都灰掉并写明原因', () => {
    const low = mount(OpenPanel, { props: { data: closed({ star: 1 }) } });
    expect(low.find('[data-testid="block-ticket"]').text()).toBe('餐厅 2 星才能开通');
    expect(low.find('[data-testid="open-coin"]').attributes('disabled')).toBeDefined();
    const poor = mount(OpenPanel, { props: { data: closed({ renown: 1000, coin: 0 }) } });
    expect(poor.find('[data-testid="block-ticket"]').text()).toBe('没有外卖券');
    expect(poor.find('[data-testid="block-coin"]').text()).toBe('银币不够（要 8,880,000）');
  });

  it('有外卖券：开通后通知刷新', async () => {
    const data = closed({ renown: 1000 });
    data.open.tickets = 1;
    const w = mount(OpenPanel, { props: { data } });
    expect(w.find('[data-testid="open-ticket"]').text()).toBe('用外卖券开通（持有 1 张）');
    await w.find('[data-testid="open-ticket"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayOpen).toHaveBeenCalledWith('ticket');
    expect(w.emitted('reload')).toHaveLength(1);
  });
});
