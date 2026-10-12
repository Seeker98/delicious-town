import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { WeatherToolsDto, WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import WeatherView from './WeatherView.vue';
import { usePageTitleStore } from '../stores/pageTitle';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    weather: vi.fn(),
    weatherTools: vi.fn(),
    weatherCompass: vi.fn(),
    weatherLots: vi.fn(),
    weatherLotsPick: vi.fn(),
  },
}));

const NOW = '2026-10-03T06:00:00.000Z'; // 北京时间 14:00
const world: WorldDto = {
  weather: {
    id: 1,
    name: '晴',
    type: 1,
    effects: {},
    note: '经营: 上座率+3%',
    until: '2026-10-03T09:00:00.000Z',
  },
  cover: null,
  forecast: {
    at: '2026-10-03T09:00:00.000Z',
    types: { '1': 0.45, '2': 0.35, '3': 0, '4': 0.2 },
    hours: [1, 5, 9, 13, 17, 21],
    current: 13,
  },
  krabStreet: 2,
  krabStreetName: '广东街',
  holidayMultiplier: 1,
  planktonRestId: null,
};
const tools = (patch: Partial<WeatherToolsDto> = {}): WeatherToolsDto => ({
  now: NOW,
  compass: 1,
  lots: 0,
  compassGoodsId: 10419,
  lotsGoodsId: 10420,
  readyAt: null,
  lockedUntil: null,
  pendingLots: null,
  compassOptions: [
    {
      type: 1,
      weathers: [
        { id: 3, p: 0.6 },
        { id: 2, p: 0.4 },
      ],
    },
    { type: 2, weathers: [{ id: 10, p: 1 }] },
    { type: 3, weathers: [] },
    { type: 4, weathers: [{ id: 8, p: 1 }] },
  ],
  cooldownHours: 4,
  coverMinutes: 60,
  lotsSec: 60,
  ...patch,
});

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: WeatherView }],
  });
  const w = mount(WeatherView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return w;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(NOW));
  vi.mocked(endpoints.weather).mockResolvedValue(world);
  vi.mocked(endpoints.weatherTools).mockResolvedValue(tools());
  try {
    localStorage.clear();
  } catch {
    // 忽略
  }
});
afterEach(() => vi.useRealTimers());

describe('WeatherView：天气名、说明、蟹老板的街按目录显示（问题记录 272）', () => {
  it('目录里有翻译时用目录的名字和说明', async () => {
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      devices: [],
      weather: [{ id: 1, name: 'Sunny', note: 'Business: occupancy +3%' }],
      streets: [
        { id: 2, name: 'Guangdong Street', cookName: 'Cantonese cuisine', desc: '', theme: '', focus: null },
      ],
    });
    const w = await mountView();
    expect(usePageTitleStore().title).toBe('Sunny');
    expect(w.get('[data-testid="weather-note"]').text()).toBe('Businessoccupancy +3%');
    expect(w.text()).toContain('Guangdong Street');
  });

  it('目录还没读到时用服务端给的名字；说明一行一条，“经营: ...”拆成小标题和内容', async () => {
    const w = await mountView();
    expect(usePageTitleStore().title).toBe('晴');
    const li = w.findAll('[data-testid="weather-note"] li');
    expect(li).toHaveLength(1);
    expect(li[0]!.get('.dt-wx-fx-k').text()).toBe('经营');
    expect(li[0]!.text()).toBe('经营上座率+3%');
    expect(w.text()).toContain('广东街');
    expect(w.text()).toContain('0 星餐厅不受天气影响');
  });

  it('没有天气说明时按效果写', async () => {
    vi.mocked(endpoints.weather).mockResolvedValue({
      ...world,
      weather: { ...world.weather, note: '', effects: { atRate: 0.03 } },
    });
    const w = await mountView();
    expect(w.get('[data-testid="weather-note"]').text()).toContain('3%');
  });
});

