import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
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
  it('点"更多"弹出分组的小图标面板，不跳页；点入口或点外面收起（问题记录：更多里的功能放到全局）', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: BottomNav }],
    });
    await router.push('/cupboard');
    const w = mount(BottomNav, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="more-sheet"]').exists()).toBe(false);
    await w.find('[data-testid="tab-more"]').trigger('click');
    expect(router.currentRoute.value.path).toBe('/cupboard');
    const sheet = w.find('[data-testid="more-sheet"]');
    for (const x of ['经营', '玩法', '其他', '厨塔', '厨具', '切换区服']) expect(sheet.text()).toContain(x);
    await w.find('[data-testid="more-backdrop"]').trigger('click');
    expect(w.find('[data-testid="more-sheet"]').exists()).toBe(false);
    await w.find('[data-testid="tab-more"]').trigger('click');
    await w.find('[data-testid="more-sheet"] a[href="/tower"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/tower');
    expect(w.find('[data-testid="more-sheet"]').exists()).toBe(false);
  });
  it('面板打开时点当前页的标签也会收起（审查：路由没变时收不起来）', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: BottomNav }],
    });
    await router.push('/cupboard');
    const w = mount(BottomNav, { global: { plugins: [router] } });
    await flushPromises();
    await w.find('[data-testid="tab-more"]').trigger('click');
    await w.find('nav a[href="/cupboard"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="more-sheet"]').exists()).toBe(false);
  });

  it('区服关掉的功能不显示底部标签（问题记录 248）', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
    useRestaurantStore().rest = { disabledFeatures: ['market', 'friend'] } as never;
    const w = mountNav();
    await flushPromises();
    expect(w.text()).toContain('食谱');
    expect(w.text()).not.toContain('菜场');
    expect(w.text()).not.toContain('好友');
  });
});
