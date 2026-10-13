import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ShilingDto, WeatherToolsDto, WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import WeatherView from './WeatherView.vue';
import { usePageTitleStore } from '../stores/pageTitle';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    weather: vi.fn(),
    weatherTools: vi.fn(),
    weatherCompass: vi.fn(),
    weatherLots: vi.fn(),
    weatherLotsPick: vi.fn(),
    shiling: vi.fn(),
    shilingWeek: vi.fn(),
    shilingBuy: vi.fn(),
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
  // 时令（PR②）读不到时不显示那一块；要测时令的用例自己给
  vi.mocked(endpoints.shiling).mockRejectedValue(new Error('off'));
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
    expect(w.findAll('[data-testid="weather-how"] li')).toHaveLength(4);
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
    // 设计图 Wx-B：人名和剩余时间加粗（用户反馈）
    expect(w.findAll('[data-testid="weather-cover"] b').map((x) => x.text())).toEqual([
      '阿福小馆',
      '42 分钟',
    ]);
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

const shiling = (patch: Partial<ShilingDto> = {}): ShilingDto => ({
  season: {
    open: true,
    minStar: 1,
    weatherId: 1,
    roads: [1, 2],
    until: '2026-10-03T09:00:00.000Z',
    next: { at: '2026-10-03T09:00:00.000Z', type: 1, p: 0.6 },
  },
  balance: 1240,
  decay: { rate: 0.01, floor: 500 },
  weekGain: 380,
  inSeason: [14],
  shop: [
    { item: 'remnant', price: 80, perLevel: true, goodsId: null, weekly: 6, left: 4 },
    { item: 'rare', price: 1500, perLevel: false, goodsId: null, weekly: 1, left: 1 },
    { item: 'compass', price: 300, perLevel: false, goodsId: 10419, weekly: 2, left: 2 },
    { item: 'lots', price: 120, perLevel: false, goodsId: 10420, weekly: 4, left: 0 },
  ],
  remnantPool: [41, 69, 186],
  rarePool: [231],
  remnants: [{ mcId: 186, num: 1 }],
  table: [
    { ids: [1, 28], roads: [1, 2] },
    { ids: [10], roads: [5, 6] },
    { ids: [6, 7], roads: [7] },
  ],
  myRoads: [1, 3],
  trialPick: 30,
  week: { rank: null, minGain: 200, count: 3 },
  ...patch,
});
const catalogWithMc = () =>
  useCatalogStore().apply({
    version: 'v',
    goods: [
      { id: 10419, name: '司天罗盘' },
      { id: 10420, name: '晴雨签' },
    ],
    foods: [],
    devices: [],
    weather: [
      { id: 1, name: '晴', type: 1 },
      { id: 28, name: '夜间晴', type: 1 },
      { id: 10, name: '小雨', type: 2 },
      { id: 6, name: '虹', type: 1, special: true },
      { id: 7, name: '飓风', type: 4, special: true },
    ],
    streets: [],
    mysterious: [
      { id: 14, name: '秘·肉末烧饼', level: 1, road: 1, nutritive: 0, coin: 0, foods: [], appraisable: true },
      { id: 41, name: '秘·龙井金鱼', level: 1, road: 2, nutritive: 0, coin: 0, foods: [], appraisable: true },
      { id: 69, name: '秘·荷花酥', level: 1, road: 3, nutritive: 0, coin: 0, foods: [], appraisable: true },
      { id: 186, name: '秘·金糕', level: 2, road: 1, nutritive: 0, coin: 0, foods: [], appraisable: true },
      {
        id: 231,
        name: '兽·酸橘汁腌鱼',
        level: 6,
        road: 7,
        nutritive: 0,
        coin: 0,
        foods: [],
        appraisable: false,
      },
    ],
  } as never);

