import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import PredictView from './PredictView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { predictList: vi.fn(), predictDetail: vi.fn(), predictTrade: vi.fn() },
}));

const ev = (p: Partial<PredictListDto['events'][number]> = {}) => ({
  id: 1,
  title: '明天会下雨吗',
  price: 0.634,
  closeAt: '2026-10-03T12:00:00.000Z',
  status: 'open' as const,
  outcome: null,
  yes: 0,
  no: 0,
  netCost: 0,
  payout: null,
  ...p,
});
const list = (p: Partial<PredictListDto> = {}): PredictListDto => ({
  eligible: true,
  reason: null,
  need: { level: 20, days: 7 },
  feeRate: 0.02,
  maxHold: 200,
  maxTrade: 100,
  events: [
    ev(),
    ev({ id: 2, title: '已结束的', status: 'resolved', outcome: true, yes: 3, netCost: 1600, payout: 3000 }),
  ],
  ...p,
});
const detail: PredictDetailDto = {
  event: {
    ...ev({ yes: 4 }),
    description: '以 12 点天气为准',
    b: 100,
    unit: 1000,
    qYes: 55,
    qNo: 0,
    openAt: '2026-10-02T00:00:00.000Z',
  },
  trades: [{ side: 'yes', dir: 'buy', qty: 2, amount: 1100, createdAt: '2026-10-02T01:00:00.000Z' }],
  points: [0.5, 0.55, 0.634],
};

describe('PredictView（238-1 设计 §7.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictList).mockResolvedValue(list());
    vi.mocked(endpoints.predictDetail).mockResolvedValue(detail);
  });

  it('列表：进行中显示概率；已结束显示结果和盈亏', async () => {
    const w = mount(PredictView);
    await flushPromises();
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('明天会下雨吗');
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('63%');
    const ended = w.get('[data-testid="pd-ended-2"]').text();
    expect(ended).toContain('结果：是');
    expect(ended).toContain('+1,400');
  });

  it('详情：说明、走势、持仓；输入份数显示预估花费', async () => {
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.predictDetail).toHaveBeenCalledWith(1);
    expect(w.get('[data-testid="pd-detail"]').text()).toContain('以 12 点天气为准');
    expect(w.find('[data-testid="pd-chart"] polyline').exists()).toBe(true);
    expect(w.get('[data-testid="pd-hold"]').text()).toContain('是 4 份');
    await w.get('[data-testid="pd-qty"]').setValue('10');
    const q = predictQuote({ y: 55, n: 0, b: 100 }, 'yes', 'buy', 10, { unit: 1000, feeRate: 0.02 });
    expect(w.get('[data-testid="pd-quote"]').text()).toContain(q.total.toLocaleString('en-US'));
  });

  it('提交：调用接口、提示、刷新', async () => {
    vi.mocked(endpoints.predictTrade).mockResolvedValue({
      side: 'no',
      dir: 'buy',
      qty: 3,
      amount: 1200,
      fee: 24,
      total: 1224,
      price: 0.6,
      yes: 4,
      no: 3,
    });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pd-side-no"]').trigger('click');
    await w.get('[data-testid="pd-qty"]').setValue('3');
    await w.get('[data-testid="pd-submit"]').trigger('click');
    await flushPromises();
    const seen = predictQuote({ y: 55, n: 0, b: 100 }, 'no', 'buy', 3, { unit: 1000, feeRate: 0.02 }).total;
    expect(endpoints.predictTrade).toHaveBeenCalledWith(1, { side: 'no', dir: 'buy', qty: 3, limit: seen });
    expect(useToastStore().items.at(-1)?.text).toContain('买入否 3 份，花费 1,224 银币');
    expect(endpoints.predictList).toHaveBeenCalledTimes(2);
  });

  it('价格被别人推动（predict_price_moved）：提示并重新读取报价（终审 I2）', async () => {
    vi.mocked(endpoints.predictTrade).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'predict_price_moved', total: 9999 }),
    );
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pd-submit"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toContain('价格变了');
    expect(endpoints.predictDetail).toHaveBeenCalledTimes(2);
  });

  it('门槛不满足：显示原因，提交禁用', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ eligible: false, reason: 'predict_level' }));
    const w = mount(PredictView);
    await flushPromises();
    expect(w.get('[data-testid="pd-reason"]').text()).toContain('餐厅 20 级');
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
  });
});
