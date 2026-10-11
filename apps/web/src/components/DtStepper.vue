<script setup lang="ts">
import { watch } from 'vue';
import { useT } from '../composables/useT';

/** 数量步进器（界面改版设计 §5 第 6 条）：取代固定宽度的数字框；中间仍能直接打字，失焦时夹到范围里 */
const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    /** 落在中间的输入框上：原来数字框的测试用 setValue 照常能用 */
    testid?: string;
    disabled?: boolean;
    /** 紧凑尺寸：列表行里用（界面改版 P4，菜场一行放不下普通尺寸） */
    size?: 'sm';
  }>(),
  { min: 0, max: Number.MAX_SAFE_INTEGER, step: 1, testid: undefined, disabled: false, size: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [n: number] }>();
const t = useT();
const clamp = (n: number) =>
  Math.min(props.max, Math.max(props.min, Math.floor(Number.isFinite(n) ? n : props.min)));
function set(n: number) {
  const v = clamp(n);
  if (v !== props.modelValue) emit('update:modelValue', v);
}
function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const n = Number(el.value);
  // 打字时只在是合法数字时跟着变；空的、打了一半的、低于下限的等失焦再处理
  if (el.value === '' || !Number.isFinite(n)) return;
  set(n);
  // 超过上限马上退回上限（已经在上限时值没变、不会重新渲染，框里要自己改回来）
  if (n > props.max) el.value = String(props.max);
}
function onBlur(e: Event) {
  const el = e.target as HTMLInputElement;
  set(el.value === '' ? Number.NaN : Number(el.value));
  el.value = String(clamp(props.modelValue));
}
// 范围变了（上限变小：体力用掉了、持有变少）：当前值跟着夹
watch(
  () => [props.min, props.max],
  () => set(props.modelValue),
);
</script>

<template>
  <div :class="['dt-stepper', { 'dt-stepper-sm': size === 'sm' }]">
    <button
      type="button"
      :aria-label="t.common.decrease"
      :disabled="disabled || modelValue <= min"
      @click="set(modelValue - step)"
    >
      −
    </button>
    <input
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      :value="modelValue"
      :disabled="disabled"
      :data-testid="testid"
      @input="onInput"
      @blur="onBlur"
    />
    <button
      type="button"
      :aria-label="t.common.increase"
      :disabled="disabled || modelValue >= max"
      @click="set(modelValue + step)"
    >
      +
    </button>
  </div>
</template>
