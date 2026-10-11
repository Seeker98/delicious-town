import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARED_GOODS, type StoreDto } from '@dt/shared';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import StoreView from './StoreView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    store: vi.fn(),
    storeRecords: vi.fn(),
    useGoods: vi.fn(),
    sell: vi.fn(),
    discard: vi.fn(),
    catalog: vi.fn(),
  },
}));

/** 详情面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（界面改版 P7） */
const mountView = (global: Record<string, unknown> = {}) =>
  mount(StoreView, { global: { ...global, stubs: { teleport: true } } });
type View = ReturnType<typeof mountView>;
/** 点一格打开面板（界面改版 P7：数量、使用、卖出都在面板里） */
const openItem = async (w: View, goodsId: number) => {
  await w.get(`[data-testid="store-item-${goodsId}"]`).trigger('click');
  await flushPromises();
  return w.get('[data-testid="store-sheet"]');
};

const data: StoreDto = {
  kinds: 1,
  storeNum: 20,
  equips: 0,
  items: [
    {
      goodsId: 85,
      type: 0,
      num: 150,
      expiresAt: null,
      usable: true,
      batch: true,
      maxUse: 99,
      sellPrice: null,
    },
  ],
};

describe('StoreView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.store).mockResolvedValue(structuredClone(data));
    vi.mocked(endpoints.useGoods).mockResolvedValue({} as never);
  });

  it('选"全部"时按类型分组，带小标题，消耗品在道具前面（问题记录 186）', async () => {
    const goods = (id: number, name: string, type: number) =>
      ({ id, name, type, deviceType: null, level: 1, desc: '', coin: 0, diamond: 0 }) as never;
    useCatalogStore().goodsMap = new Map([
      [315, goods(315, '喇叭', 1)],
      [29, goods(29, '体力卡', 0)],
    ]);
    const row = (goodsId: number, type: number) => ({ ...data.items[0]!, goodsId, type });
    vi.mocked(endpoints.store).mockResolvedValue({ ...data, items: [row(315, 1), row(29, 0)] });
    const w = mountView();
    await flushPromises();
    const html = w.html();
    // 小标题是类型名加件数（界面改版 P7）
    const g0 = w.get('[data-testid="store-group-0"]');
    const g1 = w.get('[data-testid="store-group-1"]');
    expect(g0.element.firstChild?.textContent?.trim()).toBe('消耗品');
    expect(g0.get('span').text()).toBe('1');
    expect(g1.element.firstChild?.textContent?.trim()).toBe('道具');
    expect(g1.get('span').text()).toBe('1');
    // 分类标题用浅色小字，不和物品名抢层级（问题记录 194）
    expect(g0.classes()).toContain('dt-bag-group');
    expect(g0.classes()).not.toContain('dt-section');
    expect(html.indexOf('体力卡')).toBeLessThan(html.indexOf('喇叭'));
  });

  it('批量使用显示单次上限；填的数超过上限时按上限使用（问题记录：批量使用不提示上限）', async () => {
    const w = mountView();
    await flushPromises();
    const sheet = await openItem(w, 85);
    expect(sheet.get('.dt-detail-sub').text()).toContain('一次最多 99');
    // 桩掉的 teleport 每次重绘都换新元素，每步重新取输入框
    const qty = () => w.get('[data-testid="store-qty"]');
    await qty().setValue('150');
    // 输入超过上限：框里的数改成上限（终审）
    await qty().trigger('blur');
    expect((qty().element as HTMLInputElement).value).toBe('99');
    // 按钮写明实际用几个（界面改版 P7）
    const use = w.get('[data-testid="store-use"]');
    expect(use.text()).toBe('使用 99 个');
    await use.trigger('click');
    await flushPromises();
    expect(endpoints.useGoods).toHaveBeenCalledWith(85, 99);
  });

  it('现在用不了（上限为 0）时使用按钮禁用并提示', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        {
          goodsId: 82,
          type: 0,
          num: 3,
          expiresAt: null,
          usable: true,
          batch: true,
          maxUse: 0,
          sellPrice: 3500,
        },
      ],
    });
    const w = mountView();
    await flushPromises();
    // 格子下面一行就提示，红字
    const sub = w.get('[data-testid="store-item-82"] .dt-bag-need');
    expect(sub.text()).toBe('已达上限');
    expect(sub.classes()).toContain('is-danger');
    const sheet = await openItem(w, 82);
    expect(w.get('[data-testid="store-use"]').attributes('disabled')).toBeDefined();
    expect(sheet.get('.dt-detail-sub .text-danger').text()).toBe('已达上限');
  });
  it('能卖和不能卖的格子结构一样：都有名字和下面一行（问题记录：行高不同）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        ...structuredClone(data.items),
        {
          goodsId: 106,
          type: 0,
          num: 1,
          expiresAt: null,
          usable: false,
          batch: false,
          maxUse: 0,
          sellPrice: null,
        },
      ],
    });
    const w = mountView();
    await flushPromises();
    const cells = w.findAll('.dt-bag-cell');
    expect(cells).toHaveLength(2);
    for (const c of cells) {
      expect(c.find('.dt-bag-name').exists()).toBe(true);
      expect(c.find('.dt-bag-need').exists()).toBe(true);
    }
  });

  it('名字太长时只截名字，数量总是显示，剩余时间放第二行（审查）', async () => {
    const soon = new Date(Date.now() + 90 * 60_000 + 30_000).toISOString();
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [{ ...data.items[0]!, expiresAt: soon }],
    });
    const w = mountView();
    await flushPromises();
    const cell = w.get('[data-testid="store-item-85"]');
    // 数量是右上角的角标，不在名字里，名字截断时也看得到
    const num = cell.get('.dt-bag-num');
    expect(num.text()).toBe('150');
    expect(num.element.closest('.dt-bag-name')).toBeNull();
    expect(cell.get('.dt-bag-name').text()).not.toContain('150');
    expect(cell.get('.dt-bag-need').text()).toContain('剩余 1 小时 31 分');
  });

  it('只有一个时不显示数量角标', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [{ ...data.items[0]!, num: 1 }],
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="store-item-85"] .dt-bag-num').exists()).toBe(false);
  });

  it('单价写在信息行，卖按钮写能拿到的银币', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        {
          goodsId: 18,
          type: 0,
          num: 30,
          expiresAt: null,
          usable: false,
          batch: false,
          maxUse: 0,
          sellPrice: 2800,
        },
      ],
    });
    const w = mountView();
    await flushPromises();
    const sheet = await openItem(w, 18);
    expect(sheet.get('.dt-detail-sub').text()).toBe('单价 2,800');
    const sell = () => w.get('[data-testid="store-sell"]');
    expect(sell().text()).toBe('卖 · 2,800');
    await w.get('[data-testid="store-qty"]').setValue('2');
    expect(sell().text()).toBe('卖 · 5,600');
  });

  it('信息行只在有多段时才用分隔点（终审：开头多一个点）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        {
          goodsId: 85,
          type: 0,
          num: 9,
          expiresAt: null,
          usable: true,
          batch: true,
          maxUse: 5,
          sellPrice: null,
        },
      ],
    });
    const w = mountView();
    await flushPromises();
    const sheet = await openItem(w, 85);
    expect(sheet.get('.dt-detail-sub').text()).toBe('一次最多 5');
  });

  it('卖出先确认，写明数量和能拿到的银币；取消就不卖（问题记录 128）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        {
          goodsId: 18,
          type: 0,
          num: 30,
          expiresAt: null,
          usable: false,
          batch: false,
          maxUse: 0,
          sellPrice: 2800,
        },
      ],
    });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountView();
    await flushPromises();
    await openItem(w, 18);
    // 填小数时按整数卖（终审）
    await w.get('[data-testid="store-qty"]').setValue('3.5');
    const sell = () => w.get('[data-testid="store-sell"]');
    await sell().trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('卖出 3 个');
    expect(ask.mock.calls[0]![0]).toContain('8,400 银币');
    expect(endpoints.sell).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    await sell().trigger('click');
    await flushPromises();
    expect(endpoints.sell).toHaveBeenCalledWith(18, 3);
  });

  it('丢弃先确认；取消就不丢（问题记录 128）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        {
          goodsId: SHARED_GOODS.starPromoHonor,
          type: 0,
          num: 1,
          expiresAt: null,
          usable: false,
          batch: false,
          maxUse: 0,
          sellPrice: null,
        },
      ],
    });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountView();
    await flushPromises();
    await openItem(w, SHARED_GOODS.starPromoHonor);
    const discard = w.get('[data-testid="store-discard"]');
    expect(discard.classes()).toContain('btn-outline-danger');
    await discard.trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(endpoints.discard).not.toHaveBeenCalled();
  });
});

