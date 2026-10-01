import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import RestaurantHomeView from './RestaurantHomeView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    overview: vi.fn(),
    tasks: vi.fn(),
    refuel: vi.fn(),
    claimTask: vi.fn(),
    devices: vi.fn(),
    placeDevice: vi.fn(),
    openPlaque2: vi.fn(),
    dineCurrent: vi.fn(),
    dineEnd: vi.fn(),
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
  plaque2Cost: { star: 3, coin: 15_000_000, diamond: 188 },
  headlines: { news: [], broadcast: null },
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
  icons: [],
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
    vi.mocked(endpoints.dineCurrent).mockResolvedValue(null);
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
    expect(w.text()).toContain('上座率+35%');
    expect(w.text()).toContain('幸运+36');
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

  it('痞老板驻留时写明他的坏处（问题记录：看不出痞老板有没有负面效果）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, isPlanktonHost: true });
    const w = await mountView();
    const box = w.find('[data-testid="plankton"]');
    expect(box.text()).toContain('挑剔率 -120%');
    expect(box.text()).toContain('没人点菜');
    expect(box.text()).toContain('每桌耗油 +5');
  });

  it('名字下面显示自己展示中的个性图标（问题记录：称号只有好友能看到）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      icons: [{ key: 'founder', title: '开服元老' }],
    });
    const w = await mountView();
    expect(w.find('[data-testid="my-icons"]').text()).toContain('开服元老');
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

  it('正在白食时显示卡片，满 30 分钟可以结束', async () => {
    vi.mocked(endpoints.dineCurrent).mockResolvedValue({
      hostRestId: 2,
      hostName: '乙店',
      tableNo: 3,
      startedAt: '2026-09-30T00:00:00Z',
      minutes: 45,
      canEnd: true,
    });
    vi.mocked(endpoints.dineEnd).mockResolvedValue({ coin: 10, exp: 5, strength: 0 });
    const w = await mountView();
    expect(w.find('[data-testid="dine-card"]').text()).toContain('乙店');
    await w.find('[data-testid="dine-end"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineEnd).toHaveBeenCalled();
  });
  it('第二块牌匾位：满 3 星没开通时可以花银币和钻石开通（问题记录：三星了还是锁定）', async () => {
    const plaque = {
      slot: 7,
      name: '牌匾',
      deviceType: 6,
      needStar: 3,
      unlocked: false,
      goodsId: null,
      expiresAt: null,
    };
    const rich = { ...dto, starLevel: 3, coin: 20_000_000, diamond: 200, devices: [plaque] };
    vi.mocked(endpoints.overview).mockResolvedValue(rich);
    vi.mocked(endpoints.openPlaque2).mockResolvedValue({ plaque2Open: true } as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView();
    expect(w.find('[data-testid="slot-7"]').text()).toContain('未开通');
    const btn = w.find('[data-testid="open-plaque2"]');
    // 视觉规范：按钮文字固定，花费写在信息行，按钮在右侧操作区
    expect(btn.text()).toBe('开通');
    expect(w.find('[data-testid="plaque2-cost"]').text()).toBe('15,000,000 银币 + 188 钻石');
    expect(btn.element.closest('.dt-item-actions')).not.toBeNull();
    await btn.trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(endpoints.openPlaque2).toHaveBeenCalledTimes(1);
    // 花费由全局的得失提示显示，不再多弹一条（问题记录：消息框太多）
    expect(useToastStore().items).toHaveLength(0);
    confirm.mockRestore();

    vi.mocked(endpoints.overview).mockResolvedValue({ ...rich, diamond: 100 });
    const poor = await mountView();
    expect(poor.find('[data-testid="open-plaque2"]').attributes('disabled')).toBeDefined();
    expect(poor.find('[data-testid="plaque2-block"]').text()).toBe('钻石不够（要 188）');

    vi.mocked(endpoints.overview).mockResolvedValue({ ...rich, starLevel: 2 });
    const low = await mountView();
    expect(low.find('[data-testid="open-plaque2"]').exists()).toBe(false);
    expect(low.find('[data-testid="slot-7"]').text()).toContain('3 星开放');

    // 区服把开通星级调到 4：锁定文字按区服数值写，不再停在"3 星开放"（审查）
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...rich,
      plaque2Cost: { ...rich.plaque2Cost, star: 4 },
    });
    const strict = await mountView();
    expect(strict.find('[data-testid="slot-7"]').text()).toContain('4 星开放');
    expect(strict.find('[data-testid="open-plaque2"]').exists()).toBe(false);

    vi.mocked(endpoints.overview).mockResolvedValue({
      ...rich,
      plaque2Open: true,
      devices: [{ ...plaque, unlocked: true }],
    });
    const done = await mountView();
    expect(done.find('[data-testid="open-plaque2"]').exists()).toBe(false);
  });
  it('首页排版：快捷入口一排，区块标题统一，设施一行 4 格（问题记录：首页展示效果不佳）', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="link-equip"]').exists()).toBe(false);
    expect(w.findAll('[data-testid="quick-links"] a').map((a) => a.attributes('href'))).toEqual([
      '/rest/tasks',
      '/rest/equip',
      '/store',
      '/shop',
    ]);
    expect(w.findAll('h6.dt-section').map((h) => h.text())).toEqual(['设施', '经营开关', '生效的加成']);
    expect(w.find('[data-testid="slot-1"]').element.parentElement!.classList.contains('col-3')).toBe(true);
  });

  it('生效的加成：按来源分组，加成绿色、减益红色；超过 5 条先收起', async () => {
    const effects = [
      { sourceType: 'street', sourceId: 140, name: '新手街', effects: { atRate: 0.35 }, expiresAt: null },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({
        sourceType: 'honor',
        sourceId: 200 + i,
        name: `勋章${i}`,
        effects: { spRate: 0.1 },
        expiresAt: null,
      })),
    ];
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, effects });
    const w = await mountView();
    expect(w.findAll('[data-testid="effect-row"]')).toHaveLength(5);
    expect(w.findAll('[data-testid="effect-group"]').map((g) => g.text())).toEqual(['街道', '勋章和宠物']);
    expect(w.find('.dt-chip-good').text()).toBe('上座率+35%');
    expect(w.find('.dt-chip-bad').text()).toBe('挑剔率+10%');
    await w.find('[data-testid="effects-more"]').trigger('click');
    expect(w.findAll('[data-testid="effect-row"]')).toHaveLength(7);
  });

  it('设施格同一行一样高，名字太长时截断（审查）', async () => {
    const w = await mountView();
    const slot = w.find('[data-testid="slot-1"]');
    expect(slot.classes()).toContain('h-100');
    expect(slot.find('.text-truncate').exists()).toBe(true);
  });

  it('小镇新闻：最新广播 + 3 条新闻，点"更多"去小镇页', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      headlines: {
        broadcast: {
          id: 9,
          type: 'town.broadcast',
          restId: 7,
          restName: '小王的店',
          params: { text: '大家好' },
          createdAt: '2026-09-30T04:00:00.000Z',
        },
        news: [
          {
            id: 8,
            type: 'star.up',
            restId: 7,
            restName: '小王的店',
            params: { star: 2 },
            createdAt: '2026-09-30T03:00:00.000Z',
          },
        ],
      },
    });
    const w = await mountView();
    expect(w.find('[data-testid="home-broadcast"]').text()).toContain('小王的店：大家好');
    expect(w.findAll('[data-testid="home-news"]').map((x) => x.text())).toEqual([
      expect.stringContaining('小王的店升到了 2 星'),
    ]);
    expect(w.find('[data-testid="home-news-more"]').attributes('href')).toBe('/town?tab=news');
  });

  it('生效的加成：今日星愿排在最前', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      effects: [
        ...dto.effects,
        {
          sourceType: 'bless',
          sourceId: 4,
          name: '今日星愿：招财进宝',
          effects: { coinRate: 0.08 },
          expiresAt: null,
        },
      ],
    });
    const w = await mountView();
    expect(w.findAll('[data-testid="effect-group"]')[0]!.text()).toBe('今日星愿');
  });

  it('主线任务的领奖按钮和文字垂直居中，不再用浮动（问题记录 118）', async () => {
    const tasks = await endpoints.tasks();
    vi.mocked(endpoints.tasks).mockResolvedValue({
      ...tasks,
      main: { ...tasks.main!, progress: 1, done: true },
    });
    const w = await mountView();
    const card = w.find('[data-testid="main-task"]');
    expect(card.classes()).toEqual(expect.arrayContaining(['d-flex', 'align-items-center']));
    const btn = card.find('button');
    expect(btn.text()).toBe('领奖');
    expect(btn.classes()).not.toContain('float-end');
  });
});
