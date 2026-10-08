import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ActivationDto, QuestDto, QuestsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import RestTasksView from './RestTasksView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    tasks: vi.fn(),
    activation: vi.fn(),
    signIn: vi.fn(),
    claimTask: vi.fn(),
    claimChapter: vi.fn(),
    claimActivation: vi.fn(),
  },
}));

const act = (patch: Partial<ActivationDto> = {}): ActivationDto => ({
  total: 120,
  signedIn: false,
  star: 1,
  level: 10,
  items: [
    {
      id: 1,
      name: '签到',
      points: 10,
      limit: 1,
      count: 1,
      needStar: 0,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 2,
      name: '打蟑螂',
      points: 1,
      limit: 12,
      count: 3,
      needStar: 0,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 50,
      name: '配送外卖',
      points: 5,
      limit: 2,
      count: 0,
      needStar: 2,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 901,
      name: '交易所成交',
      points: 5,
      limit: 1,
      count: 0,
      needStar: 0,
      needLevel: 30,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 903,
      name: '一番赏抽赏',
      points: 5,
      limit: 1,
      count: 0,
      needStar: 0,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: true,
    },
  ],
  rewards: [
    { points: 50, award: { exp: 500 }, claimed: true, multiplier: 1 },
    { points: 100, award: { diamond: 2 }, claimed: false, multiplier: 1 },
    { points: 150, award: { diamond: 5 }, claimed: false, multiplier: 1 },
  ],
  kujiTicket: null,
  ...patch,
});
const task = (patch: Partial<QuestDto> = {}): QuestDto => ({
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
/** 问题记录 318：章节主线 + 支线 */
const quests = (main: QuestDto[], patch: Partial<QuestsDto> = {}): QuestsDto => ({
  chapter: {
    id: 1,
    name: '开张大吉',
    needLevel: 1,
    needStar: 0,
    locked: false,
    award: { goods: [] },
    claimable: false,
    total: main.length,
    claimedCount: main.filter((x) => x.claimed).length,
    doneCount: main.filter((x) => x.done || x.claimed).length,
  },
  main,
  leftover: [],
  allMainDone: false,
  lines: [],
  weekly: null,
  ...patch,
});

/** path 可以带 ?tab=weekly / side（问题记录：任务页分三个选项卡） */
async function mountView(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: RestTasksView }],
  });
  await router.push(path);
  const w = mount(RestTasksView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('RestTasksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task()]));
    vi.mocked(endpoints.activation).mockResolvedValue(act());
    vi.mocked(endpoints.signIn).mockResolvedValue({});
  });

  it('任务名按目录取当前语言；目录里没有时用服务端给的（问题记录 272）', async () => {
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      data: {
        tasks: [{ id: 2021, name: 'Refill oil once' }],
        chapters: [],
        questLines: [],
        activation: [{ id: 1, name: 'Check in' }],
        bless: [],
        tower: [],
        formulas: [],
        kujiThemes: [],
        proficiency: [],
        cookbooks: [],
      },
    });
    const w = await mountView();
    expect(w.text()).toContain('Refill oil once');
  });

  it('任务卡片：没完成时显示进度条、不放按钮；完成后绿边和领奖按钮', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="task-2021"]').find('.progress').exists()).toBe(true);
    expect(w.find('[data-testid="claim-task-2021"]').exists()).toBe(false);
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task({ progress: 1, done: true })]));
    const done = await mountView();
    expect(done.find('[data-testid="task-2021"]').classes()).toContain('border-primary'); // 可领的任务卡和按钮一样用品牌色框（问题记录 469）
    await done.find('[data-testid="claim-task-2021"]').trigger('click');
    await flushPromises();
    expect(endpoints.claimTask).toHaveBeenCalledWith(2021);
  });

  it('主线写章名和进度；可领的排前面、已领的排后面写已领；本章领完可领章末奖励（问题记录 318）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([
        task({ id: 2021, name: '填一次油', progress: 1, done: true, claimed: true }),
        task({ id: 2022, name: '分配属性点' }),
        task({ id: 2023, name: '学会第一道食谱', progress: 1, done: true }),
      ]),
    );
    const w = await mountView();
    expect(w.get('[data-testid="chapter"]').text()).toContain('第 1 章 开张大吉 (1/3)');
    expect(w.findAll('[data-testid^="task-20"]').map((x) => x.attributes('data-testid'))).toEqual([
      'task-2023',
      'task-2022',
      'task-2021',
    ]);
    expect(w.get('[data-testid="task-2021"]').text()).toContain('✓ 已领');
    expect(w.find('[data-testid="claim-chapter"]').attributes('disabled')).toBeDefined();
    // 没领完时不是绿色，写明还差几个（问题记录 318 试玩反馈：绿色按钮点不了像坏了）
    expect(w.get('[data-testid="claim-chapter"]').classes()).not.toContain('btn-primary');
    expect(w.get('[data-testid="claim-chapter"]').text()).toBe('还差 1 个任务');
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ progress: 1, done: true, claimed: true })], {
        chapter: { ...quests([]).chapter!, claimable: true, total: 1, claimedCount: 1, doneCount: 1 },
      }),
    );
    const ready = await mountView();
    expect(ready.get('[data-testid="claim-chapter"]').classes()).toContain('btn-primary');
    expect(ready.get('[data-testid="claim-chapter"]').text()).toBe('领章末奖励');
    await ready.get('[data-testid="claim-chapter"]').trigger('click');
    await flushPromises();
    expect(endpoints.claimChapter).toHaveBeenCalledWith(1);
  });

  it('章节锁定写解锁条件；主线全做完写已完成；支线写当前一档、做完和星级锁定', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([], {
        chapter: { ...quests([]).chapter!, id: 2, name: '小店经营', needLevel: 5, locked: true },
        lines: [
          {
            id: 1,
            name: '食谱',
            quest: task({ id: 3021, name: '把 10 道食谱升到上品' }),
            lockedStar: null,
            doneCount: 0,
            total: 6,
          },
          {
            id: 2,
            name: '小镇',
            quest: task({ id: 3042, name: '摇钱袋' }),
            lockedStar: 2,
            doneCount: 1,
            total: 3,
          },
          { id: 3, name: '好友', quest: null, lockedStar: null, doneCount: 5, total: 5 },
        ],
      }),
    );
    const w = await mountView();
    expect(w.get('[data-testid="chapter"]').text()).toContain('🔒 5 级解锁');
    const side = await mountView('/?tab=side');
    expect(side.get('[data-testid="line-1"]').text()).toContain('把 10 道食谱升到上品');
    expect(side.get('[data-testid="line-1"]').text()).toContain('0/6');
    expect(side.get('[data-testid="line-2"]').text()).toContain('🔒 2 星解锁');
    expect(side.find('[data-testid="claim-task-3042"]').exists()).toBe(false);
    expect(side.get('[data-testid="line-3"]').text()).toContain('已全部完成');
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([], { chapter: null, allMainDone: true }));
    const done = await mountView();
    expect(done.text()).toContain('主线已全部完成');
  });
});

