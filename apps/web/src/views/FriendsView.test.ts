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
});
