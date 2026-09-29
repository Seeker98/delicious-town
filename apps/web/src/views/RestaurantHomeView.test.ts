import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import RestaurantHomeView from './RestaurantHomeView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    overview: vi.fn(),
    tasks: vi.fn(),
    refuel: vi.fn(),
    claimTask: vi.fn(),
    devices: vi.fn(),
    placeDevice: vi.fn(),
  },
}));

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
  oil: 400,
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
  oilLevel: 0,
  state: 1,
  stateReason: null,
  promoOn: false,
  cteOn: false,
  cookfoodsFlag: 0,
  plaque2Open: false,
  mainTaskStep: 1,
  devices: [
    { slot: 1, name: '宣传海报', deviceType: 1, needStar: 0, unlocked: true, goodsId: null, expiresAt: null },
    { slot: 4, name: '捕鼠夹', deviceType: 4, needStar: 2, unlocked: false, goodsId: null, expiresAt: null },
  ],
  lastRound: {
    roundNo: 1,
    coin: 12,
    exp: 3,
    oil: 2,
    customers: { '1': 1, '0': 3 },
    at: '2026-09-30T00:00:00.000Z',
  },
  weather: { id: 1, name: '晴' },
  isPlanktonHost: false,
  door: 0,
  avatar: null,
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

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: RestaurantHomeView }],
  });
  const w = mount(RestaurantHomeView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('RestaurantHomeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.overview).mockResolvedValue(dto);
    vi.mocked(endpoints.tasks).mockResolvedValue({
      mainStep: 1,
      main: {
        id: 1,
        main: true,
        step: 1,
        name: '填一次油',
        href: '/',
        kind: 'counter',
        key: 'oil.fill',
        target: 1,
        progress: 0,
        done: false,
        award: { coin: 2000 },
      },
      side: [],
    });
  });

  it('显示概况、本轮收益、主线任务、设施位和加成', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="rest-name"]').text()).toBe('开张大吉店');
    expect(w.findAll('a').some((a) => a.text() === '切换区服')).toBe(true);
    expect(w.find('[data-testid="rest-level"]').text()).toBe('1');
    expect(w.find('[data-testid="rest-coin"]').text()).toBe('100,000');
    expect(w.find('[data-testid="last-round"]').text()).toContain('12');
    expect(w.text()).toContain('填一次油');
    expect(w.findAll('[data-testid^="slot-"]')).toHaveLength(2);
    expect(w.text()).toContain('上座率+35% 幸运+36');
  });

  it('替换还没到期的设施要先确认（替换后不退还）', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      devices: [
        {
          slot: 1,
          name: '宣传海报',
          deviceType: 1,
          needStar: 0,
          unlocked: true,
          goodsId: 13,
          expiresAt: future,
        },
      ],
    });
    vi.mocked(endpoints.devices).mockResolvedValue({
      slots: dto.devices,
      store: [{ goodsId: 14, deviceType: 1, num: 1 }],
    } as never);
    vi.mocked(endpoints.placeDevice).mockResolvedValue({} as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountView();
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    const pick = () => w.findAll('button').find((b) => b.text().includes('×1'))!;
    await pick().trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(endpoints.placeDevice).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    await pick().trigger('click');
    await flushPromises();
    expect(endpoints.placeDevice).toHaveBeenCalledWith(1, 14);
    confirm.mockRestore();
  });

  it('经验数字显示在整条进度条上，不在橙色部分里（刚升级时橙色很短也看得见）', async () => {
    const w = await mountView();
    const text = w.find('[data-testid="exp-text"]');
    expect(text.text()).toBe('0/500');
    expect(w.find('.progress-bar').find('[data-testid="exp-text"]').exists()).toBe(false);
  });

  it('加油：显示花费，点击后刷新', async () => {
    vi.mocked(endpoints.refuel).mockResolvedValue({ oil: 1000 });
    const w = await mountView();
    const btn = w.find('[data-testid="refuel"]');
    expect(btn.text()).toContain('600');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.refuel).toHaveBeenCalled();
    expect(endpoints.overview).toHaveBeenCalledTimes(2);
  });

  it('银币不够加满时显示"加油"和实际花费', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, coin: 250 });
    const w = await mountView();
    const btn = w.find('[data-testid="refuel"]');
    expect(btn.text()).toContain('加油（250 银币）');
    expect(btn.attributes('disabled')).toBeUndefined();
  });
});
