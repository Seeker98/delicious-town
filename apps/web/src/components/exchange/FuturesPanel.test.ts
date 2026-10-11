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

/** 下单、我的期货单、怎么算都在 Teleport 到 body 的底部面板里：测试里把 teleport 桩掉（界面改版 P8） */
async function mountPanel() {
  const w = mount(FuturesPanel, { global: { stubs: { teleport: true } } });
  await flushPromises();
  return w;
}
type W = Awaited<ReturnType<typeof mountPanel>>;
/** 食材一行：价格按钮所在的那一行 */
const rowOf = (w: W, id: number) =>
  w.get(`[data-testid="fu-food-${id}"]`).element.closest('.dt-row')!.textContent ?? '';
/** 下单面板里“总价”“现在付定金”这些合计：标签和数分开写 */
const sum = (w: W, label: string) =>
  w
    .get('[data-testid="fu-order-box"]')
    .findAll('.dt-sum > div')
    .find((x) => x.get('dt').text() === label)!
    .get('dd')
    .text();
const qtyValue = (w: W) => (w.get('[data-testid="fu-qty"]').element as HTMLInputElement).value;

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
    // 额度一行：标题和“剩几 / 每天几份”分开写（界面改版 P8）
    const person = w.get('[data-testid="fu-person"]');
    expect(person.get('.dt-row-title').text()).toBe('我今天还能订');
    expect(person.get('.dt-quota-num').text()).toBe('48 / 50 份');
    expect(rowOf(w, 31)).toContain('火腿');
    expect(w.get('[data-testid="fu-food-31"]').text()).toContain('10,800');
    expect(rowOf(w, 31)).toContain('今天还剩 98 份');
    expect(w.get('[data-testid="fu-food-21"]').attributes('disabled')).toBeDefined();
    expect(rowOf(w, 21)).toContain('今天订完了');
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
    expect(w.get('[data-testid="fu-max"]').text()).toBe('最多 48');
    await qty.setValue('2');
    expect(sum(w, '总价')).toBe('21,600');
    expect(sum(w, '现在付定金')).toBe('6,480');
    expect(sum(w, '到期扣尾款')).toBe('15,120');
    expect(sum(w, '到期时间')).not.toBe('');
    expect(w.get('[data-testid="fu-order-box"]').text()).toContain('都算违约, 定金不退');
    await w.get('[data-testid="fu-order"]').trigger('click');
    await flushPromises();
    expect(endpoints.futuresOrder).toHaveBeenCalledWith({ foodsId: 31, qty: 2, unitPrice: 10800 });
    expect(endpoints.futures).toHaveBeenCalledTimes(2);
  });

  it('数量填 0、清空或超过上限：步进器夹回 1 到上限，框里写的就是下单的份数；一份都订不了时下单按钮不能点（终审：原来按 1 份下单）', async () => {
    vi.mocked(endpoints.futuresOrder).mockResolvedValue(contract({}));
    const w = await mountPanel();
    await w.get('[data-testid="fu-food-31"]').trigger('click');
    // 界面改版 P8 换成步进器：0 和空的失焦后回到 1，超过上限马上退回上限
    for (const v of ['0', '']) {
      await w.get('[data-testid="fu-qty"]').setValue(v);
      await w.get('[data-testid="fu-qty"]').trigger('blur');
      expect(qtyValue(w)).toBe('1');
    }
    await w.get('[data-testid="fu-qty"]').setValue('49');
    expect(qtyValue(w)).toBe('48');
    expect(w.get('[data-testid="fu-order"]').attributes('disabled')).toBeUndefined();
    await w.get('[data-testid="fu-order"]').trigger('click');
    await flushPromises();
    expect(endpoints.futuresOrder).toHaveBeenCalledWith({ foodsId: 31, qty: 48, unitPrice: 10800 });
    // 今天的个人额度用完：步进器和下单按钮都灰掉
    vi.mocked(endpoints.futures).mockResolvedValue(data({ personLeft: 0 }));
    const none = await mountPanel();
    await none.get('[data-testid="fu-food-31"]').trigger('click');
    expect(none.get('[data-testid="fu-qty"]').attributes('disabled')).toBeDefined();
    expect(none.get('[data-testid="fu-order"]').attributes('disabled')).toBeDefined();
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
    // 上面卡片写进行中的单数和第一张单（界面改版 P8），点开看全部
    const open = w.get('[data-testid="fu-mine-open"]');
    expect(open.get('.dt-row-value').text()).toBe('1');
    expect(open.text()).toContain('尾款 15,120 银币');
    await open.trigger('click');
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
    expect(w.find('[data-testid="fu-person"]').exists()).toBe(false);
    await w.get('[data-testid="fu-mine-open"]').trigger('click');
    expect(w.find('[data-testid="fu-c-1"]').exists()).toBe(true);
    vi.mocked(endpoints.futures).mockResolvedValue(data({ blocked: 'exchange_level' }));
    w = await mountPanel();
    expect(w.get('[data-testid="fu-blocked"]').text()).toContain('20 级');
    await w.get('[data-testid="fu-food-31"]').trigger('click');
    expect(w.find('[data-testid="fu-order"]').attributes('disabled')).toBeDefined();
  });
});
