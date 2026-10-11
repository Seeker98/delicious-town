<script setup lang="ts">
import { computed } from 'vue';
import sceneUrl from '../art/scene/restaurant.svg?url';
import type { ArtName } from '../art/generated/names';
import { useCatalogStore } from '../stores/catalog';
import DtArt from './DtArt.vue';

/**
 * 餐厅头图（界面改版设计 §5 第 1 条，用户 2026-10-11 定 72px）：店面图靠右，门按“装扮”里选的门叠在门洞上；
 * 左边叠街道、星级、等级这些（插槽），字放在令牌色的底板上，深色模式也读得清
 */
const props = defineProps<{ door: number }>();
const catalog = useCatalogStore();
// 目录里找不到这扇门（旧目录缓存、目录还没读到）就画木门，不空着（Review Focus 3）
const doorArt = computed(
  () => `door-${catalog.looks?.doors.find((d) => d.id === props.door)?.art ?? 'wood'}` as ArtName,
);
</script>

<template>
  <div class="dt-hero">
    <img class="dt-hero-scene" :src="sceneUrl" alt="" loading="lazy" width="320" height="72" />
    <DtArt class="dt-hero-door" :name="doorArt" :size="40" />
    <div class="dt-hero-text">
      <div class="dt-hero-plate"><slot /></div>
    </div>
  </div>
</template>
