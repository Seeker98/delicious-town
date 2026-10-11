<script setup lang="ts">
import { computed } from 'vue';
import type { NeedCheckDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { formatNum } from '../utils/format';
import { needLabel } from '../utils/needs';

/**
 * 升星、扩油的条件清单（界面改版 P10）：一张卡片一条一行，左边圆圈（够了绿 ✓、不够红 !），
 * 右边“现有 / 要求”，不够的现有数标红；不够的排前面
 */
const props = defineProps<{ checks: NeedCheckDto[] }>();
const catalog = useCatalogStore();
const t = useT();
const rows = computed(() => [...props.checks].sort((a, b) => Number(a.ok) - Number(b.ok)));
const label = (c: NeedCheckDto) => needLabel(c, t.value, (id) => catalog.goodsName(id));
</script>

<template>
  <div class="dt-card dt-rows-card" data-testid="need-checks">
    <div v-for="(c, i) in rows" :key="i" class="dt-check-line" :data-testid="`need-${c.key}`">
      <span :class="['dt-check-mark', c.ok ? 'is-ok' : 'is-bad']" aria-hidden="true">{{
        c.ok ? '✓' : '!'
      }}</span>
      <span class="dt-check-name">{{ label(c) }}</span>
      <span class="visually-hidden">{{ c.ok ? t.society.checkOk : t.society.checkBad }}</span>
      <b :class="['dt-check-have', { 'text-danger': !c.ok }]">{{ formatNum(c.have) }}</b>
      <span class="dt-check-need">/ {{ formatNum(c.need) }}</span>
    </div>
  </div>
</template>
