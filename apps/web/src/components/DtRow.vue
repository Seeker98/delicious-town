<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { ArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/**
 * 一行（界面改版 P5 返工，设计 §1.1）：左边图标托盘，中间标题和一行灰色副行，右边一个值或操作。
 * 有 to 时整行可点、右边灰色 ›（样式加，读屏不读）；没有 to 时右边可以放按钮、开关（插槽 end）。
 * 一张卡片里装几行：外层 .dt-card.dt-rows-card；卡片里一行都没有时整张卡片不显示（:empty）。
 * strong：标题加粗（列表里的名字：道具、飞弹、玩家，界面改版 P9 用户反馈）
 */
defineProps<{ to?: string; art?: ArtName; title?: string; sub?: string; value?: string; strong?: boolean }>();
</script>

<template>
  <component :is="to ? RouterLink : 'div'" :to="to" :class="['dt-row', { 'is-link': !!to }]">
    <span v-if="art || $slots.icon" class="dt-row-ico"
      ><slot name="icon"><DtArt v-if="art" :name="art" :size="22" /></slot
    ></span>
    <span class="dt-row-main">
      <span :class="['dt-row-title', { 'is-strong': strong }]"
        ><slot name="title">{{ title }}</slot></span
      >
      <span v-if="sub || $slots.sub" class="dt-row-sub"
        ><slot name="sub">{{ sub }}</slot></span
      >
    </span>
    <span v-if="value || $slots.value" class="dt-row-value"
      ><slot name="value">{{ value }}</slot></span
    >
    <span v-if="$slots.end" class="dt-row-end"><slot name="end" /></span>
  </component>
</template>
