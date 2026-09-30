import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import MarketView from './MarketView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { market: vi.fn(), marketBuy: vi.fn(), marketGuess: vi.fn() },
}));

const view: MarketDto = {
  daily: [
    {
      id: 11,
      shelf: 0,
      foodsId: 101,
      price: 1800,
      stock: 5999,
      left: 5990,
      hot: false,
      limit: 1000,
      bought: 0,
      openedAt: '2026-09-30T00:00:00.000Z',
    },
  ],
  special: [],
  premium: [],
  nextDaily: '2026-09-30T04:00:00.000Z',
  nextSpecial: '2026-09-30T03:00:00.000Z',
  nextPremium: '2026-09-30T04:00:00.000Z',
  specialCooldownUntil: null,
  specialCooldownMin: 10,
  guess: { period: '2026-09-30@12', joined: null, last: null, cost: 2, maxPick: 6, pool: [101, 102, 103] },
};

describe('MarketView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.market).mockResolvedValue(view);
    vi.mocked(endpoints.marketBuy).mockResolvedValue({});
    vi.mocked(endpoints.marketGuess).mockResolvedValue({ period: '2026-09-30@12' });
  });

  it('买菜：按输入的数量购买，买完刷新', async () => {
    const w = mount(MarketView);
    await flushPromises();
    await w.find('[data-testid="qty-11"]').setValue(5);
    await w.find('[data-testid="buy-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketBuy).toHaveBeenCalledWith(11, 5);
    expect(endpoints.market).toHaveBeenCalledTimes(2);
  });

  it('特价冷却中：写明同一网络 10 分钟只能抢一次、还要等几分钟，特价按钮灰掉（问题记录：买第二个提示操作太快）', async () => {
    const item = { ...view.daily[0]!, id: 21, shelf: 1 as const, limit: 1 };
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      special: [item],
      specialCooldownUntil: new Date(Date.now() + 5 * 60_000 - 1000).toISOString(),
    });
    const w = mount(MarketView);
    await flushPromises();
    expect(w.text()).toContain('同一网络 10 分钟内只能抢一次');
    expect(w.find('[data-testid="special-cooldown"]').text()).toContain('还要等 5 分钟');
    expect(w.find('[data-testid="buy-21"]').attributes('disabled')).toBeDefined();
  });

  it('竞猜：展开面板、选择食材后报名', async () => {
    const w = mount(MarketView);
    await flushPromises();
    await w.find('[data-testid="guess-toggle"]').trigger('click');
    await w.find('[data-testid="guess-101"]').trigger('click');
    await w.find('[data-testid="guess-102"]').trigger('click');
    await w.find('[data-testid="guess-join"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketGuess).toHaveBeenCalledWith([101, 102]);
  });
});
