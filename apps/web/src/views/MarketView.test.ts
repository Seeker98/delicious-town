import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import MarketView from './MarketView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { market: vi.fn(), marketBuy: vi.fn(), marketGuess: vi.fn(), marketManualStock: vi.fn() },
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
      sharedBought: 0,
      have: 0,
      canBuy: 1000,
      openedAt: '2026-09-30T00:00:00.000Z',
      owner: null,
    },
  ],
  special: [],
  premium: [],
  nextDaily: '2026-09-30T04:00:00.000Z',
  nextSpecial: '2026-09-30T03:00:00.000Z',
  nextPremium: '2026-09-30T04:00:00.000Z',
  specialCooldownUntil: null,
  specialCooldownMin: 10,
  foodsMaxNum: 999,
  cupboardFull: false,
  manual: { hasCard: false, cost: 1_000_000 },
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

  it('最多能买几个按限购、库存、橱柜单种上限取小，写明原因（问题记录：显示 1000 实际只能买 996）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      daily: [
        { ...view.daily[0]!, have: 3, canBuy: 996 },
        { ...view.daily[0]!, id: 12, foodsId: 102, have: 999, canBuy: 0 },
      ],
    });
    const w = mount(MarketView);
    await flushPromises();
    expect(w.find('[data-testid="cap-11"]').text()).toContain('橱柜单种上限 999，已有 3，最多再买 996');
    await w.find('[data-testid="qty-11"]').setValue(2000);
    await w.find('[data-testid="buy-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketBuy).toHaveBeenLastCalledWith(11, 996);
    expect(w.find('[data-testid="buy-12"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-12"]').text()).toContain('已经放满了');
  });

  it('同一网络或设备已经买满时写明原因、按钮灰掉（问题记录：显示 0/1000 却提示限购已满）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      daily: [{ ...view.daily[0]!, sharedBought: 1000, canBuy: 0 }],
    });
    const w = mount(MarketView);
    await flushPromises();
    expect(w.find('[data-testid="buy-11"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-11"]').text()).toContain('同一网络或设备本轮已买 1000 份');
  });

  it('手动进货（4E-2）：有菜场工作证时显示按钮和费用；进货后刷新', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({ ...view, manual: { hasCard: true, cost: 2_000_000 } });
    vi.mocked(endpoints.marketManualStock).mockResolvedValue({
      foods: [101, 102, 103, 104],
      cost: 2_000_000,
      renown: 200,
    });
    const w = mount(MarketView);
    await flushPromises();
    const before = vi.mocked(endpoints.market).mock.calls.length;
    const btn = w.find('[data-testid="market-manual"]');
    expect(btn.text()).toBe('手动进货（2,000,000 银币）');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.marketManualStock).toHaveBeenCalled();
    expect(vi.mocked(endpoints.market).mock.calls.length).toBe(before + 1);
  });

  it('没有工作证不显示按钮；手动货写明谁进的货，自己的货免费', async () => {
    const own = { ...view.daily[0]!, id: 12, owner: { restId: 5, name: '小王的店' } };
    vi.mocked(endpoints.market).mockResolvedValue({ ...view, daily: [view.daily[0]!, own] });
    const w = mount(MarketView);
    await flushPromises();
    expect(w.find('[data-testid="market-manual"]').exists()).toBe(false);
    expect(w.find('[data-testid="owner-12"]').text()).toBe('小王的店 进的货');
    expect(w.find('[data-testid="owner-11"]').exists()).toBe(false);
  });
});
