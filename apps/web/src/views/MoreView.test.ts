import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import MoreView from './MoreView.vue';

const me = (role: 'player' | 'mod' | 'admin') => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  role,
  shardId: 1,
  restaurantId: 1,
});

const mountView = () =>
  mount(MoreView, {
    global: {
      plugins: [
        createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: MoreView }] }),
      ],
    },
  });

describe('MoreView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('管理员和协管能看到"管理后台"入口，普通玩家看不到', () => {
    useSessionStore().me = me('mod');
    expect(mountView().text()).toContain('管理后台');
    useSessionStore().me = me('player');
    expect(mountView().text()).not.toContain('管理后台');
  });

  it('有特色菜、神殿、菜园、酒吧、厨塔、外卖、广场入口；教室并进广场，不再单列（问题记录 122）', () => {
    useSessionStore().me = me('player');
    const text = mountView().text();
    for (const x of [
      '特色菜',
      '神殿',
      '广场',
      '菜园',
      '酒吧',
      '厨塔',
      '外卖',
      '厨具与加点',
      '邀请好友',
      '兑换码',
    ])
      expect(text).toContain(x);
    expect(text).not.toContain('教室');
    expect(text).not.toContain('小镇');
    // 和底部弹出的面板同一套分组
    for (const g of ['经营', '玩法', '其他']) expect(text).toContain(g);
  });

  it('装扮在"其他"组，不在"经营"组（问题记录 173）', () => {
    useSessionStore().me = me('player');
    const w = mountView();
    const group = (title: string) =>
      w
        .findAll('.mb-2')
        .find((g) => g.find('.small.text-muted').exists() && g.find('.small.text-muted').text() === title)!;
    expect(group('其他').text()).toContain('装扮');
    expect(group('经营').text()).not.toContain('装扮');
  });
});
