<script setup lang="ts">
/**
 * 达成成就的提示（成就系统 2026-10-19，样稿 ⑥）：顶栏下面浮出一张卡，带奖杯的画奖杯；
 * 出现 280ms 淡入下移、收起 200ms；“减少动态效果”时只淡入淡出（样式在 main.css）
 */
import { useT } from '../../composables/useT';
import { useAchieveToastStore } from '../../stores/achieveToast';
import { useCatalogStore } from '../../stores/catalog';
import { achName, trophyName } from '../../utils/achieve';
import AchTrophy from './AchTrophy.vue';

const t = useT();
const store = useAchieveToastStore();
const catalog = useCatalogStore();
const trophyOf = (key: string) => catalog.achById.get(key)?.tier.trophy ?? null;
const title = (key: string) =>
  catalog.achById.get(key)?.line.hidden
    ? t.value.achieve.toastHidden(achName(key, catalog))
    : t.value.achieve.toast(achName(key, catalog));
</script>

<template>
  <TransitionGroup tag="div" name="dt-ach-toast" class="dt-ach-toasts" aria-live="polite">
    <button
      v-for="x in store.items"
      :key="x.id"
      type="button"
      class="dt-ach-toast"
      data-testid="ach-toast"
      @click="store.remove(x.id)"
    >
      <span class="dt-ach-toast-art">
        <AchTrophy
          v-if="trophyOf(x.key)"
          :tone="catalog.trophyMap.get(trophyOf(x.key)!)?.tone ?? 'bronze'"
          :size="30"
        />
        <span v-else aria-hidden="true">★</span>
      </span>
      <span class="dt-ach-toast-text">
        <span class="dt-ach-toast-title">{{ title(x.key) }}</span>
        <span v-if="trophyOf(x.key)" class="dt-meta">{{
          t.achieve.toastTrophy(trophyName(trophyOf(x.key)!, catalog))
        }}</span>
      </span>
      <span class="dt-ach-toast-pts">+{{ x.pts }}</span>
    </button>
  </TransitionGroup>
</template>