describe('时令（天气改版 PR②，设计图 Sl-A~Sl-D）', () => {
  it('天气卡写当令的道；时令区写余额、本周获得、现在当令（我会的道描边）、会的菜里应时的', async () => {
    catalogWithMc();
    vi.mocked(endpoints.shiling).mockResolvedValue(shiling());
    const w = await mountView();
    expect(w.get('[data-testid="weather-season"]').text()).toBe('当令一道二道');
    expect(w.get('[data-testid="shiling-balance"]').text()).toBe('1,240');
    expect(w.get('[data-testid="shiling-week"]').text()).toBe('380');
    expect(w.get('[data-testid="shiling-decay"]').text()).toBe('每天衰减 1%, 500 以内不扣');
    const now = w.get('[data-testid="shiling-now"]');
    expect(now.text()).toContain('· 到 17:00');
    expect(now.findAll('.dt-road.is-mine').map((x) => x.text())).toEqual(['一道']);
    expect(w.get('[data-testid="shiling-mine"]').text()).toBe('你会的菜里, 现在当令: 秘·肉末烧饼');
  });

  it('时令周榜（PR③，设计图 Jc-A、Jc-B）：一行写名次；点开列排名、门槛线、工作证和抽不到的原因', async () => {
    catalogWithMc();
    useRestaurantStore().rest = { id: 1, name: '美味小馆', disabledFeatures: [] } as never;
    vi.mocked(endpoints.shiling).mockResolvedValue(shiling({ week: { rank: 2, minGain: 200, count: 3 } }));
    vi.mocked(endpoints.shilingWeek).mockResolvedValue({
      week: '2026-09-28',
      until: '2026-10-04T15:00:00.000Z',
      count: 3,
      minGain: 200,
      top: [
        { rank: 1, restId: 5, name: '小猪餐厅', gain: 1120 },
        { rank: 2, restId: 1, name: '美味小馆', gain: 380 },
        { rank: 3, restId: 6, name: '阿花小馆', gain: 260 },
        { rank: 4, restId: 8, name: '老王面馆', gain: 150 },
      ],
      me: { rank: 2, gain: 380 },
      cards: [
        { goodsId: 60406, wageId: 20406, wage: [{ kind: 'coin', id: null, num: 300_000 }], block: null },
        {
          goodsId: 60409,
          wageId: 20409,
          wage: [{ kind: 'coin', id: null, num: 300_000 }],
          block: { kind: 'star', n: 2 },
        },
      ],
    });
    const w = await mountView();
    expect(w.get('[data-testid="shiling-week-rank"]').text()).toBe('你第 2 名');
    expect(w.get('[data-testid="shiling-week-open"]').text()).toContain(
      '本周获得 ≥ 200 的前 3 名抽工作证 · 周日 23 点',
    );
    await w.get('[data-testid="shiling-week-open"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('本周 9/28 ~ 10/4 23:00 · 按本周获得的时令值排');
    expect(w.get('[data-testid="week-row-1"]').classes()).toContain('is-mine');
    expect(w.get('[data-testid="week-row-1"]').text()).toContain('你 · 美味小馆');
    expect(w.findAll('[data-testid="week-cut"]').map((x) => x.text())).toEqual([
      '— 本周获得 200 以下不抽证 —',
    ]);
    expect(w.find('[data-testid="week-me"]').exists()).toBe(false);
    const broker = w.get('[data-testid="week-card-60406"]');
    expect(broker.text()).toContain('交易所卖出手续费 5% → 2.5%');
    expect(broker.text()).toContain('300,000');
    expect(broker.classes()).not.toContain('is-off');
    const mna = w.get('[data-testid="week-card-60409"]');
    expect(mna.classes()).toContain('is-off');
    expect(mna.text()).toContain('要 2 星');
  });

  it('会的应时菜多时只列 3 道，后面写“等 N 道”去特色菜页（用户 2026-10-12）', async () => {
    catalogWithMc();
    vi.mocked(endpoints.shiling).mockResolvedValue(shiling({ inSeason: [14, 41, 186, 69, 231] }));
    const w = await mountView();
    expect(w.get('[data-testid="shiling-mine"]').text()).toBe(
      '你会的菜里, 现在当令: 秘·肉末烧饼、秘·龙井金鱼、秘·金糕 等 2 道',
    );
    expect(w.findAll('[data-testid="shiling-mine"] a')).toHaveLength(4);
    expect(w.get('[data-testid="shiling-mine-more"]').attributes('href')).toBe('/cookbooks?tab=mc');
  });

  it('时令铺：残卷写每级单价和本周还剩；罗盘点价格直接换，换完重新读；换满的灰掉；底下写试炼指定的花费', async () => {
    catalogWithMc();
    vi.mocked(endpoints.shiling).mockResolvedValue(shiling());
    vi.mocked(endpoints.shilingBuy).mockResolvedValue({ item: 'compass', mcId: null, balance: 940 });
    const w = await mountView();
    expect(w.get('[data-testid="shiling-remnant"]').text()).toContain('每张 80 × 等级 · 本周还能换 4 张');
    expect(w.get('[data-testid="shiling-compass"]').text()).toContain('司天罗盘');
    expect(w.get('[data-testid="shiling-buy-lots"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="shiling-shop"]').text()).toContain('试炼指定菜也用时令值 (每次 30)');
    await w.get('[data-testid="shiling-buy-compass"]').trigger('click');
    await flushPromises();
    expect(endpoints.shilingBuy).toHaveBeenCalledWith('compass', undefined);
    expect(endpoints.shiling).toHaveBeenCalledTimes(2);
  });

  it('当令表：按类分组、日夜合一行、现在的那行标出来；特殊天气一组', async () => {
    catalogWithMc();
    vi.mocked(endpoints.shiling).mockResolvedValue(shiling());
    const w = await mountView();
    await w.get('[data-testid="shiling-table-open"]').trigger('click');
    const row = w.get('[data-testid="season-row-1"]');
    expect(row.text()).toContain('晴 / 夜间晴 · 现在');
    expect(row.classes()).toContain('is-now');
    expect(w.get('[data-testid="season-row-6"]').text()).toContain('虹 / 飓风');
    expect(w.get('[data-testid="season-row-6"]').text()).toContain('兽道');
    expect(w.get('[data-testid="season-table"]').text()).toContain('特殊天气');
  });

  it('换残卷：默认只列当令的道，能切全部、按级；写持有几张；点价格换这一道', async () => {
    catalogWithMc();
    vi.mocked(endpoints.shiling).mockResolvedValue(shiling());
    vi.mocked(endpoints.shilingBuy).mockResolvedValue({ item: 'remnant', mcId: 186, balance: 1080 });
    const w = await mountView();
    await w.get('[data-testid="shiling-pick-remnant"]').trigger('click');
    const ids = () => w.findAll('[data-testid^="remnant-buy-"]').map((x) => x.attributes('data-testid'));
    expect(w.get('[data-testid="remnant-filter-season"]').text()).toBe('当令 (一道、二道)');
    expect(ids()).toEqual(['remnant-buy-41', 'remnant-buy-186']);
    await w.get('[data-testid="remnant-filter-all"]').trigger('click');
    expect(ids()).toEqual(['remnant-buy-41', 'remnant-buy-69', 'remnant-buy-186']);
    await w.get('[data-testid="remnant-filter-2"]').trigger('click');
    expect(ids()).toEqual(['remnant-buy-186']);
    expect(w.get('[data-testid="remnant-186"]').text()).toContain('残卷 1 张');
    expect(w.get('[data-testid="remnant-buy-186"]').text()).toBe('160');
    await w.get('[data-testid="remnant-buy-186"]').trigger('click');
    await flushPromises();
    expect(endpoints.shilingBuy).toHaveBeenCalledWith('remnant', 186);
  });

  it('0 星：只写几星开放，没有时令铺', async () => {
    catalogWithMc();
    vi.mocked(endpoints.shiling).mockResolvedValue(
      shiling({ season: { ...shiling().season, open: false }, inSeason: [] }),
    );
    const w = await mountView();
    expect(w.get('[data-testid="shiling-locked"]').text()).toContain('1 星开放');
    expect(w.find('[data-testid="shiling-shop"]').exists()).toBe(false);
  });
});
