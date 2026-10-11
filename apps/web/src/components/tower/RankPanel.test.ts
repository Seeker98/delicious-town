import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useSessionStore } from '../../stores/session';
import RankPanel from './RankPanel.vue';
import { duelResult, rankData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { rankOccupy: vi.fn(), rankChallenge: vi.fn() },
}));

const withSlots = (taken: Array<[number, number, string]>) =>
  rankData({
    slots: rankData().slots.map((s) => {
      const hit = taken.find(([r]) => r === s.rank);
      return hit ? { rank: s.rank, restId: hit[1], name: hit[2], level: 30 } : s;
    }),
  });

/** 数据由 TowerView 读好传进来（界面改版 P9）；换榜规则和对决结果的面板用 Teleport，测试里桩掉 */
const mountPanel = (data: RankDto) =>
  mount(RankPanel, { props: { data }, global: { stubs: { teleport: true } } });

describe('RankPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 1,
      lang: null,
      npcRestId: null,
    };
    vi.mocked(endpoints.rankOccupy).mockResolvedValue({ rank: 15 });
    vi.mocked(endpoints.rankChallenge).mockResolvedValue(duelResult({ renown: 2, rank: 10 }));
  });

  it('空位可以占；占完刷新', async () => {
    const w = mountPanel(rankData());
    expect(w.find('[data-testid="my-rank"]').text()).toBe('未上榜');
    await w.find('[data-testid="occupy-15"]').trigger('click');
    await flushPromises();
    expect(endpoints.rankOccupy).toHaveBeenCalledWith(15);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('前 8 名不在范围内时灰掉并写明原因；第 10 名可以挑战，显示结果', async () => {
    const w = mountPanel(
      withSlots([
        [1, 5, '甲店'],
        [10, 6, '乙店'],
      ]),
    );
    expect(w.find('[data-testid="rc-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-1"]').text()).toContain('前 8 名要在榜上、名次相差 3 以内才能挑战');
    expect(w.find('[data-testid="occupy-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="rc-10"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="rc-10"]').trigger('click');
    await flushPromises();
    expect(endpoints.rankChallenge).toHaveBeenCalledWith(10);
    expect(w.emitted('reload')).toHaveLength(1);
    // 结果从下面弹出：比分标题，声望和新名次是标签
    expect(w.get('.dt-sheet-title').text()).toBe('对决结果');
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了 3:1');
    expect(w.findAll('.dt-duel-tags .dt-tag').map((x) => x.text())).toEqual(['声望 +2', '现在第 10 名']);
  });

  it('自己的格子标"我"，排在我后面的不能挑战', async () => {
    const w = mountPanel({
      ...withSlots([
        [3, 1, '我的店'],
        [5, 7, '丙店'],
      ]),
      myRank: 3,
    });
    expect(w.find('[data-testid="my-rank"]').text()).toBe('第 3 名');
    expect(w.get('[data-testid="slot-3"] .dt-tag').text()).toBe('我');
    expect(w.find('[data-testid="slot-5"] .dt-tag').exists()).toBe(false);
    expect(w.find('[data-testid="rc-3"]').exists()).toBe(false);
    expect(w.find('[data-testid="rc-5"]').exists()).toBe(false);
    expect(w.find('[data-testid="occupy-7"]').exists()).toBe(false);
    expect(w.find('[data-testid="occupy-2"]').exists()).toBe(true);
  });

  it('换榜规则一行，点开看名次礼包', async () => {
    const w = mountPanel(rankData());
    expect(w.find('.dt-sheet').exists()).toBe(false);
    await w.get('[data-testid="rank-weekly"]').trigger('click');
    expect(w.get('.dt-sheet-title').text()).toBe('每周一 0 点换新榜');
    expect(w.get('.dt-sheet').findAll('li')).toHaveLength(3);
  });

  it('赛厨规则按赛厨榜接口给的评委数写（backlog 396 审查）', async () => {
    const w = mountPanel(rankData({ duelJudges: 3 }));
    expect(w.get('[data-testid="duel-rules"]').text()).toContain('3 位评委投票');
    await w.get('[data-testid="duel-rules"]').trigger('click');
    expect(w.get('[data-testid="duel-rules-body"]').text()).toContain('随机请 3 位');
  });
});
