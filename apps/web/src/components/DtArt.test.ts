import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DtArt from './DtArt.vue';

describe('DtArt（界面改版 P1）', () => {
  it('界面图标引用 ui 雪碧图，默认 24px，装饰性的不让读屏读', () => {
    const w = mount(DtArt, { props: { name: 'nav-home' } });
    const svg = w.get('svg');
    expect(svg.classes()).toEqual(['dt-art', 'dt-art-ui']);
    expect(svg.attributes('width')).toBe('24');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(w.get('use').attributes('href')).toMatch(/ui\.svg#nav-home$/);
  });

  it('内容图形引用 content 雪碧图；有 label 时是一张有名字的图', () => {
    const w = mount(DtArt, { props: { name: 'res-coin-silver', size: 16, label: '银币' } });
    const svg = w.get('svg');
    expect(svg.classes()).toContain('dt-art-content');
    expect(svg.attributes('role')).toBe('img');
    expect(svg.attributes('aria-label')).toBe('银币');
    expect(svg.attributes('aria-hidden')).toBeUndefined();
    expect(w.get('use').attributes('href')).toMatch(/content\.svg#res-coin-silver$/);
  });
});