describe('RestTasksView 四块和每周任务（问题记录 318 PR 2）', () => {
  const weekly = (claimed: boolean[], fullClaimed = false): QuestsDto['weekly'] => {
    const qs = [4011, 4012, 4013, 4014].map((id, i) =>
      task({
        id,
        name: `每周${i + 1}`,
        key: 'market.buy',
        target: 10,
        progress: 10,
        done: true,
        claimed: claimed[i]!,
      }),
    );
    return {
      group: 'A',
      week: '2026-09-28',
      endsAt: new Date(Date.now() + 2 * 86_400_000 + 3.5 * 3_600_000).toISOString(),
      quests: qs,
      full: {
        id: 4019,
        award: { goods: [] },
        claimable: qs.every((q) => q.claimed) && !fullClaimed,
        claimed: fullClaimed,
      },
    };
  };
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.activation).mockResolvedValue(act());
  });

  it('三个选项卡：主线、每周、支线，默认主线；切换只显示那一块，写进地址；有能领的卡加礼物图标（问题记录：活跃和任务拆页）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([false, false, false, false]) }),
    );
    const w = await mountView();
    expect(w.findAll('[data-testid^="tab-"]').map((x) => x.text())).toEqual(['主线', '每周', '支线']);
    expect(w.find('[data-testid="card-activation"]').exists()).toBe(false);
    expect(w.findAll('[data-testid^="card-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'card-main',
    ]);
    // 每周 4 个都完成没领：每周卡有礼物图标，主线没有
    expect(w.find('[data-testid="gift-tab-weekly"]').exists()).toBe(true);
    expect(w.find('[data-testid="gift-tab-main"]').exists()).toBe(false);
    await w.get('[data-testid="tab-weekly"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid^="card-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'card-weekly',
    ]);
    expect(w.get('[data-testid="tab-weekly"]').classes()).toContain('active');
    await w.get('[data-testid="tab-side"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid^="card-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'card-lines',
    ]);
  });

  it('每周：写组别和剩余时间；单个任务能领；没领完时全完成奖励灰色写还差几个', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([true, false, false, false]) }),
    );
    const w = await mountView('/?tab=weekly');
    const card = w.get('[data-testid="card-weekly"]');
    expect(card.text()).toContain('每周任务 · A 组');
    expect(card.text()).toContain('2 天 3 小时');
    await card.get('[data-testid="claim-task-4012"]').trigger('click');
    await flushPromises();
    expect(endpoints.claimTask).toHaveBeenCalledWith(4012);
    const full = card.get('[data-testid="claim-weekly-full"]');
    expect(full.attributes('disabled')).toBeDefined();
    expect(full.classes()).not.toContain('btn-primary');
    expect(full.text()).toBe('先领完上面的任务');
  });

  it('每周：4 个都领了能领全完成奖励；领过写已领；没有每周任务时不显示这一块', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([true, true, true, true]) }),
    );
    const w = await mountView('/?tab=weekly');
    const full = w.get('[data-testid="claim-weekly-full"]');
    expect(full.classes()).toContain('btn-primary');
    expect(full.text()).toBe('领取');
    expect(w.get('[data-testid="card-weekly"]').text()).toContain('全完成奖励: ');
    await full.trigger('click');
    await flushPromises();
    expect(endpoints.claimTask).toHaveBeenCalledWith(4019);
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([true, true, true, true], true) }),
    );
    const done = await mountView('/?tab=weekly');
    expect(done.get('[data-testid="claim-weekly-full"]').text()).toBe('✓ 已领取');
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task()]));
    const none = await mountView('/?tab=weekly');
    expect(none.find('[data-testid="card-weekly"]').exists()).toBe(false);
    expect(none.get('[data-testid="no-weekly"]').text()).toBe('现在没有每周任务');
  });
});

