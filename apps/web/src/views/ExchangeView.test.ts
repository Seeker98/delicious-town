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
    tradeSellSystem: vi.fn(),
  },
}));

const book: ExchangeBookDto = {
  foodsId: 11,
  ref: 1000,
  min: 500,
  max: 2000,
  last: 1100,
  volume: 7,
  bids: [{ price: 990, qty: 3, system: false }],
  asks: [
    { price: 1010, qty: 2, system: false },
    { price: 1020, qty: 5, system: false },
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
  holds: [],
  frozen: null,
  level: 30,
  maxQty: 999,
  holdHours: 24,
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
        { id: 13, name: '鱼子酱', level: 3 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([
      { foodsId: 12, ref: 4000, last: null, changePct: null, selling: 0, buying: 3, sysStock: 0 },
      { foodsId: 11, ref: 1000, last: 1100, changePct: 0.1, selling: 4, buying: 0, sysStock: 2 },
      { foodsId: 13, ref: 900, last: null, changePct: null, selling: 0, buying: 0, sysStock: 0 },
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

  it('盘口的系统档写"系统"、换颜色；成交记录标"（系统）"', async () => {
    vi.mocked(endpoints.tradeBook).mockResolvedValue({
      ...book,
      bids: [
        { price: 990, qty: 3, system: false },
        { price: 700, qty: 20, system: true },
      ],
      asks: [
        { price: 1010, qty: 2, system: false },
        { price: 1300, qty: 6, system: true },
      ],
    });
    vi.mocked(endpoints.tradeMe).mockResolvedValue(
      me({
        trades: [
          {
            side: 'sell',
            foodsId: 11,
            price: 700,
            qty: 2,
            fee: 70,
            system: true,
            createdAt: '2026-10-02T00:00:00Z',
          },
        ],
      }),
    );
    const w = mount(ExchangeView);
    await flushPromises();
    await w.get('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    const sysAsk = w.get('[data-testid="ex-ask-sys-1300"]');
    expect(sysAsk.text()).toContain('系统');
    expect(sysAsk.classes()).toContain('text-primary');
    expect(w.get('[data-testid="ex-bid-sys-700"]').text()).toContain('系统');
    expect(w.get('[data-testid="ex-ask-1010"]').text()).not.toContain('系统');
    await w.get('[data-testid="ex-bid-sys-700"]').trigger('click');
    expect((w.get('[data-testid="ex-price"]').element as HTMLInputElement).value).toBe('700');
    expect(w.text()).toContain('（系统）');
  });

  it('卖给系统（问题记录 244）：兜底档写"系统兜底收"、点它不填进挂单单价；按钮弹出数量和到手金额；提交按系统价卖', async () => {
    vi.mocked(endpoints.tradeBook).mockResolvedValue({
      ...book,
      bids: [{ price: 380, qty: 20, system: true, floor: true }],
    });
    vi.mocked(endpoints.tradeSellSystem).mockResolvedValue({
      order: { id: 9, side: 'sell', foodsId: 11, price: 380, qty: 3, filled: 3, status: 'filled' },
      fills: [{ price: 380, qty: 3, held: false }],
    } as never);
    const w = mount(ExchangeView);
    await flushPromises();
    await w.get('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    const row = w.get('[data-testid="ex-bid-sys-380"]');
    expect(row.text()).toContain('系统兜底收');
    await row.trigger('click');
    expect((w.get('[data-testid="ex-price"]').element as HTMLInputElement).value).toBe('');
    await w.get('[data-testid="ex-sell-sys"]').trigger('click');
    await w.get('[data-testid="ex-sys-qty"]').setValue('3');
    // 380 × 3 = 1140，手续费 5% 向下取整 57，到手 1083
    expect(w.get('[data-testid="ex-sys-estimate"]').text()).toContain('到手 1,083');
    await w.get('[data-testid="ex-sys-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.tradeSellSystem).toHaveBeenCalledWith({ foodsId: 11, price: 380, qty: 3 });
    expect(useToastStore().items.at(-1)!.text).toContain('卖给系统 3 个');
    expect(endpoints.tradeBook).toHaveBeenCalledTimes(2);
  });

  it('食材列表标出在售、在收（问题记录 282）：在售写"卖 N"（含系统库存），在收写"收 N"；可筛选在售、在收', async () => {
    try {
      localStorage.removeItem('dt_exchange_filter');
    } catch {
      // 忽略
    }
    const w = mount(ExchangeView);
    await flushPromises();
    const sale = w.get('[data-testid="ex-food-11"]');
    expect(sale.classes()).toContain('dt-on-sale');
    expect(sale.text()).toContain('卖 6');
    const buy = w.get('[data-testid="ex-food-12"]');
    expect(buy.classes()).not.toContain('dt-on-sale');
    expect(buy.text()).toContain('收 3');
    expect(w.get('[data-testid="ex-food-13"]').text()).not.toMatch(/卖|收/);
    expect(w.get('[data-testid="ex-legend"]').text()).toContain('卖');
    // 不再写"绿框"（问题记录 306：太突兀）
    expect(w.get('[data-testid="ex-legend"]').text()).toBe('卖 N 有人在卖（含系统库存）；收 N 有人在收');
    await w.get('[data-testid="ex-filter-sale"]').trigger('click');
    expect(w.findAll('[data-testid^="ex-food-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'ex-food-11',
    ]);
    await w.get('[data-testid="ex-filter-buy"]').trigger('click');
    expect(w.findAll('[data-testid^="ex-food-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'ex-food-12',
    ]);
    await w.get('[data-testid="ex-filter-all"]').trigger('click');
    expect(w.findAll('[data-testid^="ex-food-"]')).toHaveLength(3);
  });

  it('交易所说明里写清楚系统报价怎么算（问题记录 250）', async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    const help = w.get('[data-testid="ex-sys-help"]').text();
    expect(help).toContain('参考价 × 0.7');
    expect(help).toContain('一天内不变');
    expect(help).toContain('兜底');
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
      { foodsId: 12, ref: 4000, last: null, changePct: null, selling: 0, buying: 0, sysStock: 0 },
      { foodsId: 11, ref: 1000, last: 1100, changePct: 0.1, selling: 0, buying: 0, sysStock: 0 },
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

describe('交易所页的防作弊提示（156-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [{ id: 11, name: '松露', level: 6 }],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([
      { foodsId: 11, ref: 1000, last: null, changePct: null, selling: 0, buying: 0, sysStock: 0 },
    ]);
    vi.mocked(endpoints.tradeBook).mockResolvedValue(book);
  });

  it('被冻结：顶部提示原因，下单和取出禁用', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me({ frozen: { reason: '对倒' } }));
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="ex-frozen"]').text()).toContain('对倒');
    expect(w.find('[data-testid="ex-submit"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-withdraw"]').attributes('disabled')).toBeDefined();
  });

  it('冻结中的所得：显示金额和最早解冻时间', async () => {
    const at = new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString();
    vi.mocked(endpoints.tradeMe).mockResolvedValue(
      me({
        holds: [
          { coin: 1200, foodsId: null, num: 0, releaseAt: at },
          { coin: 0, foodsId: 11, num: 2, releaseAt: at },
        ],
      }),
    );
    const w = mount(ExchangeView);
    await flushPromises();
    const text = w.find('[data-testid="ex-holds"]').text();
    expect(text).toContain('1,200');
    expect(text).toContain('松露×2');
    expect(text).toContain('还剩 5 小时');
  });

  it('下单有可疑成交时提示所得冻结', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me());
    vi.mocked(endpoints.tradePlace).mockResolvedValue({
      order: me().orders[0]!,
      fills: [{ price: 1010, qty: 2, held: true }],
    } as never);
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-price"]').setValue('1010');
    await w.find('[data-testid="ex-qty"]').setValue('2');
    await w.find('[data-testid="ex-submit"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain(
      '已成交 2 个，其中有可疑成交，所得冻结 24 小时',
    );
  });
});

