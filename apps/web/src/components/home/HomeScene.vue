<script setup lang="ts">
import { computed } from 'vue';
import sceneUrl from '../../art/scene/restaurant.svg?url';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import DtArt from '../DtArt.vue';

/**
 * 首页场景头图（界面改版 P5，样稿 B）：天空、山坡、地面用令牌色（深色模式跟着变），
 * 店面插画放大放在中间靠下，门按“装扮”里选的画；停业时招牌下挂“停业中”。
 * 左上角插槽 meta 放街道、星级、天气，右上角插槽 aside 放小入口。
 */
const props = defineProps<{ door: number; closed: boolean }>();
const t = useT();
const catalog = useCatalogStore();
const doorArt = computed(() => catalog.doorArt(props.door));
</script>

<template>
  <div class="dt-scene">
    <svg
      class="dt-scene-bg"
      viewBox="0 0 390 144"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="60" cy="40" rx="26" ry="8" fill="var(--dt-surface)" opacity="0.55" />
      <ellipse cx="84" cy="34" rx="17" ry="7" fill="var(--dt-surface)" opacity="0.55" />
      <ellipse cx="330" cy="54" rx="22" ry="6" fill="var(--dt-surface)" opacity="0.45" />
      <path d="M0 108c60-22 120-26 190-14s130 6 200-12v62H0z" fill="var(--dt-scene-hill)" />
      <rect x="0" y="128" width="390" height="16" fill="var(--dt-scene-ground)" />
    </svg>
    <!-- 店面图原尺寸 320×72，放大 1.394 倍；店面中心（原图 x=215）对准头图中线 -->
    <div class="dt-scene-shop-wrap">
      <img class="dt-scene-shop" :src="sceneUrl" alt="" width="446" height="100" />
      <DtArt class="dt-scene-door" :name="doorArt" :size="57" />
      <span v-if="closed" class="dt-scene-closed" data-testid="scene-closed">{{ t.home.closedSign }}</span>
    </div>
    <!-- 左上街道一行、右上入口：同一个弹性行，外文长时街道一行截断，不压在入口上 -->
    <div class="dt-scene-top">
      <div class="dt-scene-meta"><slot name="meta" /></div>
      <div class="dt-scene-aside"><slot name="aside" /></div>
    </div>
  </div>
</template>
