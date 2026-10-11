import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RestLogDto } from '@dt/shared';
import FeedRow from './FeedRow.vue';

const item = (type: string, params: Record<string, unknown>): RestLogDto => ({
  type,
  params,
  at: '2026-10-09T10:05:00.000Z',
});
const mountIt = (it: RestLogDto, showNew = false) =>
  mount(FeedRow, { props: { item: it, showNew }, global: { stubs: { RouterLink: RouterLinkStub } } });

describe('动态的一行（界面改版 P2b：首页和好友页同一种）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('时间只写月日时分，后面是统一文案', () => {
    const w = mountIt(item('mouse.steal', { foodsId: 1, num: 2 }));
    expect(w.classes()).toContain('dt-feed');
    const time = w.get('.dt-feed-time').text();
    expect(time).toContain(':05');
    expect(time).not.toContain('2026');
    expect(w.text()).toContain('老鼠偷走了');
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false);
  });

  it('好友做的事能点去对方餐厅；帖子回复去帖子', () => {
    expect(
      mountIt(item('thumb', { byName: '甲', by: 3 }))
        .getComponent(RouterLinkStub)
        .props('to'),
    ).toBe('/friends/3');
    const reply = item('forum.replied', { byName: '丁', postId: 8, title: '攻略', floor: 2 });
    expect(mountIt(reply).getComponent(RouterLinkStub).props('to')).toBe('/forum/8');
  });

  it('showNew 时前面一个小圆点，读屏读“新”', () => {
    expect(
      mountIt(item('thumb', { byName: '甲' }))
        .find('[data-testid="feed-new"]')
        .exists(),
    ).toBe(false);
    const dot = mountIt(item('thumb', { byName: '甲' }), true).get('[data-testid="feed-new"]');
    expect(dot.find('.visually-hidden').text()).not.toBe('');
  });
});
