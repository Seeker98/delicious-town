import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import IconTag from './IconTag.vue';

describe('IconTag（称号徽章，定制称号设计 四）', () => {
  it('访问好友页的黄底样式；emoji 原样显示', () => {
    const w = mount(IconTag, { props: { title: '👨‍🍳主厨' } });
    const s = w.find('[data-testid="icon-tag"]');
    expect(s.text()).toBe('👨‍🍳主厨');
    expect(s.classes()).toEqual(expect.arrayContaining(['badge', 'bg-warning', 'text-dark']));
  });
});

describe('称号和同一行文字居中对齐（问题记录 563）', () => {
  it('按中线对齐，不按文字基线（原来底色框比文字低约 1.5 像素）', () => {
    const s = mount(IconTag, { props: { title: '主厨' } }).find('[data-testid="icon-tag"]');
    expect(s.classes()).toContain('align-middle');
  });
});
