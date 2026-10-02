<script setup lang="ts">
import type { NeedCheckDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { formatNum } from '../utils/format';

defineProps<{ checks: NeedCheckDto[] }>();
const catalog = useCatalogStore();
const t = useT();
</script>

<template>
  <ul class="list-unstyled small mb-2">
    <li v-for="(c, i) in checks" :key="i" :class="c.ok ? 'text-success' : 'text-danger'">
      <i :class="['bi', c.ok ? 'bi-check-circle' : 'bi-x-circle']"></i>
      {{
        t.society.needLine(
          c.key === 'goods' ? catalog.goodsName(c.id ?? 0) : (t.society.needs[c.key] ?? c.key),
          formatNum(c.have),
          formatNum(c.need),
        )
      }}
    </li>
  </ul>
</template>
