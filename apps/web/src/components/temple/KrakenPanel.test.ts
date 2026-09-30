import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import KrakenPanel from './KrakenPanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    krakenFeed: vi.fn(),
    tentacleShop: vi.fn(),
    tentacleRefresh: vi.fn(),
    tentacleExchange: vi.fn(),
    templeMissile: vi.fn(),
  },
}));

const shop = {
  slots: [
    { mcId: 1, bought: false },
    { mcId: 2, bought: true },
  ],
  refreshes: 0,
  refreshCost: 0,
  tentacles: 5,
};

describe('KrakenPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 1, coin: 1, foods: [] },
        { id: 2, name: '秘·凤凰趴窝', level: 4, road: 1, nutritive: 1, coin: 1, foods: [] },
      ],
    } as never);
    vi.mocked(endpoints.tentacleShop).mockResolvedValue(structuredClone(shop));
    vi.mocked(endpoints.tentacleExchange).mockResolvedValue(structuredClone(shop));
    vi.mocked(endpoints.krakenFeed).mockResolvedValue({
      relation: 'same',
      favor: 9,
      seeds: [{ seedId: 1, num: 5 }],
      krabCoin: 0,
      tentacle: false,
      punish: null,
    });
  });

  it('不在投喂时段：按钮灰掉并写明时段', async () => {
    const w = mount(KrakenPanel, {
      props: {
        data: templeData({
          kraken: {
            targetMcId: 1,
            fed: false,
            feedable: false,
            hours: [
              [11, 14],
              [17, 21],
            ],
            current: { mcId: 1, grade: 3, leftNum: 10, price: 40 },
          },
        }),
      },
    });
    await flushPromises();
    expect(w.find('[data-testid="kraken-feed"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('11~14 点');
  });

  it('投喂份数不超过 剩余 − 1；显示结果；触手商店兑换', async () => {
    const w = mount(KrakenPanel, {
      props: {
        data: templeData({
          kraken: {
            targetMcId: 1,
            fed: false,
            feedable: true,
            hours: [[11, 14]],
            current: { mcId: 1, grade: 3, leftNum: 10, price: 40 },
          },
        }),
      },
    });
    await flushPromises();
    await w.find('[data-testid="kraken-num"]').setValue('99');
    await w.find('[data-testid="kraken-feed"]').trigger('click');
    await flushPromises();
    expect(endpoints.krakenFeed).toHaveBeenCalledWith(9);
    expect(w.find('[data-testid="kraken-result"]').text()).toContain('好感度 9');
    expect(w.find('[data-testid="tentacle-1"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="tentacle-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.tentacleExchange).toHaveBeenCalledWith(0);
  });
});
