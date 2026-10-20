<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

/**
 * 底部面板（界面改版设计 §5 第 6、7 条）：长表单（预设、一键处理、下单）和确认都从下面弹出。
 * Esc、点遮罩关掉；打开时焦点进面板，关掉回到原来的按钮；“减少动态效果”时只淡入不滑动。
 * 打开时焦点放在第一个输入框，没有输入框就放在面板本身，不放在按钮上（backlog P3：预设面板一按回车就套用了）；
 * Tab 键圈在最上面那层面板里
 */
/** top：确认面板用，永远压在别的面板上面（P7 终审 C1：后挂载的页面面板会盖住确认面板） */
/** focusPanel：打开时焦点放在面板本身，不放进第一个输入框（P9 试炼选料：一打开就弹出手机键盘） */
/** center：屏幕中间的卡片（时令说明弹窗，设计图 Sl-E），没有把手，标题居中；#art 插在标题上面 */
const props = defineProps<{
  open: boolean;
  title: string;
  top?: boolean;
  focusPanel?: boolean;
  center?: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const titleId = `dt-sheet-${useId()}`;
const panel = ref<HTMLElement | null>(null);

const me = Symbol('sheet');
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
  else if (e.key === 'Tab' && stack[stack.length - 1] === me && panel.value) trap(e, panel.value);
}
/** Tab 到最后一个回到第一个，Shift+Tab 反过来；焦点在面板本身或面板外时也拉回来 */
function trap(e: KeyboardEvent, p: HTMLElement) {
  const all = [...p.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (all.length === 0) {
    e.preventDefault();
    p.focus();
    return;
  }
  const first = all[0]!;
  const last = all[all.length - 1]!;
  const at = document.activeElement;
  const inside = at instanceof Node && p.contains(at) && at !== p;
  if (e.shiftKey && (!inside || at === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || at === last)) {
    e.preventDefault();
    first.focus();
  }
}
function opened() {
  if (openCount++ === 0) {
    // 第一层打开：记下回到哪；同一时刻刚关掉一层（收起预设再弹确认）就沿用那一层的
    back = justClosedBack ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    document.body.classList.add('dt-sheet-lock');
  }
  stack.push(me);
  document.addEventListener('keydown', onKey);
  void nextTick(() => {
    const field = panel.value?.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    );
    (props.focusPanel ? panel.value : (field ?? panel.value))?.focus();
  });
}
function closed() {
  document.removeEventListener('keydown', onKey);
  const i = stack.lastIndexOf(me);
  if (i >= 0) stack.splice(i, 1);
  if (--openCount > 0) return;
  // 最后一层关掉：解开滚动、焦点回到最早打开面板的按钮；同一时刻又开了一层就都交给它（终审 I3）
  document.body.classList.remove('dt-sheet-lock');
  justClosedBack = back;
  back = null;
  void nextTick(() => {
    const el = justClosedBack;
    justClosedBack = null;
    restoreFocus(el);
  });
}
/**
 * 焦点回到打开面板的按钮（backlog P6：菜场买完、橱柜用完后焦点回不去）：
 * 按钮还在请求中被禁用、或列表重新渲染换了元素时，隔 100 毫秒再试（最多 2 秒），按同一个 data-testid 找回来；
 * 这期间焦点已经去了别处（玩家点了别的、又开了面板）就不抢
 */
function restoreFocus(el: HTMLElement | null, tries = 0) {
  if (!el || openCount > 0) return;
  const active = document.activeElement;
  if (tries > 0 && active && active !== document.body) return;
  const id = el.dataset.testid;
  const target = el.isConnected
    ? el
    : id
      ? document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
      : null;
  if (target && !(target as HTMLButtonElement).disabled) {
    target.focus();
    return;
  }
  if (tries < 20) setTimeout(() => restoreFocus(el, tries + 1), 100);
}
watch(
  () => props.open,
  (v, was) => {
    if (v) opened();
    else if (was) closed();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (props.open) closed();
});
</script>

<script lang="ts">
/** 开着的面板层数：滚动锁和焦点按层数管，同一时刻一层关、一层开时不互相打架（终审 I3） */
let openCount = 0;
/** 开着的面板，后开的在后面：Tab 键只圈最上面那层 */
const stack: symbol[] = [];
/** 最早打开面板时的焦点（关掉最后一层时回到这里） */
let back: HTMLElement | null = null;
/** 刚关掉最后一层、焦点还没回去时的那个按钮 */
let justClosedBack: HTMLElement | null = null;
</script>

<template>
  <Teleport to="body">
    <div v-if="open" :class="['dt-sheet-wrap', { 'is-top': top, 'is-center': center }]">
      <div class="dt-sheet-scrim" @click="emit('close')"></div>
      <div
        ref="panel"
        class="dt-sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div v-if="!center" class="dt-sheet-grip" aria-hidden="true"></div>
        <div v-if="$slots.art" class="dt-sheet-art"><slot name="art" /></div>
        <div :id="titleId" class="dt-sheet-title">{{ title }}</div>
        <div class="dt-sheet-body"><slot /></div>
        <div v-if="$slots.actions" class="dt-sheet-actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>
