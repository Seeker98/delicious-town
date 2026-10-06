import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ForumPostDetailDto, ForumReplyDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
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
  now: new Date().toISOString(),
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

  it('别人的匿名回复按当前语言显示"匿名"，不用服务端给的名字（问题记录 272）', async () => {
    vi.mocked(endpoints.forumPost).mockResolvedValue(
      detail({ replies: [reply(1, { restId: null, restName: '服务端原文', anonymous: true })] }),
    );
    const { w } = await mountView();
    const text = w.find('[data-testid="reply-1"]').text();
    expect(text).toContain('匿名');
    expect(text).not.toContain('服务端原文');
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
      items: [{ restId: 8, name: '老李', times: 3, lastDay: '2026-10-01', reaction: 'up' }],
    });
    const { w } = await mountView();
    await w.find('[data-testid="post-pin"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumAdmin).toHaveBeenCalledWith(5, 'pin');
    await w.find('[data-testid="post-reads"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('老李 · 读了 3 次');
  });
  it('回复成功后直接追加到列表，不重新读详情（终审 I1：避免刷新阅读时间）', async () => {
    vi.mocked(endpoints.forumReply).mockResolvedValue(reply(4, { content: '新回复' }));
    const { w } = await mountView();
    await w.find('[data-testid="reply-content"]').setValue('新回复');
    await w.find('[data-testid="reply-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumPost).toHaveBeenCalledTimes(1);
    expect(w.find('[data-testid="reply-4"]').text()).toContain('新回复');
  });

  it('回复冷却中：回复按钮灰掉并显示还要等几秒（PR31 遗留）', async () => {
    vi.mocked(endpoints.forumPost).mockResolvedValue(
      // 服务器时间比本机快 10 分钟：倒计时要按服务器时间算（终审 I2）
      detail({
        replyReadyAt: new Date(Date.now() + 600_000 + 45_000).toISOString(),
        now: new Date(Date.now() + 600_000).toISOString(),
      }),
    );
    const { w } = await mountView();
    expect(w.find('[data-testid="reply-submit"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="reply-wait"]').text()).toMatch(/^(44|45) 秒后可以再回复$/);
  });

  it('别人的帖子和回复旁有举报，自己的没有（子项目 6B-1）', async () => {
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player' as const,
      shardId: 1,
      restaurantId: 8,
      lang: null,
      npcRestId: null,
    };
    vi.mocked(endpoints.forumPost).mockResolvedValue(
      detail({ replies: [reply(1, { restId: 9, canDelete: false }), reply(2)] }),
    );
    const { w } = await mountView();
    expect(w.find('[data-testid="post-report-open"]').exists()).toBe(true);
    expect(w.find('[data-testid="reply-report-1-open"]').exists()).toBe(true);
    expect(w.find('[data-testid="reply-report-2-open"]').exists()).toBe(false);
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player' as const,
      shardId: 1,
      restaurantId: 7,
      lang: null,
      npcRestId: null,
    };
    const { w: w2 } = await mountView();
    expect(w2.find('[data-testid="post-report-open"]').exists()).toBe(false);
  });
});
