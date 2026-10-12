import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import AdminPlayersView from './AdminPlayersView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { searchPlayers: vi.fn() } }));

describe('AdminPlayersView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('搜索后列出玩家和餐厅，链接到详情', async () => {
    vi.mocked(adminApi.searchPlayers).mockResolvedValue([
      {
        accountId: 7,
        username: 'alice',
        email: 'a@x',
        role: 'player',
        banned: true,
        emailVerified: false,
        bannedUntil: '2026-10-15T00:00:00.000Z',
        createdAt: '2026-10-03T02:00:00.000Z',
        restaurants: [
          { id: 3, shardId: 1, shardName: '一服', name: '爱丽丝店', level: 12, star: 1, state: 1 },
        ],
      },
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: AdminPlayersView }],
    });
    const w = mount(AdminPlayersView, { global: { plugins: [router] } });
    await w.find('[data-testid="player-q"]').setValue('ali');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.searchPlayers).toHaveBeenCalledWith('ali');
    expect(w.text()).toContain('爱丽丝店');
    expect(w.text()).toContain('#3');
    expect(w.text()).toContain('封号到 10/15');
    expect(w.text()).toContain('没验证');
    expect(w.text()).toContain('2026/10/03');
    expect(w.find('a[href="/admin/players/7"]').exists()).toBe(true);
  });
});
