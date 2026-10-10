<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '../composables/useT';
import MascotCard from './MascotCard.vue';

/** 功能页上的 NPC（问题记录 441、443）：头像加一句台词，点一下换一句；只说话 */
export type NpcCardKey = 'mayor' | 'bro13' | 'carmen' | 'gary' | 'garyWealth' | 'fanDao' | 'xiaoKai';
/** 头像路径（素材按中文名放，同菜园姐、雯姐；写全 npc/… 文案守卫才认得是文件名）和没有头像时的图标 */
const IMG: Record<NpcCardKey, [string, string]> = {
  mayor: ['npc/镇长大胃锅', 'bi-person-badge'],
  bro13: ['npc/13哥', 'bi-megaphone'],
  carmen: ['npc/卡门', 'bi-stars'],
  gary: ['npc/盖乐瑞', 'bi-bank'],
  // 理财页（理财设计 §3.4）：同一位盖乐瑞，台词另写
  garyWealth: ['npc/盖乐瑞', 'bi-bank'],
  fanDao: ['npc/饭老道', 'bi-search'],
  xiaoKai: ['npc/小凯', 'bi-flag'],
};
const props = defineProps<{ npc: NpcCardKey }>();
const t = useT();
const lines = computed(() => t.value.npc[props.npc].lines.map((text) => ({ text, weight: 1 })));
</script>

<template>
  <MascotCard
    :name="t.npc[npc].name"
    :img="IMG[npc][0]"
    :fallback-icon="IMG[npc][1]"
    :lines="lines"
    :ready="true"
    :testid="`npc-${npc}`"
  />
</template>
