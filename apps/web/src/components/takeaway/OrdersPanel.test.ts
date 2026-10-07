import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import OrdersPanel from './OrdersPanel.vue';
import { delivery, order, rider, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { takeawayDeliver: vi.fn(), takeawayRefresh: vi.fn() } }));

describe('OrdersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayDeliver).mockResolvedValue(delivery());
    vi.mocked(endpoints.takeawayRefresh).mockResolvedValue({ created: 15 });
  });

  it('显示品级、时长、声望、剩余有效时间和食材；选空闲骑手接单后通知刷新', async () => {
    const w = mount(OrdersPanel, { props: { data: takeawayData() } });
    const row = w.find('[data-testid="order-11"]');
    expect(row.text()).toContain('普通');
    expect(row.text()).toContain('南煎丸子');
    expect(row.text()).toContain('30 分钟');
    expect(row.text()).toContain('还剩 60 分钟有效');
    expect(row.text()).toContain('食材239 1/5');
    await w.find('[data-testid="take-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).toHaveBeenCalledWith(11, 31, false);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('不能接时灰掉并写明原因：没学会、声望不够、食材不够、没有空闲骑手', () => {
    const w = mount(OrdersPanel, {
      props: {
        data: takeawayData({
          orders: [
            order({ id: 1, block: 'not_learned' }),
            order({ id: 2, block: 'renown', needRenown: 12 }),
            order({ id: 3, foods: [{ foodsId: 239, need: 6, have: 5 }], block: 'foods' }),
          ],
        }),
      },
    });
    expect(w.find('[data-testid="why-1"]').text()).toBe('还没学会这道菜');
    expect(w.find('[data-testid="why-2"]').text()).toBe('声望不够 (要 12)');
    expect(w.find('[data-testid="why-3"]').text()).toBe('食材不够');
    expect(w.find('[data-testid="take-3"]').attributes('disabled')).toBeDefined();
    const busy = mount(OrdersPanel, { props: { data: takeawayData({ riders: [rider({ busy: 1 })] }) } });
    expect(busy.find('[data-testid="why-11"]').text()).toBe('没有空闲的骑手');
  });

  it('加料：没有使命必达时灰掉；有时勾上后按 double = true 接单，食材按两倍算', async () => {
    const no = mount(OrdersPanel, { props: { data: takeawayData() } });
    expect(no.find('[data-testid="double"]').attributes('disabled')).toBeDefined();
    const w = mount(OrdersPanel, { props: { data: takeawayData({ canDouble: true }) } });
    await w.find('[data-testid="double"]').setValue(true);
    expect(w.find('[data-testid="order-11"]').text()).toContain('食材239 2/5');
    await w.find('[data-testid="take-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).toHaveBeenCalledWith(11, 31, true);
  });

  it('私人刷新：没有工作证时灰掉；有时点击后通知刷新', async () => {
    const no = mount(OrdersPanel, { props: { data: takeawayData() } });
    expect(no.find('[data-testid="refresh-block"]').text()).toBe('要持有有效的商店工作证');
    expect(no.find('[data-testid="refresh"]').attributes('disabled')).toBeDefined();
    const w = mount(OrdersPanel, {
      props: { data: takeawayData({ coin: 2_000_000, refresh: { cost: 1_000_000, hasJob: true } }) },
    });
    expect(w.find('[data-testid="refresh"]').text()).toBe('私人刷新 (1,000,000 银币)');
    await w.find('[data-testid="refresh"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayRefresh).toHaveBeenCalled();
    expect(w.emitted('reload')).toHaveLength(1);
  });
});