describe('StoreView 纪念品（148-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('纪念品单独一个标签页，仓库页不显示纪念品', async () => {
    const goods = (id: number, name: string, type: number, desc = '') =>
      ({ id, name, type, deviceType: null, level: 1, desc, coin: 0, diamond: 0 }) as never;
    useCatalogStore().goodsMap = new Map([
      [315, goods(315, '喇叭', 1)],
      [90009, goods(90009, '小红旗徽章', 10, '别在围裙上的小红旗。（国庆纪念品）')],
    ]);
    const row = (goodsId: number, type: number) => ({
      ...data.items[0]!,
      goodsId,
      type,
      usable: false,
      batch: false,
    });
    vi.mocked(endpoints.store).mockResolvedValue({ ...data, items: [row(315, 1), row(90009, 10)] });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain('喇叭');
    expect(w.text()).not.toContain('小红旗徽章');
    await w.find('[data-testid="tab-souvenirs"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="souvenir-90009"]').text()).toContain('小红旗徽章');
    expect(w.find('[data-testid="souvenir-90009"]').text()).toContain('国庆纪念品');
    expect(w.text()).not.toContain('喇叭');
  });
});

describe('StoreView 新道具（问题记录 276：页面开着时服务器加了新道具）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('前端道具目录里还没有的手办：按接口给的类型进纪念品页，并自动重新读目录显示名字', async () => {
    const goods = (id: number, name: string, type: number) =>
      ({ id, name, type, deviceType: null, level: 1, desc: '', coin: 0, diamond: 0 }) as never;
    const catalog = useCatalogStore();
    catalog.loaded = true;
    catalog.goodsMap = new Map([[315, goods(315, '喇叭', 1)]]);
    vi.mocked(endpoints.catalog).mockResolvedValue({
      version: 'new',
      goods: [goods(315, '喇叭', 1), goods(91101, '南瓜大厨手办', 10)],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    const row = (goodsId: number, type: number) => ({
      ...data.items[0]!,
      goodsId,
      type,
      usable: false,
      batch: false,
    });
    vi.mocked(endpoints.store).mockResolvedValue({ ...data, items: [row(315, 1), row(91101, 10)] });
    const w = mountView();
    await flushPromises();
    expect(w.text()).not.toContain('91101');
    expect(w.text()).not.toContain('南瓜大厨手办');
    await w.find('[data-testid="tab-souvenirs"]').trigger('click');
    await flushPromises();
    expect(endpoints.catalog).toHaveBeenCalled();
    expect(w.find('[data-testid="souvenir-91101"]').text()).toContain('南瓜大厨手办');
  });

  it('有期限的道具，剩余时间显示到分钟（backlog 6B-2：以前只到小时）', async () => {
    const soon = new Date(Date.now() + 90 * 60_000 + 30_000).toISOString();
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [{ ...data.items[0]!, expiresAt: soon }],
    });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain('剩余 1 小时 31 分');
  });
});