describe('backlog 长尾第 3 批：交易所页面不写死数字', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [{ id: 11, name: '松露', level: 6 }],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([
      { foodsId: 11, ref: 1000, last: 1100, changePct: 0.1, selling: 4, buying: 0, sysStock: 0 },
    ]);
    vi.mocked(endpoints.tradeBook).mockResolvedValue(book);
  });
  const open = async () => {
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    return w;
  };

  it('数量上限按区服设置', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me({ maxQty: 50 }));
    const w = await open();
    await w.find('[data-testid="ex-price"]').setValue('1000');
    await w.find('[data-testid="ex-qty"]').setValue('60');
    expect(w.find('[data-testid="ex-submit"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="ex-qty"]').setValue('50');
    expect(w.find('[data-testid="ex-submit"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="ex-qty"]').attributes('max')).toBe('50');
  });

  it('等级不够时写明现在几级', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(
      me({ eligible: false, reason: 'exchange_level', level: 12 }),
    );
    const w = await open();
    expect(w.text()).toContain('餐厅 20 级才能交易（你现在 12 级）');
  });

  it('可疑成交提示的冻结小时数按区服设置', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me({ holdHours: 48 }));
    vi.mocked(endpoints.tradePlace).mockResolvedValue({
      order: me().orders[0]!,
      fills: [{ price: 1010, qty: 2, held: true }],
    } as never);
    const w = await open();
    await w.find('[data-testid="ex-price"]').setValue('1010');
    await w.find('[data-testid="ex-qty"]').setValue('2');
    await w.find('[data-testid="ex-submit"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain(
      '已成交 2 个，其中有可疑成交，所得冻结 48 小时',
    );
  });

  it('卖出数量超过系统还能收的，下单前提示超出部分会按自己的价格挂着', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me());
    vi.mocked(endpoints.tradeBook).mockResolvedValue({
      ...book,
      bids: [{ price: 990, qty: 3, system: true, floor: false }],
    } as never);
    const w = await open();
    await w.find('[data-testid="ex-side-sell"]').trigger('click');
    await w.find('[data-testid="ex-price"]').setValue('900');
    await w.find('[data-testid="ex-qty"]').setValue('5');
    expect(w.find('[data-testid="ex-over-sys"]').text()).toContain('系统最多再收你 3 个');
    await w.find('[data-testid="ex-qty"]').setValue('3');
    expect(w.find('[data-testid="ex-over-sys"]').exists()).toBe(false);
  });
});

