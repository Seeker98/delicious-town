<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

/**
 * 底部面板（界面改版设计 §5 第 6、7 条）：长表单（预设、一键处理、下单）和确认都从下面弹出。
 * Esc、点遮罩关掉；打开时焦点进面板，关掉回到原来的按钮；“减少动态效果”时只淡入不滑动。
 * 打开时焦点放在第一个输入框，没有输入框就放在面板本身，不放在按钮上（backlog P3：预设面板一按回车就套用了）；
 * Tab 键圈在最上面那层面板里。
 * 进出（界面第二批）：用 CSS 过渡、不用关键帧，关到一半又打开时从当前位置接着走；出去沿原路滑回下面；
 * 按住把手（或标题）往下拖能关：面板跟着手指走，松手按速度推算落点，过了一半就关、不到就弹回
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
/** 还在页面上（开着或正在退场）；is-open 类：开着的样子，去掉就沿原路退出去 */
const shown = ref(false);
const entered = ref(false);
const wrap = ref<HTMLElement | null>(null);
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

/** 面板现在的过渡要多久（秒）；没有过渡（测试环境、样式没加载）时是 0，关掉就马上拿掉 */
function transitionSecs(el: HTMLElement | null): number {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  const list = (v: string) =>
    v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1) || 0);
  const durs = list(cs.transitionDuration);
  const delays = list(cs.transitionDelay);
  return Math.max(0, ...durs.map((d, i) => d + (delays[i % delays.length] ?? 0)));
}
function enter() {
  clearTimeout(leaveTimer);
  if (shown.value) {
    // 正在退场又打开：从当前位置接着回来
    entered.value = true;
    return;
  }
  shown.value = true;
  void nextTick(() => {
    // 先按“关着”的样子排一次版，再加 is-open，过渡才有起点
    void wrap.value?.offsetHeight;
    if (props.open) entered.value = true;
  });
}
function leave() {
  entered.value = false;
  clearTimeout(leaveTimer);
  const secs = transitionSecs(panel.value);
  if (secs === 0) {
    finishLeave();
    return;
  }
  // 兜底：后台标签页里 transitionend 可能不来
  leaveTimer = setTimeout(finishLeave, secs * 1000 + 100);
}
function finishLeave() {
  clearTimeout(leaveTimer);
  if (props.open) return;
  shown.value = false;
  dragY.value = 0;
  releaseMs.value = 0;
}
function onTransitionEnd(e: TransitionEvent) {
  if (e.target !== panel.value) return;
  releaseMs.value = 0;
  if (!props.open) finishLeave();
}

/* ---------- 往下拖关掉（界面第二批） ---------- */
/** 拖动时面板往下移了多少；松手后清零，交给过渡从这里走到终点 */
const dragY = ref(0);
const dragging = ref(false);
/** 松手后这一段过渡的时长：按手指速度算，甩得快就走得快，接得上手指 */
const releaseMs = ref(0);
let drag: { id: number; x0: number; y0: number; on: boolean; hist: { y: number; t: number }[] } | null = null;
/** 拖动开始时量的面板高度（样式没加载、量不出来时按 400）；不放进响应式，渲染时读它不会引起重算 */
let dragH = 400;
/** 超出边界时越拉越沉（往上拖时用） */
function rubberband(over: number, dim: number, c = 0.55): number {
  return (over * dim * c) / (dim + c * Math.abs(over));
}
/** 按松手速度推算最后停在哪（滚动减速的算法）：v 是像素/秒 */
function project(v: number, rate = 0.998): number {
  return ((v / 1000) * rate) / (1 - rate);
}
function onPointerDown(e: PointerEvent) {
  if (props.center || !props.open || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const t = e.target instanceof Element ? e.target : null;
  if (!t?.closest('.dt-sheet-grip, .dt-sheet-title, .dt-sheet-art')) return;
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, hist: [] };
}
function onPointerMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.on) {
    // 先走 6 像素、竖着为主才算拖；横着走开就不管了
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) drag = null;
    if (!drag || Math.abs(dy) < 6) return;
    drag.on = true;
    drag.y0 = e.clientY;
    dragH = panel.value?.offsetHeight || 400;
    dragging.value = true;
    releaseMs.value = 0;
    panel.value?.setPointerCapture?.(e.pointerId);
  }
  const off = e.clientY - drag.y0;
  dragY.value = off >= 0 ? off : rubberband(off, dragH);
  drag.hist.push({ y: e.clientY, t: e.timeStamp });
  while (drag.hist.length > 2 && e.timeStamp - drag.hist[0]!.t > 100) drag.hist.shift();
}
function onPointerUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.on) return;
  dragging.value = false;
  // 速度只看松手前 100 毫秒：拖到一半停住再松手，速度是 0，不会因为停住前拖得快就关掉
  const recent = [...d.hist, { y: e.clientY, t: e.timeStamp }].filter((h) => e.timeStamp - h.t <= 100);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = first && last ? last.t - first.t : 0;
  // 两个点隔得太近（合并的事件）时按 8 毫秒算，免得速度算出天文数字
  const v =
    e.type === 'pointercancel' || !first || !last || recent.length < 2
      ? 0
      : ((last.y - first.y) / Math.max(dt, 8)) * 1000;
  const h = dragH;
  const close = e.type !== 'pointercancel' && dragY.value + project(v) > h / 2;
  const left = close ? h - dragY.value : Math.abs(dragY.value);
  // 抽屉曲线起步斜率约 2.25：按这个让过渡的起速等于手指的速度
  const speed = close ? v : -v;
  releaseMs.value = speed > 0 ? Math.min(280, Math.max(120, (2.25 * left * 1000) / speed)) : 0;
  if (close) {
    // 减少动态时面板只淡出不滑：留在手指放开的地方淡掉
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) dragY.value = 0;
    emit('close');
    // 页面没关（比如确认面板不让关）：弹回去
    void nextTick(() => {
      if (props.open) dragY.value = 0;
    });
  } else {
    dragY.value = 0;
  }
}
const panelStyle = computed(() => ({
  ...(dragY.value !== 0 ? { transform: `translateY(${dragY.value}px)` } : {}),
  ...(releaseMs.value > 0 ? { transitionDuration: `${releaseMs.value}ms` } : {}),
}));
const scrimStyle = computed(() => {
  if (dragY.value <= 0) return {};
  return { opacity: String(Math.max(0, 1 - dragY.value / dragH)) };
});

watch(
  () => props.open,
  (v, was) => {
    if (v) {
      opened();
      enter();
    } else if (was) {
      closed();
      leave();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  clearTimeout(leaveTimer);
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
    <div
      v-if="shown"
      ref="wrap"
      :class="['dt-sheet-wrap', { 'is-top': top, 'is-center': center, 'is-open': entered }]"
      :inert="open ? undefined : true"
    >
      <div
        :class="['dt-sheet-scrim', { 'is-dragging': dragging }]"
        :style="scrimStyle"
        @click="emit('close')"
      ></div>
      <div
        ref="panel"
        :class="['dt-sheet', { 'is-dragging': dragging }]"
        :style="panelStyle"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @transitionend="onTransitionEnd"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
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
