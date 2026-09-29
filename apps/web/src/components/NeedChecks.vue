<script setup lang="ts">
import type { NeedCheckDto } from '@dt/shared';
import { useCatalogStore } from '../stores/catalog';
import { formatNum } from '../utils/format';

defineProps<{ checks: NeedCheckDto[] }>();
const catalog = useCatalogStore();
const LABEL: Record<string, string> = {
  level: '餐厅等级',
  star: '星级',
  cookbooks: '已学食谱',
  coin: '银币',
};
</script>

<template>
  <ul class="list-unstyled small mb-2">
    <li v-for="(c, i) in checks" :key="i" :class="c.ok ? 'text-success' : 'text-danger'">
      <i :class="['bi', c.ok ? 'bi-check-circle' : 'bi-x-circle']"></i>
      {{ c.key === 'goods' ? catalog.goodsName(c.id ?? 0) : LABEL[c.key] }}：{{ formatNum(c.have) }} /
      {{ formatNum(c.need) }}
    </li>
  </ul>
</template>
