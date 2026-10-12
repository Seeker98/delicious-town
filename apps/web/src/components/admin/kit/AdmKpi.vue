<script setup lang="ts">
/** 数字块（界面改版 P12）：灰字名字、大数字，下面可写一行灰字；small 是玩家详情里那排小的 */
defineProps<{ label: string; value: string | number; sub?: string; small?: boolean; testid?: string }>();
</script>

<template>
  <div :class="['dt-adm-box', 'dt-adm-kpi', { 'is-sm': small }]" :data-testid="testid">
    <span>{{ label }}</span
    ><b>{{ value }}</b
    ><i v-if="sub || $slots.sub"
      ><slot name="sub">{{ sub }}</slot></i
    >
  </div>
</template>
