import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogStore } from '../stores/catalog';
import FoodArt from './FoodArt.vue';

describe('食材图形（界面改版 P4）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('按编号取类别画图，装饰性（读屏不读），默认 24px', () => {
    useCatalogStore().foodsMap = new Map([
      [7, { id: 7, name: '大米', level: 1, odds: 70, coin: 1, type: 2, art: 'grain' }],
    ]);
    const w = mount(FoodArt, { props: { id: 7 } });
    expect(w.get('use').attributes('href')).toContain('#food-grain');
    expect(w.get('svg').attributes('aria-hidden')).toBe('true');
    expect(w.get('svg').attributes('width')).toBe('24');
    expect(
      mount(FoodArt, { props: { id: 8, size: 40 } })
        .get('use')
        .attributes('href'),
    ).toContain('#food-misc');
  });
});
