import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuturesContractDto, FuturesDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import FuturesPanel from './FuturesPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: { futures: vi.fn(), futuresOrder: vi.fn(), futuresCancel: vi.fn(), cupboard: vi.fn() },
}));

const contract = (p: Partial<FuturesContractDto>): FuturesContractDto => ({
  id: 1,
  foodsId: 31,
  qty: 2,
  unitPrice: 10800,
  deposit: 6480,
  balance: 15120,
  createdAt: '2026-10-10T04:00:00Z',
  dueAt: '2026-10-13T04:00:00Z',
  status: 'open',
  settledAt: null,
  toCupboard: 0,
  toWallet: 0,
  ...p,
});
const data = (p: Partial<FuturesDto> = {}): FuturesDto => ({
  enabled: true,
  blocked: null,
  needLevel: 20,
  needDays: 7,
  foods: [
    { foodsId: 31, level: 3, rare: true, unitPrice: 10800, left: 98 },
    { foodsId: 21, level: 2, rare: false, unitPrice: 3432, left: 0 },
    { foodsId: 22, level: 2, rare: true, unitPrice: 4000, left: 500 },
  ],
  personDaily: 50,
  personLeft: 48,
  deliverHours: 72,
  depositRate: 0.3,
  contracts: [
    contract({}),
    contract({ id: 2, status: 'delivered', toCupboard: 1, toWallet: 1, settledAt: '2026-10-09T00:00:00Z' }),
    contract({ id: 3, status: 'defaulted', settledAt: '2026-10-08T00:00:00Z' }),
  ],
  ...p,
});

async function mountPanel() {
  const w = mount(FuturesPanel);
  await flushPromises();
  return w;
}

