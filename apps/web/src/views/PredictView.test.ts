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
  auto: false,
  resultNote: null,
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
  trades: [
    {
      side: 'yes',
      dir: 'buy',
      qty: 2,
      amount: 1100,
      priceAfter: 0.634,
      createdAt: '2026-10-02T01:00:00.000Z',
    },
  ],
  points: [0.5, 0.55, 0.634],
  mine: { bought: 0, sold: 0, fees: 0, voidRatio: null, trades: [] },
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

  it('盈亏说明：可展开的算法说明；持仓里写出结果为是/否各得多少、对应盈亏（问题记录 252）', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, yes: 4, no: 1, netCost: 2500 },
    });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    const help = w.get('[data-testid="pd-help"]').text();
    expect(help).toContain('怎么算盈亏');
    expect(help).toContain('每份得 1,000 银币');
    expect(help).toContain('手续费 2%');
    expect(help).toContain('作废');
    const hold = w.get('[data-testid="pd-hold"]').text();
    expect(hold).toContain('结果为是：得 4,000 银币，盈亏 +1,500');
    expect(hold).toContain('结果为否：得 1,000 银币，盈亏 -1,500');
    expect(hold).toContain('净投入 2,500');
  });

  it('已结束的事件可以点开：显示本局盈亏分析和我的成交，不显示买卖表单（问题记录 254）', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: {
        ...detail.event,
        id: 2,
        status: 'resolved',
        outcome: true,
        yes: 3,
        no: 1,
        netCost: 2650,
        payout: 3000,
      },
      mine: {
        bought: 3700,
        sold: 1050,
        fees: 80,
        voidRatio: null,
        trades: [
          {
            side: 'no',
            dir: 'sell',
            qty: 2,
            amount: 1071,
            fee: 22,
            priceAfter: 0.7,
            createdAt: '2026-10-02T02:00:00.000Z',
          },
          {
            side: 'yes',
            dir: 'buy',
            qty: 3,
            amount: 1640,
            fee: 33,
            priceAfter: 0.66,
            createdAt: '2026-10-02T01:00:00.000Z',
          },
        ],
      },
    });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-ended-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.predictDetail).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="pd-submit"]').exists()).toBe(false);
    const r = w.get('[data-testid="pd-result"]').text();
    expect(r).toContain('买入共花 3,700');
    expect(r).toContain('卖出共得 1,050');
    expect(r).toContain('手续费合计 80');
    expect(r).toContain('净投入 2,650');
    expect(r).toContain('结果为是：是 3 份 × 1,000 = 3,000');
    expect(r).toContain('本局盈亏 +350');
    const mine = w.get('[data-testid="pd-mine"]').text();
    expect(mine).toContain('卖出否 2 份');
    expect(mine).toContain('买入是 3 份');
    // 每笔写每份均价和实际花费 / 得到（含手续费）（问题记录 264）
    expect(mine).toContain('每份约 536，得到 1,049');
    expect(mine).toContain('每份约 547，花费 1,673');
  });

  it('点开的事件详情就展开在这一行下面，再点一次收起（问题记录 264）', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(
      list({
        events: [
          ev(),
          ev({ id: 3, title: '第二个' }),
          ev({
            id: 2,
            title: '已结束的',
            status: 'resolved',
            outcome: true,
            yes: 3,
            netCost: 1600,
            payout: 3000,
          }),
        ],
      }),
    );
    const w = mount(PredictView);
    await flushPromises();
    const pos = (sel: string) => w.html().indexOf(sel);
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(pos('data-testid="pd-detail"')).toBeGreaterThan(pos('data-testid="pd-event-1"'));
    expect(pos('data-testid="pd-detail"')).toBeLessThan(pos('data-testid="pd-event-3"'));
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="pd-detail"]').exists()).toBe(false);

    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, id: 2, status: 'resolved', outcome: true, payout: 3000 },
    });
    await w.get('[data-testid="pd-ended-2"]').trigger('click');
    await flushPromises();
    expect(pos('data-testid="pd-detail"')).toBeGreaterThan(pos('data-testid="pd-ended-2"'));
  });

  it('止盈止损写进说明；成交记录说明是什么，全服成交写每份均价和成交后的价格（问题记录 260、264）', async () => {
    const w = mount(PredictView);
    await flushPromises();
    expect(w.text()).toContain('止盈');
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    const help = w.get('[data-testid="pd-help"]').text();
    expect(help).toContain('止损');
    expect(help).toContain('止盈');
    const trades = w.get('[data-testid="pd-trades"]').text();
    expect(trades).toContain('全服最近成交');
    expect(trades).toContain('买入是 2 份，每份约 550');
    expect(trades).toContain('成交后"是" 63%');
  });

  it('作废的事件：写出退款比例', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, id: 2, status: 'void', yes: 3, netCost: 2000, payout: 1700 },
      mine: { bought: 2000, sold: 0, fees: 40, voidRatio: 0.85, trades: [] },
    });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-ended-2"]').trigger('click');
    await flushPromises();
    const r = w.get('[data-testid="pd-result"]').text();
    expect(r).toContain('已作废：退回净投入的 85%，共 1,700');
    expect(r).toContain('本局盈亏 -300');
  });

  it('系统出题标记；已结束的事件显示判定依据（238-2）', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(
      list({
        events: [
          ev({ auto: true }),
          ev({
            id: 2,
            title: '15 点是雨类吗',
            status: 'resolved',
            outcome: false,
            auto: true,
            resultNote: '15 点自动轮换的天气是晴（晴类）',
            payout: 0,
          }),
        ],
      }),
    );
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: {
        ...detail.event,
        id: 2,
        status: 'resolved',
        outcome: false,
        auto: true,
        resultNote: '15 点自动轮换的天气是晴（晴类）',
        payout: 0,
      },
    });
    const w = mount(PredictView);
    await flushPromises();
    expect(w.get('[data-testid="pd-auto-1"]').text()).toContain('系统出题');
    expect(w.get('[data-testid="pd-ended-note-2"]').text()).toContain('判定依据：15 点自动轮换的天气是晴');
    await w.get('[data-testid="pd-ended-2"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="pd-note"]').text()).toContain('判定依据：15 点自动轮换的天气是晴（晴类）');
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
