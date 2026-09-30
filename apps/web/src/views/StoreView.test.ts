import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import StoreView from './StoreView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { store: vi.fn(), storeRecords: vi.fn(), useGoods: vi.fn(), sell: vi.fn(), discard: vi.fn() },
}));

const data: StoreDto = {
  kinds: 1,
  storeNum: 20,
  equips: 0,
  items: [{ goodsId: 85, num: 150, expiresAt: null, usable: true, batch: true, maxUse: 99, sellPrice: null }],
};

describe('StoreView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.store).mockResolvedValue(structuredClone(data));
    vi.mocked(endpoints.useGoods).mockResolvedValue({} as never);
  });

  it('批量使用显示单次上限；填的数超过上限时按上限使用（问题记录：批量使用不提示上限）', async () => {
    const w = mount(StoreView);
    await flushPromises();
    expect(w.text()).toContain('最多 99');
    await w.find('input[type="number"]').setValue('150');
    const use = w.findAll('button').find((b) => b.text().startsWith('使用'))!;
    expect(use.text()).toBe('使用 ×99');
    await use.trigger('click');
    await flushPromises();
    expect(endpoints.useGoods).toHaveBeenCalledWith(85, 99);
  });

  it('现在用不了（上限为 0）时使用按钮禁用并提示', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        { goodsId: 82, num: 3, expiresAt: null, usable: true, batch: true, maxUse: 0, sellPrice: 3500 },
      ],
    });
    const w = mount(StoreView);
    await flushPromises();
    const use = w.findAll('button').find((b) => b.text().startsWith('使用'))!;
    expect(use.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('已达上限');
  });
});
