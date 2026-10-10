import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRestaurantStore } from '../stores/restaurant';
import MapView from './MapView.vue';

beforeEach(() => setActivePinia(createPinia()));
const mountMap = (disabled: string[] = []) => {
  useRestaurantStore().rest = { disabledFeatures: disabled } as never;
  return mount(MapView, { global: { stubs: { RouterLink: RouterLinkStub } } });
};

describe('小镇（界面改版 P2a，设计 §4.1）', () => {
  it('三组地方：买卖、玩乐、公共', () => {
    const w = mountMap();
    expect(w.findAll('.dt-section').map((x) => x.text())).toEqual(['买卖', '玩乐', '公共']);
    expect(w.get('[data-testid="place-bar"]').text()).toContain('酒吧');
    expect(w.get('[data-testid="place-bar"]').text()).toContain('雯姐和小游戏');
  });
  it('区服关掉的功能不显示', () => {
    const w = mountMap(['bar', 'kuji']);
    expect(w.find('[data-testid="place-bar"]').exists()).toBe(false);
    expect(w.find('[data-testid="place-kuji"]').exists()).toBe(false);
  });
});
