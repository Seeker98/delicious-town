<script setup lang="ts">
import { ref, watch } from 'vue';
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
    /** 紧凑尺寸：列表行里用（界面改版 P4，菜场一行放不下普通尺寸）；宽的放价格、金额（P8 终审 I4） */
    size?: 'sm' | 'wide';
    /** 中间数字框的读屏名字（backlog P3：原来没有，读屏只听到“减少 / 增加”）；不传时读“数量” */
    label?: string;
  }>(),
  {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    step: 1,
    testid: undefined,
    disabled: false,
    size: undefined,
    label: undefined,
  },
);
const emit = defineEmits<{ 'update:modelValue': [n: number] }>();
const t = useT();
const clamp = (n: number) =>
  Math.min(props.max, Math.max(props.min, Math.floor(Number.isFinite(n) ? n : props.min)));
/**
 * 正在打的字（P8 终审）：打到一半、低于下限的先不发出去，框里照打的显示；
 * 父组件这时重新渲染（大宗认购冷却每秒倒数）也不会把框里改回原来的数。失焦时夹好、清掉
 */
const draft = ref<string | null>(null);
function set(n: number) {
  const v = clamp(n);
  if (v !== props.modelValue) emit('update:modelValue', v);
}
function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const n = Number(el.value);
  draft.value = el.value;
  // 打字时只在是合法数字时跟着变；空的、打了一半的、低于下限的等失焦再处理
  // （P8 终审 C1：低于下限也马上夹回，价格框打第一位就跳成下限，没法手动输入）
  if (el.value === '' || !Number.isFinite(n) || n < props.min) return;
  set(n);
  // 超过上限马上退回上限（已经在上限时值没变、不会重新渲染，框里要自己改回来）
  if (n > props.max) {
    draft.value = String(props.max);
    el.value = draft.value;
  }
}
function onBlur(e: Event) {
  const el = e.target as HTMLInputElement;
  // 框里显示夹好的这个数（不是还没更新的 modelValue：打字时低于下限的不再先发出去，P8 终审）
  const v = clamp(el.value === '' ? Number.NaN : Number(el.value));
  draft.value = null;
  set(v);
  el.value = String(v);
}
/** 加减按钮：先丢掉打了一半的字 */
function bump(d: number) {
  draft.value = null;
  set(props.modelValue + d);
}
// 范围变了（上限变小：体力用掉了、持有变少）：当前值跟着夹
watch(
  () => [props.min, props.max],
  () => set(props.modelValue),
);
</script>

<template>
  <div :class="['dt-stepper', { 'dt-stepper-sm': size === 'sm', 'dt-stepper-wide': size === 'wide' }]">
    <button
      type="button"
      :aria-label="t.common.decrease"
      :disabled="disabled || modelValue <= min"
      @click="bump(-step)"
    >
      −
    </button>
    <input
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      :value="draft ?? modelValue"
      :disabled="disabled"
      :aria-label="label ?? t.common.quantity"
      :data-testid="testid"
      @input="onInput"
      @blur="onBlur"
    />
    <button
      type="button"
      :aria-label="t.common.increase"
      :disabled="disabled || modelValue >= max"
      @click="bump(step)"
    >
      +
    </button>
  </div>
</template>
