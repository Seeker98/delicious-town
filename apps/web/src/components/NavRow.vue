<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { UiArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/** 导航行（界面改版设计 §5.2）：整行可点，图标、名称、当前值，右边灰色 ›（样式加，读屏不读） */
defineProps<{ to: string; art: UiArtName; label: string; value?: string }>();
</script>

<template>
  <RouterLink :to="to" class="dt-nav-row dt-tap">
    <DtArt :name="art" :size="22" />
    <span class="dt-nav-row-label">{{ label }}</span>
    <span v-if="value" class="dt-nav-row-value">{{ value }}</span>
  </RouterLink>
</template>
