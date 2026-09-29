<script setup lang="ts">
import { ref } from 'vue';
import { asset } from '../assets/asset';

const props = withDefaults(defineProps<{ path: string; alt: string; fallbackIcon?: string }>(), {
  fallbackIcon: 'bi-image',
});
const failed = ref(false);
</script>

<template>
  <img v-if="!failed" class="game-img" :src="asset(props.path)" :alt="props.alt" @error="failed = true" />
  <i v-else :class="['bi', props.fallbackIcon]" :title="props.alt"></i>
</template>
