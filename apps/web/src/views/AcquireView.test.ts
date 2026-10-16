import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type {
  AcquireBriefDto,
  AcquireHoldingDto,
  AcquireOwnedDto,
  AcquireRestDto,
  AcquireRulesDto,
  AcquireViewDto,
} from '@dt/shared';
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
    acquireTendAll: vi.fn(),
  },
}));

const RULES: AcquireRulesDto = {
  minStar: 2,
  buyerMinStar: 2,
  buyerMinAccountDays: 7,
  buyerMaxPerDay: 3,
  maxHoldings: 10,
  maxPerDay: 1,
  newStarProtectDays: 3,
  protectDays: 3,
  priceMultiple: 3.5,
  heatStep: 0.1,
  taxRate: 0.1,
  firstStoreRate: 0.5,
  firstBurnRate: 0.4,
  resaleStoreRate: 0.05,
  redeemBurnRate: 0.3,
  cedeRate: 0.035,
  cedeTendRate: 0.049,
  tendMultiplier: 1.035,
  tendCostRate: 0.01,
  tendPackStep: 430_000,
  tendPackMax: 3,
  tendHalfDays: 3,
  tendStopDays: 7,
  tendReleaseDays: 14,
  listMinRate: 0.5,
  listMaxRate: 1.2,
  listDays: 3,
};
const brief = (o: Partial<AcquireBriefDto> = {}): AcquireBriefDto => ({
  restId: 2,
  name: '乙店',
  level: 10,
  star: 2,
  base: 2_100_000,
  avg: 600_000,
  heat: 1.1,
  price: 2_310_000,
  owner: null,
  listed: null,
  ...o,
});
const split = (sellerGot: number, storeGot: number, burn: number, tax: number) => ({
  sellerGot,
  storeGot,
  burn,
  tax,
});
const rest = (o: Partial<AcquireRestDto> = {}): AcquireRestDto => ({
  ...brief(),
  protectedUntil: null,
  acquireBlock: null,
  listedBlock: 'not_listed',
  acquireSplit: split(0, 1_155_000, 924_000, 231_000),
  listedSplit: null,
  ...o,
});
const holding = (o: Partial<AcquireHoldingDto> = {}): AcquireHoldingDto => ({
  ...brief({
    restId: 3,
    name: '丙店',
    base: 1_820_000,
    avg: 520_000,
    price: 1_820_000,
    heat: 1,
    owner: { restId: 1, name: '我的店' },
  }),
  tendedToday: false,
  idleDays: 1,
  cedeRate: 0.035,
  pending: 9_800,
  yesterday: 18_200,
  tendCost: 5_200,
  tendPacks: 1,
  ...o,
});
const owned = (o: Partial<AcquireOwnedDto> = {}): AcquireOwnedDto => ({
  since: '2026-10-12T02:00:00.000Z',
  cededToday: 22_140,
  ceded30: 168_900,
  cedeRate: 0.049,
  tendedToday: true,
  tendedAt: '2026-10-16T00:12:00.000Z',
  packsToday: 2,
  tendDays7: 5,
  idleDays: 0,
  redeemPrice: 3_395_000,
  redeemSplit: split(2_037_000, 0, 1_018_500, 339_500),
  ...o,
});
const view = (o: Partial<AcquireViewDto> = {}): AcquireViewDto => ({
  me: rest({
    restId: 1,
    name: '我的店',
    price: 4_620_000,
    avg: 1_320_000,
    heat: 1,
    acquireBlock: 'self',
    listedBlock: 'self',
  }),
  owned: null,
  dividendPaid: true,
  holdings: [],
  pendingTotal: 0,
  yesterdayTotal: 0,
  boughtToday: 0,
  rules: RULES,
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
  // 面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（界面改版 P8）
  const w = mount(AcquireView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return w;
}

describe('AcquireView（收购 PR 3；改版 2026-10-16）', () => {
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
      price: 2_310_000,
      ...split(0, 1_155_000, 924_000, 231_000),
    });
  });

  it('第一次打开时榜单和“我的”一起读，不等榜单回来（性能排查 2026-10-08）', async () => {
    vi.mocked(endpoints.acquireRank).mockReturnValue(new Promise(() => undefined));
    await mountView();
    expect(endpoints.acquire).toHaveBeenCalled();
  });

  it('身价榜：强收没有老板的店，面板里写清店得、并购咨询费、税和收下以后的抽成、回本', async () => {
    const w = await mountView();
    const row = w.get('[data-testid="acquire-price-2"]').text();
    expect(row).toContain('身价 2,310,000');
    expect(row).toContain('热度 1.1');
    // 自己的店：点开面板也没有收购按钮，不读能不能买
    await w.get('[data-testid="acquire-price-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="acquire-buy-1"]').exists()).toBe(false);
    expect(endpoints.acquireRest).not.toHaveBeenCalled();
    // 界面改版 P8：面板就是确认，不再弹浏览器确认框
    const confirm = vi.spyOn(window, 'confirm');
    await w.get('[data-testid="acquire-price-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireRest).toHaveBeenCalledWith(2);
    const sheet = w.get('[data-testid="acquire-sheet"]');
    expect(sheet.text()).toContain('身价 2,310,000 · 日均 600,000 · 热度 1.1');
    expect(sheet.text()).toContain('自主经营');
    const s = w.get('[data-testid="acquire-split"]').text();
    expect(s).toContain('你付2,310,000');
    expect(s).toContain('「乙店」得 (50%)1,155,000');
    expect(s).toContain('并购咨询费 (40%, 销毁)924,000');
    expect(s).toContain('税 (10%)231,000');
    const after = w.get('[data-testid="acquire-after"]').text();
    expect(after).toContain('每天抽成约21,000 (3.5%)');
    expect(after).toContain('打理的日子4.9%, 付日均的 1%');
    // 2,310,000 ÷ 21,000 = 110 天；打理日净 4.9% × 1.035 − 1% = 4.0715%：95 天
    expect(after).toContain('回本约110 天 · 天天打理 95 天');
    expect(after).toContain('收购后名下1 / 10 家 · 今天还能买 2 家');
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(endpoints.acquireBuy).toHaveBeenCalledWith(2, 'acquire', 2_310_000);
    // 买完面板关掉
    expect(w.find('[data-testid="acquire-sheet"]').exists()).toBe(false);
  });

  it('有老板的店：身价榜点开写为什么不能强收、给去在售的链接，收购按钮灰掉', async () => {
    vi.mocked(endpoints.acquireRank).mockResolvedValue({
      board: 'price',
      price: [brief({ owner: { restId: 9, name: '大胃王' } })],
      invest: [],
    });
    vi.mocked(endpoints.acquireRest).mockResolvedValue(
      rest({ owner: { restId: 9, name: '大胃王' }, acquireBlock: 'owned', acquireSplit: null }),
    );
    const w = await mountView();
    await w.get('[data-testid="acquire-price-2"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="acquire-owned-why"]').text()).toBe(
      '有老板的店不能强收, 只能等老板挂牌后在「在售」里买下。',
    );
    expect(w.find('[data-testid="acquire-go-market"]').exists()).toBe(true);
    expect(w.find('[data-testid="acquire-split"]').exists()).toBe(false);
    expect(w.find('[data-testid="acquire-block"]').exists()).toBe(false);
    expect(w.get('[data-testid="acquire-buy-2"]').attributes('disabled')).toBeDefined();
  });

  it('不能收购：面板里写原因（关联账号写明最近在同一设备或网络登录过，问题记录 495），按钮灰掉、不买', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue(rest({ acquireBlock: 'linked' }));
    const w = await mountView();
    await w.get('[data-testid="acquire-price-2"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="acquire-block"]').text()).toBe(
      '你和这家店 (或它的老板) 最近在同一台设备或同一网络登录过, 不能收购或打理',
    );
    const btn = w.get('[data-testid="acquire-buy-2"]');
    expect(btn.attributes('disabled')).toBeDefined();
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.acquireBuy).not.toHaveBeenCalled();
  });

  it('价格变了：提示现在的价格，重新读榜；面板还开着就重读这家店，再点按新价收购（P8 终审 I2）', async () => {
    vi.mocked(endpoints.acquireBuy).mockRejectedValueOnce(
      new ApiError('INVALID_STATE', { reason: 'price_changed', scope: 'acquire', price: 2_400_000 }),
    );
    const w = await mountView();
    await w.get('[data-testid="acquire-price-2"]').trigger('click');
    await flushPromises();
    vi.mocked(endpoints.acquireRest).mockResolvedValue(rest({ price: 2_400_000 }));
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toBe('价格变了, 现在是 2,400,000 银币, 请重新确认');
    expect(endpoints.acquireRank).toHaveBeenCalledTimes(2);
    expect(endpoints.acquireRest).toHaveBeenCalledTimes(2);
    expect(w.get('[data-testid="acquire-split"]').text()).toContain('2,400,000');
    await w.get('[data-testid="acquire-buy-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireBuy).toHaveBeenLastCalledWith(2, 'acquire', 2_400_000);
  });

  it('在售：挂牌比例、挂牌价；买下时原老板得 85%、店得 5%、税 10%', async () => {
    const until = new Date(Date.now() + 3 * 3600_000).toISOString();
    const listed = brief({
      owner: { restId: 9, name: '老板店' },
      listed: { rate: 1.2, price: 2_772_000, until },
    });
    vi.mocked(endpoints.acquireMarket).mockResolvedValue({ items: [listed] });
    vi.mocked(endpoints.acquireRest).mockResolvedValue(
      rest({
        ...listed,
        acquireBlock: 'owned',
        listedBlock: null,
        acquireSplit: null,
        listedSplit: split(2_356_200, 138_600, 0, 277_200),
      }),
    );
    const w = await mountView('/acquire?tab=market');
    const row = w.get('[data-testid="acquire-market-2"]');
    expect(row.text()).toContain('挂牌 120%');
    expect(row.get('.dt-acq-cost').text()).toBe('2,772,000银币');
    await row.trigger('click');
    await flushPromises();
    const s = w.get('[data-testid="acquire-split"]').text();
    expect(s).toContain('你付2,772,000');
    expect(s).toContain('「老板店」得 (85%)2,356,200');
    expect(s).toContain('「乙店」得 (5%)138,600');
    expect(s).toContain('税 (10%)277,200');
    expect(s).not.toContain('并购咨询费');
    await w.get('[data-testid="acquire-listed-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireBuy).toHaveBeenCalledWith(2, 'listed', 2_772_000);
  });

  it('投资榜：名下几家、身价合计、累计抽成', async () => {
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
    expect(row).toContain('累计抽成 123,456');
  });

  it('我的 · 被收购：今天和近 30 天让了多少、今天的抽成、老板打理了几天；赎身先确认，写清怎么分', async () => {
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({
        me: rest({
          restId: 1,
          name: '我的店',
          price: 3_395_000,
          avg: 970_000,
          heat: 1,
          owner: { restId: 7, name: '大胃王餐厅' },
          acquireBlock: 'self',
          listedBlock: 'self',
        }),
        owned: owned(),
      }),
    );
    vi.mocked(endpoints.acquireRedeem).mockResolvedValue({
      restId: 1,
      price: 3_395_000,
      ...split(2_037_000, 0, 1_018_500, 339_500),
    });
    const w = await mountView('/acquire?tab=mine');
    expect(w.get('[data-testid="acquire-me"]').text()).toContain('老板 大胃王餐厅');
    const box = w.get('[data-testid="acquire-owned"]').text();
    expect(box).toContain('今天已让出22,140');
    expect(box).toContain('近 30 天让出168,900');
    expect(box).toContain('4.9%');
    expect(box).toContain('老板打理过');
    expect(box).toContain('近 7 天老板打理5 天');
    expect(w.get('[data-testid="acquire-tend-line"]').text()).toContain('送了你 2 个二级街市补给包');
    expect(w.get('[data-testid="acquire-tend-line"]').text()).toContain('× 1.035');
    expect(w.text()).toContain('被收购期间不能收购别的店');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await w.get('[data-testid="acquire-redeem"]').trigger('click');
    await flushPromises();
    const asked = confirm.mock.calls[0]![0];
    expect(asked).toContain('花 3,395,000 银币赎身？');
    expect(asked).toContain('老板「大胃王餐厅」得 2,037,000 银币 (60%)');
    expect(asked).toContain('赎身销毁 1,018,500 银币 (30%)');
    expect(asked).toContain('税 339,500 银币 (10%)');
    expect(endpoints.acquireRedeem).toHaveBeenCalledWith(3_395_000);
  });

  it('我的 · 被收购：老板没打理、几天没打理时写清楚', async () => {
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({
        me: rest({
          restId: 1,
          owner: { restId: 7, name: '懒老板' },
          acquireBlock: 'self',
          listedBlock: 'self',
        }),
        owned: owned({ tendedToday: false, tendedAt: null, packsToday: 0, idleDays: 4, cedeRate: 0.0175 }),
      }),
    );
    const w = await mountView('/acquire?tab=mine');
    expect(w.get('[data-testid="acquire-cede-rate"]').text()).toBe('1.8%');
    expect(w.get('[data-testid="acquire-owned"]').text()).toContain('老板没打理, 减半');
    expect(w.get('[data-testid="acquire-tend-line"]').text()).toBe(
      '老板今天还没打理; 打理以后, 之后每轮结算 × 1.035',
    );
  });

  it('我的 · 名下的店：待发和昨天到账；没打理的单个打理、全部打理；几天没打理标红并写还剩几天', async () => {
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({
        holdings: [
          holding({
            restId: 3,
            name: '丙店',
            tendedToday: true,
            idleDays: 0,
            cedeRate: 0.049,
            pending: 31_060,
          }),
          holding({ restId: 4, name: '丁店' }),
          holding({
            restId: 5,
            name: '戊店',
            idleDays: 3,
            cedeRate: 0.0175,
            tendCost: 3_600,
            tendPacks: 0,
            pending: 4_410,
          }),
        ],
        pendingTotal: 45_270,
        yesterdayTotal: 73_680,
        boughtToday: 1,
      }),
    );
    vi.mocked(endpoints.acquireTend).mockResolvedValue({ restId: 4, cost: 5_200, packs: 1 });
    vi.mocked(endpoints.acquireTendAll).mockResolvedValue({
      items: [
        { restId: 4, cost: 5_200, packs: 1 },
        { restId: 5, cost: 3_600, packs: 0 },
      ],
      cost: 8_800,
    });
    const w = await mountView('/acquire?tab=mine');
    expect(w.text()).toContain('3 / 10 家 · 今天还能买 2 家');
    const sum = w.get('[data-testid="acquire-hold-sum"]').text();
    expect(sum).toContain('今天待发抽成45,270');
    expect(sum).toContain('昨天到账73,680');
    expect(sum).toContain('2 家今天还没打理, 一起打理付 8,800 银币');
    const h3 = w.get('[data-testid="acquire-hold-3"]').text();
    expect(h3).toContain('今天打理过');
    expect(h3).toContain('日均 520,000 · 抽成 4.9% · 今天待发 31,060');
    expect(w.find('[data-testid="acquire-tend-3"]').exists()).toBe(false);
    const h5 = w.get('[data-testid="acquire-hold-5"]').text();
    expect(h5).toContain('3 天没打理');
    expect(h5).toContain('抽成减半; 再 4 天不打理就不再抽成, 11 天后自动放手');
    await w.get('[data-testid="acquire-tend-4"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireTend).toHaveBeenCalledWith(4);
    expect(useToastStore().items.at(-1)?.text).toBe('打理了「丁店」, 付了 5,200 银币');
    await w.get('[data-testid="acquire-tend-all"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireTendAll).toHaveBeenCalled();
    expect(useToastStore().items.at(-1)?.text).toBe('打理了 2 家, 共付 8,800 银币');
  });

  it('今天的发放任务还没跑完：昨天到账写“还没发”，不写 0（收购 PR 2 遗留）', async () => {
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({ dividendPaid: false, holdings: [holding({ yesterday: null })] }),
    );
    const w = await mountView('/acquire?tab=mine');
    expect(w.get('[data-testid="acquire-hold-sum"]').text()).toContain('昨天到账还没发');
  });

  it('名下一家的面板：打理成本和补给包；挂牌 50%~120% 和怎么分；撤牌、放手', async () => {
    const until = new Date(Date.now() + 3600_000).toISOString();
    vi.mocked(endpoints.acquire).mockResolvedValue(
      view({
        holdings: [
          holding(),
          holding({
            restId: 4,
            name: '丁店',
            tendedToday: true,
            listed: { rate: 0.8, price: 1_456_000, until },
          }),
        ],
      }),
    );
    vi.mocked(endpoints.acquireTend).mockResolvedValue({ restId: 3, cost: 5_200, packs: 1 });
    vi.mocked(endpoints.acquireList).mockResolvedValue({ restId: 3, rate: 1.1, until });
    vi.mocked(endpoints.acquireUnlist).mockResolvedValue({ restId: 4 });
    vi.mocked(endpoints.acquireRelease).mockResolvedValue({ restId: 3 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView('/acquire?tab=mine');
    await w.get('[data-testid="acquire-hold-open-3"]').trigger('click');
    // 换比例时面板内容会重新渲染：每次重新找
    const sheet = () => w.get('[data-testid="acquire-hold-sheet"]');
    const tendSum = sheet().get('[data-testid="acquire-tend-sum"]').text();
    expect(tendSum).toContain('你付 (日均的 1%, 销毁)5,200');
    expect(tendSum).toContain('× 1.035');
    expect(tendSum).toContain('1 个二级街市补给包');
    expect(tendSum).toContain('3.5% → 4.9%');
    await sheet().get('[data-testid="acquire-tend-sheet-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireTend).toHaveBeenCalledWith(3);
    // 打理完面板还开着
    expect(w.find('[data-testid="acquire-hold-sheet"]').exists()).toBe(true);
    // 挂牌比例 120% ~ 50%，5% 一档
    expect(sheet().findAll('[data-testid^="acquire-rate-"]')).toHaveLength(15);
    expect(sheet().get('[data-testid="acquire-rate-1"]').attributes('aria-pressed')).toBe('true');
    expect(sheet().find('[data-testid="acquire-rate-1.25"]').exists()).toBe(false);
    await sheet().get('[data-testid="acquire-rate-1.1"]').trigger('click');
    expect(sheet().text()).toContain('挂牌价2,002,000');
    expect(sheet().text()).toContain('卖出后你得 (85%)1,701,700');
    expect(sheet().text()).toContain('「丙店」得 (5%)100,100');
    expect(sheet().text()).toContain('税 (10%)200,200');
    await w.get('[data-testid="acquire-list-3"]').trigger('click');
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(endpoints.acquireList).toHaveBeenCalledWith(3, 1.1);
    expect(w.find('[data-testid="acquire-hold-sheet"]').exists()).toBe(false);
    // 挂着牌的：写挂牌信息，只能撤牌；今天打理过的没有打理按钮
    await w.get('[data-testid="acquire-hold-open-4"]').trigger('click');
    expect(w.get('[data-testid="acquire-listed-line"]').text()).toContain('挂牌 80%: 1,456,000 银币');
    expect(w.find('[data-testid="acquire-tend-sheet-4"]').exists()).toBe(false);
    expect(w.find('[data-testid="acquire-list-4"]').exists()).toBe(false);
    await w.get('[data-testid="acquire-unlist-4"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireUnlist).toHaveBeenCalledWith(4);
    // 放手先确认（危险操作）
    await w.get('[data-testid="acquire-hold-open-3"]').trigger('click');
    confirm.mockReturnValueOnce(false);
    await w.get('[data-testid="acquire-release-3"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toBe('放手「丙店」？\n不退钱, 店变回自主经营。');
    expect(endpoints.acquireRelease).not.toHaveBeenCalled();
    await w.get('[data-testid="acquire-release-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireRelease).toHaveBeenCalledWith(3);
  });

  it('收购规则：一条一行，数都从区服数值来', async () => {
    const w = await mountView('/acquire?tab=mine');
    await w.get('[data-testid="acquire-rule-open"]').trigger('click');
    const items = w.get('[data-testid="acquire-rule"]').findAll('li');
    expect(items).toHaveLength(8);
    expect(items[0]!.text()).toContain('× 3.5 × 热度');
    expect(items[1]!.text()).toContain('店得 50%, 并购咨询费 40% 销毁, 10% 是税');
    expect(items[7]!.text()).toContain('老板得 60%, 30% 销毁, 10% 是税');
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
