<script setup lang="ts">
import { computed } from 'vue';
import { formatNum } from '../../utils/format';

/** 柱状图（界面改版 P12）：柱顶写数，下面写区间；柱子一个颜色（紫） */
const props = defineProps<{ bars: Array<{ label: string; value: number }> }>();
const max = computed(() => Math.max(1, ...props.bars.map((b) => b.value)));
/** 柱高按比例，最低 1%：数是 0 时也留一条细线 */
const pct = (v: number) => `${Math.max(1, (v / max.value) * 100)}%`;
</script>

<template>
  <div class="dt-adm-bars" role="img" data-testid="bar-chart">
    <div v-for="b in bars" :key="b.label" class="dt-adm-bar">
      <b>{{ formatNum(b.value) }}</b>
      <div class="dt-adm-bar-col"><i data-testid="bar" :style="{ height: pct(b.value) }"></i></div>
      <span>{{ b.label }}</span>
    </div>
  </div>
</template>
