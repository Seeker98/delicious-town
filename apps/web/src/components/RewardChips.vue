<script setup lang="ts">
import { computed } from 'vue';
import type { RewardItems } from '@dt/shared';
import { rewardChips } from '../utils/reward';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import DtArt from './DtArt.vue';

/**
 * 奖励拆成小胶囊（界面改版 P11：兑换码结果、新手兑换码；和邮件附件同一种胶囊）：每样一枚，图 + 名字×数量；
 * 称号没有图，用“称”字代替
 */
const props = defineProps<{ items: RewardItems }>();
const t = useT();
const catalog = useCatalogStore();
const chips = computed(() =>
  rewardChips(props.items, {
    goodsName: (id) => catalog.goodsName(id),
    foodName: (id) => catalog.foodName(id),
    goodsArt: (id) => catalog.goodsArt(id),
    foodArt: (id) => catalog.foodArt(id),
    icon: (key) => catalog.icon(key),
  }),
);
</script>

<template>
  <span class="dt-mail-chips">
    <span v-for="(c, i) in chips" :key="i" class="dt-mail-chip"
      ><span class="dt-mail-chip-art"
        ><DtArt v-if="c.art" :name="c.art" :size="16" /><b v-else aria-hidden="true">{{
          t.mail.iconMark
        }}</b></span
      >{{ c.text }}</span
    >
  </span>
</template>
