import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ForumListDto, ForumPostItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ForumView from './ForumView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { forumList: vi.fn() } }));

export const item = (id: number, patch: Partial<ForumPostItemDto> = {}): ForumPostItemDto => ({
  id,
  category: 'chat',
  title: `帖子${id}`,
  excerpt: '摘要',
  restId: 7,
  restName: '小王的店',
  createdAt: '2026-10-01T04:00:00.000Z',
  activeAt: '2026-10-01T04:00:00.000Z',
  readNum: 3,
  upNum: 1,
  downNum: 0,
  replyCount: 2,
  pinned: false,
  featured: false,
  ...patch,
});
const list = (patch: Partial<ForumListDto> = {}): ForumListDto => ({
  pinned: [item(1, { pinned: true })],
  items: [item(2), item(3, { featured: true })],
  nextCursor: 'c1',
  me: { canPost: true, isAdmin: false, postReadyAt: null, replyReadyAt: null },
  now: new Date().toISOString(),
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/forum', component: ForumView },
      { path: '/forum/:id', component: { template: '<div />' } },
      { path: '/forum/new', component: { template: '<div />' } },
    ],
  });
  await router.push('/forum');
  const w = mount(ForumView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe('ForumView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.forumList).mockResolvedValue(list());
  });

  it('默认全部：置顶和列表都显示，带置顶、精标', async () => {
    const { w } = await mountView();
    expect(endpoints.forumList).toHaveBeenCalledWith({ tab: 'all' });
    expect(w.find('[data-testid="forum-item-1"]').text()).toContain('置顶');
    expect(w.find('[data-testid="forum-item-3"]').text()).toContain('精');
    expect(w.find('[data-testid="forum-item-2"]').text()).toContain('阅读 3');
  });

  it('切标签、搜索都重新加载；加载更多带上游标并追加', async () => {
    const { w } = await mountView();
    await w.find('[data-testid="forum-tab-guide"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumList).toHaveBeenLastCalledWith({ tab: 'guide' });
    await w.find('[data-testid="forum-q"]').setValue('攻略');
    await w.find('[data-testid="forum-q"]').trigger('keyup.enter');
    await flushPromises();
    expect(endpoints.forumList).toHaveBeenLastCalledWith({ tab: 'guide', q: '攻略' });
    vi.mocked(endpoints.forumList).mockResolvedValueOnce(
      list({ pinned: [], items: [item(9)], nextCursor: null }),
    );
    await w.find('[data-testid="forum-more"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumList).toHaveBeenLastCalledWith({ tab: 'guide', q: '攻略', cursor: 'c1' });
    expect(w.find('[data-testid="forum-item-2"]').exists()).toBe(true);
    expect(w.find('[data-testid="forum-item-9"]').exists()).toBe(true);
    expect(w.find('[data-testid="forum-more"]').exists()).toBe(false);
  });

  it('没验证邮箱时发帖按钮灰掉并说明', async () => {
    vi.mocked(endpoints.forumList).mockResolvedValue(
      list({ me: { canPost: false, isAdmin: false, postReadyAt: null, replyReadyAt: null } }),
    );
    const { w } = await mountView();
    expect(w.find('[data-testid="forum-new"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('验证邮箱后才能发帖');
  });
  it('加载中切换标签：以最后一次为准，不会停在旧列表（终审）', async () => {
    let first!: (v: ForumListDto) => void;
    vi.mocked(endpoints.forumList).mockImplementationOnce(() => new Promise((r) => (first = r)));
    vi.mocked(endpoints.forumList).mockResolvedValueOnce(
      list({ pinned: [], items: [item(7, { category: 'guide' })] }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/forum', component: ForumView }],
    });
    await router.push('/forum');
    const w = mount(ForumView, { global: { plugins: [router] } });
    await w.find('[data-testid="forum-tab-guide"]').trigger('click');
    await flushPromises();
    first(list());
    await flushPromises();
    expect(endpoints.forumList).toHaveBeenLastCalledWith({ tab: 'guide' });
    expect(w.find('[data-testid="forum-item-7"]').exists()).toBe(true);
    expect(w.find('[data-testid="forum-item-2"]').exists()).toBe(false);
  });

  it('发帖冷却中：按钮灰掉并显示还要等几秒（PR31 遗留）', async () => {
    vi.mocked(endpoints.forumList).mockResolvedValue(
      list({
        me: {
          canPost: true,
          isAdmin: false,
          postReadyAt: new Date(Date.now() + 600_000 + 30_000).toISOString(),
          replyReadyAt: null,
        },
        // 服务器时间比本机快 10 分钟：倒计时要按服务器时间算（终审 I2）
        now: new Date(Date.now() + 600_000).toISOString(),
      }),
    );
    const { w } = await mountView();
    expect(w.find('[data-testid="forum-new"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="forum-wait"]').text()).toMatch(/^(29|30) 秒后可以再发帖$/);
  });
});
