<script setup lang="ts">
import { ref, watch } from 'vue';
import { pickLine, type MascotLine } from '../utils/mascot';
import GameImg from './GameImg.vue';

/**
 * 吉祥物 NPC 卡片（菜园姐、雯姐共用）：头像加一句台词，点一下换一句；只说话，不发奖励。
 * ready 第一次变成 true（页面数据到手）时换一句，好让看状态说的话有机会出现
 */
const props = defineProps<{
  name: string;
  img: string;
  fallbackIcon: string;
  lines: MascotLine[];
  ready: boolean;
  testid: string;
}>();
const line = ref('');
const next = () => {
  line.value = pickLine(props.lines, line.value || null);
};
next();
watch(
  () => props.ready,
  (has, had) => {
    if (has && !had) next();
  },
);
</script>

<template>
  <div
    class="d-flex align-items-center gap-2 border rounded p-2 mb-2 small"
    role="button"
    tabindex="0"
    :data-testid="testid"
    @click="next"
    @keydown.enter.prevent="next"
  >
    <GameImg :path="img" :alt="name" :fallback-icon="fallbackIcon" class="flex-shrink-0" />
    <div>
      <b>{{ name }}：</b><span :data-testid="`${testid}-line`">{{ line }}</span>
    </div>
  </div>
</template>
