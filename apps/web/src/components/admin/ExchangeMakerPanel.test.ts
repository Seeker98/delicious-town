import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import ExchangeMakerPanel from './ExchangeMakerPanel.vue';

vi.mock('../../api/admin', () => ({ adminApi: { exchangeMaker: vi.fn() } }));

describe('后台系统做市（156-3 设计 §7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 11, name: '松露', level: 6 },
        { id: 12, name: '大米', level: 1 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
  });

  it('按区服读取，显示今天的收支和每种食材', async () => {
    vi.mocked(adminApi.exchangeMaker).mockResolvedValue({
      enabled: true,
      foods: [
        { foodsId: 11, stock: 6, bought: 10, bid: 35000, ask: 65000 },
        { foodsId: 12, stock: 0, bought: 3, bid: null, ask: 2340 },
      ],
      today: { spent: 350000, earned: 260000, fee: 17500, net: -72500 },
    });
    const w = mount(ExchangeMakerPanel);
    await flushPromises();
    expect(adminApi.exchangeMaker).toHaveBeenCalledWith(1);
    expect(w.get('[data-testid="exm-today"]').text()).toContain('净回收 -72,500');
    expect(w.get('[data-testid="exm-row-11"]').text()).toContain('松露');
    expect(w.get('[data-testid="exm-row-11"]').text()).toContain('35,000');
    expect(w.get('[data-testid="exm-row-12"]').text()).toContain('不收');
  });

  it('没有数据时提示', async () => {
    vi.mocked(adminApi.exchangeMaker).mockResolvedValue({
      enabled: true,
      foods: [],
      today: { spent: 0, earned: 0, fee: 0, net: 0 },
    });
    const w = mount(ExchangeMakerPanel);
    await flushPromises();
    expect(w.text()).toContain('系统还没有库存，今天也没有收购');
  });

  it('系统做市关闭时写明已关闭，不显示买卖价（backlog 156-3）', async () => {
    vi.mocked(adminApi.exchangeMaker).mockResolvedValue({
      enabled: false,
      foods: [{ foodsId: 11, stock: 6, bought: 0, bid: 35000, ask: 65000 }],
      today: { spent: 0, earned: 0, fee: 0, net: 0 },
    });
    const w = mount(ExchangeMakerPanel);
    await flushPromises();
    expect(w.get('[data-testid="exm-off"]').text()).toContain('已关闭');
    expect(w.get('[data-testid="exm-row-11"]').text()).not.toContain('35,000');
    expect(w.get('[data-testid="exm-row-11"]').text()).not.toContain('65,000');
  });
});
