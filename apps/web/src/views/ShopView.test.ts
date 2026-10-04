import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogGoodsDto, ShopDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import ShopView from './ShopView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    shop: vi.fn(),
    shopSpecial: vi.fn(),
    shopBuy: vi.fn(),
    shopBuyBlack: vi.fn(),
    shopBuySpecial: vi.fn(),
  },
}));

const dto: ShopDto = {
  coin: [
    { goodsId: 13, price: 1000, owned: 0, limit: null, maxBuy: 3, blocked: null },
    { goodsId: 86, price: 55000, owned: 0, limit: null, maxBuy: 0, blocked: 'money' },
    { goodsId: 52, price: 60000, owned: 9999, limit: null, maxBuy: 0, blocked: 'max' },
  ],
  black: [],
};

describe('ShopView（问题记录：商店不显示最大可购买数量）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.shop).mockResolvedValue(structuredClone(dto));
    vi.mocked(endpoints.shopSpecial).mockResolvedValue(null);
    vi.mocked(endpoints.shopBuy).mockResolvedValue({} as never);
  });

  it('显示最多能买几个；填的数超过上限时按上限买', async () => {
    const w = mount(ShopView);
    await flushPromises();
    expect(w.find('[data-testid="cap-13"]').text()).toBe('最多 3');
    await w.find('[data-testid="qty-13"]').setValue('9');
    await w.find('[data-testid="buy-13"]').trigger('click');
    await flushPromises();
    expect(endpoints.shopBuy).toHaveBeenCalledWith(13, 3);
  });

  it('买不了时按钮禁用并写明原因', async () => {
    const w = mount(ShopView);
    await flushPromises();
    expect(w.find('[data-testid="buy-86"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-86"]').text()).toBe('银币不够');
    expect(w.find('[data-testid="cap-52"]').text()).toBe('已达持有上限');
  });
  it('星级不够时写“x 星可用”，按钮禁用（问题记录 146）', async () => {
    vi.mocked(endpoints.shop).mockResolvedValue({
      coin: [
        { goodsId: 93201, price: 30000, owned: 0, limit: null, maxBuy: 0, blocked: 'star', needStar: 4 },
      ],
      black: [],
    });
    const w = mount(ShopView);
    await flushPromises();
    expect(w.get('[data-testid="cap-93201"]').text()).toBe('4 星可用');
    expect(w.get('[data-testid="buy-93201"]').attributes('disabled')).toBeDefined();
  });
  it('每行结构一样：限买 1 个的在数量框的位置写"限 1 个"；名字、价格、描述各一行，点名字展开描述（问题记录：行高不同、有的没数字框）', async () => {
    vi.mocked(endpoints.shop).mockResolvedValue({
      coin: [
        { goodsId: 99, price: 5, owned: 0, limit: 1, maxBuy: 1, blocked: null },
        ...structuredClone(dto.coin),
      ],
      black: [],
    });
    useCatalogStore().goodsMap = new Map([
      [99, { id: 99, name: '长描述道具', desc: '很长的描述'.repeat(20) } as CatalogGoodsDto],
    ]);
    const w = mount(ShopView);
    await flushPromises();
    expect(w.findAll('.dt-item')).toHaveLength(4);
    expect(w.find('[data-testid="qty-99"]').exists()).toBe(false);
    expect(w.find('[data-testid="qty-hint-99"]').text()).toBe('限 1 个');
    const desc = w.find('[data-testid="desc-99"]');
    expect(desc.classes()).toContain('dt-clamp1');
    expect(w.find('[data-testid="info-99"]').classes()).toContain('dt-clamp1');
    await w.find('[data-testid="name-99"]').trigger('click');
    expect(w.find('[data-testid="desc-99"]').classes()).not.toContain('dt-clamp1');
  });

  it('价格那一行把"最多几个"放最前面，截断时不会丢（审查）', async () => {
    const w = mount(ShopView);
    await flushPromises();
    expect(w.find('[data-testid="info-13"]').text()).toMatch(/^最多 3/);
  });

  it('名称可以用键盘展开描述（PR27 遗留）', async () => {
    vi.mocked(endpoints.shop).mockResolvedValue({
      coin: [{ goodsId: 99, price: 5, owned: 0, limit: 1, maxBuy: 1, blocked: null }],
      black: [],
    });
    useCatalogStore().goodsMap = new Map([
      [99, { id: 99, name: '长描述道具', desc: '很长的描述'.repeat(20) } as CatalogGoodsDto],
    ]);
    const w = mount(ShopView);
    await flushPromises();
    const name = w.find('[data-testid="name-99"]');
    expect(name.attributes('tabindex')).toBe('0');
    await name.trigger('keydown', { key: 'Enter' });
    expect(w.find('[data-testid="desc-99"]').classes()).not.toContain('dt-clamp1');
  });

  it('特价：名字和折扣标签在同一行垂直居中（问题记录 118）', async () => {
    vi.mocked(endpoints.shopSpecial).mockResolvedValue({
      day: '2026-10-01',
      goodsId: 13,
      tierName: '五折',
      discount: 0.5,
      price: 100,
      stock: 5,
      sold: 0,
    });
    const w = mount(ShopView);
    await flushPromises();
    await w
      .findAll('a.nav-link')
      .find((a) => a.text().includes('特价'))!
      .trigger('click');
    const row = w.find('[data-testid="special-title"]');
    expect(row.classes()).toEqual(expect.arrayContaining(['d-flex', 'align-items-center']));
    expect(row.text()).toContain('五折');
  });
});
