import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import BottomNav from './BottomNav.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { friendRequests: vi.fn() } }));

const mountNav = () =>
  mount(BottomNav, {
    global: {
      plugins: [
        createRouter({
          history: createMemoryHistory(),
          routes: [{ path: '/:p(.*)*', component: BottomNav }],
        }),
      ],
    },
  });

describe('BottomNav', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('有待处理的好友申请时"好友"上显示红点', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([
      { id: 2, name: '乙', level: 1, star: 0, avatar: null, npc: false, at: '2026-09-30T00:00:00Z' },
    ]);
    const w = mountNav();
    await flushPromises();
    expect(w.text()).toContain('好友');
    expect(w.find('[data-testid="friend-dot"]').exists()).toBe(true);
  });

  it('没有申请时不显示', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
    const w = mountNav();
    await flushPromises();
    expect(w.find('[data-testid="friend-dot"]').exists()).toBe(false);
  });
});
