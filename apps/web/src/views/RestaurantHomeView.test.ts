import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import RestaurantHomeView from './RestaurantHomeView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { overview: vi.fn() } }));

const dto: RestaurantDto = {
  id: 1,
  shardId: 1,
  name: '开张大吉店',
  level: 1,
  exp: 0,
  expToNext: 500,
  coin: 100000,
  diamond: 0,
  strength: 100,
  strengthMax: 100,
  oil: 1000,
  oilMax: 1000,
  starLevel: 0,
  streetId: 0,
  streetName: '新手街',
  renown: 10,
  attrLeft: 3,
  attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
  luck: 0,
  tableNum: 4,
  cupboardNum: 100,
  storeNum: 20,
  foodsMaxNum: 999,
  foodsLockNum: 15,
  tables: [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 })),
  effects: [
    {
      sourceType: 'street',
      sourceId: 140,
      name: '新手街',
      effects: { atRate: 0.35, luckValue: 36 },
      expiresAt: null,
    },
  ],
  createdAt: '2026-09-29T00:00:00.000Z',
};

describe('RestaurantHomeView', () => {
  it('显示餐厅概况、餐桌和加成', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(dto);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: RestaurantHomeView }],
    });
    const w = mount(RestaurantHomeView, { global: { plugins: [createPinia(), router] } });
    await flushPromises();
    expect(w.find('[data-testid="rest-name"]').text()).toBe('开张大吉店');
    expect(w.find('[data-testid="rest-level"]').text()).toBe('1');
    expect(w.find('[data-testid="rest-coin"]').text()).toBe('100,000');
    expect(w.findAll('[data-testid^="table-"]')).toHaveLength(4);
    expect(w.text()).toContain('上座率+35% 幸运+36');
    expect(w.text()).toContain('永久');
  });
});
