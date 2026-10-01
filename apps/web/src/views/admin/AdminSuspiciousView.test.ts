import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminSuspiciousView from './AdminSuspiciousView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    suspiciousBar: vi.fn(),
    suspiciousSurge: vi.fn(),
    suspiciousMulti: vi.fn(),
    suspiciousRedeem: vi.fn(),
  },
}));

const who = { restId: 3, restName: '可疑店', accountId: 9, username: 'sus' };

async function mountView() {
  useAdminStore().me = { accountId: 1, username: 'boss', role: 'mod' };
  useAdminStore().shardId = 1;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(AdminSuspiciousView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('AdminSuspiciousView（子项目 6B-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.suspiciousBar).mockResolvedValue([
      { ...who, perfectSum: 9, perfectMax: 5, bullSum: 0, bullMax: 0, flagged: true },
    ]);
    vi.mocked(adminApi.suspiciousSurge).mockResolvedValue({
      day: '2026-09-30',
      coin: [{ ...who, net: 1_000_000, topSources: [{ source: 'tower.challenge', delta: 1_000_000 }] }],
      diamond: [],
      exp: [],
    });
    vi.mocked(adminApi.suspiciousMulti).mockResolvedValue([
      {
        kind: 'ip',
        key: '10.0.0.1',
        accounts: [1, 2, 3].map((i) => ({
          accountId: i,
          username: `u${i}`,
          restId: i,
          restName: `店${i}`,
          lastSeen: '2026-10-01T00:00:00.000Z',
        })),
      },
    ]);
    vi.mocked(adminApi.suspiciousRedeem).mockResolvedValue([]);
  });

  it('默认看酒吧：超过门槛的标红，链接到玩家页；顶部写明只作提醒', async () => {
    const w = await mountView();
    expect(adminApi.suspiciousBar).toHaveBeenCalledWith(1);
    expect(w.text()).toContain('只作提醒');
    const row = w.find('[data-testid="sus-bar-3"]');
    expect(row.classes()).toContain('table-danger');
    expect(row.find('a').attributes('href')).toBe('/admin/players/9');
  });

  it('资源暴涨：可选日期，显示来源', async () => {
    const w = await mountView();
    await w.find('[data-testid="sus-tab-surge"]').trigger('click');
    await flushPromises();
    expect(adminApi.suspiciousSurge).toHaveBeenCalledWith(1, undefined);
    expect(w.text()).toContain('tower.challenge +1,000,000');
    await w.find('[data-testid="sus-day"]').setValue('2026-09-29');
    await flushPromises();
    expect(adminApi.suspiciousSurge).toHaveBeenLastCalledWith(1, '2026-09-29');
  });

  it('多号：按 IP 分组列出账号', async () => {
    const w = await mountView();
    await w.find('[data-testid="sus-tab-multi"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('同一 IP：10.0.0.1');
    expect(w.findAll('[data-testid="sus-multi-account"]')).toHaveLength(3);
  });
});
