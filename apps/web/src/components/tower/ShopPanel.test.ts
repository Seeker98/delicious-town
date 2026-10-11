import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenownShopDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import ShopPanel from './ShopPanel.vue';
import { shopData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { renownBuy: vi.fn() } }));

/** 数据由 TowerView 读好传进来（界面改版 P9）；兑换面板用 Teleport，测试里桩掉 */
const mountPanel = (data: RenownShopDto = shopData()) =>
  mount(ShopPanel, { props: { data }, global: { stubs: { teleport: true } } });

describe('ShopPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.renownBuy).mockResolvedValue({ renown: 80 });
  });

  it('数量不超过 本周剩余 和 声望÷单价；兑换后刷新', async () => {
    const w = mountPanel();
    expect(w.find('[data-testid="shop-renown"]').text()).toContain('200');
    expect(w.get('[data-testid="item-310"]').text()).toContain('本周 8/10');
    // 点价格按钮弹出兑换面板
    expect(w.find('[data-testid="num"]').exists()).toBe(false);
    await w.get('[data-testid="buy-310"]').trigger('click');
    // 本周还剩 2 个、声望够换 3 个：最多 2 个
    expect(w.get('[data-testid="qty-max"]').text()).toBe('最多 2');
    await w.get('[data-testid="num"]').setValue('5');
    expect((w.get('[data-testid="num"]').element as HTMLInputElement).value).toBe('2');
    const sum = w.get('[data-testid="qty-sum"]').text();
    expect(sum).toContain('共120 声望');
    expect(sum).toContain('换完剩80 声望');
    expect(w.get('[data-testid="qty-ok"]').text()).toBe('兑换 2 个');
    await w.get('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.renownBuy).toHaveBeenCalledWith(310, 2);
    expect(w.emitted('reload')).toHaveLength(1);
    // 换完面板收起
    expect(w.find('[data-testid="qty-ok"]').exists()).toBe(false);
  });

  it('雕像：已拥有、声望不够时灰掉并写明原因；没有数量输入', async () => {
    const w = mountPanel();
    // 已拥有：右边写“已拥有”，没有兑换按钮
    expect(w.find('[data-testid="buy-397"]').exists()).toBe(false);
    expect(w.get('[data-testid="owned-397"]').text()).toBe('已拥有');
    expect(w.find('[data-testid="block-397"]').exists()).toBe(false);
    // 声望不够：副行写原因，价格按钮灰掉
    expect(w.get('[data-testid="block-460"]').text()).toContain('声望不够');
    expect(w.get('[data-testid="buy-460"]').classes()).toContain('is-off');
    // 点开也写原因、确认灰掉；雕像只能换 1 个，没有数量输入
    await w.get('[data-testid="buy-460"]').trigger('click');
    expect(w.get('[data-testid="qty-reason"]').text()).toBe('声望不够');
    expect(w.get('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="num"]').exists()).toBe(false);
    expect(w.find('[data-testid="qty-max"]').exists()).toBe(false);
    await w.get('[data-testid="qty-ok"]').trigger('click');
    expect(endpoints.renownBuy).not.toHaveBeenCalled();
  });

  it('雕像的“限拥有 1 个”写在副行里，不用挂在名字后面的标签（问题记录 489；界面改版 P9）', () => {
    const w = mountPanel();
    const row = w.get('[data-testid="item-397"]');
    expect(row.get('.dt-row-title').text()).not.toContain('限拥有');
    expect(row.find('.dt-row-title .dt-tag').exists()).toBe(false);
    expect(row.find('.badge').exists()).toBe(false);
    expect(row.get('.dt-row-sub').text()).toContain('限拥有 1 个');
    expect(w.get('[data-testid="item-310"] .dt-row-sub').text()).not.toContain('限拥有');
  });
});
