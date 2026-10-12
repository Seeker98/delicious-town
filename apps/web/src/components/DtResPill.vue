<script setup lang="ts">
import type { ArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/**
 * 资源胶囊（界面改版 P5）：左边彩色图形、右边数值；名字只给读屏；不够时数值是危险色。
 * clickable：整个胶囊是按钮，点了发 click（首页点开看说明，问题记录 619）；按钮的读屏名字是 openLabel
 */
defineProps<{ art: ArtName; label: string; tone?: 'danger'; clickable?: boolean; openLabel?: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button
    v-if="clickable"
    type="button"
    :class="['dt-res-pill', 'is-btn', { 'is-danger': tone === 'danger' }]"
    :aria-label="openLabel"
    @click="$emit('click')"
  >
    <DtArt :name="art" :size="20" /><span class="visually-hidden">{{ label }}</span
    ><slot />
  </button>
  <span v-else :class="['dt-res-pill', { 'is-danger': tone === 'danger' }]"
    ><DtArt :name="art" :size="20" /><span class="visually-hidden">{{ label }}</span
    ><slot
  /></span>
</template>
