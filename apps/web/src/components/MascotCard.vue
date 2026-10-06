<script setup lang="ts">
import { ref, watch } from 'vue';
import { pickLine, type MascotLine } from '../utils/mascot';
import { useT } from '../composables/useT';
import GameImg from './GameImg.vue';

/**
 * 吉祥物 NPC 卡片（菜园姐、雯姐共用）：头像加一句台词，点一下换一句；只说话，不发奖励。
 * ready 第一次变成 true（页面数据到手）时换一句，好让看状态说的话有机会出现。
 * 默认插槽放在卡片右侧（比如菜场的交易所入口，问题记录 246），点它不会换台词
 */
const props = defineProps<{
  name: string;
  img: string;
  fallbackIcon: string;
  lines: MascotLine[];
  ready: boolean;
  testid: string;
}>();
const t = useT();
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
    @keydown.space.prevent="next"
  >
    <GameImg :path="img" :alt="name" :fallback-icon="fallbackIcon" class="flex-shrink-0" />
    <div>
      <b>{{ t.common.colon(name) }}</b
      ><span :data-testid="`${testid}-line`" aria-live="polite">{{ line }}</span>
    </div>
    <div v-if="$slots.default" class="ms-auto flex-shrink-0" @click.stop @keydown.enter.stop>
      <slot />
    </div>
  </div>
</template>
