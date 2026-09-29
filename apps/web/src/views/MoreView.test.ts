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
});
