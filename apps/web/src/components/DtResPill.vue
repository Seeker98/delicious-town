<script setup lang="ts">
import type { ArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/** 资源胶囊（界面改版 P5）：左边彩色图形、右边数值；名字只给读屏；不够时数值是危险色 */
defineProps<{ art: ArtName; label: string; tone?: 'danger' }>();
</script>

<template>
  <span :class="['dt-res-pill', { 'is-danger': tone === 'danger' }]"
    ><DtArt :name="art" :size="20" /><span class="visually-hidden">{{ label }}</span
    ><slot
  /></span>
</template>
