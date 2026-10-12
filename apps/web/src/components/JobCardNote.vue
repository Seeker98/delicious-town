<script setup lang="ts">
import { computed } from 'vue';
import DtArt from './DtArt.vue';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { goodsArt } from '../utils/goodsArt';

/**
 * 工作证起作用时的一行提示（天气改版 PR③，设计图 Jc-E）：证名 + 证上的专属玩法（原值 → 现值）。
 * 交易所、期货、发展基金、收购、预测、鉴定各处，持有对应的证时显示
 */
const props = defineProps<{ card: number }>();
const t = useT();
const catalog = useCatalogStore();
const perk = computed(() => t.value.misc.weather.shiling.week.perks[props.card] ?? '');
</script>

<template>
  <p class="dt-job-note" :data-testid="`job-note-${card}`">
    <DtArt :name="goodsArt(card)" :size="18" /><b>{{ catalog.goodsName(card) }}</b
    ><span>{{ perk }}</span>
  </p>
</template>
