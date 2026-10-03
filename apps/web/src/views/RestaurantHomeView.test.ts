import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { QuestDto, QuestsDto, RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useLocaleStore } from '../stores/locale';
import { useToastStore } from '../stores/toast';
import RestaurantHomeView from './RestaurantHomeView.vue';

/** 问题记录 318：主线任务、任务列表 */
const quest = (patch: Partial<QuestDto> = {}): QuestDto => ({
  id: 2021,
  name: '填一次油',
  href: '/',
  key: 'oil.fill',
  target: 1,
  progress: 0,
  done: false,
  claimed: false,
  award: { coin: 2000 },
  ...patch,
});
const quests = (main: QuestDto[], patch: Partial<QuestsDto> = {}): QuestsDto => ({
  chapter: {
    id: 1,
    name: '开张大吉',
    needLevel: 1,
    needStar: 0,
    locked: false,
    award: {},
    claimable: false,
    total: main.length,
    claimedCount: main.filter((x) => x.claimed).length,
  },
  main,
  allMainDone: false,
  lines: [],
  weekly: null,
  ...patch,
});

vi.mock('../api/endpoints', () => ({
  endpoints: {
    overview: vi.fn(),
    guideCodes: vi.fn(),
    tasks: vi.fn(),
    refuel: vi.fn(),
    claimTask: vi.fn(),
    claimChapter: vi.fn(),
    devices: vi.fn(),
    placeDevice: vi.fn(),
    openPlaque2: vi.fn(),
    dineCurrent: vi.fn(),
    dineEnd: vi.fn(),
    announcements: vi.fn(),
    activation: vi.fn(),
    signIn: vi.fn(),
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
  cookfoodsPerFlag: 50,
  plaque2Open: false,
  plaque2Cost: { star: 3, coin: 15_000_000, diamond: 188 },
  headlines: { news: [], broadcast: null },
  boosts: [],
  disabledFeatures: [],
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
    vi.mocked(endpoints.announcements).mockResolvedValue({ items: [] });
    vi.mocked(endpoints.activation).mockResolvedValue({
      total: 0,
      signedIn: false,
      signInGift: 27,
      star: 0,
      items: [],
      rewards: [],
    });
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([quest()]));
  });

  it('6 星起显示挑剔消耗食材档位，并说明每档保留多少（问题记录 220）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, starLevel: 6, cookfoodsPerFlag: 40 });
    const w = await mountView();
    const hint = w.find('[data-testid="cookfoods-hint"]');
    expect(hint.text()).toContain('至少 40×N 个');
    expect(hint.text()).toContain('关闭');
    // 和其他开关一样一行：名字在左、档位在右；说明收进"这是什么？"，默认不展开（首页排版 280 反馈）
    const row = w.get('[data-testid="cookfoods-row"]');
    expect(row.classes()).toContain('dt-todo-row');
    expect(row.find('select').exists()).toBe(true);
    const help = w.get('[data-testid="cookfoods-help"]');
    expect(help.element.tagName).toBe('DETAILS');
    expect((help.element as HTMLDetailsElement).open).toBe(false);
    expect(help.find('[data-testid="cookfoods-hint"]').exists()).toBe(true);
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, starLevel: 5 });
    expect((await mountView()).find('[data-testid="cookfoods-hint"]').exists()).toBe(false);
  });

  it('有能领的新手码时提示去领（backlog：以前 10 级就不提示，20 级的码没人提醒）', async () => {
    const code = (state: 'ok' | 'used') => ({ code: 'XINSHOU20', minLevel: 20, items: {}, state });
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, level: 20 });
    vi.mocked(endpoints.guideCodes).mockResolvedValue([code('ok')]);
    const can = await mountView();
    expect(can.get('[data-testid="guide-hint"]').text()).toContain('有可以领的新手兑换码');
    vi.mocked(endpoints.guideCodes).mockResolvedValue([code('used')]);
    expect((await mountView()).find('[data-testid="guide-hint"]').exists()).toBe(false);
  });

  it('等级 < 10 显示新手提示，链到游玩指引；10 级起不显示（问题记录 150）', async () => {
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, level: 9 });
    const low = await mountView();
    expect(low.find('[data-testid="guide-hint"]').attributes('href')).toBe('/guide');
    vi.mocked(endpoints.overview).mockResolvedValue({ ...dto, level: 10 });
    const high = await mountView();
    expect(high.find('[data-testid="guide-hint"]').exists()).toBe(false);
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

  it('体力、声望也按千分位显示，和银币、油一致（问题记录 296）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      strength: 9848,
      strengthMax: 1000,
      renown: 12345,
    });
    const w = await mountView();
    expect(w.get('[data-testid="rest-strength"]').text()).toBe('9,848/1,000');
    expect(w.get('[data-testid="rest-renown"]').text()).toBe('12,345');
  });

  it('体力、声望的图标和数字之间有空格，和银币、油一致（问题记录 298）', async () => {
    const w = await mountView();
    for (const id of ['rest-coin', 'rest-strength', 'rest-renown'])
      expect(w.get(`[data-testid="${id}"]`).element.previousSibling?.textContent, id).toBe(' ');
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
    // 个性图标用浅色描边小标签，不再和经验条一样是大黄块（问题记录 198）
    const chip = w.find('[data-testid="my-icons"] span');
    expect(chip.classes()).toContain('dt-icon-tag');
    expect(chip.classes()).not.toContain('bg-warning');
    // 经验条也不再用亮黄色（问题记录 212）
    expect(w.find('[data-testid="exp-bar"]').classes()).toContain('dt-exp-bar');
    expect(w.find('[data-testid="exp-bar"]').classes()).not.toContain('bg-warning');
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

  it('今日待办每一行都用图标开头，主线不再用文字小标签（问题记录 302）', async () => {
    vi.mocked(endpoints.dineCurrent).mockResolvedValue({
      hostRestId: 2,
      hostName: '乙店',
      tableNo: 3,
      startedAt: '2026-09-30T00:00:00Z',
      minutes: 45,
      canEnd: true,
    });
    const w = await mountView();
    const main = w.get('[data-testid="main-task"]');
    expect(main.find('.dt-tag').exists()).toBe(false);
    expect(main.find('i.bi-flag').exists()).toBe(true);
    expect(main.text()).toContain('主线：填一次油');
    expect(w.get('[data-testid="dine-card"]').find('i.bi-cup-hot').exists()).toBe(true);
    expect(w.get('[data-testid="guide-hint"]').find('i.bi-lightbulb').exists()).toBe(true);
    for (const row of w.get('[data-testid="home-todo"]').findAll('.dt-todo-row'))
      expect(row.find('i.bi').exists(), row.text()).toBe(true);
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
  it('首页排版（问题记录 280）：第一屏三张卡——餐厅、今日待办、小镇动态；设施、经营开关在下面', async () => {
    vi.mocked(endpoints.activation).mockResolvedValue({
      total: 18,
      signedIn: false,
      signInGift: 27,
      star: 0,
      items: [],
      rewards: [],
    });
    const w = await mountView();
    const status = w.get('[data-testid="home-status"]');
    for (const id of ['rest-level', 'exp-text', 'rest-coin', 'refuel', 'quick-links'])
      expect(status.find(`[data-testid="${id}"]`).exists(), id).toBe(true);
    // 任务入口并进待办卡的"今日活跃"，快捷入口只剩厨具、仓库、商店
    expect(w.findAll('[data-testid="quick-links"] a').map((a) => a.attributes('href'))).toEqual([
      '/rest/equip',
      '/store',
      '/shop',
    ]);
    const todo = w.get('[data-testid="home-todo"]');
    expect(todo.find('[data-testid="home-signin-row"]').exists()).toBe(true);
    expect(todo.find('[data-testid="main-task"]').exists()).toBe(true);
    const act = todo.get('[data-testid="home-activation"]');
    expect(act.text()).toContain('今日活跃 18');
    expect(act.attributes('href')).toBe('/rest/tasks');
    // 顺序：餐厅 → 待办 → 小镇动态 → 设施
    const pos = (sel: string) => w.html().indexOf(sel);
    expect(pos('data-testid="home-status"')).toBeLessThan(pos('data-testid="home-todo"'));
    expect(pos('data-testid="home-todo"')).toBeLessThan(pos('data-testid="home-news-more"'));
    expect(pos('data-testid="home-news-more"')).toBeLessThan(pos('data-testid="slot-1"'));
    // 设施、经营开关也是卡片，标题样式和上面三张卡一致（280 反馈）
    expect(w.findAll('h6.dt-section')).toHaveLength(0);
    expect(w.get('[data-testid="home-devices"] .dt-card-title').text()).toBe('设施');
    expect(w.get('[data-testid="home-devices"]').find('[data-testid="slot-1"]').exists()).toBe(true);
    const sw = w.get('[data-testid="home-switches"]');
    expect(sw.get('.dt-card-title').text()).toBe('经营开关');
    expect(sw.findAll('.dt-todo-row').length).toBeGreaterThanOrEqual(2);
    // 油那一行和银币、钻石同在一个两列网格里，按钮用紧凑样式，行高不被撑大
    const refuel = w.get('[data-testid="refuel"]');
    expect(refuel.classes()).toContain('dt-compact-btn');
    expect(refuel.element.closest('.row')).not.toBeNull();
    expect(w.find('[data-testid="slot-1"]').element.parentElement!.classList.contains('col-3')).toBe(true);
  });

  it('生效的加成默认折叠成一行摘要，点开看全部（问题记录 280）', async () => {
    const w = await mountView();
    const box = w.get('[data-testid="effects"]');
    expect(box.element.tagName).toBe('DETAILS');
    expect((box.element as HTMLDetailsElement).open).toBe(false);
    expect(box.get('summary').text()).toContain('生效的加成');
  });

  it('正在生效的全服加成活动单独成一组，算进摘要（问题记录 294）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      boosts: [
        {
          id: 7,
          title: '双倍经验周',
          items: [
            { key: 'exp', factor: 2 },
            { key: 'marketPrice', factor: 0.8 },
          ],
          endsAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
        },
      ],
    });
    const w = await mountView();
    const box = w.get('[data-testid="effects"]');
    expect(box.get('summary').text()).toContain('2 项');
    expect(box.get('summary').text()).toContain('双倍经验周');
    const row = box.get('[data-testid="boost-row"]');
    expect(row.text()).toContain('双倍经验周');
    expect(row.findAll('.dt-chip-good').map((c) => c.text())).toEqual(['经营经验 ×2', '菜场价格 ×0.8']);
    expect(box.findAll('[data-testid="effect-group"]').map((g) => g.text())).toContain('全服活动');
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
          // 服务端只给星愿名，前缀由前端按语言加（问题记录 272）
          name: '招财进宝',
          effects: { coinRate: 0.08 },
          expiresAt: null,
        },
      ],
    });
    const w = await mountView();
    expect(w.findAll('[data-testid="effect-group"]')[0]!.text()).toBe('今日星愿');
    expect(w.findAll('[data-testid="effect-row"]')[0]!.text()).toContain('今日星愿：招财进宝');
  });

  it('主线任务的领奖按钮和文字垂直居中，不再用浮动（问题记录 118）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([quest({ progress: 1, done: true })]));
    const w = await mountView();
    const card = w.find('[data-testid="main-task"]');
    // 待办卡里统一的一行样式：flex + 垂直居中（问题记录 280）
    expect(card.classes()).toContain('dt-todo-row');
    const btn = card.find('button');
    expect(btn.text()).toBe('领奖');
    expect(btn.classes()).not.toContain('float-end');
  });

  it('主线行：本章第一个可领的；没有可领的显示第一个没完成的；主线全做完不显示（问题记录 318）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([
        quest({ id: 2021, name: '填一次油', progress: 1, done: true, claimed: true }),
        quest({ id: 2022, name: '分配属性点' }),
        quest({ id: 2023, name: '学会第一道食谱', progress: 1, done: true }),
      ]),
    );
    let w = await mountView();
    expect(w.get('[data-testid="main-task"]').text()).toContain('学会第一道食谱');
    expect(w.get('[data-testid="main-task"]').find('button').exists()).toBe(true);
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([
        quest({ id: 2021, progress: 1, done: true, claimed: true }),
        quest({ id: 2022, name: '分配属性点' }),
      ]),
    );
    w = await mountView();
    expect(w.get('[data-testid="main-task"]').text()).toContain('分配属性点');
    expect(w.get('[data-testid="main-task"]').find('button').exists()).toBe(false);
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([], { chapter: null, allMainDone: true }));
    w = await mountView();
    expect(w.find('[data-testid="main-task"]').exists()).toBe(false);
  });

  it('主线行：本章任务都领了显示章末奖励和领奖按钮；章锁定时写解锁条件（问题记录 318 PR 2）', async () => {
    const all = quests([quest({ progress: 1, done: true, claimed: true })]);
    vi.mocked(endpoints.tasks).mockResolvedValue({ ...all, chapter: { ...all.chapter!, claimable: true } });
    let w = await mountView();
    const row = w.get('[data-testid="main-task"]');
    expect(row.text()).toContain('第 1 章 开张大吉 章末奖励');
    await row.get('button').trigger('click');
    await flushPromises();
    expect(endpoints.claimChapter).toHaveBeenCalledWith(1);
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([], { chapter: { ...all.chapter!, id: 2, name: '小店经营', needLevel: 5, locked: true } }),
    );
    w = await mountView();
    expect(w.get('[data-testid="main-task"]').text()).toContain('第 2 章 小店经营');
    expect(w.get('[data-testid="main-task"]').text()).toContain('🔒 5 级解锁');
    expect(w.get('[data-testid="main-task"]').find('button').exists()).toBe(false);
  });

  it('有公告时首页显示公告横幅（子项目 6A）', async () => {
    vi.mocked(endpoints.announcements).mockResolvedValue({
      items: [
        {
          id: 1,
          title: '停服维护',
          body: '今晚 2 点',
          important: false,
          startsAt: '2026-10-01T00:00:00.000Z',
          endsAt: '2026-10-02T00:00:00.000Z',
          seen: true,
        },
      ],
    });
    const w = await mountView();
    expect(w.find('[data-testid="announce-banner"]').text()).toContain('停服维护');
  });

  it('首页显示今日签到，点了就签（问题记录 144）', async () => {
    vi.mocked(endpoints.signIn).mockResolvedValue({} as never);
    const w = await mountView();
    const btn = w.find('[data-testid="home-signin"]');
    expect(btn.text()).toContain('签到');
    vi.mocked(endpoints.activation).mockResolvedValue({
      total: 0,
      signedIn: true,
      signInGift: 27,
      star: 0,
      items: [],
      rewards: [],
    });
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
    expect(w.find('[data-testid="home-signin"]').exists()).toBe(false);
    expect(w.get('[data-testid="home-signed"]').text()).toBe('已签到');
  });

  it('读签到状态失败时不显示这一行', async () => {
    vi.mocked(endpoints.activation).mockRejectedValue(new Error('x'));
    const w = await mountView();
    expect(w.find('[data-testid="home-signin-row"]').exists()).toBe(false);
  });

  it('声望用奖章图标，悬停提示"声望"（问题记录 170）', async () => {
    const w = await mountView();
    const cell = w.find('[title="声望"]');
    expect(cell.find('i.bi-award').exists()).toBe(true);
    expect(cell.text()).not.toContain('声望');
  });

  it('经验条紧跟等级那一行，在常用入口之前（问题记录 172）', async () => {
    const w = await mountView();
    const exp = w.find('[data-testid="exp-text"]').element;
    const quick = w.find('[data-testid="quick-links"]').element;
    expect(exp.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('切到英语后首页标题、按钮是英文，数字用逗号（问题记录 272）', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    // 加载语言包期间别的计时器可能把活动 Pinia 换成旧的（见 LangSelect.test），挂载前换回来
    setActivePinia(pinia);
    try {
      const w = await mountView();
      expect(w.find('[data-testid="home-todo"] .dt-card-title').text()).toBe("Today's to-do");
      expect(w.find('[data-testid="home-switches"] .dt-card-title').text()).toBe('Business settings');
      expect(w.find('[data-testid="home-devices"] .dt-card-title').text()).toBe('Facilities');
      expect(w.find('[data-testid="home-signin"]').text()).toBe('Check in');
      expect(w.find('[data-testid="rest-coin"]').text()).toBe('100,000');
      expect(w.find('[data-testid="refuel"]').text()).toBe('Fill up (600 coins)');
      expect(w.find('[data-testid="last-round"]').text()).toContain('Last round: 12 coins');
      expect(w.find('[data-testid="last-round"]').text()).toContain('Regular customer×1');
      expect(w.text()).not.toMatch(/今日待办|经营开关|签到/);
    } finally {
      await useLocaleStore().set('zh-CN');
    }
  });

  it('签到后右边只写短短的「已签到」，领到什么写在下面一行（问题记录 310：以前一长串挤得换行）', async () => {
    vi.mocked(endpoints.activation).mockResolvedValue({
      total: 10,
      signedIn: true,
      signInGift: 27,
      star: 0,
      items: [],
      rewards: [],
    });
    const w = await mountView();
    const row = w.get('[data-testid="home-signin-row"]');
    expect(row.get('[data-testid="home-signed"]').text()).toBe('已签到');
    expect(row.get('[data-testid="home-signed"]').find('i.bi-check-circle-fill').exists()).toBe(true);
    expect(row.get('[data-testid="home-signin-gift"]').text()).toContain('×1（在仓库）');
  });
});
