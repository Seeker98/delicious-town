import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExchangeBookDto, ExchangeMeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import ExchangeView from './ExchangeView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    tradeFoods: vi.fn(),
    tradeBook: vi.fn(),
    tradeMe: vi.fn(),
    tradePlace: vi.fn(),
    tradeCancel: vi.fn(),
    tradeWithdraw: vi.fn(),
  },
}));

const book: ExchangeBookDto = {
  foodsId: 11,
  ref: 1000,
  min: 500,
  max: 2000,
  last: 1100,
  volume: 7,
  bids: [{ price: 990, qty: 3 }],
  asks: [
    { price: 1010, qty: 2 },
    { price: 1020, qty: 5 },
  ],
};
const me = (p: Partial<ExchangeMeDto> = {}): ExchangeMeDto => ({
  eligible: true,
  reason: null,
  need: { level: 20, days: 7 },
  orders: [
    {
      id: 5,
      side: 'sell',
      foodsId: 11,
      price: 1500,
      qty: 3,
      filled: 1,
      status: 'open',
      createdAt: '2026-10-02T00:00:00Z',
      expiresAt: '2026-10-03T00:00:00Z',
    },
  ],
  wallet: { coin: 950, foods: [{ foodsId: 11, num: 2 }] },
  trades: [],
  feeRate: 0.05,
  ...p,
});

describe('ExchangeView（156-1 设计 §8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 11, name: '松露', level: 6 },
        { id: 12, name: '藏红花', level: 3 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([
      { foodsId: 12, ref: 4000, last: null, changePct: null },
      { foodsId: 11, ref: 1000, last: 1100, changePct: 0.1 },
    ]);
    vi.mocked(endpoints.tradeBook).mockResolvedValue(book);
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me());
    vi.mocked(endpoints.tradePlace).mockResolvedValue({
      order: me().orders[0]!,
      fills: [{ price: 1010, qty: 2 }],
    } as never);
  });

  it('食材按等级分组；选中后显示盘口、参考价和允许范围', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    expect(w.find('[data-testid="ex-food-12"]').text()).toContain('藏红花');
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.tradeBook).toHaveBeenCalledWith(11);
    expect(w.find('[data-testid="ex-book"]').text()).toContain('1,010');
    expect(w.find('[data-testid="ex-book"]').text()).toContain('参考价 1,000');
    expect(w.find('[data-testid="ex-band"]').text()).toContain('500 ~ 2,000');
  });

  it('点盘口的价格填进表单；下单显示预计花费；提交后刷新并提示成交', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-ask-1010"]').trigger('click');
    expect((w.find('[data-testid="ex-price"]').element as HTMLInputElement).value).toBe('1010');
    await w.find('[data-testid="ex-qty"]').setValue('2');
    expect(w.find('[data-testid="ex-estimate"]').text()).toContain('2,020');
    await w.find('[data-testid="ex-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.tradePlace).toHaveBeenCalledWith({ foodsId: 11, side: 'buy', price: 1010, qty: 2 });
    expect(endpoints.tradeMe).toHaveBeenCalledTimes(2);
  });

  it('卖出时显示扣手续费后的所得', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-side-sell"]').trigger('click');
    await w.find('[data-testid="ex-price"]').setValue('1000');
    await w.find('[data-testid="ex-qty"]').setValue('3');
    expect(w.find('[data-testid="ex-estimate"]').text()).toContain('2,850');
  });

  it('不满足门槛时表单禁用并写明原因', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me({ eligible: false, reason: 'exchange_level' }));
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="ex-submit"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('餐厅 20 级才能交易');
  });

  it('撤单和全部取出', async () => {
    vi.mocked(endpoints.tradeCancel).mockResolvedValue({} as never);
    vi.mocked(endpoints.tradeWithdraw).mockResolvedValue({ coin: 950, foods: [], left: [] } as never);
    const w = mount(ExchangeView);
    await flushPromises();
    expect(w.find('[data-testid="ex-wallet"]').text()).toContain('950');
    await w.find('[data-testid="ex-cancel-5"]').trigger('click');
    await flushPromises();
    expect(endpoints.tradeCancel).toHaveBeenCalledWith(5);
    await w.find('[data-testid="ex-withdraw"]').trigger('click');
    await flushPromises();
    expect(endpoints.tradeWithdraw).toHaveBeenCalled();
  });
});

describe('终审：交易所页的选食材和取出提示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 11, name: '松露', level: 6 },
        { id: 12, name: '藏红花', level: 3 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([
      { foodsId: 12, ref: 4000, last: null, changePct: null },
      { foodsId: 11, ref: 1000, last: 1100, changePct: 0.1 },
    ]);
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me());
  });

  it('快速连点两种食材：先点的盘口后回来也不会覆盖后点的；换食材时清空单价', async () => {
    let resolveA!: (v: ExchangeBookDto) => void;
    vi.mocked(endpoints.tradeBook)
      .mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
      .mockResolvedValueOnce({ ...book, foodsId: 12, ref: 4000, min: 2000, max: 8000 });
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await w.find('[data-testid="ex-food-12"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-price"]').setValue('3000');
    resolveA(book);
    await flushPromises();
    expect(w.find('[data-testid="ex-band"]').text()).toContain('2,000 ~ 8,000');
    vi.mocked(endpoints.tradeBook).mockResolvedValueOnce(book);
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect((w.find('[data-testid="ex-price"]').element as HTMLInputElement).value).toBe('');
  });

  it('读盘口失败时提示', async () => {
    vi.mocked(endpoints.tradeBook).mockRejectedValue(new Error('x'));
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain('读取盘口失败');
  });

  it('取出时有放不下的：提示留在交易所账户', async () => {
    vi.mocked(endpoints.tradeWithdraw).mockResolvedValue({
      coin: 0,
      foods: [{ foodsId: 11, num: 2 }],
      left: [{ foodsId: 11, num: 3 }],
    } as never);
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-withdraw"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain('已取出；还有 3 个食材放不下，留在交易所账户');
  });
});
