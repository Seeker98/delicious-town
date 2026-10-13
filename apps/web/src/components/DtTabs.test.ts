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

  it('键盘（backlog）：只有选中的在 Tab 顺序里；左右键循环切换并移焦点，Home、End 到两头', async () => {
    const three = [...TABS, { key: 'c', label: '丙' }];
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: three }, attachTo: document.body });
    const btns = w.findAll('button[role="tab"]');
    expect(btns.map((b) => b.attributes('tabindex'))).toEqual(['0', '-1', '-1']);
    await btns[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(btns[1]!.element);
    await btns[0]!.trigger('keydown', { key: 'ArrowLeft' });
    await btns[0]!.trigger('keydown', { key: 'End' });
    await btns[0]!.trigger('keydown', { key: 'Home' });
    await btns[0]!.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('update:modelValue')).toEqual([['b'], ['c'], ['c']]);
    w.unmount();
  });

  it('disabled（backlog：一番赏抽签进行中）：别的标签点不了、方向键跳过，选中的照常', async () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: TABS, disabled: true } });
    expect(w.get('[data-testid="tab-a"]').attributes('disabled')).toBeUndefined();
    expect(w.get('[data-testid="tab-b"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="tab-b"]').trigger('click');
    await w.get('[data-testid="tab-a"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('只有一个标签时不显示标签栏', () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: [TABS[0]!] } });
    expect(w.find('ul').exists()).toBe(false);
  });
});
