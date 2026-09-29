<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ labels: string[]; series: Array<{ name: string; values: number[] }>; height?: number }>(),
  { height: 180 },
);

const W = 600;
const PAD = 30;
const COLORS = ['#0d6efd', '#dc3545', '#198754', '#fd7e14', '#6f42c1', '#20c997', '#6c757d'];

const values = computed(() => props.series.flatMap((s) => s.values));
const max = computed(() => Math.max(0, ...values.value));
const min = computed(() => Math.min(0, ...values.value));
const x = (i: number) =>
  PAD + (props.labels.length <= 1 ? 0 : (i * (W - 2 * PAD)) / (props.labels.length - 1));
const y = (v: number) => {
  const span = max.value - min.value || 1;
  return props.height - PAD / 2 - ((v - min.value) * (props.height - PAD)) / span;
};
const lines = computed(() =>
  props.series.map((s, i) => ({
    name: s.name,
    color: COLORS[i % COLORS.length],
    points: s.values.map((v, j) => `${x(j)},${y(v)}`).join(' '),
  })),
);
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${height}`" class="w-100" role="img" data-testid="line-chart">
      <line :x1="PAD" :x2="W - PAD" :y1="y(0)" :y2="y(0)" stroke="#ccc" />
      <text x="2" :y="y(max) + 4" font-size="10">{{ max }}</text>
      <text x="2" :y="y(min)" font-size="10">{{ min }}</text>
      <polyline
        v-for="l in lines"
        :key="l.name"
        data-testid="series"
        :points="l.points"
        fill="none"
        :stroke="l.color"
        stroke-width="2"
      />
      <text v-if="labels.length > 0" :x="PAD" :y="height - 2" font-size="10">{{ labels[0] }}</text>
      <text v-if="labels.length > 1" :x="W - PAD" :y="height - 2" font-size="10" text-anchor="end">
        {{ labels[labels.length - 1] }}
      </text>
    </svg>
    <div class="small d-flex flex-wrap gap-2">
      <span v-for="l in lines" :key="l.name"><span :style="{ color: l.color }">●</span> {{ l.name }}</span>
    </div>
  </div>
</template>
