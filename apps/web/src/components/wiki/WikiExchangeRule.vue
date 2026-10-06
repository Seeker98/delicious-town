<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { OpenExchangeRule } from '@dt/shared';
import { useT } from '../../composables/useT';

/** 一条兑换规则：A ×2 + B ×1 → C ×1（每人限兑几次）；道具都是链接（问题记录 142） */
defineProps<{ rule: OpenExchangeRule }>();
const t = useT();
</script>

<template>
  <span>
    <template v-for="(n, i) in rule.need" :key="n.goodsId">
      <span v-if="i > 0"> + </span>
      <RouterLink :to="`/wiki/goods/${n.goodsId}`">{{ n.name }}</RouterLink
      >{{ t.common.times }}{{ n.num }}
    </template>
    → <RouterLink :to="`/wiki/goods/${rule.goodsId}`">{{ rule.goodsName }}</RouterLink
    >{{ t.common.times }}{{ rule.num }}{{ t.wiki.sources.times(rule.times) }}
  </span>
</template>
