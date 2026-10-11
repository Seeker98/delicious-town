import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { ApiError } from '../api/client';
import LoginView from './LoginView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { login: vi.fn(), publicAnnouncements: vi.fn(), setLang: vi.fn() },
}));

async function mountView(path = '/login') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: LoginView }],
  });
  await router.push(path);
  // 语言面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P11）
  const w = mount(LoginView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
}
/** 字段上面写标签（界面改版 P11）：按标签找到对应的输入框 */
const fieldOf = (w: Awaited<ReturnType<typeof mountView>>['w'], label: string) => {
  const l = w.findAll('label').find((x) => x.text() === label)!;
  return w.get(`#${l.attributes('for')}`);
};

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('登录页显示全部区服的公告（停服维护通知用，子项目 6A），公告在表单卡里', async () => {
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
    const { w } = await mountView();
    expect(w.get('.dt-auth-card [data-testid="announce-banner"]').text()).toContain('今晚停服维护');
  });

  it('没有顶栏：头图在最上面，右上是语言胶囊，点开语言面板', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockResolvedValue({ items: [] });
    const { w } = await mountView();
    expect(w.find('header').exists()).toBe(false);
    expect(w.find('[data-testid="auth-scene"]').exists()).toBe(true);
    const chip = w.get('[data-testid="lang-chip"]');
    expect(chip.text()).toContain('简体中文');
    expect(w.find('[data-testid="lang-en"]').exists()).toBe(false);
    await chip.trigger('click');
    expect(w.find('[data-testid="lang-en"]').exists()).toBe(true);
  });

  it('登录页底部有游戏资料、游玩指引两个胶囊，不用登录也能看（问题记录 142）', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockResolvedValue({ items: [] });
    const { w } = await mountView();
    const a = w.get('[data-testid="login-wiki"]');
    expect(a.attributes('href')).toBe('/wiki');
    expect(a.text()).toBe('游戏资料');
    expect(w.get('[data-testid="login-guide"]').attributes('href')).toBe('/guide');
  });

  it('读公告失败时照常显示登录表单：用户名、密码两格带标签', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockRejectedValue(new Error('x'));
    const { w } = await mountView();
    expect(w.find('[data-testid="announce-banner"]').exists()).toBe(false);
    expect(w.text()).toContain('欢迎回来');
    expect(fieldOf(w, '用户名').attributes('autocomplete')).toBe('username');
    expect(fieldOf(w, '密码').attributes('type')).toBe('password');
  });

  it('登录成功：用户名去掉首尾空格，去 redirect 或切换区服页', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockResolvedValue({ items: [] });
    vi.mocked(endpoints.login).mockResolvedValue({
      accountId: 1,
      username: 'u1',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: null,
      restaurantId: null,
      lang: 'zh-CN',
      npcRestId: null,
    } as never);
    const { w, router } = await mountView();
    await fieldOf(w, '用户名').setValue(' u1 ');
    await fieldOf(w, '密码').setValue('secret123');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(endpoints.login).toHaveBeenCalledWith({ username: 'u1', password: 'secret123' });
    expect(router.currentRoute.value.path).toBe('/shards');
  });

  it('登录失败：卡片顶上写红字原因', async () => {
    vi.mocked(endpoints.publicAnnouncements).mockResolvedValue({ items: [] });
    vi.mocked(endpoints.login).mockRejectedValue(new ApiError('SOMETHING_ODD'));
    const { w } = await mountView();
    await fieldOf(w, '用户名').setValue('u1');
    await fieldOf(w, '密码').setValue('bad');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.get('.dt-auth-card [role="alert"]').text()).not.toBe('');
  });
});
