import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import DeliveriesPanel from './DeliveriesPanel.vue';
import { claimResult, delivery, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { takeawayClaim: vi.fn(), takeawayClaimAll: vi.fn() },
}));

describe('DeliveriesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没到：写还要几分钟，不能领；无人机立即送达，显示结果并通知刷新', async () => {
    vi.mocked(endpoints.takeawayClaim).mockResolvedValue(
      claimResult({ drone: true, goods: { id: 1, num: 2 } }),
    );
    const w = mount(DeliveriesPanel, { props: { data: takeawayData({ deliveries: [delivery()] }) } });
    expect(w.find('[data-testid="delivery-21"]').text()).toContain('还要 30 分钟');
    expect(w.find('[data-testid="claim-21"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="drone-21"]').text()).toBe('无人机（3 钻石）');
    await w.find('[data-testid="drone-21"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayClaim).toHaveBeenCalledWith(21, true);
    expect(w.find('[data-testid="result-head"]').text()).toBe('无人机送到了');
    expect(w.find('[data-testid="result"]').text()).toContain('银币 +198');
    expect(w.find('[data-testid="result"]').text()).toContain('道具1×2');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('钻石不够时无人机灰掉；已到的可以领，失败写原因', async () => {
    vi.mocked(endpoints.takeawayClaim).mockResolvedValue(
      claimResult({
        success: false,
        reason: '顾客退单了!',
        coin: 0,
        renown: 0,
        exp: 6,
        goods: null,
        riderExp: 12,
      }),
    );
    const poor = mount(DeliveriesPanel, {
      props: { data: takeawayData({ diamond: 2, deliveries: [delivery()] }) },
    });
    expect(poor.find('[data-testid="drone-21"]').attributes('disabled')).toBeDefined();
    const w = mount(DeliveriesPanel, {
      props: {
        data: takeawayData({
          deliveries: [delivery({ arrived: true, arriveAt: '2026-09-30T03:50:00.000Z' })],
        }),
      },
    });
    expect(w.find('[data-testid="delivery-21"]').text()).toContain('已送到');
    await w.find('[data-testid="claim-21"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayClaim).toHaveBeenCalledWith(21, false);
    expect(w.find('[data-testid="result-head"]').text()).toBe('配送失败：顾客退单了!');
    expect(w.find('[data-testid="result"]').text()).toContain('骑手经验 +12');
  });

  it('全部领取：没有已到的就灰掉；领到几单显示几张结果', async () => {
    vi.mocked(endpoints.takeawayClaimAll).mockResolvedValue([
      claimResult(),
      claimResult({ deliveryId: 22, customer: 265 }),
    ]);
    const none = mount(DeliveriesPanel, { props: { data: takeawayData({ deliveries: [delivery()] }) } });
    expect(none.find('[data-testid="claim-all"]').attributes('disabled')).toBeDefined();
    const w = mount(DeliveriesPanel, {
      props: {
        data: takeawayData({
          deliveries: [delivery({ arrived: true }), delivery({ id: 22, arrived: true })],
        }),
      },
    });
    await w.find('[data-testid="claim-all"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid="result"]')).toHaveLength(2);
    expect(w.text()).toContain('送外卖时偶遇道具265！');
  });
});
