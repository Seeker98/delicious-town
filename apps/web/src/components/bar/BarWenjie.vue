<script setup lang="ts">
import { computed } from 'vue';
import type { BarDto } from '@dt/shared';
import { wenjieLines } from '../../utils/wenjie';
import MascotCard from '../MascotCard.vue';

/** 酒吧吉祥物雯姐（问题记录 210） */
const props = defineProps<{ data: BarDto | null }>();
const lines = computed(() => wenjieLines(props.data));
</script>

<template>
  <MascotCard
    name="雯姐"
    img="npc/雯姐"
    fallback-icon="bi-cup-hot"
    :lines="lines"
    :ready="data !== null"
    testid="bar-wenjie"
  />
</template>
