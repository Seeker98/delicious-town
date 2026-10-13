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
    { points: 50, award: { exp: 500 }, claimed: true },
    { points: 100, award: { diamond: 2 }, claimed: false },
    { points: 150, award: { diamond: 5 }, claimed: false },
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

/** path 可以带 ?tab=weekly / side；不带时是“今日”，这里默认看主线（界面改版 P2b） */
async function mountView(path = '/?tab=main') {
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

  it('任务卡片：没完成时显示进度、不放按钮；完成后绿边和领奖按钮', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="task-2021"] .dt-act-count').text()).toBe('0/1');
    expect(w.get('[data-testid="task-2021"] .dt-row-sub').text()).toBe('银币 2,000');
    expect(w.find('[data-testid="claim-task-2021"]').exists()).toBe(false);
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task({ progress: 1, done: true })]));
    const done = await mountView();
    // 可领的任务和按钮一样用品牌色标出（问题记录 469；界面改版 P3：左边紫色竖条）
    expect(done.find('[data-testid="task-2021"]').classes()).toContain('is-ready');
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
    const head = w.get('[data-testid="chapter"]');
    expect(head.text()).toContain('第 1 章');
    expect(head.text()).toContain('开张大吉');
    expect(head.get('.dt-quest-head-count').text()).toBe('1 / 3');
    expect(head.get('.dt-quest-bar > span').attributes('style')).toContain('width: 33.3');
    expect(w.findAll('[data-testid^="task-20"]').map((x) => x.attributes('data-testid'))).toEqual([
      'task-2023',
      'task-2022',
      'task-2021',
    ]);
    expect(w.get('[data-testid="task-2021"] .dt-tag-ok').text()).toBe('已领');
    // 卡片底写章末奖励
    expect(w.get('[data-testid="card-main"] .dt-quest-foot').text()).toContain('章末奖励');
    // 没领完时不是按钮、不是品牌色，写明还差几个（问题记录 318 试玩反馈：绿色按钮点不了像坏了）
    const chapterBtn = w.get('[data-testid="claim-chapter"]');
    expect(chapterBtn.element.tagName).toBe('SPAN');
    expect(chapterBtn.classes()).toContain('dt-tag');
    expect(chapterBtn.classes()).not.toContain('btn-primary');
    expect(chapterBtn.text()).toBe('还差 1 个任务');
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ progress: 1, done: true, claimed: true })], {
        chapter: { ...quests([]).chapter!, claimable: true, total: 1, claimedCount: 1, doneCount: 1 },
      }),
    );
    const ready = await mountView();
    expect(ready.get('[data-testid="claim-chapter"]').element.tagName).toBe('BUTTON');
    expect(ready.get('[data-testid="claim-chapter"]').classes()).toContain('btn-primary');
    expect(ready.get('[data-testid="claim-chapter"]').text()).toBe('领奖');
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
    const chapter = w.get('[data-testid="chapter"]');
    expect(chapter.text()).toContain('第 2 章');
    expect(chapter.text()).toContain('小店经营');
    // 锁定写解锁条件：小标签里画锁图标，文字去掉锁符号；不写进度、不放章末奖励
    const lock = chapter.get('.dt-tag.dt-tag-mute');
    expect(lock.text()).toBe('5 级解锁');
    expect(lock.find('.bi-lock-fill').exists()).toBe(true);
    expect(chapter.text()).not.toContain('🔒');
    expect(chapter.find('.dt-quest-head-count').exists()).toBe(false);
    expect(w.find('[data-testid="claim-chapter"]').exists()).toBe(false);
    const side = await mountView('/?tab=side');
    expect(side.get('[data-testid="line-1"]').text()).toContain('食谱');
    expect(side.get('[data-testid="line-1"]').text()).toContain('把 10 道食谱升到上品');
    expect(side.get('[data-testid="line-1"] .dt-quest-head-count').text()).toBe('0 / 6');
    expect(side.get('[data-testid="line-2"] .dt-quest-head-count').text()).toBe('1 / 3');
    expect(side.get('[data-testid="line-2"] .dt-tag-mute').text()).toBe('2 星解锁');
    expect(side.find('[data-testid="claim-task-3042"]').exists()).toBe(false);
    expect(side.get('[data-testid="line-3"] .dt-tag-ok').text()).toBe('已全部完成');
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

  it('四个选项卡：今日、主线、每周、支线；切换只显示那一块，写进地址；有能领的卡加礼物图标（界面改版 P2b：签到和活跃并进来）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([false, false, false, false]) }),
    );
    const w = await mountView();
    expect(w.findAll('[data-testid^="tab-"]').map((x) => x.text())).toEqual(['今日', '主线', '每周', '支线']);
    expect(w.find('[data-testid="card-activation"]').exists()).toBe(false);
    // 签到和活跃并进来了，不再有去活跃页的入口
    expect(w.find('[data-testid="to-activation"]').exists()).toBe(false);
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
    expect(w.get('[data-testid="card-lines"]').text()).toBe('暂时没有支线任务');
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
    expect(full.element.tagName).toBe('SPAN');
    expect(full.classes()).toContain('dt-tag');
    expect(full.classes()).not.toContain('btn-primary');
    expect(full.text()).toBe('先领完上面的任务');
  });

  it('每周：4 个都领了能领全完成奖励；领过写已领；没有每周任务时不显示这一块', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([true, true, true, true]) }),
    );
    const w = await mountView('/?tab=weekly');
    const full = w.get('[data-testid="claim-weekly-full"]');
    expect(full.element.tagName).toBe('BUTTON');
    expect(full.classes()).toContain('btn-primary');
    expect(full.text()).toBe('领奖');
    expect(w.get('[data-testid="card-weekly"] .dt-quest-foot').text()).toContain('全完成奖励');
    await full.trigger('click');
    await flushPromises();
    expect(endpoints.claimTask).toHaveBeenCalledWith(4019);
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], { weekly: weekly([true, true, true, true], true) }),
    );
    const done = await mountView('/?tab=weekly');
    expect(done.get('[data-testid="claim-weekly-full"]').text()).toBe('已领');
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
    expect(card.get('[data-testid="chapter"] .dt-quest-head-count').text()).toBe('0 / 1');
    // 补领是本章卡片下面单独一块（界面改版 P7），本章卡片里只有本章的任务
    expect(card.findAll('[data-testid^="task-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'task-2081',
    ]);
    const box = w.get('[data-testid="main-leftover"]');
    expect(box.get('.dt-block-title').text()).toBe('补领: 前面章节后来开放的任务');
    expect(box.findAll('[data-testid^="task-"]').map((x) => x.attributes('data-testid'))).toEqual([
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
    expect(w.find('[data-testid="main-leftover"] [data-testid="task-2061"]').exists()).toBe(true);
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

  it('每周：没完成的显示进度；可领的排前面、没完成的其次、已领的最后；全完成按钮数没完成的', async () => {
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
    expect(card.get('[data-testid="task-4012"] .dt-act-count').text()).toBe('4/10');
    expect(card.get('[data-testid="task-4014"] .dt-act-count').text()).toBe('0/10');
    expect(card.find('[data-testid="claim-task-4012"]').exists()).toBe(false);
    expect(card.get('[data-testid="claim-weekly-full"]').text()).toBe('还差 2 个任务');
  });

  it('每周全完成奖励领过后是“已领”小标签（和活跃页已领的奖励一个样子）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task()], {
        weekly: weeklyOf([task({ id: 4011, progress: 1, done: true, claimed: true })], { claimed: true }),
      }),
    );
    const w = await mountView('/?tab=weekly');
    const full = w.get('[data-testid="claim-weekly-full"]');
    expect(full.element.tagName).toBe('SPAN');
    expect(full.classes()).toEqual(expect.arrayContaining(['dt-tag', 'dt-tag-ok']));
    expect(full.classes()).not.toContain('btn');
  });
});

