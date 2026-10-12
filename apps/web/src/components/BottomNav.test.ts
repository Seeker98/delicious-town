import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
import BottomNav from './BottomNav.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { friendRequests: vi.fn() } }));

const mountNav = async (path = '/', disabled: string[] = []) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: BottomNav, meta: { section: 'home' } },
      { path: '/cookbooks/:id?', component: BottomNav, meta: { section: 'cookbooks' } },
      { path: '/bar', component: BottomNav, meta: { section: 'map' } },
      { path: '/:p(.*)*', component: BottomNav },
    ],
  });
  useRestaurantStore().rest = { disabledFeatures: disabled } as never;
  await router.push(path);
  const w = mount(BottomNav, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('底部导航（界面改版 P2a，设计 §4.1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
  });

  it('六个入口，“更多”换成“小镇”', async () => {
    const w = await mountNav();
    expect(w.findAll('[data-testid^="tab-"]').map((x) => x.text())).toEqual([
      '餐厅',
      '食谱',
      '橱柜',
      '菜场',
      '好友',
      '小镇',
    ]);
    expect(w.find('[data-testid="tab-more"]').exists()).toBe(false);
  });

  it('按所属入口高亮：在食谱详情页“食谱”亮，在酒吧“小镇”亮', async () => {
    const a = await mountNav('/cookbooks/12');
    // 详情页只说明属于这个入口，不是入口页本身（backlog P2a）
    expect(a.get('[data-testid="tab-cookbooks"]').attributes('aria-current')).toBe('true');
    expect(
      (await mountNav('/cookbooks')).get('[data-testid="tab-cookbooks"]').attributes('aria-current'),
    ).toBe('page');
    const b = await mountNav('/bar');
    expect(b.get('[data-testid="tab-map"]').attributes('aria-current')).toBe('true');
    expect(b.get('[data-testid="tab-home"]').attributes('aria-current')).toBeUndefined();
  });

  it('区服关掉的功能不显示入口', async () => {
    const w = await mountNav('/', ['market']);
    expect(w.find('[data-testid="tab-market"]').exists()).toBe(false);
    expect(w.findAll('[data-testid^="tab-"]')).toHaveLength(5);
  });

  it('有待处理的好友申请时“好友”上显示红点，没有时不显示', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([
      { id: 2, name: '乙', level: 1, star: 0, avatar: null, npc: false, at: '2026-09-30T00:00:00Z' },
    ]);
    const w = await mountNav();
    expect(w.find('[data-testid="friend-dot"]').exists()).toBe(true);
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
    setActivePinia(createPinia());
    const w2 = await mountNav();
    expect(w2.find('[data-testid="friend-dot"]').exists()).toBe(false);
  });
});
