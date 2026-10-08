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
  unit: 1000,
  yes: 0,
  no: 0,
  netCost: 0,
  payout: null,
  auto: false,
  resultNote: null,
  kind: 'manual',
  params: {},
  resultParams: null,
  own: false,
  ...p,
});
const list = (p: Partial<PredictListDto> = {}): PredictListDto => ({
  eligible: true,
  reason: null,
  enabled: true,
  need: { level: 20, days: 7 },
  feeRate: 0.02,
  maxHold: 200,
  maxTrade: 100,
  unit: 1000,
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
    // 事件名用卡片标题样式（14px、粗 600），不用继承按钮字号的 <b>（问题记录 278）
    expect(w.get('[data-testid="pd-event-1"] .dt-card-title').text()).toContain('明天会下雨吗');
    expect(w.find('[data-testid="pd-event-1"] b').exists()).toBe(false);
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('明天会下雨吗');
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('63%');
    const ended = w.get('[data-testid="pd-ended-2"]').text();
    // 结果用标签显示（问题记录 288）
    expect(w.get('[data-testid="pd-ended-2"] [data-testid="pd-ended-tag"]').text()).toBe('是');
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
    expect(hold).toContain('结果为是: 得 4,000 银币, 盈亏 +1,500');
    expect(hold).toContain('结果为否: 得 1,000 银币, 盈亏 -1,500');
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
    expect(r).toContain('结果为是: 是 3 份 × 1,000 = 3,000');
    expect(r).toContain('本局盈亏 +350');
    const mine = w.get('[data-testid="pd-mine"]').text();
    expect(mine).toContain('卖出否 2 份');
    expect(mine).toContain('买入是 3 份');
    // 每笔写每份均价和实际花费 / 得到（含手续费）（问题记录 264）
    expect(mine).toContain('每份约 536 · 得到 1,049');
    expect(mine).toContain('每份约 547 · 花费 1,673');
  });

  it('价格走势不到两个点时不画空图，写一行提示（问题记录 278）', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({ ...detail, points: [0.5] });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="pd-chart"]').exists()).toBe(false);
    expect(w.get('[data-testid="pd-chart-empty"]').text()).toContain('还没有成交');
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
    expect(trades).toContain('买入是 2 份 · 每份约 550');
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
    expect(r).toContain('已作废: 退回净投入的 85%, 共 1,700');
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
    expect(w.get('[data-testid="pd-ended-note-2"]').text()).toContain('判定依据: 15 点自动轮换的天气是晴');
    await w.get('[data-testid="pd-ended-2"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="pd-note"]').text()).toContain('判定依据: 15 点自动轮换的天气是晴（晴类）');
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
    expect(useToastStore().items.at(-1)?.text).toContain('买入否 3 份, 花费 1,224 银币');
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

describe('出题人不能交易自己出的题（backlog 238-1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictList).mockResolvedValue(list());
  });
  it('自己出的题：交易块写明不能交易，提交禁用；别人的题照常', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, own: true },
    });
    const w = mount(PredictView);
    await flushPromises();
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="pd-own"]').text()).toBe('这道题是你出的, 不能交易');
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
    vi.mocked(endpoints.predictDetail).mockResolvedValue(detail);
    const other = mount(PredictView);
    await flushPromises();
    await other.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(other.find('[data-testid="pd-own"]').exists()).toBe(false);
  });
});

