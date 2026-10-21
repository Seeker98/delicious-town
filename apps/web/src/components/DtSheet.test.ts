import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
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

/** 指针事件（jsdom 没有 PointerEvent）：竖着的位置 y、时间 t 毫秒，指针编号 1 */
function fire(el: Element, type: string, y: number, t = 0) {
  const e = new MouseEvent(type, { bubbles: true, clientX: 0, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
}

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

  it('确认面板（top）有 is-top，层级压在页面自己的面板上面（P7 终审 C1）', () => {
    const stubs = { teleport: true };
    expect(
      mount(DtSheet, { props: { open: true, title: 'x', top: true }, global: { stubs } })
        .get('.dt-sheet-wrap')
        .classes(),
    ).toContain('is-top');
    expect(
      mount(DtSheet, { props: { open: true, title: 'x' }, global: { stubs } })
        .get('.dt-sheet-wrap')
        .classes(),
    ).not.toContain('is-top');
  });

  it('按 Esc、点遮罩都是关掉', async () => {
    const w = mount(DtSheet, { props: { open: true, title: 't' }, global: { stubs: { teleport: true } } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toHaveLength(1);
    await w.get('.dt-sheet-scrim').trigger('click');
    expect(w.emitted('close')).toHaveLength(2);
  });

  it('打开后焦点在面板本身（不落在按钮上，backlog P3），关掉后回到打开前的按钮', async () => {
    // 真的 Teleport：替身每次重新渲染都把面板重新插一遍，焦点会掉（面板打开后会再渲染一次加 is-open）
    const w = mount(Harness, { attachTo: document.body });
    const opener = w.get('#opener');
    (opener.element as HTMLButtonElement).focus();
    await opener.trigger('click');
    await flushPromises();
    expect(document.activeElement?.classList.contains('dt-sheet')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(document.activeElement?.id).toBe('opener');
    w.unmount();
  });

  it('关掉时打开按钮还灰着（请求中）：等它恢复再把焦点放回去（backlog P6：菜场买完焦点回不去）', async () => {
    vi.useFakeTimers();
    const busy = ref(false);
    const open = ref(false);
    const Busy = defineComponent({
      setup: () => () => [
        h(
          'button',
          {
            id: 'opener3',
            'data-testid': 'opener3',
            disabled: busy.value,
            onClick: () => (open.value = true),
          },
          '买',
        ),
        h(DtSheet, { open: open.value, title: '买', onClose: () => (open.value = false) }),
      ],
    });
    const w = mount(Busy, { attachTo: document.body, global: { stubs: { teleport: true } } });
    (document.getElementById('opener3') as HTMLButtonElement).focus();
    open.value = true;
    await flushPromises();
    busy.value = true;
    open.value = false;
    await flushPromises();
    expect(document.activeElement?.id).not.toBe('opener3');
    busy.value = false;
    await flushPromises();
    await vi.advanceTimersByTimeAsync(150);
    expect(document.activeElement?.id).toBe('opener3');
    vi.useRealTimers();
    w.unmount();
  });

  it('有输入框时焦点落在第一个输入框；Tab 圈在面板里、跳过灰掉的按钮（P6 审查 I1、backlog P3）', async () => {
    const Disabled = defineComponent({
      setup() {
        const open = ref(false);
        return () => [
          h('button', { id: 'opener2', onClick: () => (open.value = true) }, '打开'),
          h(
            DtSheet,
            { open: open.value, title: '买', onClose: () => (open.value = false) },
            {
              default: () => [
                h('button', { id: 'minus', disabled: true }, '−'),
                h('input', { id: 'qty' }),
                h('button', { id: 'plus' }, '+'),
              ],
            },
          ),
        ];
      },
    });
    const w = mount(Disabled, { attachTo: document.body });
    await w.get('#opener2').trigger('click');
    await flushPromises();
    expect(document.activeElement?.id).toBe('qty');
    const tab = (shiftKey = false) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true }));
    (document.getElementById('plus') as HTMLButtonElement).focus();
    tab();
    expect(document.activeElement?.id).toBe('qty');
    tab(true);
    expect(document.activeElement?.id).toBe('plus');
    // 焦点跑到面板外（页面上的按钮）也拉回来
    (document.getElementById('opener2') as HTMLButtonElement).focus();
    tab();
    expect(document.activeElement?.id).toBe('qty');
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
    const w = mount(Two, { attachTo: document.body });
    await flushPromises();
    await w.get('#swap').trigger('click');
    await flushPromises();
    expect(document.body.classList.contains('dt-sheet-lock')).toBe(true);
    expect(document.activeElement?.closest('.dt-sheet')?.textContent).toContain('确认');
    w.unmount();
    expect(document.body.classList.contains('dt-sheet-lock')).toBe(false);
  });

  it('按住把手往下拖（界面第二批）：面板跟着走；拖过一半松手就关，拖一点点松手弹回', async () => {
    const w = mount(DtSheet, { props: { open: true, title: 't' }, attachTo: document.body });
    const panel = () => document.querySelector<HTMLElement>('.dt-sheet')!;
    // 慢慢拖（1 秒）还是一下甩出去（40 毫秒）
    const drag = async (to: number, ms: number) => {
      fire(document.querySelector('.dt-sheet-grip')!, 'pointerdown', 100, 0);
      fire(panel(), 'pointermove', 110, 10);
      fire(panel(), 'pointermove', 110 + to, 10 + ms);
      await nextTick();
    };
    await drag(20, 1000);
    expect(panel().classList.contains('is-dragging')).toBe(true);
    expect(panel().style.transform).toBe('translateY(20px)');
    fire(panel(), 'pointerup', 130, 1010);
    await nextTick();
    expect(w.emitted('close')).toBeUndefined();
    expect(panel().style.transform).toBe('');

    // jsdom 里面板高度是 0，按 400 算：慢慢拖过 200 就关
    await drag(260, 1000);
    fire(panel(), 'pointerup', 370, 1010);
    expect(w.emitted('close')).toHaveLength(1);
    // 只拖了 60 但甩得快：按速度推算的落点过了一半，也关
    await drag(60, 40);
    fire(panel(), 'pointerup', 170, 50);
    expect(w.emitted('close')).toHaveLength(2);
  });

  it('正文里按下拖动不算（留给滚动）；中间的卡片没有把手', async () => {
    mount(DtSheet, {
      props: { open: true, title: 't' },
      slots: { default: '<p id="body">正文</p>' },
      attachTo: document.body,
    });
    fire(document.getElementById('body')!, 'pointerdown', 100);
    fire(document.querySelector('.dt-sheet')!, 'pointermove', 400);
    await nextTick();
    expect(document.querySelector('.dt-sheet')!.classList.contains('is-dragging')).toBe(false);
    const c = mount(DtSheet, {
      props: { open: true, title: 't', center: true },
      global: { stubs: { teleport: true } },
    });
    expect(c.find('.dt-sheet-grip').exists()).toBe(false);
  });

  it('关掉时没有过渡（样式没加载）就马上拿掉', async () => {
    const w = mount(DtSheet, { props: { open: true, title: 't' }, global: { stubs: { teleport: true } } });
    await w.setProps({ open: false });
    expect(w.find('.dt-sheet-wrap').exists()).toBe(false);
  });
});
