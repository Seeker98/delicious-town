import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DtTabs from './DtTabs.vue';

const TABS = [
  { key: 'a', label: '甲' },
  { key: 'b', label: '乙', badge: 2 },
];

describe('DtTabs（界面改版 P2b）', () => {
  it('按钮式标签，选中的有 active 和 aria-selected；徽标', () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: TABS } });
    const btns = w.findAll('button[role="tab"]');
    expect(btns.map((b) => b.text())).toEqual(['甲', '乙2']);
    expect(btns[0]!.classes()).toEqual(expect.arrayContaining(['nav-link', 'active']));
    expect(btns[0]!.attributes('aria-selected')).toBe('true');
    expect(btns[1]!.attributes('aria-selected')).toBe('false');
    expect(w.get('ul').classes()).toContain('nav-tabs');
    expect(w.get('[data-testid="tab-b"] .badge').text()).toBe('2');
  });

  it('点了发出新的值；自定 testid 前缀', async () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: TABS, testidPrefix: 'ex-tab-' } });
    await w.get('[data-testid="ex-tab-b"]').trigger('click');
    expect(w.emitted('update:modelValue')).toEqual([['b']]);
  });

  it('标签栏右边的 end 插槽（界面改版 P10：广场的“论坛 ›”）；没有插槽时不留位置', () => {
    const w = mount(DtTabs, {
      props: { modelValue: 'a', tabs: TABS },
      slots: { end: '<a href="/forum">论坛</a>' },
    });
    expect(w.get('.dt-tabs-bar').classes()).toContain('has-end');
    expect(w.get('.dt-tabs-end a').text()).toBe('论坛');
    const plain = mount(DtTabs, { props: { modelValue: 'a', tabs: TABS } });
    expect(plain.get('.dt-tabs-bar').classes()).not.toContain('has-end');
    expect(plain.find('.dt-tabs-end').exists()).toBe(false);
  });

  it('只有一个标签时不显示标签栏', () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: [TABS[0]!] } });
    expect(w.find('ul').exists()).toBe(false);
  });
});
