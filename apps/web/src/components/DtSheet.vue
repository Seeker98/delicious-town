<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

/**
 * 底部面板（界面改版设计 §5 第 6、7 条）：长表单（预设、一键处理、下单）和确认都从下面弹出。
 * Esc、点遮罩关掉；打开时焦点进面板，关掉回到原来的按钮；“减少动态效果”时只淡入不滑动
 */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const titleId = `dt-sheet-${useId()}`;
const panel = ref<HTMLElement | null>(null);

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
function opened() {
  if (openCount++ === 0) {
    // 第一层打开：记下回到哪；同一时刻刚关掉一层（收起预设再弹确认）就沿用那一层的
    back = justClosedBack ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    document.body.classList.add('dt-sheet-lock');
  }
  document.addEventListener('keydown', onKey);
  void nextTick(() => {
    const first = panel.value?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    (first ?? panel.value)?.focus();
  });
}
function closed() {
  document.removeEventListener('keydown', onKey);
  if (--openCount > 0) return;
  // 最后一层关掉：解开滚动、焦点回到最早打开面板的按钮；同一时刻又开了一层就都交给它（终审 I3）
  document.body.classList.remove('dt-sheet-lock');
  justClosedBack = back;
  back = null;
  void nextTick(() => {
    const el = justClosedBack;
    justClosedBack = null;
    if (openCount === 0) el?.focus();
  });
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
/** 最早打开面板时的焦点（关掉最后一层时回到这里） */
let back: HTMLElement | null = null;
/** 刚关掉最后一层、焦点还没回去时的那个按钮 */
let justClosedBack: HTMLElement | null = null;
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dt-sheet-wrap">
      <div class="dt-sheet-scrim" @click="emit('close')"></div>
      <div
        ref="panel"
        class="dt-sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="dt-sheet-grip" aria-hidden="true"></div>
        <div :id="titleId" class="dt-sheet-title">{{ title }}</div>
        <div class="dt-sheet-body"><slot /></div>
        <div v-if="$slots.actions" class="dt-sheet-actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>
