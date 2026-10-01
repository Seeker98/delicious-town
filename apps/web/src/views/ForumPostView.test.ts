import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ForumPostDetailDto, ForumReplyDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ForumPostView from './ForumPostView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    forumPost: vi.fn(),
    forumReact: vi.fn(),
    forumReply: vi.fn(),
    forumDeleteReply: vi.fn(),
    forumDelete: vi.fn(),
    forumAdmin: vi.fn(),
    forumReads: vi.fn(),
  },
}));

const reply = (floor: number, patch: Partial<ForumReplyDto> = {}): ForumReplyDto => ({
  id: 100 + floor,
  floor,
  replyTo: null,
  restId: 8,
  restName: '老李',
  anonymous: false,
  content: `第${floor}楼`,
  createdAt: '2026-10-01T04:00:00.000Z',
  deleted: false,
  canDelete: true,
  ...patch,
});
const detail = (patch: Partial<ForumPostDetailDto> = {}): ForumPostDetailDto => ({
  post: {
    id: 5,
    category: 'guide',
    title: '攻略',
    excerpt: '',
    restId: 7,
    restName: '小王的店',
    createdAt: '2026-10-01T04:00:00.000Z',
    activeAt: '2026-10-01T04:00:00.000Z',
    readNum: 1,
    upNum: 0,
    downNum: 0,
    replyCount: 2,
    pinned: false,
    featured: false,
    content: '<img src=x onerror=alert(1)>\n第二行',
    editedAt: null,
  },
  mine: null,
  can: { edit: false, delete: false, admin: false, reads: false, reply: true },
  replies: [reply(1), reply(2, { replyTo: 1 }), reply(3, { deleted: true, content: '', canDelete: false })],
  replyReadyAt: null,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/forum', component: { template: '<div />' } },
      { path: '/forum/:id', component: ForumPostView },
      { path: '/forum/:id/edit', component: { template: '<div />' } },
      { path: '/friends/:restId', component: { template: '<div />' } },
    ],
  });
  await router.push('/forum/5');
  const w = mount(ForumPostView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe('ForumPostView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.forumPost).mockResolvedValue(detail());
  });
  afterEach(() => vi.restoreAllMocks());

  it('正文按纯文字显示：HTML 不会被当成标签，换行保留', async () => {
    const { w } = await mountView();
    const body = w.find('[data-testid="post-body"]');
    expect(body.text()).toContain('<img src=x onerror=alert(1)>');
    expect(body.find('img').exists()).toBe(false);
    expect(body.classes()).toContain('dt-post-body');
  });

  it('点赞后更新计数和我的态度；没有管理权限时不显示置顶', async () => {
    vi.mocked(endpoints.forumReact).mockResolvedValue({ mine: 'up', up: 1, down: 0 });
    const { w } = await mountView();
    expect(w.find('[data-testid="post-pin"]').exists()).toBe(false);
    await w.find('[data-testid="post-up"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumReact).toHaveBeenCalledWith(5, 'up');
    expect(w.find('[data-testid="post-up"]').classes()).toContain('active');
    expect(w.find('[data-testid="post-up"]').text()).toContain('1');
  });

  it('回复某一楼、匿名回复', async () => {
    vi.mocked(endpoints.forumReply).mockResolvedValue(reply(4));
    const { w } = await mountView();
    expect(w.find('[data-testid="reply-2"]').text()).toContain('回复 #1');
    expect(w.find('[data-testid="reply-3"]').text()).toContain('该回复已删除');
    await w.find('[data-testid="reply-to-2"]').trigger('click');
    expect(w.find('[data-testid="reply-target"]').text()).toContain('回复 #2');
    await w.find('[data-testid="reply-content"]').setValue('同意');
    await w.find('[data-testid="reply-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumReply).toHaveBeenCalledWith(5, { content: '同意', replyTo: 2, anonymous: false });
    await w.find('[data-testid="reply-content"]').setValue('悄悄说');
    await w.find('[data-testid="reply-anon"]').setValue(true);
    await w.find('[data-testid="reply-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumReply).toHaveBeenLastCalledWith(5, { content: '悄悄说', anonymous: true });
  });

  it('删除回复前要确认；取消就不删', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(endpoints.forumDeleteReply).mockResolvedValue({});
    const { w } = await mountView();
    await w.find('[data-testid="reply-delete-1"]').trigger('click');
    expect(confirm).toHaveBeenCalled();
    expect(endpoints.forumDeleteReply).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="reply-delete-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumDeleteReply).toHaveBeenCalledWith(101);
  });

  it('管理员看到置顶和加精；作者能看阅读明细', async () => {
    vi.mocked(endpoints.forumPost).mockResolvedValue(
      detail({ can: { edit: true, delete: true, admin: true, reads: true, reply: true } }),
    );
    vi.mocked(endpoints.forumAdmin).mockResolvedValue({ pinned: true, featured: false, rewarded: false });
    vi.mocked(endpoints.forumReads).mockResolvedValue({
      items: [{ restId: 8, name: '老李', times: 3, lastAt: '2026-10-01T04:00:00.000Z', reaction: 'up' }],
    });
    const { w } = await mountView();
    await w.find('[data-testid="post-pin"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumAdmin).toHaveBeenCalledWith(5, 'pin');
    await w.find('[data-testid="post-reads"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('老李 · 读了 3 次');
  });
});
