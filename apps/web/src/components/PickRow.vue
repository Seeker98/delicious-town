<script setup lang="ts">
import type { ArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/**
 * 面板里“选一个”的一行（界面改版 P10：换天气、开课选菜和教师证）：左边单选圈、图形托盘，
 * 中间名字和一行灰字，右边价格或小标签。放在 .dt-card.dt-rows-card 里，一行一个；
 * 外层给 role="radiogroup" 和 aria-label。选不了的行灰掉（disabled），原因写在右边小标签里
 */
defineProps<{
  on: boolean;
  disabled?: boolean;
  art?: ArtName;
  title?: string;
  sub?: string;
  testid?: string;
}>();
const emit = defineEmits<{ pick: [] }>();
</script>

<template>
  <button
    type="button"
    role="radio"
    :aria-checked="on"
    :class="['dt-pick', { 'is-on': on }]"
    :disabled="disabled"
    :data-testid="testid"
    @click="emit('pick')"
  >
    <span class="dt-pick-rad" aria-hidden="true"></span>
    <span v-if="art" class="dt-pick-art"><DtArt :name="art" :size="26" /></span>
    <span class="dt-pick-main">
      <span class="dt-pick-title"
        ><slot name="title">{{ title }}</slot></span
      >
      <span v-if="sub || $slots.sub" class="dt-pick-sub"
        ><slot name="sub">{{ sub }}</slot></span
      >
    </span>
    <span v-if="$slots.end" class="dt-pick-end"><slot name="end" /></span>
  </button>
</template>
