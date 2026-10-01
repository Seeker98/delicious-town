import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { newsTime } from '../../utils/news';
import AdminStatsView from './AdminStatsView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { economy: vi.fn(), distribution: vi.fn(), settlementRounds: vi.fn() },
}));

describe('AdminStatsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('经济按来源画线，分布画柱', async () => {
    useAdminStore().shardId = 1;
    vi.mocked(adminApi.economy).mockResolvedValue([
      { day: '2026-09-29', kind: 'coin', source: 'settlement', amount: 100 },
      { day: '2026-09-30', kind: 'coin', source: 'settlement', amount: 120 },
      { day: '2026-09-30', kind: 'coin', source: 'market.buy', amount: -80 },
      { day: '2026-09-30', kind: 'exp', source: 'settlement', amount: 50 },
    ]);
    vi.mocked(adminApi.distribution).mockResolvedValue({
      open: 2,
      closed: 1,
      levels: [
        { from: 1, to: 9, count: 2 },
        { from: 10, to: 19, count: 1 },
      ],
      stars: [{ star: 0, count: 3 }],
      cookbooks: [{ from: 0, to: 19, count: 3 }],
    });
    vi.mocked(adminApi.settlementRounds).mockResolvedValue([]);
    const w = mount(AdminStatsView);
    await flushPromises();
    const eco = w.find('[data-testid="economy-chart"]');
    expect(eco.findAll('[data-testid="series"]')).toHaveLength(2);
    expect(w.find('[data-testid="levels-chart"]').findAll('[data-testid="bar"]')).toHaveLength(2);
  });

  it('结算耗时图横轴写结算时间而不是轮号，并说明横纵轴（问题记录 124）', async () => {
    useAdminStore().shardId = 1;
    vi.mocked(adminApi.economy).mockResolvedValue([]);
    vi.mocked(adminApi.distribution).mockResolvedValue({
      open: 0,
      closed: 0,
      levels: [],
      stars: [],
      cookbooks: [],
    });
    const round = (n: number, at: string, ms: number) => ({
      round: n,
      at,
      ms,
      settled: 3,
      closed: 0,
      failed: 0,
    });
    vi.mocked(adminApi.settlementRounds).mockResolvedValue([
      round(7461900, '2026-10-01T04:00:00.000Z', 120),
      round(7461901, '2026-10-01T04:04:00.000Z', 3100),
    ]);
    const w = mount(AdminStatsView);
    await flushPromises();
    const chart = w.find('[data-testid="rounds-chart"]');
    expect(chart.text()).not.toContain('7461900');
    expect(chart.text()).toContain(newsTime('2026-10-01T04:00:00.000Z'));
    expect(chart.text()).toContain(newsTime('2026-10-01T04:04:00.000Z'));
    expect(w.find('[data-testid="rounds-axis"]').text()).toContain('毫秒');
  });
});
