import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogStore } from '../../stores/catalog';
import HomeScene from './HomeScene.vue';

describe('首页场景头图（界面改版 P5，样稿 B）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().looks = { doors: [{ id: 4, art: 'red' }], icons: [] } as never;
  });

  it('停业时招牌上挂“停业中”；营业时不挂', () => {
    const closed = mount(HomeScene, { props: { door: 0, closed: true } });
    expect(closed.get('[data-testid="scene-closed"]').text()).toBe('停业中');
    const open = mount(HomeScene, { props: { door: 0, closed: false } });
    expect(open.find('[data-testid="scene-closed"]').exists()).toBe(false);
  });

  it('门按装扮里选的画；找不到的门画木门', () => {
    const red = mount(HomeScene, { props: { door: 4, closed: false } });
    expect(red.get('.dt-scene-door use').attributes('href')).toContain('#door-red');
    const unknown = mount(HomeScene, { props: { door: 999, closed: false } });
    expect(unknown.get('.dt-scene-door use').attributes('href')).toContain('#door-wood');
  });

  it('天空、山坡、地面用令牌色（深色模式跟着变），店面插画是图片', () => {
    const w = mount(HomeScene, { props: { door: 0, closed: false }, slots: { meta: '<span>新手街</span>' } });
    const fills = w.findAll('.dt-scene-bg [fill]').map((x) => x.attributes('fill'));
    expect(fills).toEqual(expect.arrayContaining(['var(--dt-scene-hill)', 'var(--dt-scene-ground)']));
    expect(w.get('.dt-scene').attributes('style') ?? '').not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(w.get('img.dt-scene-shop').attributes('alt')).toBe('');
    expect(w.get('.dt-scene-meta').text()).toContain('新手街');
  });
});
