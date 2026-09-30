import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import BasketPanel from './BasketPanel.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { basket: vi.fn(), basketStore: vi.fn() } }));

describe('BasketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.basket).mockResolvedValue({ items: [{ foodsId: 101, num: 21 }] });
    vi.mocked(endpoints.basketStore).mockResolvedValue({ stored: 21, dropped: 0 });
  });

  it('列出菜篮；数量不超过持有；存进橱柜后重新读取', async () => {
    const w = mount(BasketPanel);
    await flushPromises();
    expect(w.find('[data-testid="basket-101"]').text()).toContain('× 21');
    await w.find('[data-testid="basket-num-101"]').setValue('99');
    await w.find('[data-testid="basket-store-101"]').trigger('click');
    await flushPromises();
    expect(endpoints.basketStore).toHaveBeenCalledWith(101, 21);
    expect(endpoints.basket).toHaveBeenCalledTimes(2);
  });

  it('空菜篮显示提示', async () => {
    vi.mocked(endpoints.basket).mockResolvedValue({ items: [] });
    const w = mount(BasketPanel);
    await flushPromises();
    expect(w.find('[data-testid="basket-empty"]').exists()).toBe(true);
  });
});
