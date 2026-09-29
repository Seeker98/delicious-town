import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import AdminLayout from './AdminLayout.vue';

vi.mock('../../api/admin', () => ({ adminApi: { me: vi.fn(), shards: vi.fn() } }));

const mountAt = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin',
        component: AdminLayout,
        children: [{ path: '', component: { template: '<p>子页面</p>' } }],
      },
    ],
  });
  await router.push('/admin');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有权限时显示"页面不存在"', async () => {
    vi.mocked(adminApi.me).mockRejectedValue(new Error('404'));
    const w = await mountAt();
    expect(w.find('[data-testid="admin-404"]').exists()).toBe(true);
    expect(w.text()).not.toContain('子页面');
  });

  it('有权限时显示导航、区服选择和子页面', async () => {
    vi.mocked(adminApi.me).mockResolvedValue({ accountId: 1, username: 'boss', role: 'admin' });
    vi.mocked(adminApi.shards).mockResolvedValue([{ id: 1, name: '一服', status: 'open', restaurants: 3 }]);
    const w = await mountAt();
    expect(w.find('[data-testid="admin-who"]').text()).toContain('boss');
    expect(w.find('[data-testid="admin-shard"]').text()).toContain('一服');
    expect(w.text()).toContain('子页面');
  });
});
