import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ShopView from './ShopView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { shop: vi.fn(), shopSpecial: vi.fn(), overview: vi.fn() },
}));
vi.mock('vue-router', async (orig) => ({
  ...(await orig<typeof import('vue-router')>()),
  useRoute: () => ({ query: { cat: 'art' } }),
}));

const row = (goodsId: number) => ({ goodsId, price: 1000, owned: 0, limit: null, maxBuy: 3, blocked: null });
const dto: ShopDto = { coin: [row(30001), row(30601), row(30704)], black: [] };

describe('商店带 ?cat= 进来（艺术品设施 2026-10-17：首页“去商店看看艺术品”）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.shop).mockResolvedValue(dto);
    vi.mocked(endpoints.shopSpecial).mockResolvedValue(null);
  });

  it('先选中艺术品那一类，只列名曲、名画', async () => {
    const w = mount(ShopView, { global: { stubs: { teleport: true, RouterLink: true } } });
    await flushPromises();
    expect(w.get('[data-testid="cat-art"]').classes()).toContain('active');
    expect(w.find('[data-testid="buy-30001"]').exists()).toBe(false);
    expect(w.find('[data-testid="buy-30601"]').exists()).toBe(true);
  });
});
