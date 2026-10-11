<script setup lang="ts">
import { useT } from '../composables/useT';

/** 加载骨架（界面改版设计 §5 第 8 条）：数据没回来时先占几行灰条，不写“加载中”；读屏照样读 */
withDefaults(defineProps<{ rows?: number }>(), { rows: 4 });
const t = useT();
</script>

<template>
  <div class="dt-skel" aria-busy="true">
    <span class="visually-hidden">{{ t.common.loading }}</span>
    <div v-for="i in rows" :key="i" class="dt-skel-row" aria-hidden="true"></div>
  </div>
</template>
