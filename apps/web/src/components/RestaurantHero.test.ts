import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogStore } from '../stores/catalog';
import RestaurantHero from './RestaurantHero.vue';

const doorOf = (w: ReturnType<typeof mount>) => w.get('.dt-hero-door use').attributes('href')?.split('#')[1];

describe('餐厅头图（界面改版 P3，设计 §5 第 1 条）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().looks = {
      doors: [
        { id: 0, name: '木门', coin: 0, art: 'wood' },
        { id: 1, name: '红漆门', coin: 20000, art: 'red' },
      ],
      avatars: [],
      icons: [],
    };
  });

  it('店面图是装饰（不读）、懒加载；门按现在的门；叠字放在插槽里', () => {
    const w = mount(RestaurantHero, { props: { door: 1 }, slots: { default: '<b>7 级</b>' } });
    const img = w.get('img.dt-hero-scene');
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('loading')).toBe('lazy');
    expect(img.attributes('src')).toContain('restaurant');
    expect(doorOf(w)).toBe('door-red');
    expect(w.get('.dt-hero-plate').text()).toBe('7 级');
  });

  it('门在目录里找不到（旧目录缓存、目录还没读到）：显示木门，不空着（Review Focus 3）', () => {
    expect(doorOf(mount(RestaurantHero, { props: { door: 99 } }))).toBe('door-wood');
    useCatalogStore().looks = null;
    expect(doorOf(mount(RestaurantHero, { props: { door: 1 } }))).toBe('door-wood');
  });
});
