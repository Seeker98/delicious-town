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
    overview: vi.fn(),
  },
}));

/** 购买面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（界面改版 P8） */
const mountView = () => mount(ShopView, { global: { stubs: { teleport: true } } });

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
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="info-13"]').text()).toContain('最多 3');
    // 能买的不挂原因标签
    expect(w.find('[data-testid="cap-13"]').exists()).toBe(false);
    // 界面改版 P8：点价格按钮弹出购买面板，数量在面板里选
    expect(w.find('[data-testid="shop-sheet"]').exists()).toBe(false);
    await w.find('[data-testid="buy-13"]').trigger('click');
    expect(w.find('[data-testid="shop-sheet"]').exists()).toBe(true);
    const qty = w.get('[data-testid="qty-sheet"]');
    expect(qty.attributes('min')).toBe('1');
    expect(qty.attributes('max')).toBe('3');
    await qty.setValue('9');
    expect((qty.element as HTMLInputElement).value).toBe('3');
    expect(w.get('[data-testid="sheet-total"]').text()).toBe('3,000 银币');
    await w.get('[data-testid="sheet-buy"]').trigger('click');
    await flushPromises();
    expect(endpoints.shopBuy).toHaveBeenCalledWith(13, 3);
    // 买完面板关掉
    expect(w.find('[data-testid="shop-sheet"]').exists()).toBe(false);
  });

  it('面板里“最多”一键填满上限', async () => {
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="buy-13"]').trigger('click');
    await w.get('[data-testid="qty-max"]').trigger('click');
    expect((w.get('[data-testid="qty-sheet"]').element as HTMLInputElement).value).toBe('3');
    expect(w.get('[data-testid="sheet-buy"]').text()).toBe('买 3 个');
  });

  it('买不了时价格按钮变灰但能点开看说明，面板里写原因、买的按钮灰掉（P8 终审 I3）', async () => {
    const w = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    const btn = w.get('[data-testid="buy-86"]');
    expect(btn.attributes('disabled')).toBeUndefined();
    expect(btn.classes()).toContain('is-off');
    await btn.trigger('click');
    expect(w.get('[data-testid="sheet-reason"]').text()).toBe('银币不够');
    expect(w.get('[data-testid="sheet-buy"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cap-86"]').text()).toBe('银币不够');
    expect(w.find('[data-testid="cap-52"]').text()).toBe('已达持有上限');
  });
  it('余额不够时面板写还差多少，不写“买完剩 0”（backlog P8）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ coin: 20000, diamond: 0 } as never);
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="buy-86"]').trigger('click');
    const sum = w.get('[data-testid="sheet-sum"]');
    expect(sum.text()).not.toContain('买完剩');
    expect(w.get('[data-testid="sheet-short"]').text()).toBe('还差35,000 银币');
    await w.get('[data-testid="buy-13"]').trigger('click');
    expect(w.get('[data-testid="sheet-sum"]').text()).toContain('买完剩19,000 银币');
  });
  it('星级不够时写“x 星可用”，价格按钮变灰（问题记录 146）', async () => {
    vi.mocked(endpoints.shop).mockResolvedValue({
      coin: [
        { goodsId: 93201, price: 30000, owned: 0, limit: null, maxBuy: 0, blocked: 'star', needStar: 4 },
      ],
      black: [],
    });
    const w = mount(ShopView);
    await flushPromises();
    expect(w.get('[data-testid="cap-93201"]').text()).toBe('4 星可用');
    expect(w.get('[data-testid="buy-93201"]').classes()).toContain('is-off');
  });
  it('每行结构一样：限买 1 个的写"限 1 个"标签；描述在购买面板里写全，限买 1 个的面板没有数量框（问题记录：行高不同、有的没数字框）', async () => {
    vi.mocked(endpoints.shop).mockResolvedValue({
      coin: [
        { goodsId: 99, price: 5, owned: 0, limit: 1, maxBuy: 1, blocked: null },
        ...structuredClone(dto.coin),
      ],
      black: [],
    });
    const longDesc = '很长的描述'.repeat(20);
    useCatalogStore().goodsMap = new Map([
      [99, { id: 99, name: '长描述道具', desc: longDesc } as CatalogGoodsDto],
    ]);
    const w = mountView();
    await flushPromises();
    // 每件一行，每行都有信息行和价格按钮
    for (const id of [99, 13, 86, 52]) {
      expect(w.find(`[data-testid="item-${id}"]`).exists()).toBe(true);
      expect(w.find(`[data-testid="item-${id}"] [data-testid="info-${id}"]`).exists()).toBe(true);
      expect(w.find(`[data-testid="item-${id}"] [data-testid="buy-${id}"]`).exists()).toBe(true);
    }
    expect(w.get('[data-testid="cap-99"]').text()).toBe('限 1 个');
    await w.get('[data-testid="buy-99"]').trigger('click');
    expect(w.get('[data-testid="sheet-desc"]').text()).toBe(longDesc);
    expect(w.find('[data-testid="qty-sheet"]').exists()).toBe(false);
    await w.get('[data-testid="sheet-buy"]').trigger('click');
    await flushPromises();
    expect(endpoints.shopBuy).toHaveBeenCalledWith(99, 1);
  });

  it('信息行写"最多几个"，截断时不会丢（审查）', async () => {
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="info-13"]').text()).toContain('最多 3');
  });

  it('价格按钮是真按钮，键盘能打开面板看描述；读屏念名字和价格（PR27 遗留）', async () => {
    vi.mocked(endpoints.shop).mockResolvedValue({
      coin: [{ goodsId: 99, price: 5, owned: 0, limit: 1, maxBuy: 1, blocked: null }],
      black: [],
    });
    useCatalogStore().goodsMap = new Map([
      [99, { id: 99, name: '长描述道具', desc: '很长的描述'.repeat(20) } as CatalogGoodsDto],
    ]);
    const w = mountView();
    await flushPromises();
    const btn = w.get('[data-testid="buy-99"]');
    expect(btn.element.tagName).toBe('BUTTON');
    expect(btn.attributes('aria-label')).toBe('买长描述道具, 5');
    await btn.trigger('click');
    expect(w.get('[data-testid="sheet-desc"]').text()).toContain('很长的描述');
  });

  it('特价标签按实际折扣写（不低于卖店价时五折档实际是七折，backlog 2026-10-25）', async () => {
    vi.mocked(endpoints.shopSpecial).mockResolvedValue({
      day: '2026-10-01',
      goodsId: 13,
      tierName: '五折',
      discount: 56_001 / 80_000,
      price: 56_001,
      stock: 10,
      sold: 0,
    });
    const w = mountView();
    await flushPromises();
    await w
      .findAll('button.nav-link')
      .find((a) => a.text().includes('限时折扣'))!
      .trigger('click');
    expect(w.get('[data-testid="special-title"] .dt-tag-danger').text()).toBe('七折');
  });

  it('特价：名字和折扣标签在同一行（问题记录 118）；点价格在面板里抢购 1 个', async () => {
    vi.mocked(endpoints.shopSpecial).mockResolvedValue({
      day: '2026-10-01',
      goodsId: 13,
      tierName: '五折',
      discount: 0.5,
      price: 100,
      stock: 5,
      sold: 0,
    });
    vi.mocked(endpoints.shopBuySpecial).mockResolvedValue({} as never);
    const w = mountView();
    await flushPromises();
    await w
      .findAll('button.nav-link')
      .find((a) => a.text().includes('限时折扣'))!
      .trigger('click');
    const title = w.get('[data-testid="special-title"]');
    expect(title.text()).toContain('五折');
    // 折扣标签就在名字那个元素里，和名字同一行
    expect(title.get('.dt-tag-danger').text()).toBe('五折');
    await w.get('[data-testid="special-buy"]').trigger('click');
    expect(w.get('[data-testid="sheet-total"]').text()).toBe('100 银币');
    expect(w.find('[data-testid="qty-sheet"]').exists()).toBe(false);
    await w.get('[data-testid="sheet-buy"]').trigger('click');
    await flushPromises();
    expect(endpoints.shopBuySpecial).toHaveBeenCalledWith(1);
    expect(endpoints.shopBuy).not.toHaveBeenCalled();
  });
});
