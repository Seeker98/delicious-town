<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ bars: Array<{ label: string; value: number }>; height?: number }>(),
  {
    height: 160,
  },
);

const W = 600;
const max = computed(() => Math.max(1, ...props.bars.map((b) => b.value)));
const bw = computed(() => (W - 20) / Math.max(1, props.bars.length));
const h = (v: number) => ((props.height - 40) * v) / max.value;
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${height}`" class="w-100" role="img" data-testid="bar-chart">
    <g v-for="(b, i) in bars" :key="b.label">
      <rect
        data-testid="bar"
        :x="10 + i * bw + 2"
        :width="Math.max(1, bw - 4)"
        :y="height - 20 - h(b.value)"
        :height="h(b.value)"
        fill="#0d6efd"
      />
      <text :x="10 + i * bw + bw / 2" :y="height - 6" font-size="10" text-anchor="middle">{{ b.label }}</text>
      <text :x="10 + i * bw + bw / 2" :y="height - 24 - h(b.value)" font-size="10" text-anchor="middle">
        {{ b.value }}
      </text>
    </g>
  </svg>
</template>