describe('仓库记录的时间（backlog：选“昨天”“更早”时看不出是哪天）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.store).mockResolvedValue(structuredClone(data));
    vi.mocked(endpoints.storeRecords).mockResolvedValue([
      { kind: 'coin', itemId: null, delta: 100, source: 'shop.sell', at: new Date().toISOString() },
      { kind: 'coin', itemId: null, delta: 100, source: 'shop.sell', at: '2026-10-06T04:05:06Z' },
    ]);
  });

  it('今天的记录只写时间；不是今天的带日期（北京时间），不管选的是哪个时间段（终审 M2：选“12 小时”也会跨午夜）', async () => {
    const w = mountView();
    await flushPromises();
    await w
      .findAll('button.nav-link')
      .find((a) => a.text() === '道具流水')!
      .trigger('click');
    await flushPromises();
    const time = (i: number) => w.get(`[data-testid="record-time-${i}"]`).text();
    expect(time(0)).toMatch(/^\d\d:\d\d:\d\d$/);
    expect(time(1)).toContain('10/06');
    expect(time(1)).toContain('12:05');
  });

  it('直接打开 ?tab=records、?tab=souvenirs：照样读流水、纪念品，不写“没有”（终审 I2）', async () => {
    vi.mocked(endpoints.storeRecords).mockResolvedValue([] as never);
    const open = async (path: string) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/:p(.*)*', component: StoreView }],
      });
      await router.push(path);
      mountView({ plugins: [router] });
      await flushPromises();
    };
    await open('/store?tab=records');
    expect(endpoints.storeRecords).toHaveBeenCalled();
    vi.mocked(endpoints.store).mockClear();
    await open('/store?tab=souvenirs');
    expect(vi.mocked(endpoints.store).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('仓库套用新控件（界面改版 P4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.store).mockResolvedValue(structuredClone(data));
  });

  it('道具是背包格子，一格一种；数量是面板里的步进器（界面改版 P7）', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="store-item-85"]').element.closest('.dt-bag')).not.toBeNull();
    expect(w.find('[data-testid="store-qty"]').exists()).toBe(false);
    const sheet = await openItem(w, 85);
    const input = sheet.get('[data-testid="store-qty"]');
    expect(input.element.closest('.dt-stepper')).not.toBeNull();
    // 再点同一格收起
    await w.get('[data-testid="store-item-85"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="store-sheet"]').exists()).toBe(false);
  });

  it('“全部”把数量填成一次最多能用的数', async () => {
    const w = mountView();
    await flushPromises();
    await openItem(w, 85);
    await w.get('[data-testid="store-qty-all"]').trigger('click');
    expect((w.get('[data-testid="store-qty"]').element as HTMLInputElement).value).toBe('99');
    expect(w.get('[data-testid="store-use"]').text()).toBe('使用 99 个');
  });

  it('按类型筛选是一排胶囊，点了按那个类型读取', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="store-type-all"]').attributes('aria-pressed')).toBe('true');
    await w.get('[data-testid="store-type-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.store).toHaveBeenLastCalledWith(1);
    expect(w.get('[data-testid="store-type-1"]').classes()).toContain('active');
    expect(w.get('[data-testid="store-type-all"]').attributes('aria-pressed')).toBe('false');
  });

  it('没读回来时是骨架行', async () => {
    vi.mocked(endpoints.store).mockReturnValue(new Promise(() => undefined));
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="store-skeleton"]').exists()).toBe(true);
  });

  it('读取失败时写读取失败，不一直显示骨架行（终审 I4）', async () => {
    vi.mocked(endpoints.store).mockRejectedValue(new Error('x'));
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="store-skeleton"]').exists()).toBe(false);
    expect(w.get('[data-testid="store-failed"]').text()).toContain('读取仓库失败');
  });

  it('卖出走确认面板', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        {
          goodsId: 18,
          type: 0,
          num: 30,
          expiresAt: null,
          usable: false,
          batch: false,
          maxUse: 0,
          sellPrice: 2800,
        },
      ],
    });
    const spy = vi.spyOn(window, 'confirm');
    const store = useConfirmStore();
    store.hosts = 1;
    const w = mountView();
    await flushPromises();
    await openItem(w, 18);
    await w.get('[data-testid="store-sell"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(store.current?.title).toContain('2,800');
    store.answer(false);
    await flushPromises();
    expect(endpoints.sell).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('流水每条一行（只读行）；没有流水、没有纪念品时是空状态', async () => {
    vi.mocked(endpoints.storeRecords).mockResolvedValue([
      { kind: 'coin', itemId: null, delta: 100, source: 'shop.sell', at: new Date().toISOString() },
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: StoreView }],
    });
    await router.push('/store?tab=records');
    const w = mountView({ plugins: [router] });
    await flushPromises();
    expect(w.get('[data-testid="record-time-0"]').element.closest('.dt-feed')).not.toBeNull();
    vi.mocked(endpoints.storeRecords).mockResolvedValue([] as never);
    const router2 = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: StoreView }],
    });
    await router2.push('/store?tab=records');
    const empty = mountView({ plugins: [router2] });
    await flushPromises();
    expect(empty.get('[data-testid="records-empty"]').classes()).toContain('dt-empty-state');
    const router3 = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: StoreView }],
    });
    await router3.push('/store?tab=souvenirs');
    const none = mountView({ plugins: [router3] });
    await flushPromises();
    expect(none.get('[data-testid="souvenirs-empty"]').classes()).toContain('dt-empty-state');
  });
});
