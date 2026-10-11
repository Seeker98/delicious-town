import { config, flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import MarketView from './MarketView.vue';
import { readCss } from '../styles/cssSource';

// 菜场页顶部有"交易所"入口（156-1）：测试不挂路由，用桩代替
config.global.stubs.RouterLink = RouterLinkStub;

vi.mock('../api/endpoints', () => ({
  endpoints: { market: vi.fn(), marketBuy: vi.fn(), marketGuess: vi.fn(), marketManualStock: vi.fn() },
}));

const view: MarketDto = {
  daily: [
    {
      id: 11,
      shelf: 0,
      foodsId: 101,
      price: 1800,
      stock: 5999,
      left: 5990,
      hot: false,
      limit: 1000,
      bought: 0,
      sharedBought: 0,
      have: 0,
      canBuy: 1000,
      openedAt: '2026-09-30T00:00:00.000Z',
      owner: null,
    },
  ],
  special: [],
  premium: [],
  nextDaily: '2026-09-30T04:00:00.000Z',
  nextSpecial: '2026-09-30T03:00:00.000Z',
  nextPremium: '2026-09-30T04:00:00.000Z',
  specialCooldownUntil: null,
  specialCooldownMin: 10,
  foodsMaxNum: 999,
  cupboardFull: false,
  manual: { hasCard: false, cost: 1_000_000 },
  guess: { period: '2026-09-30@12', joined: null, last: null, cost: 2, maxPick: 6, pool: [101, 102, 103] },
};

/** 购买面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（界面改版 P6） */
const mountView = () => mount(MarketView, { global: { stubs: { teleport: true } } });
/** 点价格按钮弹出购买面板 */
async function openBuy(w: ReturnType<typeof mountView>, id: number) {
  await w.get(`[data-testid="buy-${id}"]`).trigger('click');
  await flushPromises();
}

describe('MarketView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.market).mockClear();
    vi.mocked(endpoints.market).mockResolvedValue(view);
    vi.mocked(endpoints.marketBuy).mockResolvedValue({});
    vi.mocked(endpoints.marketGuess).mockResolvedValue({ period: '2026-09-30@12' });
  });

  it('交易所入口放在菜园姐那一行，不单独占一行（问题记录 246）', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="garden-sis"]').find('[data-testid="market-exchange"]').exists()).toBe(true);
  });

  it('区服关掉交易所时不显示入口（问题记录 248）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['exchange'] } as never;
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="market-exchange"]').exists()).toBe(false);
  });

  it('分区标题和右边的进货时间在同一行对齐：都在 .dt-block-head 里，间距放在外层区块（问题记录 192）（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    const head = w.get('[data-testid="section-head-daily"]');
    expect(head.classes()).toContain('dt-block-head');
    expect(head.find('h2.dt-block-title').exists()).toBe(true);
    expect(head.get('.dt-block-more').text()).toContain('下次进货');
    expect(w.get('[data-testid="section-daily"]').classes()).toContain('dt-block');
    expect(w.find('h6.dt-section').exists()).toBe(false);
  });

  it('高级菜场暂时隐藏（问题记录 477）：服务端有货也不显示', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      premium: [{ ...view.daily[0]!, id: 31, shelf: 2 as const }],
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="section-head-daily"]').exists()).toBe(true);
    expect(w.find('[data-testid="section-head-premium"]').exists()).toBe(false);
    expect(w.find('[data-testid="buy-31"]').exists()).toBe(false);
    expect(w.text()).not.toContain('高级菜场');
  });

  it('买菜：点价格按钮弹出购买面板，按输入的数量购买，买完刷新（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="buy-sheet"]').exists()).toBe(false);
    await openBuy(w, 11);
    expect(w.find('[data-testid="buy-sheet"]').exists()).toBe(true);
    await w.find('[data-testid="qty-sheet"]').setValue(5);
    await w.find('[data-testid="buy-confirm"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="buy-sheet"]').exists()).toBe(false);
    expect(endpoints.marketBuy).toHaveBeenCalledWith(11, 5);
    expect(endpoints.market).toHaveBeenCalledTimes(2);
  });

  it('特价冷却中：写明同一网络 10 分钟只能抢一次、还要等几分钟，特价按钮灰掉（问题记录：买第二个提示操作太快）', async () => {
    const item = { ...view.daily[0]!, id: 21, shelf: 1 as const, limit: 1 };
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      special: [item],
      specialCooldownUntil: new Date(Date.now() + 5 * 60_000 - 1000).toISOString(),
    });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain('同一网络 10 分钟内只能抢一次');
    expect(w.find('[data-testid="special-cooldown"]').text()).toContain('还要等 5 分钟');
    expect(w.find('[data-testid="buy-21"]').attributes('disabled')).toBeDefined();
  });

  it('竞猜：展开面板、选择食材后报名（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    // jsdom 点 summary 不会切换 details：直接把它设成展开并发 toggle 事件
    const details = w.get('details[data-testid="guess"]');
    expect(w.find('[data-testid="guess-toggle"]').element.tagName).toBe('SUMMARY');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await w.find('[data-testid="guess-101"]').trigger('click');
    await w.find('[data-testid="guess-102"]').trigger('click');
    await w.find('[data-testid="guess-join"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketGuess).toHaveBeenCalledWith([101, 102]);
  });

  it('最多能买几个按限购、库存、橱柜单种上限取小，写明原因（问题记录：显示 1000 实际只能买 996）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      daily: [
        { ...view.daily[0]!, have: 3, canBuy: 996 },
        { ...view.daily[0]!, id: 12, foodsId: 102, have: 999, canBuy: 0 },
      ],
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="cap-11"]').text()).toContain('橱柜单种上限 999, 已有 3, 最多再买 996');
    await openBuy(w, 11);
    await w.find('[data-testid="qty-sheet"]').setValue(2000);
    await w.find('[data-testid="buy-confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketBuy).toHaveBeenLastCalledWith(11, 996);
    expect(w.find('[data-testid="buy-12"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-12"]').text()).toContain('已经放满了');
  });

  it('同一网络或设备已经买满时写明原因、按钮灰掉（问题记录：显示 0/1000 却提示限购已满）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      daily: [{ ...view.daily[0]!, sharedBought: 1000, canBuy: 0 }],
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="buy-11"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-11"]').text()).toContain('同一网络或设备本轮已买 1000 份');
  });

  it('手动进货（4E-2）：有菜场工作证时显示按钮和费用；进货后刷新', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({ ...view, manual: { hasCard: true, cost: 2_000_000 } });
    vi.mocked(endpoints.marketManualStock).mockResolvedValue({
      foods: [101, 102, 103, 104],
      cost: 2_000_000,
      renown: 200,
    });
    const w = mountView();
    await flushPromises();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const before = vi.mocked(endpoints.market).mock.calls.length;
    const btn = w.find('[data-testid="market-manual"]');
    expect(btn.text()).toBe('手动进货 (2,000,000 银币)');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.marketManualStock).toHaveBeenCalled();
    expect(vi.mocked(endpoints.market).mock.calls.length).toBe(before + 1);
    confirm.mockRestore();
  });

  it('没有工作证不显示按钮；手动货写明谁进的货，自己的货免费', async () => {
    const own = { ...view.daily[0]!, id: 12, owner: { restId: 5, name: '小王的店' } };
    vi.mocked(endpoints.market).mockResolvedValue({ ...view, daily: [view.daily[0]!, own] });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="market-manual"]').exists()).toBe(false);
    expect(w.find('[data-testid="owner-12"]').text()).toContain('小王的店 进的货');
    expect(w.find('[data-testid="owner-11"]').exists()).toBe(false);
  });

  it('自己的手动货不显示价格和限购；手动进货先确认并写明下次整点下架（PR29 遗留）', async () => {
    useSessionStore().$patch({ me: { restaurantId: 5 } } as never);
    const own = { ...view.daily[0]!, id: 12, owner: { restId: 5, name: '我的店' } };
    vi.mocked(endpoints.market).mockResolvedValue({
      ...view,
      daily: [own],
      manual: { hasCard: true, cost: 1_000_000 },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(endpoints.marketManualStock).mockClear();
    const w = mountView();
    await flushPromises();
    const row = w.find('[data-testid="item-12"]');
    expect(row.text()).toContain('自己的货, 免费');
    expect(row.text()).not.toContain('银币');
    expect(row.text()).not.toContain('限购');
    await w.find('[data-testid="market-manual"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('下次日常进货');
    expect(endpoints.marketManualStock).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('分区标题加粗醒目，菜名不加粗（问题记录 176）（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.find('section h2').classes()).toContain('dt-block-title');
    expect(w.find('[data-testid="item-11"] b').exists()).toBe(false);
  });

  it('每行前面是食材图，一行一个 .dt-row，两段各在一张卡片里；行里不再有步进器，右边是价格按钮，数量在购买面板里（界面改版 P4、P6）', async () => {
    const w = mountView();
    await flushPromises();
    const row = w.get('[data-testid="item-11"]');
    expect(row.classes()).toEqual(expect.arrayContaining(['dt-row', 'dt-row-wrap']));
    expect(row.get('.dt-row-ico use').attributes('href')).toMatch(/#food-/);
    expect(row.element.closest('.dt-card')).not.toBeNull();
    expect(row.find('.dt-stepper').exists()).toBe(false);
    const btn = row.get('button.dt-price-btn');
    expect(btn.attributes('data-testid')).toBe('buy-11');
    expect(btn.get('[data-testid="price-11"]').text()).toBe('1,800');
    await openBuy(w, 11);
    expect(
      w.get('[data-testid="buy-sheet"] [data-testid="qty-sheet"]').element.closest('.dt-stepper'),
    ).not.toBeNull();
  });

  it('没读回来时是骨架行（界面改版 P4）', async () => {
    vi.mocked(endpoints.market).mockReturnValue(new Promise(() => undefined));
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="market-skeleton"]').exists()).toBe(true);
  });

  it('手动进货走确认面板（界面改版 P4）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      manual: { ...view.manual, hasCard: true },
    });
    const spy = vi.spyOn(window, 'confirm');
    const store = useConfirmStore();
    store.hosts = 1;
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="market-manual"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(store.current?.title).toContain('下次日常进货');
    store.answer(false);
    await flushPromises();
    expect(endpoints.marketManualStock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('限购写在副行里和剩余放一起，价格按钮上只写价格（界面改版 P4、P6）', async () => {
    const w = mountView();
    await flushPromises();
    const row = w.get('[data-testid="item-11"]');
    expect(row.get('[data-testid="limit-11"]').text()).toMatch(/^限购 \d+\/\d+$/);
    expect(row.get('.dt-row-sub').text()).toContain('剩 5,990');
    expect(row.get('.dt-row-sub').find('[data-testid="limit-11"]').exists()).toBe(true);
    expect(row.get('[data-testid="price-11"]').text()).not.toContain('限购');
  });

  it('限购不压在名字上：名字在标题里、限购在副行里，价格按钮在最右，名字不收窄成 0（终审 I1：法文 360px 重叠）（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    const limit = w.get('[data-testid="limit-11"]').element;
    expect(limit.closest('.dt-row-sub')).not.toBeNull();
    expect(limit.closest('.dt-row-title')).toBeNull();
    const row = w.get('[data-testid="item-11"]').element;
    expect(row.querySelector('.dt-row-title .dt-shrink')).toBeNull();
    expect(row.querySelector('.dt-row-end [data-testid="buy-11"]')).not.toBeNull();
  });

  it('购买面板按银币算最多能买几个，余额写在合计后面（界面改版 P6，P4 终审 I3）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      coin: 5000,
      daily: [{ ...view.daily[0]!, price: 1200, canBuy: 100 }],
    });
    const w = mountView();
    await flushPromises();
    await openBuy(w, 11);
    expect(w.get('[data-testid="quick-max"]').text()).toContain('最多 4');
    expect(w.find('[data-testid="quick-100"]').exists()).toBe(false);
    expect(w.get('[data-testid="buy-total"]').text()).toContain('余 5,000');
    await w.get('[data-testid="quick-max"]').trigger('click');
    expect(w.get('[data-testid="buy-total"]').text()).toContain('4,800');
    await w.get('[data-testid="buy-confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.marketBuy).toHaveBeenLastCalledWith(11, 4);
  });

  it('特价菜打开购买面板时数量默认就是最多能买的（用户 2026-10-11）；日常菜默认 1', async () => {
    const special = { ...view.daily[0]!, id: 21, shelf: 1 as const, price: 100, canBuy: 3 };
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      coin: 1e9,
      special: [special],
    });
    const w = mountView();
    await flushPromises();
    await openBuy(w, 21);
    expect((w.get('[data-testid="qty-sheet"]').element as HTMLInputElement).value).toBe('3');
    expect(w.get('[data-testid="buy-confirm"]').text()).toContain('3');
    w.unmount();
    vi.mocked(endpoints.market).mockResolvedValue({ ...structuredClone(view), coin: 1e9 });
    const d = mountView();
    await flushPromises();
    await openBuy(d, 11);
    expect((d.get('[data-testid="qty-sheet"]').element as HTMLInputElement).value).toBe('1');
  });

  it('一次最多买 1000 个（服务端的上限），“最多”不超过它（P6 审查）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      coin: 1e12,
      daily: [{ ...view.daily[0]!, price: 1, canBuy: 5000 }],
    });
    const w = mountView();
    await flushPromises();
    await openBuy(w, 11);
    expect(w.get('[data-testid="quick-max"]').text()).toContain('最多 1,000');
  });

  it('3 级以上、2 级、万能的格子里，灰字改用同色系的深字，浅色下对比度够 4.5（P6 审查）', () => {
    const css = readCss('main');
    for (const tier of ['is-t2', 'is-t3', 'is-master'])
      expect(css).toMatch(new RegExp(`\\.dt-bag-cell\\.${tier} \\.dt-bag-need`));
  });

  it('银币一个都买不起时写银币不够，确认按钮灰掉（界面改版 P6）', async () => {
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      coin: 100,
      daily: [{ ...view.daily[0]!, price: 1200, canBuy: 100 }],
    });
    const w = mountView();
    await flushPromises();
    await openBuy(w, 11);
    expect(w.find('[data-testid="buy-short"]').exists()).toBe(true);
    expect(w.get('[data-testid="buy-confirm"]').attributes('disabled')).toBeDefined();
  });

  it('服务端没给银币时不按银币限制，也不写余额（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    await openBuy(w, 11);
    expect(w.get('[data-testid="buy-total"]').text()).not.toContain('余');
    expect(w.find('[data-testid="buy-short"]').exists()).toBe(false);
    expect(w.get('[data-testid="quick-max"]').text()).toContain('最多 1,000');
  });

  it('2 级以上的菜名后面标等级，1 级不标（界面改版 P6）', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 101, name: '大米', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 102, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.market).mockResolvedValue({
      ...structuredClone(view),
      daily: [view.daily[0]!, { ...view.daily[0]!, id: 12, foodsId: 102 }],
    });
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="item-11"] .dt-row-title').text()).toBe('大米');
    expect(w.find('[data-testid="item-11"] .dt-lv').exists()).toBe(false);
    expect(w.get('[data-testid="item-12"] .dt-row-title').text()).toContain('葡萄');
    expect(w.get('[data-testid="item-12"] .dt-lv').text()).toBe('2 级');
    expect(w.get('[data-testid="item-12"] .dt-lv').classes()).toContain('is-t2');
  });

  it('读取失败时写读取失败，不一直显示骨架行（终审 I4）', async () => {
    vi.mocked(endpoints.market).mockRejectedValue(new Error('x'));
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="market-skeleton"]').exists()).toBe(false);
    expect(w.get('[data-testid="market-failed"]').text()).toContain('读取菜场失败');
  });
});
