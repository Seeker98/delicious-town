import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ShopView from './ShopView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    shop: vi.fn(),
    shopSpecial: vi.fn(),
    shopBuy: vi.fn(),
    shopBuyBlack: vi.fn(),
    shopBuySpecial: vi.fn(),
  },
}));

const dto: ShopDto = {
  coin: [
    { goodsId: 13, price: 1000, owned: 0, limit: null, maxBuy: 3, blocked: null },
    { goodsId: 86, price: 55000, owned: 0, limit: null, maxBuy: 0, blocked: 'money' },
    { goodsId: 52, price: 60000, owned: 9999, limit: null, maxBuy: 0, blocked: 'max' },
  ],
  black: [],
};

describe('ShopView（问题记录：商店不显示最大可购买数量）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.shop).mockResolvedValue(structuredClone(dto));
    vi.mocked(endpoints.shopSpecial).mockResolvedValue(null);
    vi.mocked(endpoints.shopBuy).mockResolvedValue({} as never);
  });

  it('显示最多能买几个；填的数超过上限时按上限买', async () => {
    const w = mount(ShopView);
    await flushPromises();
    expect(w.find('[data-testid="cap-13"]').text()).toBe('最多 3');
    await w.find('[data-testid="qty-13"]').setValue('9');
    await w.find('[data-testid="buy-13"]').trigger('click');
    await flushPromises();
    expect(endpoints.shopBuy).toHaveBeenCalledWith(13, 3);
  });

  it('买不了时按钮禁用并写明原因', async () => {
    const w = mount(ShopView);
    await flushPromises();
    expect(w.find('[data-testid="buy-86"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-86"]').text()).toBe('银币不够');
    expect(w.find('[data-testid="cap-52"]').text()).toBe('已达持有上限');
  });
});
