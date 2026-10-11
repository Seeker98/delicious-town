<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { ArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/** 空状态（界面改版设计 §5 第 8 条）：配图（可选）、为什么空、去哪里获得；默认插槽放按钮（读取失败时的“重试”） */
defineProps<{ title: string; body?: string; art?: ArtName; to?: string; link?: string }>();
</script>

<template>
  <div class="dt-empty-state">
    <DtArt v-if="art" :name="art" :size="64" />
    <div class="dt-empty-title">{{ title }}</div>
    <p v-if="body" class="dt-empty-body">{{ body }}</p>
    <RouterLink v-if="to" :to="to" class="dt-go">{{ link }}</RouterLink>
    <slot />
  </div>
</template>
