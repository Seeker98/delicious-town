import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AcquireBriefDto, AcquireHoldingDto, AcquireRestDto, AcquireViewDto } from '@dt/shared';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import AcquireView from './AcquireView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    acquire: vi.fn(),
    acquireRest: vi.fn(),
    acquireRank: vi.fn(),
    acquireMarket: vi.fn(),
    acquireBuy: vi.fn(),
    acquireRedeem: vi.fn(),
    acquireRelease: vi.fn(),
    acquireList: vi.fn(),
    acquireUnlist: vi.fn(),
    acquireTend: vi.fn(),
  },
}));

const brief = (o: Partial<AcquireBriefDto> = {}): AcquireBriefDto => ({
  restId: 2,
  name: '乙店',
  level: 10,
  star: 2,
  base: 1_000_000,
  heat: 1.2,
  price: 1_200_000,
  owner: null,
  listed: null,
  ...o,
});
const rest = (o: Partial<AcquireRestDto> = {}): AcquireRestDto => ({
  ...brief(),
  taxRate: 0.1,
  protectedUntil: null,
  acquireBlock: null,
  listedBlock: 'not_listed',
  ...o,
});
const holding = (o: Partial<AcquireHoldingDto> = {}): AcquireHoldingDto => ({
  ...brief({ restId: 3, name: '丙店', price: 1_000_000, heat: 1, owner: { restId: 1, name: '我的店' } }),
  dividend: { coin: 50_000, tended: true },
  tendedToday: false,
  ...o,
});
const view = (o: Partial<AcquireViewDto> = {}): AcquireViewDto => ({
  me: rest({ restId: 1, name: '我的店', price: 500_000, acquireBlock: 'self', listedBlock: 'self' }),
  tendedToday: false,
  dividendPaid: true,
  holdings: [],
  maxHoldings: 10,
  taxRate: 0.1,
  listMinRate: 0.5,
  listDays: 3,
  protectDays: 3,
  dividendRate: 0.05,
  tendBonus: 0.5,
  tendFoods: 5,
  ...o,
});

