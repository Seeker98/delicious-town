import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useLocaleStore } from '../stores/locale';
import { useToastStore } from '../stores/toast';
import CupboardView from './CupboardView.vue';
import { SHARED_FOODS } from '@dt/shared';

/** 一级万能食材；+1、+2 是二级、三级 */
const M1 = SHARED_FOODS.masterLevel1;
/** 冰箱费用（冰箱收费 2026-10-22）：空冰箱、默认费率 */
const FEE = {
  kinds: 0,
  value: 0,
  mult: 1,
  daily: 0,
  debt: 0,
  debtSince: null,
  debtDays: 3,
  entryRate: 0.05,
  dailyRate: 0.005,
  thawRate: 0.1,
  tiers: [
    [21, 1.5],
    [41, 2.25],
  ] as Array<[number, number]>,
};

vi.mock('../api/endpoints', () => ({
  endpoints: {
    cupboard: vi.fn(),
    fridge: vi.fn(),
    readFridge: vi.fn(),
    handleFoods: vi.fn(),
    lockFood: vi.fn(),
    unlockFood: vi.fn(),
    thaw: vi.fn(),
    freeze: vi.fn(),
    exchangeMaster: vi.fn(),
  },
}));

/** 详情面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（界面改版 P6） */
const mountView = (global: Record<string, unknown> = {}) =>
  mount(CupboardView, { global: { ...global, stubs: { teleport: true, ...(global.stubs as object) } } });

