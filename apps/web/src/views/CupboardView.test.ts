import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useLocaleStore } from '../stores/locale';
import CupboardView from './CupboardView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    cupboard: vi.fn(),
    fridge: vi.fn(),
    readFridge: vi.fn(),
    handleFoods: vi.fn(),
    lockFood: vi.fn(),
    unlockFood: vi.fn(),
    thaw: vi.fn(),
    exchangeMaster: vi.fn(),
  },
}));

describe('CupboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
      items: [{ foodsId: 302, num: 4, locked: false, streetNeed: 3 }],
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

  it('选择食材后可以分解', async () => {
    const w = mount(CupboardView);
    await flushPromises();
    await w.find('[data-testid="pick-302"]').trigger('click');
    await w.find('[data-testid="decompose"]').trigger('click');
    await flushPromises();
    expect(endpoints.handleFoods).toHaveBeenCalledWith({ foodsId: 302, way: 'decompose', num: 1 });
  });

  it('显示最多能分解、合成几个；数量超过时按上限处理（合成取偶数）（问题记录：合成不显示最大数）', async () => {
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      ...(await endpoints.cupboard()),
      items: [{ foodsId: 302, num: 7, locked: false, streetNeed: 0 }],
    });
    const w = mount(CupboardView);
    await flushPromises();
    await w.find('[data-testid="pick-302"]').trigger('click');
    expect(w.text()).toContain('最多分解 7，合成 6');
    await w.find('input[type="number"]').setValue('7');
    expect(w.find('[data-testid="compose"]').text()).toBe('合成 ×6');
    await w.find('[data-testid="compose"]').trigger('click');
    await flushPromises();
    expect(endpoints.handleFoods).toHaveBeenLastCalledWith({ foodsId: 302, way: 'compose', num: 6 });
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
      items: [
        { foodsId: 302, num: 4, locked: false, streetNeed: 0 },
        { foodsId: 101, num: 9, locked: false, streetNeed: 0 },
      ],
    });
    localStorage.clear();
    const w = mount(CupboardView);
    await flushPromises();
    expect(w.find('[data-testid="level-all"]').text()).toContain('全部 (2)');
    expect(w.find('[data-testid="level-1"]').text()).toContain('1 级 (1)');
    await w.find('[data-testid="level-2"]').trigger('click');
    expect(w.find('[data-testid="pick-302"]').exists()).toBe(true);
    expect(w.find('[data-testid="pick-101"]').exists()).toBe(false);
    const w2 = mount(CupboardView);
    await flushPromises();
    expect(w2.find('[data-testid="pick-101"]').exists()).toBe(false);
    await w2.find('[data-testid="level-all"]').trigger('click');
    expect(w2.find('[data-testid="pick-101"]').exists()).toBe(true);
  });
  it('方块统一两行：没有"本街还需"的第二行也占位（问题记录：方块高度不一）', async () => {
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
      items: [
        { foodsId: 302, num: 4, locked: false, streetNeed: 3 },
        { foodsId: 101, num: 9, locked: false, streetNeed: 0 },
      ],
    });
    const w = mount(CupboardView);
    await flushPromises();
    for (const id of [302, 101]) {
      const tile = w.find(`[data-testid="pick-${id}"]`);
      expect(tile.classes()).toContain('dt-tile');
      expect(tile.find('.dt-tile-sub').exists()).toBe(true);
    }
    expect(w.find('[data-testid="pick-302"] .dt-tile-sub').text()).toBe('本街还需 3');
    expect(w.find('[data-testid="pick-101"] .dt-tile-sub').text()).toBe('');
    // 名字太长时只截名字，数量总是显示
    expect(w.find('[data-testid="pick-101"] .dt-tile-num').text()).toBe('×9');
  });

  it('食材名不截断：不再用 text-truncate（问题记录 138）', async () => {
    const w = mount(CupboardView);
    await flushPromises();
    expect(w.find('[data-testid="pick-302"] .text-truncate').exists()).toBe(false);
    expect(w.find('[data-testid="pick-302"] .dt-tile-name').text()).toBe('葡萄');
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
      items: [
        { foodsId: 467, num: 4, locked: false, streetNeed: 0 },
        { foodsId: 469, num: 4, locked: false, streetNeed: 0 },
      ],
    });
    const w = mount(CupboardView);
    await flushPromises();
    await w.find('[data-testid="pick-467"]').trigger('click');
    expect(w.find('[data-testid="master-rule"]').text()).toContain('2 个一级万能食材换 1 个随机二级稀有食材');
    await w.find('[data-testid="pick-469"]').trigger('click');
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
      items: [{ foodsId: 468, num: 300, locked: false, streetNeed: 0 }],
    });
    vi.mocked(endpoints.exchangeMaster).mockResolvedValue({ gained: [] });
    const w = mount(CupboardView);
    await flushPromises();
    await w.find('[data-testid="pick-468"]').trigger('click');
    await w.find('input[type="number"]').setValue(100);
    const btn = w.find('[data-testid="exchange"]');
    expect(btn.text()).toContain('×100');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.exchangeMaster).toHaveBeenCalledWith(468, 50);
    await w.find('input[type="number"]').setValue(7);
    expect(w.find('[data-testid="exchange"]').text()).toContain('×6');
  });

  it('冰箱：解冻按钮写明个数和银币，确认后才解冻；放不下时按钮灰掉（问题记录 206）', async () => {
    vi.mocked(endpoints.fridge).mockResolvedValue({
      items: [
        { foodsId: 302, num: 5, thawable: 3, thawCoin: 750 },
        { foodsId: 303, num: 2, thawable: 0, thawCoin: 0 },
      ],
    });
    vi.mocked(endpoints.thaw).mockResolvedValue({ foodsId: 302, moved: 3, coin: 750 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const w = mount(CupboardView);
    await flushPromises();
    await w.find('[data-testid="tab-fridge"]').trigger('click');
    await flushPromises();
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
  it('切到英语后橱柜页是英文（问题记录 272）', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    // 加载语言包期间别的计时器可能把活动 Pinia 换成旧的（见 LangSelect.test），挂载前换回来
    setActivePinia(pinia);
    try {
      const w = mount(CupboardView);
      await flushPromises();
      expect(w.text()).toContain('Slots 1/100 · Locked 0/15 · Max 999 each');
      expect(w.find('[data-testid="level-all"]').text()).toBe('All (1)');
      expect(w.find('[data-testid="level-2"]').text()).toBe('Level 2 (1)');
      expect(w.text()).toContain('Street needs 3');
      await w.find('[data-testid="pick-302"]').trigger('click');
      expect(w.find('[data-testid="decompose"]').text()).toBe('Break down ×1');
      expect(w.text()).not.toMatch(/格子|分解|本街/);
    } finally {
      await useLocaleStore().set('zh-CN');
    }
  });
});
