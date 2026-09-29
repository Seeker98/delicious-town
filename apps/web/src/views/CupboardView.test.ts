import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
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
});