describe('CupboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 等级筛选记在本地存储里：别让上一个测试选的等级把这次的行筛掉
    localStorage.clear();
    // 按钮是否可用取决于食材等级，目录里放一个 2 级食材
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [{ id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 }],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      slotsUsed: 1,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      foodsMaxNum: 999,
      targetGrade: 5,
      fridgeCount: 0,
      fridgeUnread: false,
      freeHandleLeft: 20,
      handleMax: 100,
      exchangeMaxTimes: 50,
      fridgeFee: FEE,
      items: [{ foodsId: 302, num: 4, locked: false, streetNeed: 3, fridge: 0, price: 1000 }],
    });
    vi.mocked(endpoints.handleFoods).mockResolvedValue({
      chances: 2,
      success: 2,
      lucky: 0,
      failCoin: 0,
      strengthUsed: 0,
      gained: [],
    });
  });

  it('选中的食材用完了（分解光）：面板关上、不再记着它，之后在冰箱解冻同一种也不会突然弹出来（P6 审查 I2）', async () => {
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="pick-302"]').trigger('click');
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(true);
    const full = await endpoints.cupboard();
    vi.mocked(endpoints.cupboard).mockResolvedValueOnce({
      ...full,
      items: [{ foodsId: 303, num: 1, locked: false, streetNeed: 0, fridge: 0, price: 1000 }],
    });
    await w.get('[data-testid="decompose"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(false);
    // 到冰箱解冻同一种：重新读橱柜时 302 又回来了，面板不能自己弹出来
    vi.mocked(endpoints.fridge).mockResolvedValue({
      fee: FEE,
      items: [{ foodsId: 302, num: 5, thawable: 3, thawCoin: 750, streetNeed: 0 }],
    });
    vi.mocked(endpoints.thaw).mockResolvedValue({ foodsId: 302, moved: 3, coin: 750, debtPaid: 0 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await w.get('[data-testid="tab-fridge"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="thaw-302"]').trigger('click');
    await flushPromises();
    expect(endpoints.thaw).toHaveBeenCalledWith(302);
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(false);
    confirm.mockRestore();
    // 这个文件的 beforeEach 不清调用记录：别让后面的冰箱测试看到这次解冻
    vi.mocked(endpoints.thaw).mockClear();
  });

  it('选择食材后可以分解', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="pick-302"]').trigger('click');
    await w.find('[data-testid="decompose"]').trigger('click');
    await flushPromises();
    expect(endpoints.handleFoods).toHaveBeenCalledWith({ foodsId: 302, way: 'decompose', num: 1 });
  });

  it('免体力次数用完时面板写明这次分解、合成各扣几点体力；还有免体力次数时不写（2026-10-13）', async () => {
    const full = await endpoints.cupboard();
    vi.mocked(endpoints.cupboard).mockResolvedValue({ ...full, freeHandleLeft: 0 });
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="pick-302"]').trigger('click');
    // 2 级葡萄持有 4：分解 1 个扣 1，合成 4 个出 2 个扣 2（步进器默认 1，合成按偶数取）
    await w.get('[data-testid="picked-card"] input').setValue('4');
    expect(w.get('[data-testid="handle-paid"]').text()).toBe(
      '今天的免体力次数用完了: 分解 4 个扣 4 体力, 合成 4 个 (出 2 个) 扣 2 体力',
    );
    vi.mocked(endpoints.handleFoods).mockResolvedValueOnce({
      chances: 8,
      success: 7,
      lucky: 0,
      failCoin: 0,
      strengthUsed: 4,
      gained: [],
    });
    await w.get('[data-testid="decompose"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain('成功 7/8 次, 消耗 4 体力');
    // 处理完面板关掉，提示不被挡住
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(false);
  });

  it('还有免体力次数时不写扣体力', async () => {
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="pick-302"]').trigger('click');
    expect(w.find('[data-testid="handle-paid"]').exists()).toBe(false);
  });

  it('显示最多能分解、合成几个；数量超过时按上限处理（合成取偶数）（问题记录：合成不显示最大数）', async () => {
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...(await endpoints.cupboard()),
      items: [{ foodsId: 302, num: 7, locked: false, streetNeed: 0, fridge: 0, price: 1000 }],
    });
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="pick-302"]').trigger('click');
    expect(w.text()).toContain('最多分解 7, 合成 6');
    await w.find('input[type="number"]').setValue('7');
    expect(w.find('[data-testid="compose"]').text()).toBe('合成 ×6');
    await w.find('[data-testid="compose"]').trigger('click');
    await flushPromises();
    expect(endpoints.handleFoods).toHaveBeenLastCalledWith({ foodsId: 302, way: 'compose', num: 6 });
    // 处理完面板关上了（2026-10-13），再点开
    await w.find('[data-testid="pick-302"]').trigger('click');
    await w.find('input[type="number"]').setValue('99');
    expect(w.find('[data-testid="decompose"]').text()).toBe('分解 ×7');
  });

  it('按等级筛选（问题记录：橱柜食材太多时只看某一级）；记住上次选的等级', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
        { id: 101, name: '大米', level: 1, odds: 100, coin: 100, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      slotsUsed: 2,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      foodsMaxNum: 999,
      targetGrade: 5,
      fridgeCount: 0,
      fridgeUnread: false,
      freeHandleLeft: 20,
      handleMax: 100,
      exchangeMaxTimes: 50,
      fridgeFee: FEE,
      items: [
        { foodsId: 302, num: 4, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
        { foodsId: 101, num: 9, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
      ],
    });
    localStorage.clear();
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="level-all"]').text()).toContain('全部 (2)');
    expect(w.find('[data-testid="level-1"]').text()).toContain('1 级 (1)');
    await w.find('[data-testid="level-2"]').trigger('click');
    expect(w.find('[data-testid="pick-302"]').exists()).toBe(true);
    expect(w.find('[data-testid="pick-101"]').exists()).toBe(false);
    const w2 = mountView();
    await flushPromises();
    expect(w2.find('[data-testid="pick-101"]').exists()).toBe(false);
    await w2.find('[data-testid="level-all"]').trigger('click');
    expect(w2.find('[data-testid="pick-101"]').exists()).toBe(true);
  });
  it('列表一行一种（橱柜改版）：本街还需写在名字下面，不需要的只有一行；右边数量；2 级以上有等级标签，锁定的有小锁', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
        { id: 101, name: '大米', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 401, name: '橄榄油', level: 4, odds: 100, coin: 100, type: 2 },
        { id: M1, name: '一级万能食材', level: 9, odds: 100, coin: 100, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...(await endpoints.cupboard()),
      items: [
        { foodsId: 302, num: 4, locked: false, streetNeed: 3, fridge: 0, price: 1000 },
        { foodsId: 101, num: 1200, locked: true, streetNeed: 0, fridge: 0, price: 1000 },
        { foodsId: 401, num: 2, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
        { foodsId: M1, num: 6, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
      ],
    });
    localStorage.clear();
    const w = mountView();
    await flushPromises();
    expect(w.find('.dt-bag').exists()).toBe(false);
    const row = w.get('[data-testid="pick-302"]');
    expect(row.classes()).toContain('dt-cup-row');
    expect(row.get('.dt-cup-name').text()).toContain('葡萄');
    expect(row.get('.dt-cup-need').text()).toBe('本街还需 3');
    expect(row.get('.dt-cup-qty').text()).toBe('4');
    expect(row.get('.dt-lv').classes()).toContain('is-t2');
    expect(row.find('.bi-lock-fill').exists()).toBe(false);
    const rice = w.get('[data-testid="pick-101"]');
    expect(rice.find('.dt-cup-need').exists()).toBe(false);
    expect(rice.find('.dt-lv').exists()).toBe(false);
    expect(rice.find('.bi-lock-fill').exists()).toBe(true);
    expect(rice.get('.dt-cup-qty').text()).toBe('1,200');
    expect(w.get('[data-testid="pick-401"] .dt-lv').classes()).toContain('is-t3');
    expect(w.get(`[data-testid="pick-${M1}"] .dt-lv`).classes()).toContain('is-master');
    expect(w.get(`[data-testid="pick-${M1}"] .dt-lv`).text()).toBe('万能');
    // 食材名不截断（问题记录 138）
    expect(row.find('.text-truncate').exists()).toBe(false);
  });

  it('搜索框（橱柜改版）：按名字过滤，等级胶囊的数跟着变，匹配的字标出来；✕ 清空；搜不到时写明', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 103, name: '苦瓜', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 108, name: '黄瓜', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 101, name: '大米', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...(await endpoints.cupboard()),
      items: [103, 108, 101, 302].map((foodsId) => ({
        foodsId,
        num: 5,
        locked: false,
        streetNeed: 0,
        fridge: 0,
        price: 1000,
      })),
    });
    localStorage.clear();
    const w = mountView();
    await flushPromises();
    const q = w.get('[data-testid="cupboard-q"]');
    expect(q.attributes('placeholder')).toBe('搜食材名字');
    expect(w.find('[data-testid="cupboard-q-clear"]').exists()).toBe(false);
    await q.setValue('瓜');
    expect(w.findAll('.dt-cup-row').map((r) => r.attributes('data-testid'))).toEqual([
      'pick-103',
      'pick-108',
    ]);
    expect(w.get('[data-testid="level-all"]').text()).toBe('全部 (2)');
    expect(w.get('[data-testid="level-1"]').text()).toBe('1 级 (2)');
    expect(w.find('[data-testid="level-2"]').exists()).toBe(false);
    expect(w.get('[data-testid="pick-103"] mark').text()).toBe('瓜');
    await q.setValue('松露');
    expect(w.findAll('.dt-cup-row')).toHaveLength(0);
    const none = w.get('[data-testid="cupboard-nomatch"]').text();
    expect(none).toContain('没有叫“松露”的食材');
    expect(none).toContain('看看冰箱');
    await w.get('[data-testid="cupboard-q-clear"]').trigger('click');
    expect((q.element as HTMLInputElement).value).toBe('');
    expect(w.findAll('.dt-cup-row')).toHaveLength(4);
    expect(w.find('.dt-cup-row mark').exists()).toBe(false);
  });

  it('搜索时选着的等级里没有结果：那个胶囊还在（数是 0），写这一级没有', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 103, name: '苦瓜', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...(await endpoints.cupboard()),
      items: [103, 302].map((foodsId) => ({
        foodsId,
        num: 5,
        locked: false,
        streetNeed: 0,
        fridge: 0,
        price: 1000,
      })),
    });
    localStorage.clear();
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="level-2"]').trigger('click');
    await w.get('[data-testid="cupboard-q"]').setValue('瓜');
    expect(w.get('[data-testid="level-2"]').text()).toBe('2 级 (0)');
    expect(w.text()).toContain('这一级没有食材');
    expect(w.find('[data-testid="cupboard-nomatch"]').exists()).toBe(false);
  });

  it('冰箱也有搜索框：按名字过滤，搜不到时提示看看常温', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 103, name: '苦瓜', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.fridge).mockResolvedValue({
      fee: FEE,
      items: [103, 302].map((foodsId) => ({ foodsId, num: 5, thawable: 3, thawCoin: 750, streetNeed: 0 })),
    });
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="tab-fridge"]').trigger('click');
    await flushPromises();
    const q = w.get('[data-testid="fridge-q"]');
    await q.setValue('葡');
    expect(w.find('[data-testid="fridge-302"]').exists()).toBe(true);
    expect(w.find('[data-testid="fridge-103"]').exists()).toBe(false);
    await q.setValue('松露');
    expect(w.get('[data-testid="fridge-nomatch"]').text()).toContain('看看常温');
  });

  it('选中万能食材时写明能否兑换稀有食材（问题记录 140）', async () => {
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      slotsUsed: 2,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      foodsMaxNum: 999,
      targetGrade: 5,
      fridgeCount: 0,
      fridgeUnread: false,
      freeHandleLeft: 20,
      handleMax: 100,
      exchangeMaxTimes: 50,
      fridgeFee: FEE,
      items: [
        { foodsId: M1, num: 4, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
        { foodsId: M1 + 2, num: 4, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
      ],
    });
    const w = mountView();
    await flushPromises();
    await w.find(`[data-testid="pick-${M1}"]`).trigger('click');
    expect(w.find('[data-testid="master-rule"]').text()).toContain('2 个一级万能食材换 1 个随机二级稀有食材');
    await w.find(`[data-testid="pick-${M1 + 2}"]`).trigger('click');
    expect(w.find('[data-testid="master-rule"]').text()).toContain('三级及以上的万能食材不能兑换稀有食材');
  });

  it('兑换稀有食材：数量框填的是消耗几个万能食材，和合成一样；按钮写明消耗数（问题记录 202）', async () => {
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      slotsUsed: 1,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      foodsMaxNum: 999,
      targetGrade: 5,
      fridgeCount: 0,
      fridgeUnread: false,
      freeHandleLeft: 20,
      handleMax: 100,
      exchangeMaxTimes: 50,
      fridgeFee: FEE,
      items: [{ foodsId: M1 + 1, num: 300, locked: false, streetNeed: 0, fridge: 0, price: 1000 }],
    });
    vi.mocked(endpoints.exchangeMaster).mockResolvedValue({ gained: [] });
    const w = mountView();
    await flushPromises();
    await w.find(`[data-testid="pick-${M1 + 1}"]`).trigger('click');
    await w.find('input[type="number"]').setValue(100);
    const btn = w.find('[data-testid="exchange"]');
    expect(btn.text()).toContain('×100');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.exchangeMaster).toHaveBeenCalledWith(M1 + 1, 50);
    await w.find('input[type="number"]').setValue(7);
    expect(w.find('[data-testid="exchange"]').text()).toContain('×6');
  });

  it('冰箱：解冻按钮写明个数和银币，确认后才解冻；放不下时按钮灰掉（问题记录 206）', async () => {
    vi.mocked(endpoints.fridge).mockResolvedValue({
      fee: FEE,
      items: [
        { foodsId: 302, num: 5, thawable: 3, thawCoin: 750, streetNeed: 4 },
        { foodsId: 303, num: 2, thawable: 0, thawCoin: 0, streetNeed: 0 },
      ],
    });
    vi.mocked(endpoints.thaw).mockResolvedValue({ foodsId: 302, moved: 3, coin: 750, debtPaid: 0 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="tab-fridge"]').trigger('click');
    await flushPromises();
    // 和橱柜一样写等级和本街还需几个（问题记录 465）
    expect(w.get('[data-testid="fridge-302"]').text()).toContain('2 级');
    expect(w.get('[data-testid="fridge-302"]').text()).toContain('本街还需 4');
    expect(w.get('[data-testid="fridge-303"]').text()).not.toContain('本街还需');
    const btn = w.find('[data-testid="thaw-302"]');
    expect(btn.text()).toContain('×3');
    expect(btn.text()).toContain('750 银币');
    await btn.trigger('click');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(endpoints.thaw).not.toHaveBeenCalled();
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.thaw).toHaveBeenCalledWith(302);
    expect(w.find('[data-testid="thaw-303"]').attributes('disabled')).toBeDefined();
    confirm.mockRestore();
  });
  it('切到英语后橱柜页是英文（问题记录 272）（界面改版 P6）', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    // 加载语言包期间别的计时器可能把活动 Pinia 换成旧的（见 LangSheet.test），挂载前换回来
    setActivePinia(pinia);
    try {
      const w = mountView();
      await flushPromises();
      const meta = w.get('[data-testid="cupboard-meta"]').text();
      expect(meta).toContain('Slots 1/100');
      expect(meta).toContain('Locked 0/15');
      expect(meta).toContain('max 999 per ingredient');
      expect(w.find('[data-testid="level-all"]').text()).toBe('All (1)');
      expect(w.find('[data-testid="level-2"]').text()).toBe('Level 2 (1)');
      expect(w.get('[data-testid="pick-302"] .dt-cup-need').text()).toBe('Street needs 3');
      expect(w.get('[data-testid="cupboard-q"]').attributes('placeholder')).toBe('Search ingredients');
      expect(w.get('[data-testid="pick-302"]').attributes('aria-label')).toContain('Street needs 3');
      await w.find('[data-testid="pick-302"]').trigger('click');
      expect(w.find('[data-testid="decompose"]').text()).toBe('Break down ×1');
      expect(w.text()).not.toMatch(/格子|分解|本街/);
    } finally {
      await useLocaleStore().set('zh-CN');
    }
  });

  it('直接打开 ?tab=fridge（刷新、后退、分享的链接）：冰箱照样读出来（终审 I2）', async () => {
    vi.mocked(endpoints.fridge).mockResolvedValue({
      fee: FEE,
      items: [{ foodsId: 302, num: 5, thawable: 3, thawCoin: 750, streetNeed: 4 }],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: CupboardView }],
    });
    await router.push('/cupboard?tab=fridge');
    const w = mountView({ plugins: [router] });
    await flushPromises();
    expect(endpoints.fridge).toHaveBeenCalled();
    expect(w.find('[data-testid="fridge-302"]').exists()).toBe(true);
  });

  it('一行一种，左边是食材图，正在看的那行 is-picked（点开的是面板，不用 aria-pressed，backlog P3）；数量是步进器（界面改版 P4）（橱柜改版）', async () => {
    const w = mountView();
    await flushPromises();
    const tile = w.get('[data-testid="pick-302"]');
    expect(tile.classes()).toContain('dt-cup-row');
    expect(tile.get('.dt-cup-tray use').attributes('href')).toMatch(/#food-/);
    expect(tile.get('use').attributes('href')).toMatch(/#food-/);
    expect(tile.attributes('aria-pressed')).toBeUndefined();
    expect(tile.attributes('aria-haspopup')).toBe('dialog');
    expect(tile.classes()).not.toContain('is-picked');
    await tile.trigger('click');
    expect(tile.classes()).toContain('is-picked');
    expect(w.get('input[type="number"]').element.closest('.dt-stepper')).not.toBeNull();
  });

  it('点一格从底部弹出详情，再点同一格或按 Esc 关掉（界面改版 P6）', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(false);
    const tile = w.get('[data-testid="pick-302"]');
    await tile.trigger('click');
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(true);
    expect(w.find('.dt-sheet').exists()).toBe(true);
    // 再点同一格：关掉
    await tile.trigger('click');
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(false);
    expect(tile.classes()).not.toContain('is-picked');
    // 按 Esc：关掉
    await tile.trigger('click');
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(w.find('[data-testid="picked-card"]').exists()).toBe(false);
    expect(tile.classes()).not.toContain('is-picked');
    w.unmount();
  });

  it('等级不允许时分解、合成按钮不出现；万能食材才有兑换（界面改版 P6）', async () => {
    useCatalogStore().apply({
      version: 'test',
      goods: [],
      foods: [
        { id: 302, name: '葡萄', level: 2, odds: 100, coin: 1000, type: 2 },
        { id: 101, name: '大米', level: 1, odds: 100, coin: 100, type: 2 },
        { id: 701, name: '龙虾', level: 5, odds: 100, coin: 100, type: 2 },
      ],
      streets: [],
      weather: [],
      devices: [],
    });
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...(await endpoints.cupboard()),
      items: [
        { foodsId: 101, num: 4, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
        { foodsId: 701, num: 4, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
        { foodsId: 302, num: 4, locked: false, streetNeed: 0, fridge: 0, price: 1000 },
      ],
    });
    const w = mountView();
    await flushPromises();
    // 1 级：不能分解，能合成
    await w.get('[data-testid="pick-101"]').trigger('click');
    expect(w.find('[data-testid="decompose"]').exists()).toBe(false);
    expect(w.find('[data-testid="compose"]').exists()).toBe(true);
    expect(w.find('[data-testid="exchange"]').exists()).toBe(false);
    // 5 级：能分解，不能合成
    await w.get('[data-testid="pick-701"]').trigger('click');
    expect(w.find('[data-testid="decompose"]').exists()).toBe(true);
    expect(w.find('[data-testid="compose"]').exists()).toBe(false);
    // 2 级：都能
    await w.get('[data-testid="pick-302"]').trigger('click');
    expect(w.find('[data-testid="decompose"]').exists()).toBe(true);
    expect(w.find('[data-testid="compose"]').exists()).toBe(true);
    expect(w.find('[data-testid="lock"]').exists()).toBe(true);
  });

  it('步进器上限跟着持有：持有 4 个时最多 4，不是固定 100（终审 I2）', async () => {
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="pick-302"]').trigger('click');
    expect(w.get('[data-testid="picked-card"] input[type="number"]').attributes('max')).toBe('4');
  });

  it('读取失败时写读取失败，不一直显示骨架行（终审 I4）', async () => {
    vi.mocked(endpoints.cupboard).mockRejectedValue(new Error('x'));
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="cupboard-skeleton"]').exists()).toBe(false);
    expect(w.get('[data-testid="cupboard-failed"]').text()).toContain('读取橱柜失败');
  });

  it('橱柜空时是空状态，带去菜场的链接；没读回来时是骨架行（界面改版 P4）', async () => {
    vi.mocked(endpoints.cupboard).mockReturnValue(new Promise(() => undefined));
    expect(mountView().find('[data-testid="cupboard-skeleton"]').exists()).toBe(true);
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      slotsUsed: 0,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      foodsMaxNum: 999,
      targetGrade: 5,
      fridgeCount: 0,
      fridgeUnread: false,
      freeHandleLeft: 20,
      handleMax: 100,
      exchangeMaxTimes: 50,
      fridgeFee: FEE,
      items: [],
    });
    const w = mountView({ stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } });
    await flushPromises();
    const empty = w.get('[data-testid="cupboard-empty"]');
    expect(empty.get('use').attributes('href')).toContain('#empty-cupboard');
    expect(empty.get('a').attributes('href')).toBe('/market');
  });

  it('冰箱每行前面是食材图；解冻走确认面板（界面改版 P4）', async () => {
    vi.mocked(endpoints.fridge).mockResolvedValue({
      fee: FEE,
      items: [{ foodsId: 302, num: 5, thawable: 3, thawCoin: 750, streetNeed: 4 }],
    });
    vi.mocked(endpoints.thaw).mockResolvedValue({ foodsId: 302, moved: 3, coin: 750, debtPaid: 0 });
    const spy = vi.spyOn(window, 'confirm');
    const store = useConfirmStore();
    store.hosts = 1;
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="tab-fridge"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="fridge-302"] use').attributes('href')).toMatch(/#food-/);
    await w.get('[data-testid="thaw-302"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(store.current?.title).toContain('750');
    store.answer(true);
    await flushPromises();
    expect(endpoints.thaw).toHaveBeenCalledWith(302);
    spy.mockRestore();
  });

  it('放冰箱（冰箱收费 2026-10-22）：确认框写入库费、放完的格数和每天约多少；跨档时写明整个冰箱乘几倍', async () => {
    const full = await endpoints.cupboard();
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...full,
      fridgeFee: { ...FEE, kinds: 20, value: 200_000, daily: 1000 },
    });
    vi.mocked(endpoints.freeze).mockResolvedValue({ foodsId: 302, moved: 1, coin: 50 });
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="pick-302"]').trigger('click');
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await w.get('[data-testid="freeze"]').trigger('click');
    await flushPromises();
    // 1 个 × 菜场价 1000 × 5% = 50；放完 21 格，(200000 + 1000) × 0.5% × 1.5 = 1508
    const text = spy.mock.calls[0]![0] as string;
    expect(text).toContain('50');
    expect(text).toContain('21 格');
    expect(text).toContain('1,508');
    expect(text).toContain('×1.5');
    expect(endpoints.freeze).toHaveBeenCalledWith(302, 1);
    spy.mockRestore();
  });

  it('冰箱页写费用；还差一两格跨档时提醒；欠费时写后果，放冰箱按钮灰掉', async () => {
    const full = await endpoints.cupboard();
    const owing = { ...FEE, kinds: 19, value: 100_000, daily: 500, debt: 1234, debtSince: '2026-10-20' };
    vi.mocked(endpoints.cupboard).mockResolvedValue({ ...full, fridgeFee: owing });
    vi.mocked(endpoints.fridge).mockResolvedValue({
      fee: owing,
      items: [{ foodsId: 302, num: 5, thawable: 3, thawCoin: 750, streetNeed: 0 }],
    });
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="pick-302"]').trigger('click');
    expect(w.get('[data-testid="freeze"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="tab-fridge"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="fridge-fee"]').text()).toContain('冰箱 19 格');
    expect(w.get('[data-testid="fridge-fee-next"]').text()).toContain('再多 2 格');
    expect(w.get('[data-testid="fridge-debt"]').text()).toContain('1,234');
  });
});