describe('终审 I2：冷静期已过的所得能取出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [{ id: 11, name: '松露', level: 6 }],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([
      { foodsId: 11, ref: 1000, last: null, changePct: null, selling: 0, buying: 0, sysStock: 0 },
    ]);
  });
  it('账户为空、冻结记录已到期：按钮可点，提示可以取出；没到期的照常显示剩余时间', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const later = new Date(Date.now() + 2 * 3_600_000 + 60_000).toISOString();
    vi.mocked(endpoints.tradeMe).mockResolvedValue(
      me({
        wallet: { coin: 0, foods: [] },
        holds: [
          { coin: 0, foodsId: 11, num: 2, releaseAt: past },
          { coin: 500, foodsId: null, num: 0, releaseAt: later },
        ],
      }),
    );
    const w = mount(ExchangeView);
    await flushPromises();
    expect(w.find('[data-testid="ex-withdraw"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="ex-holds-ready"]').text()).toContain('松露×2');
    expect(w.find('[data-testid="ex-holds-ready"]').text()).toContain('可以取出');
    expect(w.find('[data-testid="ex-holds"]').text()).toContain('银币 500');
    expect(w.find('[data-testid="ex-holds"]').text()).toContain('还剩 2 小时');
    expect(w.find('[data-testid="ex-holds"]').text()).not.toContain('松露');
  });
});
