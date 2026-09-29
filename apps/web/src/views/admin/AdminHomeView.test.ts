import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminHomeView from './AdminHomeView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { economy: vi.fn(), settlementRounds: vi.fn() } }));

describe('AdminHomeView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('今日活跃、结算银币经验、最近一轮耗时', async () => {
    useAdminStore().shardId = 1;
    vi.mocked(adminApi.economy).mockResolvedValue([
      { day: 'd', kind: 'active', source: 'rest', amount: 12 },
      { day: 'd', kind: 'coin', source: 'settlement', amount: 34567 },
      { day: 'd', kind: 'exp', source: 'settlement', amount: 890 },
    ]);
    vi.mocked(adminApi.settlementRounds).mockResolvedValue([
      { round: 9, at: '2026-09-30T00:00:00.000Z', ms: 123, settled: 12, closed: 0, failed: 1 },
    ]);
    const w = mount(AdminHomeView);
    await flushPromises();
    expect(w.find('[data-testid="home-active"]').text()).toContain('12');
    expect(w.find('[data-testid="home-coin"]').text()).toContain('34,567');
    expect(w.find('[data-testid="home-round"]').text()).toContain('123');
    expect(w.find('[data-testid="home-round"]').text()).toContain('失败 1');
  });
});
