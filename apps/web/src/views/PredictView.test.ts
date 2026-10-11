import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { PredictListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
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

/**
 * 列表里的事件是链接（界面改版 P8：详情单独一页 /predict/编号），挂载时要装路由；
 * 「怎么算盈亏」面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容留在 wrapper 里
 */
async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/predict', component: { template: '<p/>' } },
      { path: '/predict/:id', component: { template: '<p/>' } },
    ],
  });
  await router.push('/predict');
  const w = mount(PredictView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
}
/** 点开「怎么算盈亏」，返回面板里的说明 */
async function openHelp(w: Awaited<ReturnType<typeof mountView>>['w']) {
  await w.get('[data-testid="pd-help"]').trigger('click');
  return w.get('.dt-sheet');
}

describe('PredictView（238-1 设计 §7.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.predictList).mockResolvedValue(list());
  });

  it('列表：进行中显示概率；已结束显示结果和盈亏', async () => {
    const { w } = await mountView();
    // 事件名用单独的标题样式，不用继承按钮字号的 <b>（问题记录 278）
    expect(w.get('[data-testid="pd-event-1"] .dt-pd-ev-title').text()).toContain('明天会下雨吗');
    expect(w.find('[data-testid="pd-event-1"] b').exists()).toBe(false);
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('63%');
    const ended = w.get('[data-testid="pd-ended-2"]').text();
    // 结果用标签显示（问题记录 288）
    expect(w.get('[data-testid="pd-ended-2"] [data-testid="pd-ended-tag"]').text()).toBe('结果: 是');
    expect(ended).toContain('+1,400');
    // 列表不再读详情（界面改版 P8：详情是单独一页）
    expect(endpoints.predictDetail).not.toHaveBeenCalled();
  });

  it('进行中的事件写剩余时间和我的持仓', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(
      list({ events: [ev({ closeAt: '2999-01-01T00:00:00.000Z', yes: 4, no: 1 }), ev({ id: 3 })] }),
    );
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('还剩');
    expect(w.get('[data-testid="pd-event-1"]').text()).toContain('我持有 是 4 / 否 1');
    expect(w.get('[data-testid="pd-event-3"]').text()).not.toContain('我持有');
  });

  it('点事件进详情页 /predict/编号，不在列表里展开（界面改版 P8，取代问题记录 264 的就地展开）', async () => {
    const { w, router } = await mountView();
    expect(w.get('[data-testid="pd-event-1"]').attributes('href')).toBe('/predict/1');
    expect(w.get('[data-testid="pd-ended-2"]').attributes('href')).toBe('/predict/2');
    await w.get('[data-testid="pd-event-1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/predict/1');
    expect(w.find('[data-testid="pd-detail"]').exists()).toBe(false);
  });

  it('止盈止损写进说明（问题记录 260）', async () => {
    const { w } = await mountView();
    const help = (await openHelp(w)).text();
    expect(help).toContain('止损');
    expect(help).toContain('止盈');
  });

  it('盈亏说明：点开是算法说明（问题记录 252）', async () => {
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-help"]').text()).toContain('怎么算盈亏');
    const help = (await openHelp(w)).text();
    expect(help).toContain('怎么算盈亏');
    expect(help).toContain('每份得 1,000 银币');
    expect(help).toContain('手续费 2%');
    expect(help).toContain('作废');
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
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-auto-1"]').text()).toContain('系统出题');
    expect(w.get('[data-testid="pd-ended-note-2"]').text()).toContain('判定依据: 15 点自动轮换的天气是晴');
  });

  it('门槛不满足：显示原因', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ eligible: false, reason: 'predict_level' }));
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-reason"]').text()).toContain('餐厅 20 级');
  });
});

describe('backlog 238-1：事件合约页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('说明不再写死每份 1,000 银币：按区服的每份金额', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ unit: 2000 }));
    const { w } = await mountView();
    const help = (await openHelp(w)).text();
    expect(help).not.toContain('每份得 1,000 银币');
    expect(help).toContain('每份得 2,000 银币');
  });

  it('交易所被冻结：显示原因', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ eligible: false, reason: 'predict_frozen' }));
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-reason"]').text()).toContain('交易所已被冻结');
  });

  it('区服关掉事件合约：写明只能查看', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(list({ enabled: false }));
    const { w } = await mountView();
    expect(w.get('[data-testid="pd-off"]').text()).toContain('暂停');
  });

  describe('页面层级（问题记录 288，方案 A）', () => {
    beforeEach(() => {
      vi.mocked(endpoints.predictList).mockResolvedValue(list());
    });

    it('「怎么算盈亏」只在页面顶部放一行，默认收起，点了从下面弹出', async () => {
      const { w } = await mountView();
      expect(w.findAll('[data-testid="pd-help"]')).toHaveLength(1);
      expect(w.html().indexOf('pd-help')).toBeLessThan(w.html().indexOf('pd-event-1'));
      expect(w.find('.dt-sheet').exists()).toBe(false);
      const sheet = await openHelp(w);
      expect(sheet.get('.dt-sheet-title').text()).toBe('怎么算盈亏');
      await w.get('.dt-sheet-scrim').trigger('click');
      expect(w.find('.dt-sheet').exists()).toBe(false);
    });

    it('列表卡有一条是/否概率条', async () => {
      const { w } = await mountView();
      const bar = w.get('[data-testid="pd-bar-1"] [data-testid="pd-bar-yes"]');
      expect(bar.attributes('style')).toContain('width: 63%');
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
      const { w } = await mountView();
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
      const { w } = await mountView();
      expect(w.get('[data-testid="pd-ended-6"] [data-testid="pd-ended-tag"]').text()).toBe('结果: 是');
      expect(w.get('[data-testid="pd-ended-7"] [data-testid="pd-ended-tag"]').text()).toBe('结果: 否');
      expect(w.get('[data-testid="pd-ended-6"]').get('[data-testid="pd-ended-profit"]').text()).toContain(
        '+500',
      );
      expect(w.find('[data-testid="pd-ended-2"]').exists()).toBe(false);
      await w.get('[data-testid="pd-ended-more"]').trigger('click');
      expect(w.find('[data-testid="pd-ended-2"]').exists()).toBe(true);
      expect(w.get('[data-testid="pd-ended-more"]').attributes('aria-expanded')).toBe('true');
    });

    it('没判定的已结束事件写状态（等待判定、已作废），不写盈亏（问题记录 288）', async () => {
      vi.mocked(endpoints.predictList).mockResolvedValue(
        list({
          events: [
            ev({ id: 2, status: 'closed' }),
            ev({ id: 3, status: 'void', yes: 1, netCost: 500, payout: 400 }),
          ],
        }),
      );
      const { w } = await mountView();
      expect(w.get('[data-testid="pd-ended-2"] [data-testid="pd-ended-tag"]').text()).toBe('等待判定');
      expect(w.find('[data-testid="pd-ended-2"] [data-testid="pd-ended-profit"]').exists()).toBe(false);
      expect(w.get('[data-testid="pd-ended-3"] [data-testid="pd-ended-tag"]').text()).toBe('已作废');
      expect(w.get('[data-testid="pd-ended-3"] [data-testid="pd-ended-profit"]').text()).toContain('-100');
    });
  });
});