describe('FuturesPanel（期货设计 §10）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T04:00:00Z'));
    setActivePinia(createPinia());
    const catalog = useCatalogStore();
    catalog.foodsMap = new Map([
      [31, { id: 31, name: '火腿', level: 3, odds: 60, coin: 4500, type: 0 }],
      [21, { id: 21, name: '青菜', level: 2, odds: 100, coin: 2200, type: 0 }],
      [22, { id: 22, name: '十三香', level: 2, odds: 70, coin: 2200, type: 0 }],
    ]) as never;
    vi.mocked(endpoints.futures).mockResolvedValue(data());
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [{ foodsId: 22, num: 0, locked: false, streetNeed: 5 }],
    } as never);
  });
  afterEach(() => vi.useRealTimers());

  it('按等级分组列出食材：单价、今天还剩；订完的灰掉；顶部写我今天还能订几份', async () => {
    const w = await mountPanel();
    expect(w.get('[data-testid="fu-person"]').text()).toBe('我今天还能订 48 份 (每天 50 份)');
    expect(w.get('[data-testid="fu-food-31"]').text()).toContain('火腿');
    expect(w.get('[data-testid="fu-food-31"]').text()).toContain('10,800');
    expect(w.get('[data-testid="fu-food-31"]').text()).toContain('今天还剩 98 份');
    expect(w.get('[data-testid="fu-food-21"]').attributes('disabled')).toBeDefined();
  });

  it('筛选：稀有、普通、本街要的、搜名字', async () => {
    const w = await mountPanel();
    const ids = () => w.findAll('[data-testid^="fu-food-"]').map((x) => x.attributes('data-testid'));
    await w.get('[data-testid="fu-filter-rare"]').trigger('click');
    expect(ids()).toEqual(['fu-food-22', 'fu-food-31']);
    await w.get('[data-testid="fu-filter-normal"]').trigger('click');
    expect(ids()).toEqual(['fu-food-21']);
    await w.get('[data-testid="fu-filter-street"]').trigger('click');
    expect(ids()).toEqual(['fu-food-22']);
    await w.get('[data-testid="fu-filter-all"]').trigger('click');
    await w.get('[data-testid="fu-search"]').setValue('火');
    expect(ids()).toEqual(['fu-food-31']);
  });

  it('下单框：数量上限是区服剩余和个人剩余里小的；写总价、定金、尾款、到期时间和违约说明；下单带单价', async () => {
    vi.mocked(endpoints.futuresOrder).mockResolvedValue(contract({}));
    const w = await mountPanel();
    await w.get('[data-testid="fu-food-31"]').trigger('click');
    const qty = w.get('[data-testid="fu-qty"]');
    expect(qty.attributes('max')).toBe('48');
    await qty.setValue('2');
    const box = w.get('[data-testid="fu-order-box"]').text();
    expect(box).toContain('总价 21,600 银币');
    expect(box).toContain('定金 6,480');
    expect(box).toContain('尾款 15,120');
    expect(box).toContain('到期时间');
    expect(box).toContain('都算违约, 定金不退');
    await w.get('[data-testid="fu-order"]').trigger('click');
    await flushPromises();
    expect(endpoints.futuresOrder).toHaveBeenCalledWith({ foodsId: 31, qty: 2, unitPrice: 10800 });
    expect(endpoints.futures).toHaveBeenCalledTimes(2);
  });

  it('数量填 0、清空或超过上限：下单按钮不能点（终审：原来按 1 份下单）', async () => {
    const w = await mountPanel();
    await w.get('[data-testid="fu-food-31"]').trigger('click');
    for (const v of ['0', '', '49']) {
      await w.get('[data-testid="fu-qty"]').setValue(v);
      expect(w.get('[data-testid="fu-order"]').attributes('disabled')).toBeDefined();
    }
    await w.get('[data-testid="fu-qty"]').setValue('48');
    expect(w.get('[data-testid="fu-order"]').attributes('disabled')).toBeUndefined();
  });

  it('价格变了：提示并刷新', async () => {
    vi.mocked(endpoints.futuresOrder).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'futures_price_moved', price: 11000 }),
    );
    const w = await mountPanel();
    await w.get('[data-testid="fu-food-31"]').trigger('click');
    await w.get('[data-testid="fu-order"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)!.text).toContain('期货价格变了');
    expect(endpoints.futures).toHaveBeenCalledTimes(2);
  });

  it('我的期货单：进行中写剩余时间、尾款和撤单；结束的写结果；撤单要确认', async () => {
    vi.mocked(endpoints.futuresCancel).mockResolvedValue(contract({ status: 'cancelled' }));
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountPanel();
    expect(w.get('[data-testid="fu-c-1"]').text()).toContain('火腿×2');
    expect(w.get('[data-testid="fu-c-1"]').text()).toContain('尾款 15,120 银币');
    expect(w.get('[data-testid="fu-c-2"]').text()).toContain('已交割 (1 份进了交易所账户)');
    expect(w.get('[data-testid="fu-c-3"]').text()).toContain('已违约, 定金 6,480 银币没收');
    expect(w.find('[data-testid="fu-cancel-2"]').exists()).toBe(false);
    await w.get('[data-testid="fu-cancel-1"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('定金 6,480 银币不退');
    expect(endpoints.futuresCancel).toHaveBeenCalledWith(1);
    ask.mockRestore();
  });

  it('功能关着：不显示下单部分，只显示我的期货单；门槛不够写原因、不能下单', async () => {
    vi.mocked(endpoints.futures).mockResolvedValue(data({ enabled: false, foods: [] }));
    let w = await mountPanel();
    expect(w.find('[data-testid="fu-foods"]').exists()).toBe(false);
    expect(w.get('[data-testid="fu-off"]').text()).toContain('已有的单到期照常交割');
    expect(w.find('[data-testid="fu-c-1"]').exists()).toBe(true);
    vi.mocked(endpoints.futures).mockResolvedValue(data({ blocked: 'exchange_level' }));
    w = await mountPanel();
    expect(w.get('[data-testid="fu-blocked"]').text()).toContain('20 级');
    await w.get('[data-testid="fu-food-31"]').trigger('click');
    expect(w.find('[data-testid="fu-order"]').attributes('disabled')).toBeDefined();
  });
});
