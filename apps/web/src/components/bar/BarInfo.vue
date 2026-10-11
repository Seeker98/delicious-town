<script setup lang="ts">
import { ref } from 'vue';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import type { BarGame } from '../../utils/barGames';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 酒吧游戏页顶上的说明卡（界面改版 P9）：游戏图、花多少、今天几局，右边“玩法 ›”；
 * 规则从一段话改成分条，放进玩法面板（插槽 rules 放奖励表）
 */
defineProps<{ game: BarGame; title: string; sub: string }>();
const t = useT();
const open = ref(false);
</script>

<template>
  <section class="dt-card dt-bar-info" data-testid="bar-info">
    <span class="dt-bar-info-art"><DtArt :name="`game-${game}` as ArtName" :size="32" /></span>
    <span class="dt-bar-info-main">
      <b data-testid="bar-info-title">{{ title }}</b>
      <span data-testid="bar-info-sub">{{ sub }}</span>
    </span>
    <button type="button" class="dt-link-btn" data-testid="bar-rules-open" @click="open = true">
      {{ t.bar.rulesBtn }}
    </button>
  </section>
  <DtSheet :open="open" :title="t.bar.rulesTitle(t.bar.tabs[game])" @close="open = false">
    <div class="dt-help dt-bar-rules" data-testid="bar-rules">
      <ul>
        <li v-for="(x, i) in t.bar.rules[game]" :key="i">{{ x }}</li>
      </ul>
      <slot name="rules" />
    </div>
    <template #actions>
      <button type="button" class="btn btn-light dt-btn-block" @click="open = false">
        {{ t.bar.rulesOk }}
      </button>
    </template>
  </DtSheet>
</template>
