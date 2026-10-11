import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import OrdersPanel from './OrdersPanel.vue';
import { delivery, order, rider, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { takeawayDeliver: vi.fn(), takeawayRefresh: vi.fn() } }));

/** 接单面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（界面改版 P8） */
const mountPanel = (data: TakeawayDto) =>
  mount(OrdersPanel, { props: { data }, global: { stubs: { teleport: true } } });

describe('OrdersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayDeliver).mockResolvedValue(delivery());
    vi.mocked(endpoints.takeawayRefresh).mockResolvedValue({ created: 15 });
  });

  it('显示品级、时长、声望、剩余有效时间和食材；选空闲骑手接单后通知刷新', async () => {
    const w = mountPanel(
      takeawayData({
        riders: [
          rider(),
          rider({ id: 32, name: '外援', self: false }),
          rider({ id: 33, name: '忙人', self: false, busy: 1 }),
        ],
      }),
    );
    const row = w.find('[data-testid="order-11"]');
    expect(row.text()).toContain('普通');
    expect(row.text()).toContain('南煎丸子');
    expect(row.text()).toContain('30 分钟');
    expect(row.text()).toContain('还剩 60 分钟有效');
    expect(row.text()).toContain('食材239 1/5');
    // 界面改版 P8：点接单弹出面板选骑手；默认选第一个空闲的，忙的灰掉
    expect(w.find('[data-testid="take-sheet"]').exists()).toBe(false);
    await w.find('[data-testid="take-11"]').trigger('click');
    expect(w.find('[data-testid="take-sheet"]').exists()).toBe(true);
    expect((w.get('[data-testid="rider-31"]').element as HTMLInputElement).checked).toBe(true);
    expect(w.get('[data-testid="rider-33"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="rider-32"]').setValue(true);
    expect(endpoints.takeawayDeliver).not.toHaveBeenCalled();
    await w.get('[data-testid="take-confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).toHaveBeenCalledWith(11, 32, false);
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="take-sheet"]').exists()).toBe(false);
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
    const no = mountPanel(takeawayData());
    await no.get('[data-testid="take-11"]').trigger('click');
    expect(no.get('[data-testid="double"]').attributes('disabled')).toBeDefined();
    const w = mountPanel(takeawayData({ canDouble: true }));
    await w.get('[data-testid="take-11"]').trigger('click');
    await w.get('[data-testid="double"]').setValue(true);
    // 面板里的食材按两倍算，行里还是不加料的数
    expect(w.get('[data-testid="take-sheet"]').text()).toContain('食材239 2/5');
    expect(w.get('[data-testid="order-11"]').text()).toContain('食材239 1/5');
    await w.get('[data-testid="take-confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).toHaveBeenCalledWith(11, 31, true);
  });

  it('加料后食材不够：面板里写原因，接单按钮灰掉', async () => {
    const w = mountPanel(
      takeawayData({ canDouble: true, orders: [order({ foods: [{ foodsId: 239, need: 3, have: 5 }] })] }),
    );
    await w.get('[data-testid="take-11"]').trigger('click');
    expect(w.find('[data-testid="take-why"]').exists()).toBe(false);
    await w.get('[data-testid="double"]').setValue(true);
    expect(w.get('[data-testid="take-why"]').text()).toBe('食材不够');
    expect(w.get('[data-testid="take-confirm"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="take-confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).not.toHaveBeenCalled();
  });

  it('私人刷新：没有工作证时灰掉；有时点击后通知刷新', async () => {
    const no = mount(OrdersPanel, { props: { data: takeawayData() } });
    expect(no.find('[data-testid="refresh-block"]').text()).toBe('要持有有效的商店工作证');
    expect(no.find('[data-testid="refresh"]').attributes('disabled')).toBeDefined();
    const w = mount(OrdersPanel, {
      props: { data: takeawayData({ coin: 2_000_000, refresh: { cost: 1_000_000, hasJob: true } }) },
    });
    expect(w.find('[data-testid="refresh"]').text()).toBe('1,000,000 银币');
    await w.find('[data-testid="refresh"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayRefresh).toHaveBeenCalled();
    expect(w.emitted('reload')).toHaveLength(1);
  });
});