describe('天气页（天气改版，设计图 Wx-A、Wx-B）', () => {
  it('时段写这一轮几点到几点、几点换天；预报一天六个换天时间，标出现在和下一轮，四类按概率从大到小', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="weather-when"]').text()).toBe('13:00 ~ 17:00 · 17 点换天');
    expect(w.findAll('.dt-wx-slots > span').map((x) => x.text())).toEqual([
      '1:00',
      '5:00',
      '9:00',
      '13:00',
      '17:00',
      '21:00',
    ]);
    expect(w.get('.dt-wx-slots > .is-now').text()).toBe('13:00');
    expect(w.get('.dt-wx-slots > .is-next').text()).toBe('17:00');
    const bars = w.findAll('.dt-wx-bar');
    expect(bars.map((x) => x.get('.dt-wx-bar-name').text())).toEqual(['晴', '雨', '风沙雾', '雪冰']);
    expect(bars.map((x) => x.get('.dt-wx-bar-pct').text())).toEqual(['45%', '35%', '20%', '0%']);
  });

  it('“天气怎么玩”三行，可以收起，收起记住', async () => {
    const w = await mountView();
    expect(w.findAll('[data-testid="weather-how"] li')).toHaveLength(3);
    expect(w.get('[data-testid="weather-how"]').text()).toContain('1、5、9、13、17、21 点');
    await w.get('[data-testid="weather-how-toggle"]').trigger('click');
    expect(w.findAll('[data-testid="weather-how"] li')).toHaveLength(0);
    const again = await mountView();
    expect(again.findAll('[data-testid="weather-how"] li')).toHaveLength(0);
  });

  it('别人用道具盖着：名字后面写道具，时段写到几点回到自然天气，写谁改的、还剩几分钟；道具按钮灰掉、写几分钟后能改', async () => {
    useCatalogStore().apply({
      version: 'v',
      goods: [
        {
          id: 10419,
          name: '司天罗盘',
          type: 1,
          deviceType: 0,
          level: 4,
          desc: '',
          coin: 0,
          diamond: 0,
          stackable: true,
        },
      ],
      foods: [],
      devices: [],
      weather: [
        { id: 3, name: '多云', type: 1 },
        { id: 11, name: '中雨', type: 2 },
      ],
      streets: [],
    });
    vi.mocked(endpoints.weather).mockResolvedValue({
      ...world,
      weather: { ...world.weather, id: 3, name: '多云', until: '2026-10-03T06:42:00.000Z' },
      cover: {
        goodsId: 10419,
        byRestId: 9,
        byName: '阿福小馆',
        until: '2026-10-03T06:42:00.000Z',
        natural: { id: 11, name: '中雨' },
      },
    });
    vi.mocked(endpoints.weatherTools).mockResolvedValue(tools({ lockedUntil: '2026-10-03T06:42:00.000Z' }));
    const w = await mountView();
    expect(w.get('[data-testid="weather-hero"] .dt-tag').text()).toBe('司天罗盘');
    expect(w.get('[data-testid="weather-when"]').text()).toBe('13:42 ~ 14:42 · 之后回到中雨');
    expect(w.get('[data-testid="weather-cover"]').text()).toBe(
      '阿福小馆 用司天罗盘把中雨换成了多云, 还剩 42 分钟。底下的天气照常变化, 17 点会换天。',
    );
    expect(w.get('[data-testid="compass-open"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="tool-foot"]').classes()).toContain('is-warn');
    expect(w.get('[data-testid="tool-foot"]').text()).toBe(
      '别人刚改过天气, 42 分钟后 (14:42 以后) 才能再改。',
    );
  });

  it('我在冷却：写几点用过、几点以后能再用；没有签时写去商店', async () => {
    vi.mocked(endpoints.weatherTools).mockResolvedValue(tools({ readyAt: '2026-10-03T08:00:00.000Z' }));
    const w = await mountView();
    expect(w.get('[data-testid="tool-foot"]').text()).toBe('你 12:00 用过, 16:00 以后才能再用。');
    expect(w.get('[data-testid="tool-lots"]').text()).toContain('去商店');
    expect(w.get('[data-testid="tool-lots"]').find('button').exists()).toBe(false);
  });

  it('司天罗盘：选一类（转不到的类灰掉），每类写能换出的天气和概率；用完提示、重新读', async () => {
    useCatalogStore().apply({
      version: 'v',
      goods: [],
      foods: [],
      devices: [],
      weather: [
        { id: 2, name: '阴', type: 1 },
        { id: 3, name: '多云', type: 1 },
      ],
      streets: [],
    });
    vi.mocked(endpoints.weatherCompass).mockResolvedValue({
      from: 1,
      to: 3,
      until: '2026-10-03T07:00:00.000Z',
    });
    const w = await mountView();
    await w.get('[data-testid="compass-open"]').trigger('click');
    expect(w.get('[data-testid="compass-3"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="compass-3"]').text()).toContain('现在的天气转不到这一类');
    expect(w.get('[data-testid="compass-1"]').text()).toContain('多云 60% · 阴 40%');
    expect(w.get('[data-testid="compass-go"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="compass-1"]').trigger('click');
    await w.get('[data-testid="compass-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.weatherCompass).toHaveBeenCalledWith(1);
    expect(endpoints.weather).toHaveBeenCalledTimes(2);
  });

  it('晴雨签：先说明、点摇签才用掉；摇出两支挑一支；倒计时写还剩几秒', async () => {
    useCatalogStore().apply({
      version: 'v',
      goods: [],
      foods: [],
      devices: [],
      weather: [
        { id: 3, name: '多云', type: 1, note: '经营: 上座率+5%' },
        { id: 10, name: '小雨', type: 2 },
      ],
      streets: [],
    });
    vi.mocked(endpoints.weatherTools).mockResolvedValue(tools({ lots: 1 }));
    vi.mocked(endpoints.weatherLots).mockResolvedValue({
      choices: [3, 10],
      until: '2026-10-03T06:01:00.000Z',
    });
    vi.mocked(endpoints.weatherLotsPick).mockResolvedValue({
      from: 1,
      to: 10,
      until: '2026-10-03T07:00:00.000Z',
    });
    const w = await mountView();
    await w.get('[data-testid="lots-open"]').trigger('click');
    expect(endpoints.weatherLots).not.toHaveBeenCalled();
    await w.get('[data-testid="lots-draw"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="lot-0"]').text()).toContain('多云');
    expect(w.get('[data-testid="lot-0"]').text()).toContain('经营: 上座率+5%');
    expect(w.get('[data-testid="lot-take"]').text()).toBe('就要多云');
    expect(w.get('[data-testid="lots-countdown"]').text()).toBe('60 秒内不选, 自动用签一');
    await w.get('[data-testid="lot-1"]').trigger('click');
    expect(w.get('[data-testid="lot-take"]').text()).toBe('就要小雨');
    await w.get('[data-testid="lot-take"]').trigger('click');
    await flushPromises();
    expect(endpoints.weatherLotsPick).toHaveBeenCalledWith(1);
  });
});
