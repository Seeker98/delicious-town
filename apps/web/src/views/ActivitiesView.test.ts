import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import ActivitiesView from './ActivitiesView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    activities: vi.fn(),
    activityClaim: vi.fn(),
    activityClaimAll: vi.fn(),
    activityUnlock: vi.fn(),
  },
}));

const base = {
  title: '国庆',
  body: '说明',
  startsAt: '2026-10-01T00:00:00Z',
  endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
  minLevel: 1,
  state: 'running' as const,
  today: {},
  premium: false,
};
const goals: ActivityDto = {
  ...base,
  id: 1,
  kind: 'goals',
  def: {
    goals: [
      { key: 'signin', target: 3, award: { coin: 10 } },
      { key: 'signin', target: 5, award: { coin: 50 } },
    ],
  },
  counters: { signin: 3 },
  rewards: [
    { key: 'g0', award: { coin: 10 }, reached: true, claimed: null },
    { key: 'g1', award: { coin: 50 }, reached: false, claimed: null },
  ],
  claimable: 1,
};
const cells = Array.from({ length: 9 }, (_, i) => ({ key: 'market.buy', target: i + 1, award: { coin: 1 } }));
const grid: ActivityDto = {
  ...base,
  id: 2,
  kind: 'grid',
  def: { size: 3, cells, lineAward: { coin: 100 }, fullAward: { coin: 1000 } },
  counters: { 'market.buy': 3 },
  rewards: [
    ...cells.map((c, i) => ({ key: `c${i}`, award: c.award, reached: i < 3, claimed: null })),
    { key: 'r0', award: { coin: 100 }, reached: true, claimed: null },
    { key: 'full', award: { coin: 1000 }, reached: false, claimed: null },
  ],
  claimable: 4,
};
const pass: ActivityDto = {
  ...base,
  id: 3,
  kind: 'pass',
  def: {
    rules: [{ key: 'market.buy', points: 5, dailyCap: 20 }],
    levels: [{ points: 10, free: { coin: 1 }, premium: { coin: 9 } }],
    unlock: { diamond: 100 },
  },
  counters: { points: 12 },
  today: { 'market.buy': 8 },
  rewards: [
    { key: 'f0', award: { coin: 1 }, reached: true, claimed: null },
    { key: 'p0', award: { coin: 9 }, reached: false, claimed: null },
  ],
  claimable: 1,
};

describe('ActivitiesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [goals, grid, pass], level: 10 });
    vi.mocked(endpoints.activityClaim).mockResolvedValue({ keys: ['g0'], items: [{ coin: 10 }] } as never);
    vi.mocked(endpoints.activityClaimAll).mockResolvedValue({ keys: ['g0'], items: [{ coin: 10 }] } as never);
    vi.mocked(endpoints.activityUnlock).mockResolvedValue({ premium: true } as never);
  });

  it('目标清单：签到徽标、进度、剩余时间；领取后重新读取', async () => {
    const w = mount(ActivitiesView);
    await flushPromises();
    const card = w.find('[data-testid="activity-1"]');
    expect(card.text()).toContain('签到');
    expect(card.text()).toContain('3/3');
    expect(card.text()).toContain('还剩 2 天');
    await card.find('[data-testid="claim-1-g0"]').trigger('click');
    await flushPromises();
    expect(endpoints.activityClaim).toHaveBeenCalledWith(1, 'g0');
    expect(endpoints.activities).toHaveBeenCalledTimes(2);
  });

  it('九宫格：画成 3×3，完成的格子和线有标记', async () => {
    const w = mount(ActivitiesView);
    await flushPromises();
    const cellsEl = w.findAll('[data-testid^="cell-2-"]');
    expect(cellsEl).toHaveLength(9);
    expect(cellsEl[0]!.classes()).toContain('dt-cell-done');
    expect(cellsEl[4]!.classes()).not.toContain('dt-cell-done');
    expect(w.find('[data-testid="claim-2-r0"]').exists()).toBe(true);
  });

  it('战令：显示积分和今日积分；解锁先确认', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(ActivitiesView);
    await flushPromises();
    const card = w.find('[data-testid="activity-3"]');
    expect(card.text()).toContain('积分 12');
    expect(card.text()).toContain('8/20');
    await card.find('[data-testid="unlock-3"]').trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalled();
    expect(endpoints.activityUnlock).toHaveBeenCalledWith(3);
  });

  it('结算中的活动不显示领取按钮，写明会发到邮箱；全部领取', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [{ ...goals, state: 'settling', claimable: 0 }],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('未领的奖励会发到邮箱');
    expect(w.find('[data-testid="claim-1-g0"]').exists()).toBe(false);
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [goals], level: 10 });
    const w2 = mount(ActivitiesView);
    await flushPromises();
    await w2.find('[data-testid="claim-all-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.activityClaimAll).toHaveBeenCalledWith(1);
  });

  it('等级不够时提示达到后才计数', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [{ ...goals, minLevel: 20 }], level: 10 });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('需要 20 级');
  });
});

describe('ActivitiesView 全服加成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
  });
  it('列出加成项和剩余时间，没有领取按钮', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [
        {
          ...base,
          id: 8,
          kind: 'boost',
          def: {
            items: [
              { key: 'exp', factor: 2 },
              { key: 'marketPrice', factor: 0.8 },
            ],
          },
          counters: {},
          rewards: [],
          claimable: 0,
        },
      ],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    const card = w.find('[data-testid="activity-8"]');
    expect(card.find('[data-testid="boost-8"]').text()).toContain('经营经验 ×2、菜场价格 ×0.8');
    expect(card.text()).toContain('还剩 2 天');
    expect(card.find('button').exists()).toBe(false);
    expect(card.find('table').exists()).toBe(false);
  });
});

describe('终审 I1：全服加成不显示等级门槛', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
  });
  it('旧数据里最低等级不是 1 的全服加成，也不提示"需要 N 级"', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [
        {
          ...base,
          id: 9,
          minLevel: 30,
          kind: 'boost',
          def: { items: [{ key: 'exp', factor: 2 }] },
          counters: {},
          rewards: [],
          claimable: 0,
        },
      ],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).not.toContain('需要 30 级');
  });
});
