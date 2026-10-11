import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DtRow from './DtRow.vue';

describe('DtRow', () => {
  it('strong 时标题加粗（P9 用户反馈：道具、飞弹、玩家名字要加粗）；默认不加', () => {
    const plain = mount(DtRow, { props: { title: '美味券' } });
    expect(plain.get('.dt-row-title').classes()).not.toContain('is-strong');
    const strong = mount(DtRow, { props: { title: '美味券', strong: true } });
    expect(strong.get('.dt-row-title').classes()).toContain('is-strong');
  });
});
