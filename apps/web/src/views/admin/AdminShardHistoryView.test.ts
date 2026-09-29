import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminShardHistoryView from './AdminShardHistoryView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { history: vi.fn(), rollback: vi.fn() } }));

describe('AdminShardHistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('列出版本和改动路径；管理员可以回滚旧版本', async () => {
    useAdminStore().me = { accountId: 1, username: 'x', role: 'admin' };
    vi.mocked(adminApi.history).mockResolvedValue([
      {
        version: 2,
        override: {},
        actor: 'boss',
        note: '恢复',
        changed: ['tuning.settlement.expMultiplier'],
        at: '2026-09-30T00:00:00.000Z',
      },
      {
        version: 1,
        override: {},
        actor: 'boss',
        note: '加速',
        changed: ['tuning.settlement.expMultiplier'],
        at: '2026-09-29T00:00:00.000Z',
      },
    ]);
    vi.mocked(adminApi.rollback).mockResolvedValue({ version: 3 });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('回到加速');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/shards/:id/history', component: AdminShardHistoryView },
        { path: '/:p(.*)*', component: { template: '<p/>' } },
      ],
    });
    await router.push('/admin/shards/1/history');
    const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain('tuning.settlement.expMultiplier');
    expect(w.find('[data-testid="rollback-2"]').exists()).toBe(false);
    await w.find('[data-testid="rollback-1"]').trigger('click');
    await flushPromises();
    expect(adminApi.rollback).toHaveBeenCalledWith(1, { version: 1, note: '回到加速' });
    prompt.mockRestore();
  });
});
