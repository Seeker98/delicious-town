<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ArtName } from '../art/generated/names';
import { pickLine, type MascotLine } from '../utils/mascot';
import DtArt from './DtArt.vue';

/**
 * 吉祥物 NPC 卡片（菜园姐、雯姐共用）：头像加一句台词，点一下换一句；只说话，不发奖励。
 * 界面改版 P8：圆形头像（有图用图，没画的先用图标），名字一行、台词一行。
 * ready 第一次变成 true（页面数据到手）时换一句，好让看状态说的话有机会出现。
 * 默认插槽放在卡片右侧（比如菜场的交易所入口，问题记录 246），点它不会换台词
 */
const props = defineProps<{
  name: string;
  /** 名字前的图标（Bootstrap Icons 类名）：没有头像图时用 */
  icon: string;
  /** 头像图（界面改版 P8：盖乐瑞、嘻哈男孩先画了） */
  art?: ArtName;
  lines: MascotLine[];
  ready: boolean;
  testid: string;
  /** 大头像（界面改版 P10：协会 NPC 页，56px、台词加「」） */
  large?: boolean;
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
    :class="['dt-card dt-mascot', { 'is-large': large }]"
    role="button"
    tabindex="0"
    :data-testid="testid"
    @click="next"
    @keydown.enter.prevent="next"
    @keydown.space.prevent="next"
  >
    <span v-if="art" class="dt-npc-ava"><DtArt :name="art" :size="large ? 56 : 40" /></span>
    <span v-else class="dt-mascot-ico" aria-hidden="true"><i :class="['bi', icon]"></i></span>
    <div class="dt-mascot-text">
      <b>{{ name }}</b>
      <span :data-testid="`${testid}-line`" aria-live="polite">{{ line }}</span>
    </div>
    <div v-if="$slots.default" class="dt-mascot-end" @click.stop @keydown.enter.stop @keydown.space.stop>
      <slot />
    </div>
  </div>
</template>