describe('任务卡的进度数字（backlog：经营支线的目标值最大最显眼）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  it('进度和目标都有千分位', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ id: 2021, target: 1_000_000, progress: 123_456 })]),
    );
    const w = await mountView();
    expect(w.get('[data-testid="task-2021"]').text()).toContain('123,456/1,000,000');
  });
});

describe('任务名里的 {n} 按区服数值代入（515 支线扩充 B 遗留：原来写死）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.activation).mockResolvedValue(act());
  });

  it('目录里的翻译和服务端给的名字都代入，数字带千分位', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ id: 2021, name: '一道题持有满 {n} 份', vars: { n: 1500 } })], {
        lines: [
          {
            id: 6,
            name: '神殿',
            quest: task({ id: 3125, name: '投喂克拉肯一次好感超过 {n}', vars: { n: 50 } }),
            lockedStar: null,
            doneCount: 4,
            total: 8,
          },
        ],
      }),
    );
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      data: {
        tasks: [{ id: 3125, name: 'Get more than {n} favor from the Kraken in one feeding' }],
        chapters: [],
        questLines: [],
        activation: [],
        tower: [],
        formulas: [],
        kujiThemes: [],
        proficiency: [],
        cookbooks: [],
      },
    });
    const main = await mountView();
    expect(main.get('[data-testid="task-2021"]').text()).toContain('一道题持有满 1,500 份');
    const side = await mountView('/?tab=side');
    expect(side.get('[data-testid="line-6"]').text()).toContain('Get more than 50 favor');
    expect(side.text()).not.toContain('{n}');
  });

  it('不带 ?tab 时打开“今日”：签到和活跃在这里（界面改版 P2b）', async () => {
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task()]));
    const w = await mountView('/');
    expect(w.get('[data-testid="tab-today"]').attributes('aria-selected')).toBe('true');
    expect(w.find('[data-testid="signin"]').exists()).toBe(true);
    expect(w.find('[data-testid="card-main"]').exists()).toBe(false);
    await w.get('[data-testid="tab-main"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="card-activation"]').exists()).toBe(false);
    expect(w.find('[data-testid="card-main"]').exists()).toBe(true);
  });

  it('任务还没读回来时是骨架行（界面改版 P3）', async () => {
    vi.mocked(endpoints.tasks).mockReturnValue(new Promise(() => undefined));
    const w = await mountView('/?tab=main');
    expect(w.find('[data-testid="tasks-skeleton"]').exists()).toBe(true);
  });
});
