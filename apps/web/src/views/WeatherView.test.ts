import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import WeatherView from './WeatherView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { weather: vi.fn() } }));

const world: WorldDto = {
  weather: {
    id: 1,
    name: '晴',
    type: 1,
    effects: {},
    note: '经营: 上座率+3%',
    until: '2026-10-03T10:00:00.000Z',
  },
  krabStreet: 2,
  krabStreetName: '广东街',
  holidayMultiplier: 1,
  planktonRestId: null,
};

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: WeatherView }],
  });
  const w = mount(WeatherView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('WeatherView：天气名、说明、蟹老板的街按目录显示（问题记录 272）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.weather).mockResolvedValue(world);
  });

  it('目录里有翻译时用目录的名字和说明', async () => {
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      devices: [],
      weather: [{ id: 1, name: 'Sunny', note: 'Business: occupancy +3%' }],
      streets: [{ id: 2, name: 'Guangdong Street', cookName: 'Cantonese cuisine' }],
    });
    const text = (await mountView()).text();
    expect(text).toContain('Sunny');
    expect(text).toContain('Business: occupancy +3%');
    expect(text).toContain('Guangdong Street');
  });

  it('目录还没读到时用服务端给的名字', async () => {
    const text = (await mountView()).text();
    expect(text).toContain('晴');
    expect(text).toContain('经营: 上座率+3%');
    expect(text).toContain('广东街');
  });
});
