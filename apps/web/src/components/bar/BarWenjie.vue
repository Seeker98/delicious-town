<script setup lang="ts">
import { computed } from 'vue';
import type { BarDto } from '@dt/shared';
import { wenjieLines } from '../../utils/wenjie';
import { useT } from '../../composables/useT';
import MascotCard from '../MascotCard.vue';

/** 酒吧吉祥物雯姐（问题记录 210） */
const props = defineProps<{ data: BarDto | null }>();
const lines = computed(() => wenjieLines(props.data));
const t = useT();
</script>

<template>
  <MascotCard
    :name="t.bar.wenjie.name"
    img="npc/雯姐"
    fallback-icon="bi-cup-hot"
    :lines="lines"
    :ready="data !== null"
    testid="bar-wenjie"
  />
</template>
