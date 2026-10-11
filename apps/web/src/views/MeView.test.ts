import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import MeView from './MeView.vue';

beforeEach(() => {
  setActivePinia(createPinia());
  useRestaurantStore().rest = {
    name: '不会玩',
    streetId: 1,
    streetName: '新手街',
    disabledFeatures: [],
  } as never;
});
const mountMe = () => mount(MeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
const links = (w: ReturnType<typeof mountMe>) =>
  w.findAllComponents(RouterLinkStub).map((l) => l.props('to'));

describe('我（界面改版 P2a，设计 §4.1）', () => {
  it('店铺头、我的店、账号、帮助', () => {
    useSessionStore().me = { role: 'player', username: 'u1' } as never;
    const w = mountMe();
    expect(w.text()).toContain('不会玩');
    expect(w.text()).toContain('u1 · 新手街');
    expect(links(w)).toEqual([
      '/rest/info',
      '/rest/look',
      '/rest/equip',
      '/store',
      '/redeem',
      '/account',
      '/shards',
      '/help',
    ]);
  });
  it('协管、管理员多一个后台入口；普通玩家没有', () => {
    useSessionStore().me = { role: 'mod', username: 'u1' } as never;
    expect(links(mountMe())).toContain('/admin');
    useSessionStore().me = { role: 'player', username: 'u1' } as never;
    expect(links(mountMe())).not.toContain('/admin');
  });
  it('区服关掉的功能不显示', () => {
    useSessionStore().me = { role: 'player', username: 'u1' } as never;
    useRestaurantStore().rest = {
      name: '不会玩',
      streetName: '新手街',
      disabledFeatures: ['store', 'redeem'],
    } as never;
    const l = links(mountMe());
    expect(l).not.toContain('/store');
    expect(l).not.toContain('/redeem');
  });
});
