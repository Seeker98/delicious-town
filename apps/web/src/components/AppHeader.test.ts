import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import AppHeader from './AppHeader.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { mailUnread: vi.fn(), serverTime: vi.fn() } }));
beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 0 });
  vi.mocked(endpoints.serverTime).mockResolvedValue({ now: new Date().toISOString() });
});

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<p/>' } }],
  });

describe('AppHeader（问题记录：左上角"美味小镇"点了不能回主界面）', () => {
  it('游戏内：店名链接回首页；不在首页时有返回按钮，点了回到上一页', async () => {
    const router = makeRouter();
    await router.push('/');
    await router.push('/society/star');
    const w = mount(AppHeader, { props: { inGame: true }, global: { plugins: [router] } });
    expect(w.find('[data-testid="home"]').attributes('href')).toBe('/');
    await w.find('[data-testid="back"]').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('首页没有返回按钮；没有上一页时返回按钮回首页', async () => {
    const router = makeRouter();
    await router.push('/');
    const w = mount(AppHeader, { props: { inGame: true }, global: { plugins: [router] } });
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
    const r2 = makeRouter();
    await r2.push('/market');
    const w2 = mount(AppHeader, { props: { inGame: true }, global: { plugins: [r2] } });
    await w2.find('[data-testid="back"]').trigger('click');
    await flushPromises();
    expect(r2.currentRoute.value.path).toBe('/');
  });

  it('登录、选区服等页面（不在游戏里）只显示文字', async () => {
    const router = makeRouter();
    await router.push('/login');
    const w = mount(AppHeader, { props: { inGame: false }, global: { plugins: [router] } });
    expect(w.text()).toContain('美味小镇');
    expect(w.find('[data-testid="home"]').exists()).toBe(false);
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
  });

  it('登录后不在游戏里的页面（选区服、没进区服时的指引页）：店名也能点回首页（问题记录 188、190）', async () => {
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: null,
      restaurantId: null,
      lang: null,
      npcRestId: null,
    };
    const router = makeRouter();
    await router.push('/shards');
    const w = mount(AppHeader, { props: { inGame: false }, global: { plugins: [router] } });
    expect(w.find('[data-testid="home"]').attributes('href')).toBe('/');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
  });

  it('Wiki（问题记录 338）：没登录、登录了都能点店名回去（没登录时首页会被守卫送去登录页）', async () => {
    const router = makeRouter();
    await router.push('/wiki/goods');
    const w = mount(AppHeader, { props: { inGame: false }, global: { plugins: [router] } });
    expect(w.find('[data-testid="home"]').attributes('href')).toBe('/');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 1,
      lang: null,
      npcRestId: null,
    };
    const w2 = mount(AppHeader, { props: { inGame: false }, global: { plugins: [router] } });
    expect(w2.find('[data-testid="home"]').attributes('href')).toBe('/');
  });

  it('后台页面（问题记录：admin 页左上角点不回主界面）：店名也链接回首页，没有返回按钮', async () => {
    const router = makeRouter();
    await router.push('/admin/players');
    const w = mount(AppHeader, { props: { inGame: false }, global: { plugins: [router] } });
    expect(w.find('[data-testid="home"]').attributes('href')).toBe('/');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
  });

  it('游戏里显示信封和未读数，点开去邮箱；不在游戏里不显示', async () => {
    vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 3 });
    const router = makeRouter();
    await router.push('/');
    const w = mount(AppHeader, { props: { inGame: true }, global: { plugins: [router] } });
    await flushPromises();
    const link = w.find('[data-testid="mail-link"]');
    expect(link.attributes('href')).toBe('/mail');
    expect(link.text()).toContain('3');
    expect(link.attributes('aria-label')).toBe('邮箱，3 封未读');
    // 图标放大、未读数缩小（问题记录 200）
    expect(link.find('i').classes()).toContain('dt-mail-icon');
    const out = mount(AppHeader, { props: { inGame: false }, global: { plugins: [router] } });
    expect(out.find('[data-testid="mail-link"]').exists()).toBe(false);
  });
});
