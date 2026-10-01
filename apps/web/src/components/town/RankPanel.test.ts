import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useSessionStore } from '../../stores/session';
import { shortNum } from '../../utils/format';
import RankPanel from './RankPanel.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { rank: vi.fn() } }));

const board = (patch: Partial<LeaderboardDto> = {}): LeaderboardDto => ({
  key: 'income.coin.today',
  rows: [
    { rank: 1, restId: 3, name: '老李', value: 123_456_789 },
    { rank: 2, restId: 7, name: '我的店', value: 45_678 },
    { rank: 2, restId: 9, name: '小张', value: 45_678 },
  ],
  me: { rank: 2, value: 45_678 },
  updatedAt: '2026-10-01T04:05:00.000Z',
  ...patch,
});

describe('RankPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    useSessionStore().$patch({ me: { restaurantId: 7 } } as never);
  });

  it('默认第一个大类第一个榜；自己那一行高亮；大数缩写', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue(board());
    const w = mount(RankPanel, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    expect(endpoints.rank).toHaveBeenCalledWith('income.coin.today');
    const rows = w.findAll('[data-testid^="rank-row-"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain('1.23亿');
    expect(w.find('[data-testid="rank-row-7"]').classes()).toContain('dt-item-me');
    expect(w.find('[data-testid="rank-me"]').exists()).toBe(false);
  });

  it('我不在前列时底部单独显示；打赏大类显示奖励说明', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue(
      board({
        key: 'hiphop.week',
        rows: board().rows.filter((r) => r.restId !== 7),
        me: { rank: 53, value: 10 },
      }),
    );
    const w = mount(RankPanel, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    await w.find('[data-testid="rank-group-打赏"]').trigger('click');
    await flushPromises();
    expect(endpoints.rank).toHaveBeenLastCalledWith('hiphop.week');
    expect(w.find('[data-testid="rank-reward"]').text()).toContain('工作证');
    expect(w.find('[data-testid="rank-me"]').text()).toBe('我：第 53 名 · 10');
  });

  it('shortNum：亿、万缩写', () => {
    expect(shortNum(123_456_789)).toBe('1.23亿');
    expect(shortNum(45_678)).toBe('4.6万');
    expect(shortNum(9_999)).toBe('9,999');
  });
});
