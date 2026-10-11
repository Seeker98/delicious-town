import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useRestaurantStore } from '../../stores/restaurant';
import { useSessionStore } from '../../stores/session';
import { shortNum } from '../../utils/format';
import RankPanel from './RankPanel.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { rank: vi.fn() } }));

const board = (patch: Partial<LeaderboardDto> = {}): LeaderboardDto => ({
  key: 'income.coin.today',
  rows: [
    { rank: 1, restId: 3, name: '老李', avatar: 2, value: 123_456_789 },
    { rank: 2, restId: 7, name: '我的店', avatar: null, value: 45_678 },
    { rank: 2, restId: 9, name: '小张', avatar: null, value: 45_678 },
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
    const w = mount(RankPanel, { global: { stubs: { RouterLink: RouterLinkStub } } });
    await flushPromises();
    expect(endpoints.rank).toHaveBeenCalledWith('income.coin.today');
    const rows = w.findAll('[data-testid^="rank-row-"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain('1.23亿');
    // 界面改版 P10：名次圆章前三金银铜；自己那一行 .is-me
    expect(rows[0]!.find('.dt-medal').classes()).toContain('is-1');
    expect(w.find('[data-testid="rank-row-7"]').classes()).toContain('is-me');
    expect(w.find('[data-testid="rank-row-3"]').classes()).not.toContain('is-me');
    // 一行整行是链接：别人的店去访问页，自己的回首页
    const to = (id: number) =>
      w
        .findAllComponents(RouterLinkStub)
        .find((l) => l.attributes('data-testid') === `rank-row-${id}`)!
        .props('to');
    expect(to(3)).toBe('/friends/3');
    expect(to(7)).toBe('/');
    expect(w.find('[data-testid="rank-me"]').exists()).toBe(false);
  });

  it('最后列出能在原地操作的榜，区服关掉的功能不列（界面改版 P10）', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue(board());
    const w = mount(RankPanel, { global: { stubs: { RouterLink: RouterLinkStub } } });
    await flushPromises();
    expect(w.findAll('[data-testid^="rank-elsewhere-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'rank-elsewhere-tower',
      'rank-elsewhere-acquire',
      'rank-elsewhere-temple',
    ]);
    expect(w.get('[data-testid="rank-elsewhere-tower"]').text()).toContain('厨塔 · 赛厨榜');
    useRestaurantStore().rest = { disabledFeatures: ['temple'] } as never;
    await flushPromises();
    expect(w.find('[data-testid="rank-elsewhere-temple"]').exists()).toBe(false);
  });

  it('我不在前列时底部单独显示；打赏大类显示奖励说明', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue(
      board({
        key: 'hiphop.week',
        rows: board().rows.filter((r) => r.restId !== 7),
        me: { rank: 53, value: 10 },
      }),
    );
    useRestaurantStore().rest = { name: '我的店', disabledFeatures: [] } as never;
    const w = mount(RankPanel, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    await w.find('[data-testid="rank-group-打赏"]').trigger('click');
    await flushPromises();
    expect(endpoints.rank).toHaveBeenLastCalledWith('hiphop.week');
    expect(w.find('[data-testid="rank-reward"]').text()).toContain('工作证');
    // 界面改版 P10：底部吸住一条：名次圆章、“我 · 店名”、没进前几、数值
    const me = w.get('[data-testid="rank-me"]');
    expect(me.get('.dt-medal').text()).toBe('53');
    expect(me.text()).toContain('我 · 我的店');
    expect(me.text()).toContain('没进前 2');
    expect(me.get('.dt-rank-value').text()).toBe('10');
  });

  it('shortNum：亿、万缩写', () => {
    expect(shortNum(123_456_789)).toBe('1.23亿');
    expect(shortNum(45_678)).toBe('4.6万');
    expect(shortNum(9_999)).toBe('9,999');
  });

  it('厨力榜写"每 10 分钟更新"，其他榜每分钟（PR29 遗留）', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue(board());
    const w = mount(RankPanel, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    expect(w.find('[data-testid="rank-meta"]').text()).toContain('每分钟更新');
    await w.find('[data-testid="rank-group-厨力"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="rank-meta"]').text()).toContain('每 10 分钟更新');
  });

  it('子榜是下拉框（界面改版 P2b：分区不超过两层）；选另一个子榜会重读', async () => {
    vi.mocked(endpoints.rank).mockResolvedValue(board());
    const w = mount(RankPanel, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    const sel = w.get('[data-testid="rank-board-select"]');
    const opts = sel.findAll('option');
    expect(opts.map((o) => o.attributes('value'))).toEqual([
      'income.coin.today',
      'income.coin.round',
      'income.coin.yesterday',
      'income.exp.today',
      'income.exp.round',
      'income.exp.yesterday',
    ]);
    expect(opts[0]!.text()).toBe('银币今日');
    await sel.setValue('income.exp.today');
    await flushPromises();
    expect(endpoints.rank).toHaveBeenLastCalledWith('income.exp.today');
    // 只有一个子榜的大类不出下拉框
    await w.find('[data-testid="rank-group-等级"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="rank-board-select"]').exists()).toBe(false);
  });
});
