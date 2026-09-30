import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import SeedPanel from './SeedPanel.vue';
import { seedsData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { seeds: vi.fn(), seedBuy: vi.fn(), seedExchange: vi.fn() },
}));

describe('SeedPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.seeds).mockResolvedValue(seedsData());
    vi.mocked(endpoints.seedBuy).mockResolvedValue({ coin: 3600 });
    vi.mocked(endpoints.seedExchange).mockResolvedValue({ seeds: 10 });
  });

  it('买种子：数量不超过 银币÷单价 和 99', async () => {
    const w = mount(SeedPanel);
    await flushPromises();
    expect(w.find('[data-testid="seed-stock"]').text()).toContain('× 2');
    await w.find('[data-testid="shop-num"]').setValue('9');
    await w.find('[data-testid="shop-buy"]').trigger('click');
    await flushPromises();
    expect(endpoints.seedBuy).toHaveBeenCalledWith(1, 2);
  });

  it('兑换：次数不超过 精华÷每次精华；精华不够时灰掉并写明原因', async () => {
    const w = mount(SeedPanel);
    await flushPromises();
    await w.find('[data-testid="ex-times"]').setValue('5');
    await w.find('[data-testid="ex-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.seedExchange).toHaveBeenCalledWith(1, 2);
    await w.find('[data-testid="ex-seed"]').setValue('95');
    expect(w.find('[data-testid="ex-go"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-block"]').text()).toContain('配方精华不够');
  });

  it('商店关闭时写明原因', async () => {
    vi.mocked(endpoints.seeds).mockResolvedValue(seedsData({ shop: { open: false, items: [] } }));
    const w = mount(SeedPanel);
    await flushPromises();
    expect(w.find('[data-testid="shop-closed"]').exists()).toBe(true);
  });
});
