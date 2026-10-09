import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RestLogDto } from '@dt/shared';
import { markFeedSeen } from '../../utils/feed';
import HomeFeed from './HomeFeed.vue';

const item = (type: string, params: Record<string, unknown>, at: string): RestLogDto => ({
  type,
  params,
  at,
});
const mountIt = (items: RestLogDto[], restId = 7) =>
  mount(HomeFeed, { props: { items, restId }, global: { stubs: { RouterLink: RouterLinkStub } } });

describe('首页餐厅动态（问题记录 553）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => localStorage.clear());

  it('没有动态就不显示这张卡', () => {
    expect(mountIt([]).find('[data-testid="home-feed"]').exists()).toBe(false);
  });

  it('每条一行，文案和好友页一致；"更多"去好友页的动态卡', () => {
    const w = mountIt([
      item('dine.left', { byName: '甲', table: 2, coin: 30 }, '2026-10-09T10:00:00.000Z'),
      item('mouse.steal', { foodsId: 1, num: 2 }, '2026-10-09T09:00:00.000Z'),
    ]);
    const rows = w.findAll('[data-testid="home-feed-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('甲 在你店里第 2 桌吃完白食走了, 吃走了 30 银币');
    expect(rows[1]!.text()).toContain('老鼠偷走了');
    const more = w.find('[data-testid="home-feed-more"]').findComponent(RouterLinkStub);
    expect(more.props('to')).toBe('/friends?tab=feed');
  });

  it('帖子被回复：点了去那个帖子', () => {
    const w = mountIt([
      item(
        'forum.replied',
        { byName: '甲', postId: 12, title: '求助', floor: 3 },
        '2026-10-09T10:00:00.000Z',
      ),
    ]);
    const link = w.find('[data-testid="home-feed-row"]').findComponent(RouterLinkStub);
    expect(link.props('to')).toBe('/forum/12');
    expect(link.text()).toContain('甲 回复了你的帖子「求助」');
  });

  it('比上次在好友页看过的更新的，前面有个小圆点；按店分开记', () => {
    const items = [
      item('thumb', { byName: '甲' }, '2026-10-09T10:00:00.000Z'),
      item('thumb', { byName: '乙' }, '2026-10-09T09:00:00.000Z'),
    ];
    const dots = (restId: number) =>
      mountIt(items, restId)
        .findAll('[data-testid="home-feed-row"]')
        .map((r) => r.find('[data-testid="home-feed-new"]').exists());
    expect(dots(7)).toEqual([true, true]);
    markFeedSeen(7, [items[1]!]);
    expect(dots(7)).toEqual([true, false]);
    markFeedSeen(7, items);
    expect(dots(7)).toEqual([false, false]);
    expect(dots(8)).toEqual([true, true]);
  });
});
