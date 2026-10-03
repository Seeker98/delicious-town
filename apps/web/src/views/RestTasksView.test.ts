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
  signInGift: 27,
  star: 1,
  items: [
    { id: 1, name: '签到', points: 10, limit: 1, count: 1, needStar: 0 },
    { id: 2, name: '打蟑螂', points: 1, limit: 12, count: 3, needStar: 0 },
    { id: 50, name: '配送外卖', points: 5, limit: 2, count: 0, needStar: 2 },
  ],
  rewards: [
    { points: 50, award: { exp: 500 }, claimed: true, multiplier: 1 },
    { points: 100, award: { diamond: 2 }, claimed: false, multiplier: 1 },
    { points: 150, award: { diamond: 5 }, claimed: false, multiplier: 1 },
  ],
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
  },
  main,
  allMainDone: false,
  lines: [],
  weekly: null,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: RestTasksView }],
  });
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

  it('任务名、活跃项名按目录取当前语言；目录里没有时用服务端给的（问题记录 272）', async () => {
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
    expect(w.get('[data-testid="act-1"]').text()).toContain('Check in');
    expect(w.get('[data-testid="act-2"]').text()).toContain('打蟑螂');
  });

  it('签到按钮', async () => {
    const w = await mountView();
    await w.find('[data-testid="signin"]').trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
  });

  it('活跃项：没做满的写进度排前面，星级不够的写几星开放，做满的标"✓ 已满"排后面（问题记录：灰色黑色分不清）', async () => {
    const w = await mountView();
    expect(w.findAll('[data-testid^="act-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'act-2',
      'act-50',
      'act-1',
    ]);
    expect(w.find('[data-testid="act-2"]').text()).toContain('3/12');
    expect(w.find('[data-testid="act-50"]').text()).toContain('🔒 2 星开放');
    expect(w.find('[data-testid="act-50"]').classes()).toContain('dt-act-locked');
    expect(w.find('[data-testid="act-1"]').text()).toContain('✓ 已满');
    expect(w.find('[data-testid="act-1"]').classes()).toContain('dt-act-done');
  });

  it('活跃奖励三种样子：已领、可以领（实心）、还差几点', async () => {
    const w = await mountView();
    const claimed = w.find('[data-testid="claim-50"]');
    expect(claimed.text()).toBe('✓ 已领 50 点');
    expect(claimed.attributes('disabled')).toBeDefined();
    const ready = w.find('[data-testid="claim-100"]');
    expect(ready.text()).toBe('领 100 点奖励');
    expect(ready.classes()).toContain('btn-success');
    expect(ready.attributes('disabled')).toBeUndefined();
    const far = w.find('[data-testid="claim-150"]');
    expect(far.text()).toBe('150 点（还差 30）');
    expect(far.attributes('disabled')).toBeDefined();
  });

  it('任务卡片：没完成时显示进度条、不放按钮；完成后绿边和领奖按钮', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="task-2021"]').find('.progress').exists()).toBe(true);
    expect(w.find('[data-testid="claim-task-2021"]').exists()).toBe(false);
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([task({ progress: 1, done: true })]));
    const done = await mountView();
    expect(done.find('[data-testid="task-2021"]').classes()).toContain('border-success');
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
    expect(w.get('[data-testid="chapter"]').text()).toContain('第 1 章 开张大吉（1/3）');
    expect(w.findAll('[data-testid^="task-20"]').map((x) => x.attributes('data-testid'))).toEqual([
      'task-2023',
      'task-2022',
      'task-2021',
    ]);
    expect(w.get('[data-testid="task-2021"]').text()).toContain('✓ 已领');
    expect(w.find('[data-testid="claim-chapter"]').attributes('disabled')).toBeDefined();
    // 没领完时不是绿色，写明还差几个（问题记录 318 试玩反馈：绿色按钮点不了像坏了）
    expect(w.get('[data-testid="claim-chapter"]').classes()).not.toContain('btn-success');
    expect(w.get('[data-testid="claim-chapter"]').text()).toBe('还差 2 个任务');
    vi.mocked(endpoints.tasks).mockResolvedValue(
      quests([task({ progress: 1, done: true, claimed: true })], {
        chapter: { ...quests([]).chapter!, claimable: true, total: 1, claimedCount: 1 },
      }),
    );
    const ready = await mountView();
    expect(ready.get('[data-testid="claim-chapter"]').classes()).toContain('btn-success');
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
    expect(w.get('[data-testid="line-1"]').text()).toContain('把 10 道食谱升到上品');
    expect(w.get('[data-testid="line-1"]').text()).toContain('0/6');
    expect(w.get('[data-testid="line-2"]').text()).toContain('🔒 2 星解锁');
    expect(w.find('[data-testid="claim-task-3042"]').exists()).toBe(false);
    expect(w.get('[data-testid="line-3"]').text()).toContain('已全部完成');
    vi.mocked(endpoints.tasks).mockResolvedValue(quests([], { chapter: null, allMainDone: true }));
    const done = await mountView();
    expect(done.text()).toContain('主线已全部完成');
  });
});
