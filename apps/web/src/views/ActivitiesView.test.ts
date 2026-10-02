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
    activityExchange: vi.fn(),
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
  exchangeUntil: null,
  coop: null,
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

describe('ActivitiesView 兑换活动', () => {
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
  const ex = (patch: Record<string, unknown> = {}) => ({
    ...base,
    id: 11,
    kind: 'exchange',
    def: {
      currencies: [{ name: '福' }, { name: '禄' }],
      drops: [{ key: 'market.buy', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [
        {
          cost: [
            { currency: 0, num: 2 },
            { currency: 1, num: 1 },
          ],
          award: { coin: 10 },
          limit: 3,
        },
      ],
      graceHours: 24,
    },
    counters: { m0: 5, m1: 0, x0: 1 },
    today: { d0: 3 },
    rewards: [],
    claimable: 0,
    exchangeUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...patch,
  });
  it('显示余额、掉落规则和兑换表；余额不够时按钮禁用', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [ex() as never], level: 10 });
    const w = mount(ActivitiesView);
    await flushPromises();
    const card = w.find('[data-testid="activity-11"]');
    expect(card.find('[data-testid="balance-11"]').text()).toContain('福 5');
    expect(card.find('[data-testid="balance-11"]').text()).toContain('禄 0');
    expect(card.text()).toContain('菜场买菜');
    expect(card.text()).toContain('5%');
    expect(card.text()).toContain('1/3');
    expect(card.find('[data-testid="exchange-11-0"]').attributes('disabled')).toBeDefined();
  });
  it('余额够时可以兑换，兑换后重新读取', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [ex({ counters: { m0: 5, m1: 2, x0: 1 } }) as never],
      level: 10,
    });
    vi.mocked(endpoints.activityExchange).mockResolvedValue({
      index: 0,
      times: 1,
      items: { coin: 10 },
    } as never);
    const w = mount(ActivitiesView);
    await flushPromises();
    await w.find('[data-testid="exchange-11-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.activityExchange).toHaveBeenCalledWith(11, 0, 1);
    expect(endpoints.activities).toHaveBeenCalledTimes(2);
  });
  it('结束后在兑换期内显示剩余时间', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [
        ex({
          state: 'ended',
          exchangeUntil: new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString(),
        }) as never,
      ],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('兑换期，还剩 5 小时');
    expect(w.text()).not.toContain('未领的奖励');
  });
});

describe('终审 I1：兑换次数输入无效时按钮禁用', () => {
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
  const rich = {
    ...base,
    id: 12,
    kind: 'exchange',
    def: {
      currencies: [{ name: '福' }],
      drops: [{ key: 'market.buy', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [{ cost: [{ currency: 0, num: 1 }], award: { coin: 10 }, limit: 5 }],
      graceHours: 24,
    },
    counters: { m0: 100, x0: 0 },
    today: {},
    rewards: [],
    claimable: 0,
    exchangeUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  };
  it('清空、0、小数、超过剩余次数都禁用；有效时按填的次数兑换', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [rich as never], level: 10 });
    vi.mocked(endpoints.activityExchange).mockResolvedValue({
      index: 0,
      times: 2,
      items: { coin: 20 },
    } as never);
    const w = mount(ActivitiesView);
    await flushPromises();
    const input = w.find('[data-testid="times-12-0"]');
    const btn = () => w.find('[data-testid="exchange-12-0"]');
    for (const v of ['', '0', '1.5', '6']) {
      await input.setValue(v);
      expect(btn().attributes('disabled'), `times=${v}`).toBeDefined();
    }
    await input.setValue('2');
    expect(btn().attributes('disabled')).toBeUndefined();
    await btn().trigger('click');
    await flushPromises();
    expect(endpoints.activityExchange).toHaveBeenCalledWith(12, 0, 2);
  });
});

describe('问题记录 224：兑换卡片说明活动货币不进仓库', () => {
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
  it('余额下面有说明', async () => {
    const a = {
      ...base,
      id: 13,
      kind: 'exchange',
      def: {
        currencies: [{ name: '马勋章' }],
        drops: [{ key: 'market.buy', chance: 0.2, currency: 0, num: 1, dailyCap: 10 }],
        shop: [{ cost: [{ currency: 0, num: 1 }], award: { coin: 1 }, limit: 10 }],
        graceHours: 24,
      },
      counters: { m0: 10 },
      today: {},
      rewards: [],
      claimable: 0,
      exchangeUntil: new Date(Date.now() + 86_400_000).toISOString(),
    };
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [a as never], level: 10 });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.find('[data-testid="activity-13"]').text()).toContain('活动货币不进仓库');
  });
});

describe('ActivitiesView 全服合力（148-3）', () => {
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
  const co = (patch: Record<string, unknown> = {}) => ({
    ...base,
    id: 21,
    kind: 'coop',
    def: {
      rules: [{ key: 'market.buy', points: 10, dailyCap: 50 }],
      milestones: [
        { target: 100, minContribution: 0, award: { coin: 1 } },
        { target: 1000, minContribution: 0, award: { coin: 2 } },
        { target: 2000, minContribution: 300, award: { coin: 3 } },
      ],
      ranks: [
        { from: 1, to: 1, award: { diamond: 5 } },
        { from: 2, to: 3, award: { diamond: 1 } },
      ],
    },
    counters: { points: 200 },
    today: { 'market.buy': 30 },
    rewards: [
      { key: 's0', award: { coin: 1 }, reached: true, claimed: null },
      { key: 's1', award: { coin: 2 }, reached: false, claimed: null },
      { key: 's2', award: { coin: 3 }, reached: false, claimed: null },
    ],
    claimable: 1,
    coop: {
      pool: 550,
      top: [
        { rank: 1, restId: 9, name: '甲餐厅', points: 300, mine: false },
        { rank: 2, restId: 7, name: '我的店', points: 200, mine: true },
      ],
      myRank: 2,
    },
    ...patch,
  });
  const text = (w: ReturnType<typeof mount>, id: string) =>
    w.find(`[data-testid="${id}"]`).text().replace(/\s+/g, ' ');

  it('总分、贡献、名次、进度、还差多少、名次段奖励、前 10 名里自己加粗', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [co() as never], level: 10 });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(text(w, 'coop-head-21')).toBe('全服 550 分 · 我的贡献 200 分 · 第 2 名');
    expect(w.find('[data-testid="coop-bar-21"]').attributes('style')).toContain('width: 50%');
    expect(text(w, 'coop-hint-21-1')).toBe('全服还差 450 分');
    expect(w.find('[data-testid="coop-hint-21-0"]').exists()).toBe(false);
    expect(w.find('[data-testid="activity-21"]').text()).toContain('第 2~3 名：钻石 1');
    expect(w.find('[data-testid="claim-21-s0"]').exists()).toBe(true);
    const rows = w.findAll('[data-testid="coop-top-21"] tr');
    expect(rows[1]!.classes()).toContain('fw-bold');
    expect(rows[0]!.classes()).not.toContain('fw-bold');
  });

  it('全服已达成、个人贡献不够时提示个人还差；全部达成时满格', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [co({ coop: { pool: 2500, top: [], myRank: 3 } }) as never],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(text(w, 'coop-hint-21-2')).toBe('个人贡献还差 100 分');
    expect(w.find('[data-testid="coop-bar-21"]').attributes('style')).toContain('width: 100%');
    expect(w.text()).toContain('全部里程碑已达成');
  });

  it('结束后显示贡献榜已结算', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [co({ state: 'ended', claimable: 0 }) as never],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('贡献榜已结算，奖励已发邮件');
  });
});
