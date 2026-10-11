import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import DtSheet from './DtSheet.vue';

/** 外面一个打开按钮，里面一个底部面板：看焦点进出 */
const Harness = defineComponent({
  setup() {
    const open = ref(false);
    return () => [
      h('button', { id: 'opener', onClick: () => (open.value = true) }, '打开'),
      h(
        DtSheet,
        { open: open.value, title: '分解？', onClose: () => (open.value = false) },
        { default: () => h('p', '正文'), actions: () => h('button', { id: 'ok' }, '好') },
      ),
    ];
  },
});

// 开着的面板层数是模块里的计数：每条测试后卸载，不留着开着的面板
enableAutoUnmount(afterEach);

describe('底部面板（界面改版 P3，设计 §5 第 6、7 条）', () => {
  it('关着时不渲染；开着时是对话框，标题当名字', () => {
    expect(
      mount(DtSheet, { props: { open: false, title: 'x' } })
        .find('[role="dialog"]')
        .exists(),
    ).toBe(false);
    const w = mount(DtSheet, {
      props: { open: true, title: '分解？' },
      slots: { default: '<p>正文</p>' },
      global: { stubs: { teleport: true } },
    });
    const d = w.get('[role="dialog"]');
    expect(d.attributes('aria-modal')).toBe('true');
    expect(w.get(`#${d.attributes('aria-labelledby')}`).text()).toBe('分解？');
    expect(d.text()).toContain('正文');
  });

  it('按 Esc、点遮罩都是关掉', async () => {
    const w = mount(DtSheet, { props: { open: true, title: 't' }, global: { stubs: { teleport: true } } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toHaveLength(1);
    await w.get('.dt-sheet-scrim').trigger('click');
    expect(w.emitted('close')).toHaveLength(2);
  });

  it('打开后焦点进面板（第一个按钮），关掉后回到打开前的按钮', async () => {
    const w = mount(Harness, { attachTo: document.body, global: { stubs: { teleport: true } } });
    const opener = w.get('#opener');
    (opener.element as HTMLButtonElement).focus();
    await opener.trigger('click');
    await flushPromises();
    expect(document.activeElement?.id).toBe('ok');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(document.activeElement?.id).toBe('opener');
    w.unmount();
  });

  it('同一时刻关掉一个、打开另一个（收起预设再弹确认）：滚动锁还在，焦点在新面板里，不被拉回页面（终审 I3）', async () => {
    const Two = defineComponent({
      setup() {
        const a = ref(true);
        const b = ref(false);
        return () => [
          h('button', { id: 'swap', onClick: () => ((a.value = false), (b.value = true)) }, '换'),
          h(DtSheet, { open: b.value, title: '确认' }, { actions: () => h('button', { id: 'b-ok' }, '好') }),
          h(DtSheet, { open: a.value, title: '预设' }, { actions: () => h('button', { id: 'a-ok' }, '用') }),
        ];
      },
    });
    const w = mount(Two, { attachTo: document.body, global: { stubs: { teleport: true } } });
    await flushPromises();
    await w.get('#swap').trigger('click');
    await flushPromises();
    expect(document.body.classList.contains('dt-sheet-lock')).toBe(true);
    expect(document.activeElement?.id).toBe('b-ok');
    w.unmount();
    expect(document.body.classList.contains('dt-sheet-lock')).toBe(false);
  });
});
