import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ShopPanel from './ShopPanel.vue';
import { shopData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { renownShop: vi.fn(), renownBuy: vi.fn() } }));

describe('ShopPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.renownShop).mockResolvedValue(shopData());
    vi.mocked(endpoints.renownBuy).mockResolvedValue({ renown: 80 });
  });

  it('数量不超过 本周剩余 和 声望÷单价；兑换后刷新', async () => {
    const w = mount(ShopPanel);
    await flushPromises();
    expect(w.find('[data-testid="shop-renown"]').text()).toContain('200');
    await w.find('[data-testid="num-310"]').setValue('5');
    await w.find('[data-testid="buy-310"]').trigger('click');
    await flushPromises();
    expect(endpoints.renownBuy).toHaveBeenCalledWith(310, 2);
    expect(endpoints.renownShop).toHaveBeenCalledTimes(2);
  });

  it('雕像：已拥有、声望不够时灰掉并写明原因；没有数量输入', async () => {
    const w = mount(ShopPanel);
    await flushPromises();
    expect(w.find('[data-testid="num-397"]').exists()).toBe(false);
    expect(w.find('[data-testid="buy-397"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="item-397"]').text()).toContain('已拥有');
    expect(w.find('[data-testid="buy-460"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="item-460"]').text()).toContain('声望不够');
  });

  it('雕像的“限拥有 1 个”写在数量框的位置，和银币商店一样，不用挂在名字后面的标签（问题记录 489）', async () => {
    const w = mount(ShopPanel);
    await flushPromises();
    const row = w.get('[data-testid="item-397"]');
    expect(row.find('.badge').exists()).toBe(false);
    expect(row.get('[data-testid="limit-397"]').text()).toBe('限拥有 1 个');
    expect(row.get('[data-testid="limit-397"]').classes()).toEqual(
      expect.arrayContaining(['dt-qty-text', 'text-nowrap']),
    );
    expect(w.find('[data-testid="limit-310"]').exists()).toBe(false);
  });
});
