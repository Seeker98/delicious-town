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
    // 输入超过上限：失焦后框里的数改成上限，按钮不显示数量也看得出实际用几个（终审）
    await w.find('input[type="number"]').trigger('change');
    expect((w.find('input[type="number"]').element as HTMLInputElement).value).toBe('99');
    const use = w.findAll('button').find((b) => b.text().startsWith('使用'))!;
    // 按钮文字不再带数量（数量在输入框里），宽度不会随数量变（PR27 遗留）
    expect(use.text()).toBe('使用');
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
  it('能卖和不能卖的行结构一样：都有统一高度的行和右侧操作区（问题记录：行高不同）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        ...structuredClone(data.items),
        { goodsId: 106, num: 1, expiresAt: null, usable: false, batch: false, maxUse: 0, sellPrice: null },
      ],
    });
    const w = mount(StoreView);
    await flushPromises();
    const rows = w.findAll('.dt-item');
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.find('.dt-item-actions').exists()).toBe(true);
  });

  it('名字太长时只截名字，数量总是显示，剩余时间放第二行（审查）', async () => {
    const w = mount(StoreView);
    await flushPromises();
    const num = w.find('.dt-store-num');
    expect(num.text()).toBe('×150');
    expect(num.element.closest('.text-truncate')).toBeNull();
  });

  it('卖按钮文字固定，单价写在信息行（视觉规范：操作区宽度不随价格变）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        { goodsId: 18, num: 30, expiresAt: null, usable: false, batch: false, maxUse: 0, sellPrice: 2800 },
      ],
    });
    const w = mount(StoreView);
    await flushPromises();
    const sell = w.findAll('button').find((b) => b.text().startsWith('卖'))!;
    expect(sell.text()).toBe('卖');
    expect(w.find('.dt-item .dt-meta').text()).toContain('单价 2,800');
  });

  it('信息行只在有多段时才用分隔点（终审：开头多一个点）', async () => {
    vi.mocked(endpoints.store).mockResolvedValue({
      ...structuredClone(data),
      items: [
        { goodsId: 85, num: 9, expiresAt: null, usable: true, batch: true, maxUse: 5, sellPrice: null },
      ],
    });
    const w = mount(StoreView);
    await flushPromises();
    expect(w.find('.dt-item .dt-meta').text()).toBe('一次最多 5');
  });
});
