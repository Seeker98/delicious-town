<script setup lang="ts">
/** 统计块（界面改版 P5）：大数字 + 小标签；good 绿、bad 红、不写是正文色 */
defineProps<{ value: string; label: string; tone?: 'good' | 'bad' }>();
</script>

<template>
  <div :class="['dt-stat', tone ? `is-${tone}` : '']">
    <div class="dt-stat-value">{{ value }}</div>
    <div class="dt-stat-label">{{ label }}</div>
  </div>
</template>
