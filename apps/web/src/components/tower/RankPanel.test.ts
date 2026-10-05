import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useSessionStore } from '../../stores/session';
import RankPanel from './RankPanel.vue';
import { duelResult, rankData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { towerRank: vi.fn(), rankOccupy: vi.fn(), rankChallenge: vi.fn() },
}));

const withSlots = (taken: Array<[number, number, string]>) =>
  rankData({
    slots: rankData().slots.map((s) => {
      const hit = taken.find(([r]) => r === s.rank);
      return hit ? { rank: s.rank, restId: hit[1], name: hit[2], level: 30 } : s;
    }),
  });

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
    };
    vi.mocked(endpoints.rankOccupy).mockResolvedValue({ rank: 15 });
    vi.mocked(endpoints.rankChallenge).mockResolvedValue(duelResult({ renown: 2, rank: 10 }));
  });

  it('空位可以占；占完刷新', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue(rankData());
    const w = mount(RankPanel);
    await flushPromises();
    expect(w.find('[data-testid="my-rank"]').text()).toBe('未上榜');
    await w.find('[data-testid="occupy-15"]').trigger('click');
    await flushPromises();
    expect(endpoints.rankOccupy).toHaveBeenCalledWith(15);
    expect(endpoints.towerRank).toHaveBeenCalledTimes(2);
  });

  it('前 8 名不在范围内时灰掉并写明原因；第 10 名可以挑战，显示结果', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue(
      withSlots([
        [1, 5, '甲店'],
        [10, 6, '乙店'],
      ]),
    );
    const w = mount(RankPanel);
    await flushPromises();
    expect(w.find('[data-testid="rc-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-1"]').text()).toContain('前 8 名要在榜上、名次相差 3 以内才能挑战');
    expect(w.find('[data-testid="occupy-1"]').exists()).toBe(false);
    await w.find('[data-testid="rc-10"]').trigger('click');
    await flushPromises();
    expect(endpoints.rankChallenge).toHaveBeenCalledWith(10);
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了 3:1，声望 +2，你现在是第 10 名');
  });

  it('自己的格子标"我"，排在我后面的不能挑战', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue({
      ...withSlots([
        [3, 1, '我的店'],
        [5, 7, '丙店'],
      ]),
      myRank: 3,
    });
    const w = mount(RankPanel);
    await flushPromises();
    expect(w.find('[data-testid="slot-3"]').text()).toContain('我');
    expect(w.find('[data-testid="rc-5"]').exists()).toBe(false);
    expect(w.find('[data-testid="occupy-7"]').exists()).toBe(false);
    expect(w.find('[data-testid="occupy-2"]').exists()).toBe(true);
  });
});
