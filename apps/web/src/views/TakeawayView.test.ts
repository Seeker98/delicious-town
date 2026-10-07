import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { takeawayData } from '../components/takeaway/testData';
import TakeawayView from './TakeawayView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { takeaway: vi.fn() } }));

const stubs = {
  OpenPanel: { template: '<p>open-panel</p>', props: ['data'] },
  OrdersPanel: {
    template: `<button data-testid="again" @click="$emit('reload')">orders-panel</button>`,
    props: ['data'],
    emits: ['reload'],
  },
  DeliveriesPanel: { template: '<p>deliveries-panel</p>', props: ['data'] },
  RidersPanel: { template: '<p>riders-panel</p>', props: ['data'] },
};

describe('TakeawayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('没开通时只显示开通面板', async () => {
    vi.mocked(endpoints.takeaway).mockResolvedValue(takeawayData({ opened: false }));
    const w = mount(TakeawayView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain('open-panel');
    expect(w.find('[data-testid="tab-orders"]').exists()).toBe(false);
  });

  it('开通后默认外卖单标签；标签写数量；切到配送中并记住；面板要求刷新时重新读取', async () => {
    vi.mocked(endpoints.takeaway).mockResolvedValue(takeawayData());
    const w = mount(TakeawayView, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="tab-orders"]').text()).toBe('外卖单 (1)');
    expect(w.find('[data-testid="tab-deliveries"]').text()).toBe('配送中 (0)');
    await w.find('[data-testid="again"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeaway).toHaveBeenCalledTimes(2);
    await w.find('[data-testid="tab-deliveries"]').trigger('click');
    expect(w.text()).toContain('deliveries-panel');
    // 切标签时重新读取：接单后马上切到配送中，旧面板已卸载收不到刷新通知
    await flushPromises();
    expect(endpoints.takeaway).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem('dt_takeaway_tab')).toBe('deliveries');
    const again = mount(TakeawayView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('deliveries-panel');
    await again.find('[data-testid="tab-riders"]').trigger('click');
    expect(again.text()).toContain('riders-panel');
  });

  it('停在页面上时每分钟重新读取，倒计时和"已送到"会更新（终审 I2）', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(endpoints.takeaway).mockResolvedValue(takeawayData());
      const w = mount(TakeawayView, { global: { stubs } });
      await flushPromises();
      expect(endpoints.takeaway).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(endpoints.takeaway).toHaveBeenCalledTimes(2);
      w.unmount();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(endpoints.takeaway).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
