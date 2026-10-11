import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DtLevelRing from './DtLevelRing.vue';
import DtResPill from './DtResPill.vue';
import DtStatTile from './DtStatTile.vue';

describe('等级环（界面改版 P5）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('中间写等级，读屏写等级和经验百分比', () => {
    const w = mount(DtLevelRing, { props: { level: 7, percent: 64 } });
    expect(w.get('[role="img"]').attributes('aria-label')).toBe('等级 7, 经验 64%');
    expect(w.get('.dt-level-ring-text b').text()).toBe('7');
  });

  it('百分比夹在 0~100：超过的画满，负数画空', () => {
    const over = mount(DtLevelRing, { props: { level: 99, percent: 180 } });
    expect(over.get('[role="img"]').attributes('aria-label')).toBe('等级 99, 经验 100%');
    const [full, circ] = over
      .get('[data-testid="level-ring-arc"]')
      .attributes('stroke-dasharray')!
      .split(' ');
    expect(full).toBe(circ);
    const under = mount(DtLevelRing, { props: { level: 1, percent: -5 } });
    expect(under.get('[data-testid="level-ring-arc"]').attributes('stroke-dasharray')).toMatch(/^0\.0 /);
  });
});

describe('资源胶囊（界面改版 P5）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('图形 + 值，名字给读屏；不够时是危险色', () => {
    const w = mount(DtResPill, {
      props: { art: 'res-oil', label: '油', tone: 'danger' },
      slots: { default: '0' },
    });
    expect(w.get('use').attributes('href')).toContain('#res-oil');
    expect(w.get('.visually-hidden').text()).toBe('油');
    expect(w.text()).toContain('0');
    expect(w.classes()).toContain('is-danger');
    expect(mount(DtResPill, { props: { art: 'res-oil', label: '油' } }).classes()).not.toContain('is-danger');
  });
});

describe('统计块（界面改版 P5）', () => {
  it('大数字和标签；好坏用颜色', () => {
    const w = mount(DtStatTile, { props: { value: '+491', label: '银币', tone: 'good' } });
    expect(w.get('.dt-stat-value').text()).toBe('+491');
    expect(w.get('.dt-stat-label').text()).toBe('银币');
    expect(w.classes()).toContain('is-good');
    const plain = mount(DtStatTile, { props: { value: '12', label: '耗油' } });
    expect(plain.classes()).not.toContain('is-good');
    expect(plain.classes()).not.toContain('is-bad');
  });
});
