import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import PredictDetailView from './PredictDetailView.vue';

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

/**
 * 详情单独一页 /predict/编号（界面改版 P8），读网址里的编号，挂载时要装路由；
 * 买卖面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容留在 wrapper 里
 */
async function mountView(id = 1) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/predict/:id', component: PredictDetailView }],
  });
  await router.push(`/predict/${id}`);
  const w = mount(PredictDetailView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
}
type W = Awaited<ReturnType<typeof mountView>>['w'];
/** 点买是 / 买否 / 卖出，打开买卖面板 */
async function openTrade(w: W, btn: 'pd-buy-yes' | 'pd-buy-no' | 'pd-sell' = 'pd-buy-yes') {
  await w.get(`[data-testid="${btn}"]`).trigger('click');
  return w.get('[data-testid="pd-trade-sheet"]');
}

describe('PredictDetailView（238-1 设计 §7.2，界面改版 P8 详情单独一页）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictList).mockResolvedValue(list());
    vi.mocked(endpoints.predictDetail).mockResolvedValue(detail);
  });

  it('详情：说明、走势、持仓；输入份数显示预估花费', async () => {
    const { w } = await mountView();
    expect(endpoints.predictDetail).toHaveBeenCalledWith(1);
    expect(w.get('[data-testid="pd-title"]').text()).toContain('明天会下雨吗');
    expect(w.text()).toContain('以 12 点天气为准');
    expect(w.find('[data-testid="pd-chart"] polyline').exists()).toBe(true);
    expect(w.get('[data-testid="pd-hold"]').text()).toContain('是 4 份');
    await openTrade(w);
    await w.get('[data-testid="pd-qty"]').setValue('10');
    const q = predictQuote({ y: 55, n: 0, b: 100 }, 'yes', 'buy', 10, { unit: 1000, feeRate: 0.02 });
    expect(w.get('[data-testid="pd-quote"]').text()).toContain(q.total.toLocaleString('en-US'));
  });

  it('持仓里写出结果为是/否各得多少、对应盈亏（问题记录 252）', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, yes: 4, no: 1, netCost: 2500 },
    });
    const { w } = await mountView();
    const rows = w.findAll('[data-testid="pd-sec-hold"] .dt-sum > div').map((x) => x.text());
    expect(rows).toContain('净投入2,500');
    expect(rows.find((x) => x.startsWith('结果为是'))).toContain('得 4,000 · +1,500');
    expect(rows.find((x) => x.startsWith('结果为否'))).toContain('得 1,000 · -1,500');
    // 「怎么算盈亏」整页只在列表上放一份（问题记录 288），详情页不重复
    expect(w.find('[data-testid="pd-help"]').exists()).toBe(false);
  });

  it('已结束的事件：显示本局盈亏分析和我的成交，不显示买卖（问题记录 254）', async () => {
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
    const { w } = await mountView(2);
    expect(endpoints.predictDetail).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="pd-sec-trade"]').exists()).toBe(false);
    expect(w.find('[data-testid="pd-buy-yes"]').exists()).toBe(false);
    expect(w.find('[data-testid="pd-hold"]').exists()).toBe(false);
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
    const { w } = await mountView();
    expect(w.find('[data-testid="pd-chart"]').exists()).toBe(false);
    expect(w.get('[data-testid="pd-chart-empty"]').text()).toContain('还没有成交');
  });

  it('成交记录说明是什么，全服成交写每份均价和成交后的价格（问题记录 260、264）', async () => {
    const { w } = await mountView();
    expect(w.text()).toContain('全服最近成交');
    expect(w.text()).toContain('最近 20 笔, 不显示是谁');
    expect(w.text()).toContain('花费和得到都含手续费');
    const trades = w.get('[data-testid="pd-trades"]').text();
    expect(trades).toContain('买入是 2 份 · 每份约 550');
    expect(trades).toContain('成交后"是" 63%');
    // 自己还没买卖过：写一行空状态，不出空卡片
    expect(w.find('[data-testid="pd-mine"]').exists()).toBe(false);
    expect(w.text()).toContain('还没有买卖');
  });

  it('作废的事件：写出退款比例', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, id: 2, status: 'void', yes: 3, netCost: 2000, payout: 1700 },
      mine: { bought: 2000, sold: 0, fees: 40, voidRatio: 0.85, trades: [] },
    });
    const { w } = await mountView(2);
    const r = w.get('[data-testid="pd-result"]').text();
    expect(r).toContain('已作废: 退回净投入的 85%, 共 1,700');
    expect(r).toContain('本局盈亏 -300');
  });

  it('已结束的事件显示判定依据（238-2）', async () => {
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
    const { w } = await mountView(2);
    expect(w.get('[data-testid="pd-title"]').text()).toContain('系统出题');
    expect(w.get('[data-testid="pd-note"]').text()).toContain('判定依据: 15 点自动轮换的天气是晴（晴类）');
  });

  it('提交：调用接口、提示、关掉面板、刷新', async () => {
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
    const { w } = await mountView();
    await openTrade(w, 'pd-buy-no');
    expect(w.get('[data-testid="pd-side-no"]').attributes('aria-pressed')).toBe('true');
    await w.get('[data-testid="pd-qty"]').setValue('3');
    expect(w.get('[data-testid="pd-submit"]').text()).toContain('买入否 3 份');
    await w.get('[data-testid="pd-submit"]').trigger('click');
    await flushPromises();
    const seen = predictQuote({ y: 55, n: 0, b: 100 }, 'no', 'buy', 3, { unit: 1000, feeRate: 0.02 }).total;
    expect(endpoints.predictTrade).toHaveBeenCalledWith(1, { side: 'no', dir: 'buy', qty: 3, limit: seen });
    expect(useToastStore().items.at(-1)?.text).toContain('买入否 3 份, 花费 1,224 银币');
    expect(w.find('[data-testid="pd-trade-sheet"]').exists()).toBe(false);
    expect(endpoints.predictList).toHaveBeenCalledTimes(2);
    expect(endpoints.predictDetail).toHaveBeenCalledTimes(2);
  });

  it('面板里能切买入 / 卖出、是 / 否；卖出不能超过持有', async () => {
    const { w } = await mountView();
    await openTrade(w, 'pd-buy-yes');
    await w.get('[data-testid="pd-side-no"]').trigger('click');
    await w.get('[data-testid="pd-dir-sell"]').trigger('click');
    // 没持有"否"：卖不了，报价写提示
    expect(w.get('[data-testid="pd-quote"]').text()).toContain('输入份数');
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="pd-side-yes"]').trigger('click');
    // 持有"是" 4 份：步进器最多到 4
    await w.get('[data-testid="pd-qty"]').setValue('9');
    expect((w.get('[data-testid="pd-qty"]').element as HTMLInputElement).value).toBe('4');
    const q = predictQuote({ y: 55, n: 0, b: 100 }, 'yes', 'sell', 4, { unit: 1000, feeRate: 0.02 });
    expect(w.get('[data-testid="pd-quote"]').text()).toContain(`预计得到 ${q.total.toLocaleString('en-US')}`);
    expect(w.get('[data-testid="pd-submit"]').text()).toContain('卖出是 4 份');
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeUndefined();
  });

  it('卖出按钮：有持仓才显示，打开时选好卖出和持有的那一边', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, yes: 0, no: 2 },
    });
    const { w } = await mountView();
    await openTrade(w, 'pd-sell');
    expect(w.get('[data-testid="pd-dir-sell"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="pd-side-no"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="pd-trade-sheet"]').text()).toContain('持有 2 份');
  });

  it('价格被别人推动（predict_price_moved）：提示并重新读取报价（终审 I2）', async () => {
    vi.mocked(endpoints.predictTrade).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'predict_price_moved', total: 9999 }),
    );
    const { w } = await mountView();
    await openTrade(w);
    await w.get('[data-testid="pd-submit"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toContain('价格变了');
    expect(endpoints.predictDetail).toHaveBeenCalledTimes(2);
  });

  it('门槛不满足：买卖按钮禁用', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ eligible: false, reason: 'predict_level' }));
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-buy-yes"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="pd-buy-no"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="pd-sell"]').attributes('disabled')).toBeDefined();
  });

  it('换了网址里的编号就读新的事件', async () => {
    const { w, router } = await mountView();
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, id: 3, title: '第二个' },
    });
    await router.push('/predict/3');
    await flushPromises();
    expect(endpoints.predictDetail).toHaveBeenLastCalledWith(3);
    expect(w.get('[data-testid="pd-title"]').text()).toContain('第二个');
  });

  it('读取失败：写读取失败，不一直显示骨架', async () => {
    vi.mocked(endpoints.predictDetail).mockRejectedValue(new Error('x'));
    const { w } = await mountView();
    expect(w.find('[data-testid="pd-title"]').exists()).toBe(false);
    expect(w.text()).toContain('读取失败');
  });
});

