<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '../composables/useT';

/** 等级环（界面改版 P5，样稿 B）：外圈是经验进度，中间是等级；百分比夹在 0~100 */
const props = withDefaults(defineProps<{ level: number; percent: number; size?: number }>(), { size: 72 });
const t = useT();
const pct = computed(() => Math.max(0, Math.min(100, Math.round(props.percent))));
const R = 30;
const C = 2 * Math.PI * R;
const dash = computed(() => `${((pct.value / 100) * C).toFixed(1)} ${C.toFixed(1)}`);
</script>

<template>
  <div
    class="dt-level-ring"
    role="img"
    :aria-label="t.common.levelRing(level, pct)"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg :width="size" :height="size" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <circle class="dt-level-ring-track" cx="36" cy="36" :r="R" />
      <circle
        class="dt-level-ring-arc"
        data-testid="level-ring-arc"
        cx="36"
        cy="36"
        :r="R"
        :stroke-dasharray="dash"
        transform="rotate(-90 36 36)"
      />
    </svg>
    <span class="dt-level-ring-text" aria-hidden="true"
      ><small>Lv</small
      ><b
        ><slot>{{ level }}</slot></b
      ></span
    >
  </div>
</template>
