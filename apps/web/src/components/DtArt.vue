<script setup lang="ts">
import { computed } from 'vue';
import contentUrl from '../art/generated/content.svg?url';
import uiUrl from '../art/generated/ui.svg?url';
import { UI_ART, type ArtName } from '../art/generated/names';

/**
 * 图形（界面改版设计 §3.4）：界面图标是单色紫调（颜色跟文字色走、填充深浅由 CSS 的 fill-opacity 给），
 * 内容图形是固定色的扁平图。雪碧图第一次用到时下载，之后走缓存。
 */
const props = withDefaults(defineProps<{ name: ArtName; size?: number; label?: string }>(), { size: 24 });
const isUi = computed(() => (UI_ART as readonly string[]).includes(props.name));
const href = computed(() => `${isUi.value ? uiUrl : contentUrl}#${props.name}`);
</script>

<template>
  <svg
    :class="['dt-art', isUi ? 'dt-art-ui' : 'dt-art-content']"
    :width="size"
    :height="size"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <use :href="href" />
  </svg>
</template>