describe('backlog 238-1：事件合约页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictDetail).mockResolvedValue(detail);
  });
  const open = async (l: PredictListDto) => {
    vi.mocked(endpoints.predictList).mockResolvedValue(l);
    const w = mount(PredictView);
    await flushPromises();
    await w.find('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    return w;
  };

  it('单笔超过上限：提示并禁止提交', async () => {
    const w = await open(list({ maxTrade: 10 }));
    await w.find('[data-testid="pd-qty"]').setValue('11');
    expect(w.find('[data-testid="pd-limit"]').text()).toContain('一次最多 10 份');
    expect(w.find('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
  });

  it('买入后持有超过上限：提示还能买几份', async () => {
    // 详情里已持有"是" 4 份
    const w = await open(list({ maxHold: 10 }));
    await w.find('[data-testid="pd-qty"]').setValue('7');
    expect(w.find('[data-testid="pd-limit"]').text()).toContain('每边最多持有 10 份, 还能买 6 份');
    expect(w.find('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="pd-qty"]').setValue('6');
    expect(w.find('[data-testid="pd-limit"]').exists()).toBe(false);
  });

  it('说明不再写死每份 1,000 银币：按区服的每份金额', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ unit: 2000 }));
    const w = mount(PredictView);
    await flushPromises();
    expect(w.text()).not.toContain('每份得 1,000 银币');
    expect(w.get('[data-testid="pd-help"]').text()).toContain('每份得 2,000 银币');
  });

  it('交易所被冻结：显示原因', async () => {
    const w = await open(list({ eligible: false, reason: 'predict_frozen' }));
    expect(w.find('[data-testid="pd-reason"]').text()).toContain('交易所已被冻结');
    expect(w.find('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
  });

  it('区服关掉事件合约：写明只能查看，提交禁用', async () => {
    const w = await open(list({ enabled: false }));
    expect(w.find('[data-testid="pd-off"]').text()).toContain('暂停');
    expect(w.find('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
  });

  describe('页面层级（问题记录 288，方案 A）', () => {
    it('「怎么玩」只在页面顶部放一份，默认收起；展开事件后不再重复', async () => {
      const w = mount(PredictView);
      await flushPromises();
      const help = w.get('[data-testid="pd-help"]');
      expect(help.element.tagName).toBe('DETAILS');
      expect((help.element as HTMLDetailsElement).open).toBe(false);
      await w.get('[data-testid="pd-event-1"]').trigger('click');
      await flushPromises();
      expect(w.findAll('[data-testid="pd-help"]')).toHaveLength(1);
      expect(w.html().indexOf('pd-help')).toBeLessThan(w.html().indexOf('pd-event-1'));
    });

    it('列表卡有一条是/否概率条', async () => {
      const w = mount(PredictView);
      await flushPromises();
      const bar = w.get('[data-testid="pd-bar-1"] [data-testid="pd-bar-yes"]');
      expect(bar.attributes('style')).toContain('width: 63%');
    });

    it('详情分成行情、我的持仓、交易、记录四块；行情写每份结算金额；记录默认收起并带条数', async () => {
      const w = mount(PredictView);
      await flushPromises();
      await w.get('[data-testid="pd-event-1"]').trigger('click');
      await flushPromises();
      const d = w.get('[data-testid="pd-detail"]');
      const order = ['pd-sec-market', 'pd-sec-hold', 'pd-sec-trade', 'pd-sec-records'].map((id) =>
        d.html().indexOf(`data-testid="${id}"`),
      );
      expect(order.every((x) => x >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(d.get('[data-testid="pd-sec-market"]').text()).toContain('每份结算 1,000 银币');
      const trades = d.get('[data-testid="pd-trades"]');
      expect(trades.element.tagName).toBe('DETAILS');
      expect((trades.element as HTMLDetailsElement).open).toBe(false);
      expect(trades.get('summary').text()).toContain('(1)');
    });

    it('没有持仓时不显示「我的持仓」', async () => {
      vi.mocked(endpoints.predictDetail).mockResolvedValue({
        ...detail,
        event: { ...detail.event, yes: 0, no: 0 },
      });
      const w = mount(PredictView);
      await flushPromises();
      await w.get('[data-testid="pd-event-1"]').trigger('click');
      await flushPromises();
      expect(w.find('[data-testid="pd-sec-hold"]').exists()).toBe(false);
      expect(w.find('[data-testid="pd-sec-trade"]').exists()).toBe(true);
    });

    it('已结束的事件按截止时间从新到旧排，先显示最近的 5 个（问题记录 449）', async () => {
      const ended = [2, 3, 4, 5, 6, 7].map((id) =>
        ev({
          id,
          title: `结束${id}`,
          status: 'resolved',
          outcome: true,
          closeAt: `2026-10-0${id}T04:00:00.000Z`,
        }),
      );
      vi.mocked(endpoints.predictList).mockResolvedValue(list({ events: [ev(), ...ended] }));
      const w = mount(PredictView);
      await flushPromises();
      const ids = w
        .findAll('[data-testid^="pd-ended-"]')
        .map((x) => x.attributes('data-testid')!)
        .filter((x) => /^pd-ended-\d+$/.test(x));
      expect(ids).toEqual(['pd-ended-7', 'pd-ended-6', 'pd-ended-5', 'pd-ended-4', 'pd-ended-3']);
    });

    it('已结束的事件：结果标签和我的盈亏；超过 5 个先收起', async () => {
      const ended = [2, 3, 4, 5, 6, 7].map((id) =>
        ev({
          id,
          title: `结束${id}`,
          status: 'resolved',
          outcome: id % 2 === 0,
          yes: 1,
          netCost: 500,
          payout: id % 2 === 0 ? 1000 : 0,
        }),
      );
      vi.mocked(endpoints.predictList).mockResolvedValue(list({ events: [ev(), ...ended] }));
      const w = mount(PredictView);
      await flushPromises();
      expect(w.get('[data-testid="pd-ended-6"] [data-testid="pd-ended-tag"]').text()).toBe('是');
      expect(w.get('[data-testid="pd-ended-7"] [data-testid="pd-ended-tag"]').text()).toBe('否');
      expect(w.get('[data-testid="pd-ended-6"]').get('[data-testid="pd-ended-profit"]').text()).toContain(
        '+500',
      );
      expect(w.find('[data-testid="pd-ended-2"]').exists()).toBe(false);
      await w.get('[data-testid="pd-ended-more"]').trigger('click');
      expect(w.find('[data-testid="pd-ended-2"]').exists()).toBe(true);
    });
  });
});