describe('任务页终审遗留（backlog 318）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.activation).mockResolvedValue(act());
  });

  it('章末按钮：有没完成的写还差几个（只数没完成的）；都完成只差领时写先领完上面的任务', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ id: 2021, progress: 1, done: true }), task({ id: 2022 }), task({ id: 2023 })]),
    );
    expect((await mountView()).get('[data-testid="claim-chapter"]').text()).toBe('还差 2 个任务');
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ id: 2021, progress: 1, done: true }), task({ id: 2022, progress: 1, done: true })]),
    );
    expect((await mountView()).get('[data-testid="claim-chapter"]').text()).toBe('先领完上面的任务');
  });

  it('补出来的任务单独列在"补领"下面，不混进本章、不算本章进度；章锁定、主线全做完时也列出', async () => {
    const left = task({ id: 2061, name: '摇一次酒吧老虎机', progress: 1, done: true });
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task({ id: 2081 })], { leftover: [left] }));
    let w = await mountView();
    let card = w.get('[data-testid="card-main"]');
    expect(card.get('[data-testid="chapter"]').text()).toContain(' (0/1)');
    const box = card.get('[data-testid="main-leftover"]');
    expect(box.text()).toContain('补领');
    expect(box.find('[data-testid="task-2061"]').exists()).toBe(true);
    expect(card.findAll('[data-testid^="task-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'task-2081',
      'task-2061',
    ]);
    await box.get('[data-testid="claim-task-2061"]').trigger('click');
    await flushPromises();
    expect(endpoints.claimTask).toHaveBeenCalledWith(2061);
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([], {
        chapter: { ...quests([]).chapter!, id: 2, needLevel: 5, locked: true },
        leftover: [left],
      }),
    );
    w = await mountView();
    expect(w.get('[data-testid="main-leftover"]').text()).toContain('摇一次酒吧老虎机');
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([], { chapter: null, allMainDone: true, leftover: [left] }),
    );
    w = await mountView();
    card = w.get('[data-testid="card-main"]');
    expect(card.text()).toContain('主线已全部完成');
    expect(card.find('[data-testid="main-leftover"] [data-testid="task-2061"]').exists()).toBe(true);
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task()]));
    expect((await mountView()).find('[data-testid="main-leftover"]').exists()).toBe(false);
  });

  const weeklyOf = (qs: QuestDto[], full: Partial<NonNullable<QuestsDto['weekly']>['full']> = {}) => ({
    group: 'A',
    week: '2026-09-28',
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    quests: qs,
    full: { id: 4019, award: { goods: [] }, claimable: false, claimed: false, ...full },
  });

  it('每周：没完成的显示进度条；可领的排前面、没完成的其次、已领的最后；全完成按钮数没完成的', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], {
        weekly: weeklyOf([
          task({ id: 4011, target: 10, progress: 10, done: true, claimed: true }),
          task({ id: 4012, target: 10, progress: 4 }),
          task({ id: 4013, target: 10, progress: 10, done: true }),
          task({ id: 4014, target: 10, progress: 0 }),
        ]),
      }),
    );
    const card = (await mountView('/?tab=weekly')).get('[data-testid="card-weekly"]');
    expect(card.findAll('[data-testid^="task-40"]').map((x) => x.attributes('data-testid'))).toEqual([
      'task-4013',
      'task-4012',
      'task-4014',
      'task-4011',
    ]);
    expect(card.get('[data-testid="task-4012"] .progress-bar').attributes('style')).toContain('width: 40%');
    expect(card.find('[data-testid="claim-task-4012"]').exists()).toBe(false);
    expect(card.get('[data-testid="claim-weekly-full"]').text()).toBe('还差 2 个任务');
  });

  it('每周全完成奖励领过后是浅灰底（和活跃页已领的奖励一个样子）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], {
        weekly: weeklyOf([task({ id: 4011, progress: 1, done: true, claimed: true })], { claimed: true }),
      }),
    );
    const w = await mountView('/?tab=weekly');
    const full = w.get('[data-testid="claim-weekly-full"]');
    expect(full.classes()).toEqual(expect.arrayContaining(['btn-light', 'text-muted']));
    expect(full.classes()).not.toContain('btn-outline-secondary');
  });
});
