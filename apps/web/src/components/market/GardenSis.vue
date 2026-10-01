<script setup lang="ts">
import { computed } from 'vue';
import type { MarketDto } from '@dt/shared';
import { gardenLines } from '../../utils/gardenSis';
import MascotCard from '../MascotCard.vue';

/** 菜场吉祥物菜园姐（问题记录 176） */
const props = defineProps<{ data: MarketDto | null }>();
const lines = computed(() => gardenLines(props.data));
</script>

<template>
  <MascotCard
    name="菜园姐"
    img="npc/菜园姐"
    fallback-icon="bi-flower2"
    :lines="lines"
    :ready="data !== null"
    testid="garden-sis"
  />
</template>