async function mountView(path = '/acquire') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/acquire', component: AcquireView },
      { path: '/friends/:restId', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  const w = mount(AcquireView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('AcquireView（收购 PR 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 1,
      lang: null,
      npcRestId: null,
    };
    vi.mocked(endpoints.acquire).mockResolvedValue(view());
    vi.mocked(endpoints.acquireRank).mockResolvedValue({
      board: 'price',
      price: [brief(), brief({ restId: 1, name: '我的店' })],
      invest: [],
    });
    vi.mocked(endpoints.acquireRest).mockResolvedValue(rest());
    vi.mocked(endpoints.acquireBuy).mockResolvedValue({
      restId: 2,
      price: 1_200_000,
      tax: 120_000,
      sellerGot: 1_080_000,
    });
  });

  it('身价榜：身价、热度、老板；自己的店不给收购按钮；收购前确认价格、对方得多少、税', async () => {
    const w = await mountView();
    const row = w.get('[data-testid="acquire-price-2"]').text();
    expect(row).toContain('身价 1,200,000');
    expect(row).toContain('热度 1.2');
    expect(row).toContain('自主经营');
    expect(w.find('[data-testid="acquire-buy-1"]').exists()).toBe(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toBe(
      '花 1,200,000 银币收购「乙店」？\n「乙店」得 1,080,000 银币，税 120,000 银币。',
    );
    expect(endpoints.acquireBuy).not.toHaveBeenCalled();
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireBuy).toHaveBeenCalledWith(2, 'acquire', 1_200_000);
  });

  it('不能收购：提示原因（关联账号写明最近在同一设备或网络登录过，问题记录 495），不弹确认、不买', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue(rest({ acquireBlock: 'linked' }));
    const confirm = vi.spyOn(window, 'confirm');
    const w = await mountView();
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(endpoints.acquireBuy).not.toHaveBeenCalled();
    expect(useToastStore().items.at(-1)?.text).toBe(
      '你和这家店 (或它的老板) 最近在同一台设备或同一网络登录过，不能收购',
    );
  });

  it('价格变了：提示现在的价格，重新读榜', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(endpoints.acquireBuy).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'price_changed', scope: 'acquire', price: 1_300_000 }),
    );
    const w = await mountView();
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toBe('价格变了，现在是 1,300,000 银币，请重新确认');
    expect(endpoints.acquireRank).toHaveBeenCalledTimes(2);
  });

  it('在售：折扣、挂牌价；买下按挂牌价', async () => {
    const until = new Date(Date.now() + 3 * 3600_000).toISOString();
    const listed = brief({
      owner: { restId: 9, name: '老板店' },
      listed: { rate: 0.5, price: 600_000, until },
    });
    vi.mocked(endpoints.acquireMarket).mockResolvedValue({ items: [listed] });
    vi.mocked(endpoints.acquireRest).mockResolvedValue(rest({ ...listed, listedBlock: null }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView('/acquire?tab=market');
    expect(w.get('[data-testid="acquire-market-2"]').text()).toContain('挂牌 50%: 600,000 银币');
    await w.get('[data-testid="acquire-listed-2"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('「老板店」得 540,000 银币，税 60,000 银币');
    expect(endpoints.acquireBuy).toHaveBeenCalledWith(2, 'listed', 600_000);
  });

  it('今天的分红还没发：名下店写“昨天的分红还没发”，不写“没有”（收购 PR 2 遗留）', async () => {
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({ dividendPaid: false, holdings: [holding({ dividend: null })] }),
    );
    const w = await mountView('/acquire?tab=mine');
    const h3 = w.get('[data-testid="acquire-hold-3"]').text();
    expect(h3).toContain('昨天的分红还没发');
    expect(h3).not.toContain('昨天没有分红');
  });

  it('投资榜：名下几家、身价合计、累计分红', async () => {
    vi.mocked(endpoints.acquireRank).mockResolvedValue({
      board: 'invest',
      price: [],
      invest: [{ restId: 5, name: '大户', holdings: 3, value: 9_000_000, dividendTotal: 123_456 }],
    });
    const w = await mountView('/acquire?tab=invest');
    expect(endpoints.acquireRank).toHaveBeenCalledWith('invest');
    const row = w.get('[data-testid="acquire-invest-5"]').text();
    expect(row).toContain('名下 3 家');
    expect(row).toContain('身价合计 9,000,000');
    expect(row).toContain('累计分红 123,456');
  });

  it('我的：被收购时能打理（今天打理过就禁用）、赎身先确认', async () => {
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({ me: rest({ restId: 1, name: '我的店', price: 500_000, owner: { restId: 7, name: '大老板' } }) }),
    );
    vi.mocked(endpoints.acquireTend).mockResolvedValue({
      foods: [
        { id: 1, num: 3 },
        { id: 2, num: 2 },
      ],
    });
    vi.mocked(endpoints.acquireRedeem).mockResolvedValue({
      restId: 1,
      price: 500_000,
      tax: 50_000,
      sellerGot: 450_000,
    });
    const w = await mountView('/acquire?tab=mine');
    expect(w.get('[data-testid="acquire-me"]').text()).toContain('你的餐厅归「大老板」所有');
    expect(w.text()).toContain('被收购期间不能收购别的店');
    await w.get('[data-testid="acquire-tend"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toBe('打理好了，得到 5 份食材');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await w.get('[data-testid="acquire-redeem"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('老板「大老板」得 450,000 银币，税 50,000 银币');
    expect(endpoints.acquireRedeem).toHaveBeenCalledWith(500_000);

    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({ tendedToday: true, me: rest({ restId: 1, owner: { restId: 7, name: '大老板' } }) }),
    );
    const w2 = await mountView('/acquire?tab=mine');
    expect(w2.get('[data-testid="acquire-tend"]').attributes('disabled')).toBeDefined();
  });

  it('我的：名下的店写昨天分红、今天打理没有；挂牌按选的折扣，撤牌、放手', async () => {
    const until = new Date(Date.now() + 3600_000).toISOString();
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({
        holdings: [
          holding(),
          holding({
            restId: 4,
            name: '丁店',
            dividend: null,
            tendedToday: true,
            listed: { rate: 0.8, price: 800_000, until },
          }),
        ],
      }),
    );
    vi.mocked(endpoints.acquireList).mockResolvedValue({ restId: 3, rate: 0.7, until });
    vi.mocked(endpoints.acquireUnlist).mockResolvedValue({ restId: 4 });
    vi.mocked(endpoints.acquireRelease).mockResolvedValue({ restId: 3 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView('/acquire?tab=mine');
    expect(w.text()).toContain('名下的店 (2 / 10)');
    const h3 = w.get('[data-testid="acquire-hold-3"]').text();
    expect(h3).toContain('昨天分红 50,000 银币 (打理过)');
    expect(h3).toContain('今天还没打理');
    const h4 = w.get('[data-testid="acquire-hold-4"]').text();
    expect(h4).toContain('昨天没有分红');
    expect(h4).toContain('今天打理过');
    // 折扣选项：100% ~ 50%，5% 一档
    const opts = w.get('[data-testid="acquire-rate-3"]').findAll('option');
    expect(opts).toHaveLength(11);
    await w.get('[data-testid="acquire-rate-3"]').setValue('0.7');
    await w.get('[data-testid="acquire-list-3"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('按身价的 70% 挂牌 (700,000 银币)');
    expect(endpoints.acquireList).toHaveBeenCalledWith(3, 0.7);
    await w.get('[data-testid="acquire-unlist-4"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireUnlist).toHaveBeenCalledWith(4);
    await w.get('[data-testid="acquire-release-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireRelease).toHaveBeenCalledWith(3);
  });

  it('切到别的标签、新数据还没回来时不先闪“没有数据”（审查 Minor 5）', async () => {
    let resolve!: (v: { items: AcquireBriefDto[] }) => void;
    vi.mocked(endpoints.acquireMarket).mockReturnValue(new Promise((r) => (resolve = r)));
    const w = await mountView();
    await w.get('[data-testid="acquire-tab-market"]').trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain('现在没有挂牌的店');
    resolve({ items: [] });
    await flushPromises();
    expect(w.text()).toContain('现在没有挂牌的店');
  });
});
