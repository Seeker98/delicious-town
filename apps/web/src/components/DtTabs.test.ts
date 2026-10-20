import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref, type PropType } from 'vue';
import { tabsShown } from '../utils/tabsIds';
import DtTabPanel from './DtTabPanel.vue';
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

// 页面里 DtTabs 和 DtTabPanel 是兄弟节点
const Page = defineComponent({
  props: { tabs: { type: Array as PropType<typeof TABS>, default: () => TABS }, idPrefix: String },
  setup(props) {
    const tab = ref('a');
    return () =>
      h('div', [
        h(DtTabs, {
          modelValue: tab.value,
          tabs: props.tabs,
          idPrefix: props.idPrefix,
          'onUpdate:modelValue': (k: string) => (tab.value = k),
        }),
        h(
          DtTabPanel,
          { tab: tab.value, idPrefix: props.idPrefix },
          { default: () => h('p', { 'data-testid': 'body' }, tab.value) },
        ),
      ]);
  },
});

describe('DtTabs 和 DtTabPanel（backlog：读屏的 tab ↔ tabpanel 对应）', () => {
  it('选中的标签 aria-controls 指向内容区，内容区 aria-labelledby 指回标签；切换后跟着变', async () => {
    const w = mount(Page);
    const check = (key: string) => {
      const tab = w.get(`[data-testid="tab-${key}"]`);
      const panel = w.get('[role="tabpanel"]');
      expect(tab.attributes('id')).toBe(`dt-tabs-tab-${key}`);
      expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'));
      expect(panel.attributes('id')).toBe(`dt-tabs-panel-${key}`);
      expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'));
      expect(panel.attributes('tabindex')).toBe('0');
      expect(panel.get('[data-testid="body"]').text()).toBe(key);
    };
    check('a');
    // 没选中的标签有 id，但内容区没渲染，不写 aria-controls
    expect(w.get('[data-testid="tab-b"]').attributes('id')).toBe('dt-tabs-tab-b');
    expect(w.get('[data-testid="tab-b"]').attributes('aria-controls')).toBeUndefined();
    await w.get('[data-testid="tab-b"]').trigger('click');
    check('b');
    expect(w.get('[data-testid="tab-a"]').attributes('aria-controls')).toBeUndefined();
    w.unmount();
  });

  it('自定 idPrefix：两边用同一个前缀', () => {
    const w = mount(Page, { props: { idPrefix: 'ex' } });
    expect(w.get('[data-testid="tab-a"]').attributes('aria-controls')).toBe('ex-panel-a');
    expect(w.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe('ex-tab-a');
    w.unmount();
  });

  it('只有一个标签（标签栏不显示）时内容区不标 tabpanel，只留一个不带属性的 div', async () => {
    const w = mount(Page, { props: { tabs: [TABS[0]!], idPrefix: 'one' } });
    expect(w.find('[role="tabpanel"]').exists()).toBe(false);
    const box = w.get('[data-testid="body"]').element.parentElement!;
    expect(box.tagName).toBe('DIV');
    expect(box.getAttributeNames()).toEqual([]);
    // 标签多了以后标上，里面的东西不重新挂载
    const body = w.get('[data-testid="body"]').element;
    await w.setProps({ tabs: TABS });
    expect(w.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe('one-tab-a');
    expect(w.get('[data-testid="body"]').element).toBe(body);
    w.unmount();
    expect(tabsShown('one')).toBe(false);
  });

  // 上面几个用例没卸载，默认前缀还登记着，这里用单独的前缀
  it('换页时新标签栏先挂载、旧的后卸载，登记不会被旧的清掉', () => {
    const props = { modelValue: 'a', tabs: TABS, idPrefix: 'swap' };
    const old = mount(DtTabs, { props });
    const next = mount(DtTabs, { props });
    old.unmount();
    expect(tabsShown('swap')).toBe(true);
    next.unmount();
    expect(tabsShown('swap')).toBe(false);
  });
});
