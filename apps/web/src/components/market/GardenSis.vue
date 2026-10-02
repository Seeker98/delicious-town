<script setup lang="ts">
import { computed } from 'vue';
import type { MarketDto } from '@dt/shared';
import { gardenLines } from '../../utils/gardenSis';
import { useT } from '../../composables/useT';
import MascotCard from '../MascotCard.vue';

/** 菜场吉祥物菜园姐（问题记录 176） */
const props = defineProps<{ data: MarketDto | null }>();
const lines = computed(() => gardenLines(props.data));
const t = useT();
</script>

<template>
  <MascotCard
    :name="t.market.sis.name"
    img="npc/菜园姐"
    fallback-icon="bi-flower2"
    :lines="lines"
    :ready="data !== null"
    testid="garden-sis"
  >
    <slot />
  </MascotCard>
</template>
