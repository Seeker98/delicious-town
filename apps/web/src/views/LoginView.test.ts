import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import LoginView from './LoginView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { login: vi.fn(), publicAnnouncements: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: LoginView }],
  });
  await router.push('/login');
  const w = mount(LoginView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('登录页显示全部区服的公告（停服维护通知用，子项目 6A）', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockResolvedValue({
      items: [
        {
          id: 1,
          title: '今晚停服维护',
          body: '2 点到 3 点',
          important: true,
          startsAt: '2026-10-01T00:00:00.000Z',
          endsAt: '2026-10-02T00:00:00.000Z',
          seen: true,
        },
      ],
    });
    const w = await mountView();
    expect(w.find('[data-testid="announce-banner"]').text()).toContain('今晚停服维护');
  });

  it('登录页底部有游戏资料入口，不用登录也能看（问题记录 142）', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockResolvedValue({ items: [] });
    const w = await mountView();
    const a = w.get('[data-testid="login-wiki"]');
    expect(a.attributes('href')).toBe('/wiki');
    expect(a.text()).toBe('游戏资料 (Wiki)');
  });

  it('读公告失败时照常显示登录表单', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockRejectedValue(new Error('x'));
    const w = await mountView();
    expect(w.find('[data-testid="announce-banner"]').exists()).toBe(false);
    expect(w.text()).toContain('登录美味小镇');
  });
});
