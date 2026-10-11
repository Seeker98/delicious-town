<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '../composables/useT';
import MascotCard from './MascotCard.vue';

/** 功能页上的 NPC（问题记录 441、443）：头像加一句台词，点一下换一句；只说话 */
export type NpcCardKey = 'mayor' | 'bro13' | 'carmen' | 'gary' | 'garyWealth' | 'fanDao' | 'xiaoKai';
/** 名字前的图标（界面改版 P4：原版图包去掉了，NPC 头像图形以后画） */
const ICON: Record<NpcCardKey, string> = {
  mayor: 'bi-person-badge',
  bro13: 'bi-megaphone',
  carmen: 'bi-stars',
  gary: 'bi-bank',
  // 理财页（理财设计 §3.4）：同一位盖乐瑞，台词另写
  garyWealth: 'bi-bank',
  fanDao: 'bi-search',
  xiaoKai: 'bi-flag',
};
const props = defineProps<{ npc: NpcCardKey }>();
const t = useT();
const lines = computed(() => t.value.npc[props.npc].lines.map((text) => ({ text, weight: 1 })));
</script>

<template>
  <MascotCard :name="t.npc[npc].name" :icon="ICON[npc]" :lines="lines" :ready="true" :testid="`npc-${npc}`" />
</template>
