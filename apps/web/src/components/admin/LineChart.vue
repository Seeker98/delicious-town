<script setup lang="ts">
import { computed } from 'vue';
import { chartColor, shortNum } from './chartUtil';

/**
 * 折线图（界面改版 P12）：线用固定五色；纵轴刻度（最高、一半、0、最低）和横轴日期写在图外面，
 * 字是 11px 的普通文字，不跟着图一起放大缩小。legend 为 false 时不在下面画图例（统计页写在卡片头上）
 */
const props = withDefaults(
  defineProps<{
    labels: string[];
    series: Array<{ name: string; values: number[] }>;
    height?: number;
    legend?: boolean;
  }>(),
  { height: 220, legend: true },
);

const W = 900;
const PAD = 8;
const values = computed(() => props.series.flatMap((s) => s.values));
const max = computed(() => Math.max(0, ...values.value));
const min = computed(() => Math.min(0, ...values.value));
const span = computed(() => max.value - min.value || 1);
const x = (i: number) => (props.labels.length <= 1 ? W / 2 : (i * W) / (props.labels.length - 1));
const y = (v: number) => PAD + ((max.value - v) * (props.height - 2 * PAD)) / span.value;
/** 刻度：最高、一半、0，有负数时再加最低 */
const ticks = computed(() => {
  const out = [max.value, max.value / 2, 0];
  if (min.value < 0) out.push(min.value);
  return [...new Set(out)].map((v) => ({ v, text: shortNum(v), top: `${(y(v) / props.height) * 100}%` }));
});
/** 横轴最多写 5 个日期，首尾一定写 */
const xLabels = computed(() => {
  const n = props.labels.length;
  if (n <= 5) return props.labels;
  return [0, 1, 2, 3, 4].map((k) => props.labels[Math.round((k * (n - 1)) / 4)]!);
});
const lines = computed(() =>
  props.series.map((s, i) => ({
    name: s.name,
    color: chartColor(i),
    points: s.values.map((v, j) => `${x(j)},${y(v)}`).join(' '),
  })),
);
</script>

<template>
  <div>
    <div class="dt-adm-chart">
      <div class="dt-adm-chart-y" :style="{ height: `${height}px` }">
        <span v-for="t in ticks" :key="t.v" :style="{ top: t.top }">{{ t.text }}</span>
      </div>
      <div class="dt-adm-chart-plot">
        <svg
          :viewBox="`0 0 ${W} ${height}`"
          :height="height"
          preserveAspectRatio="none"
          role="img"
          data-testid="line-chart"
        >
          <line
            v-for="t in ticks"
            :key="t.v"
            x1="0"
            :x2="W"
            :y1="y(t.v)"
            :y2="y(t.v)"
            class="dt-adm-chart-grid"
            vector-effect="non-scaling-stroke"
          />
          <polyline
            v-for="l in lines"
            :key="l.name"
            data-testid="series"
            :points="l.points"
            fill="none"
            :stroke="l.color"
            stroke-width="2"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div class="dt-adm-chart-x">
          <span v-for="(l, i) in xLabels" :key="i">{{ l }}</span>
        </div>
      </div>
    </div>
    <div v-if="legend" class="dt-adm-line dt-adm-mt-sm">
      <span v-for="l in lines" :key="l.name" class="dt-adm-chip"
        ><i :style="{ background: l.color }"></i>{{ l.name }}</span
      >
    </div>
  </div>
</template>