describe('出题人不能交易自己出的题（backlog 238-1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictList).mockResolvedValue(list());
  });
  it('自己出的题：交易块写明不能交易，买卖禁用；别人的题照常', async () => {
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, own: true },
    });
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-own"]').text()).toBe('这道题是你出的, 不能交易');
    expect(w.get('[data-testid="pd-buy-yes"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="pd-buy-no"]').attributes('disabled')).toBeDefined();
    vi.mocked(endpoints.predictDetail).mockResolvedValue(detail);
    const { w: other } = await mountView();
    expect(other.find('[data-testid="pd-own"]').exists()).toBe(false);
    expect(other.get('[data-testid="pd-buy-yes"]').attributes('disabled')).toBeUndefined();
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
    return (await mountView()).w;
  };

  it('单笔超过上限：买入步进器夹到上限；卖出超过单笔上限时提示并禁止提交', async () => {
    const w = await open(list({ maxTrade: 10 }));
    await openTrade(w);
    await w.get('[data-testid="pd-qty"]').setValue('11');
    expect((w.get('[data-testid="pd-qty"]').element as HTMLInputElement).value).toBe('10');
    expect(w.find('[data-testid="pd-limit"]').exists()).toBe(false);

    // 持有比单笔上限多：卖出时步进器按持有算，超过单笔上限就提示
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, yes: 50 },
    });
    const s = await open(list({ maxTrade: 10 }));
    await openTrade(s, 'pd-sell');
    await s.get('[data-testid="pd-qty"]').setValue('11');
    expect(s.get('[data-testid="pd-limit"]').text()).toContain('一次最多 10 份');
    expect(s.get('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
  });

  it('买入后持有超过上限：提示还能买几份', async () => {
    // 详情里已持有"是" 4 份
    const w = await open(list({ maxHold: 10 }));
    await openTrade(w);
    await w.get('[data-testid="pd-qty"]').setValue('7');
    expect(w.get('[data-testid="pd-limit"]').text()).toContain('每边最多持有 10 份, 还能买 6 份');
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="pd-qty"]').setValue('6');
    expect(w.find('[data-testid="pd-limit"]').exists()).toBe(false);
    expect(w.get('[data-testid="pd-submit"]').attributes('disabled')).toBeUndefined();
  });

  it('交易所被冻结：买卖禁用', async () => {
    const w = await open(list({ eligible: false, reason: 'predict_frozen' }));
    expect(w.get('[data-testid="pd-buy-yes"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="pd-buy-no"]').attributes('disabled')).toBeDefined();
  });

  it('区服关掉事件合约：写明只能查看，买卖禁用', async () => {
    const w = await open(list({ enabled: false }));
    expect(w.get('[data-testid="pd-off"]').text()).toContain('暂停');
    expect(w.get('[data-testid="pd-buy-yes"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="pd-sell"]').attributes('disabled')).toBeDefined();
  });

  describe('页面层级（问题记录 288、界面改版 P8）', () => {
    it('详情分成行情、我的持仓、交易、记录四块；标题下写每份结算金额；两段记录直接列出', async () => {
      vi.mocked(endpoints.predictList).mockResolvedValue(list());
      const { w } = await mountView();
      const html = w.html();
      const order = ['pd-sec-market', 'pd-sec-hold', 'pd-sec-trade', 'pd-sec-records', 'pd-trades'].map(
        (id) => html.indexOf(`data-testid="${id}"`),
      );
      expect(order.every((x) => x >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      const meta = w.get('.dt-pd-meta').text();
      expect(meta).toContain('每份结算 1,000 银币');
      expect(w.get('[data-testid="pd-sec-market"]').text()).toContain('是 63%');
      expect(w.get('[data-testid="pd-sec-market"]').text()).toContain('否 37%');
      expect(w.findAll('[data-testid="pd-trades"] .dt-row')).toHaveLength(1);
    });

    it('没有持仓时不显示「我的持仓」和卖出按钮；卖出那一格灰掉', async () => {
      vi.mocked(endpoints.predictList).mockResolvedValue(list());
      vi.mocked(endpoints.predictDetail).mockResolvedValue({
        ...detail,
        event: { ...detail.event, yes: 0, no: 0 },
      });
      const { w } = await mountView();
      expect(w.find('[data-testid="pd-sec-hold"]').exists()).toBe(false);
      expect(w.find('[data-testid="pd-sec-trade"]').exists()).toBe(true);
      expect(w.find('[data-testid="pd-sell"]').exists()).toBe(false);
      await openTrade(w);
      expect(w.get('[data-testid="pd-dir-sell"]').attributes('disabled')).toBeDefined();
    });
  });
});
