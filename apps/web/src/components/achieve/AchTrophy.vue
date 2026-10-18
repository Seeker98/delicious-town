<script setup lang="ts">
/**
 * 成就奖杯（成就系统 2026-10-19）：杯身、两耳、底座；底色按档次（铜、银、金、彩），没拿到的是灰色剪影。
 * 颜色在 tokens.css 的 --dt-trophy-*，样式在 main.css 的 .dt-trophy
 */
withDefaults(defineProps<{ tone?: string; locked?: boolean; size?: number; label?: string }>(), {
  tone: 'bronze',
  locked: false,
  size: 40,
  label: '',
});
</script>

<template>
  <svg
    :class="['dt-trophy', locked ? 'is-locked' : `is-${tone}`]"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  >
    <path class="dt-trophy-a" d="M14 8h20v10a10 10 0 0 1-20 0z" />
    <path class="dt-trophy-ear" d="M14 11H8a6 6 0 0 0 6 8M34 11h6a6 6 0 0 1-6 8" />
    <path class="dt-trophy-shine" d="M20 8h4v14a6 6 0 0 1-4-4z" />
    <rect class="dt-trophy-b" x="21" y="27" width="6" height="7" />
    <rect class="dt-trophy-a" x="15" y="34" width="18" height="6" rx="2" />
    <rect class="dt-trophy-b" x="15" y="38" width="18" height="2" rx="1" />
  </svg>
</template>
