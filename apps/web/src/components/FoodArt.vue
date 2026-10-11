<script setup lang="ts">
import { computed } from 'vue';
import { useCatalogStore } from '../stores/catalog';
import DtArt from './DtArt.vue';

/** 食材图形（界面改版 P4）：按目录里的类别画，装饰性（食材名字写在旁边） */
const props = withDefaults(defineProps<{ id: number; size?: number }>(), { size: 24 });
const catalog = useCatalogStore();
const name = computed(() => catalog.foodArt(props.id));
</script>

<template>
  <DtArt :name="name" :size="size" class="dt-food-art" />
</template>
