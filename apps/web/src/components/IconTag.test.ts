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
