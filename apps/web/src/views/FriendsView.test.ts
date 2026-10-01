import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendsView from './FriendsView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    friendList: vi.fn(),
    friendRequests: vi.fn(),
    friendRespond: vi.fn(),
    friendSearch: vi.fn(),
    friendStreet: vi.fn(),
    friendApply: vi.fn(),
    friendFeed: vi.fn(),
    thumbsToday: vi.fn(),
    thumbsReturnAll: vi.fn(),
  },
}));

const mountView = () =>
  mount(FriendsView, {
    global: {
      plugins: [
        createRouter({
          history: createMemoryHistory(),
          routes: [{ path: '/:p(.*)*', component: FriendsView }],
        }),
      ],
    },
  });

describe('FriendsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.friendList).mockResolvedValue({
      count: 1,
      max: 199,
      items: [
        {
          id: 9,
          name: '蟹老板',
          level: 60,
          star: 5,
          avatar: 12,
          npc: true,
          roaches: 3,
          dineSeat: true,
          flipReady: 30,
          since: 'x',
        },
        {
          id: 2,
          name: '乙',
          level: 5,
          star: 0,
          avatar: 1,
          npc: false,
          roaches: 0,
          dineSeat: false,
          flipReady: 5,
          since: 'x',
        },
      ],
    });
    vi.mocked(endpoints.friendRequests).mockResolvedValue([
      { id: 3, name: '丙', level: 2, star: 0, avatar: null, npc: false, at: '2026-09-30T00:00:00Z' },
    ]);
    vi.mocked(endpoints.friendRespond).mockResolvedValue({ status: 'friends' });
    vi.mocked(endpoints.friendSearch).mockResolvedValue([
      { id: 4, name: '丁', level: 3, star: 0, avatar: null, isFriend: false, requested: false },
    ]);
    vi.mocked(endpoints.friendStreet).mockResolvedValue([]);
    vi.mocked(endpoints.friendApply).mockResolvedValue({ status: 'requested' });
  });

  it('好友列表：蟹老板在前，显示蟑螂数和可白食', async () => {
    const w = mountView();
    await flushPromises();
    const rows = w.findAll('[data-testid^="friend-row-"]');
    expect(rows[0]!.text()).toContain('蟹老板');
    expect(rows[0]!.text()).toContain('蟑螂 3');
    expect(rows[0]!.text()).toContain('可白食');
    expect(w.text()).toContain('好友 1/199');
  });

  it('同意申请', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="tab-requests"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="accept-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendRespond).toHaveBeenCalledWith(3, true);
  });

  it('搜索并申请加好友', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="tab-find"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="search-input"]').setValue('丁');
    await w.find('[data-testid="search-form"]').trigger('submit');
    await flushPromises();
    await w.find('[data-testid="apply-4"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendApply).toHaveBeenCalledWith(4);
    expect(w.find('[data-testid="apply-4"]').text()).toBe('已申请');
  });

  it('好友列表还在读时点"动态"：动态照样读出来（好友 e2e 偶发失败的原因）', async () => {
    let release!: (v: never) => void;
    vi.mocked(endpoints.friendList).mockImplementationOnce(() => new Promise((r) => (release = r)));
    vi.mocked(endpoints.friendFeed).mockResolvedValue({
      items: [{ type: 'thumb', params: { byName: '乙店' }, at: '2026-10-01T04:00:00.000Z' }],
    } as never);
    vi.mocked(endpoints.thumbsToday).mockResolvedValue([]);
    const w = mountView();
    await w.find('[data-testid="tab-feed"]').trigger('click');
    await flushPromises();
    release({ friends: [], cap: 10 } as never);
    await flushPromises();
    expect(endpoints.friendFeed).toHaveBeenCalled();
    expect(w.text()).toContain('乙店 给你点了赞');
  });

  it('好友行紧凑：店名、等级、状态在同一行（问题记录 168）', async () => {
    const w = mountView();
    await flushPromises();
    const line = w.find('[data-testid^="friend-row-"] .dt-friend-line');
    expect(line.exists()).toBe(true);
    expect(line.text()).toContain('蟹老板');
    expect(line.text()).toContain('级');
    expect(line.text()).toContain('蟑螂 3');
  });

  it('好友行头像不被压缩、不再单独放大（问题记录 179）', async () => {
    const w = mountView();
    await flushPromises();
    const img = w.find('[data-testid^="friend-row-"] .flex-shrink-0');
    expect(img.exists()).toBe(true);
    expect(w.find('.dt-friend-avatar').exists()).toBe(false);
  });
});
