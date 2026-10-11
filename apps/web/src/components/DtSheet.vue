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
let back: HTMLElement | null = null;

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
function opened() {
  back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener('keydown', onKey);
  document.body.classList.add('dt-sheet-lock');
  void nextTick(() => {
    const first = panel.value?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    (first ?? panel.value)?.focus();
  });
}
function closed() {
  document.removeEventListener('keydown', onKey);
  document.body.classList.remove('dt-sheet-lock');
  const el = back;
  back = null;
  void nextTick(() => el?.focus());
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
