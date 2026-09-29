import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
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
});
