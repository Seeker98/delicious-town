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
import DtAvatar from '../DtAvatar.vue';
import { useRestaurantStore } from '../../stores/restaurant';
import { formatNum } from '../../utils/format';
import { restAva } from '../../utils/restAva';

const t = useT();
const store = useAchieveToastStore();
const catalog = useCatalogStore();
const trophyOf = (key: string) => catalog.achById.get(key)?.tier.trophy ?? null;
/** 解锁头像框的卡（成就 PR③ 样稿 ⑥）：画自己的头像戴上这个框 */
const restStore = useRestaurantStore();
const myArt = () =>
  restAva(restStore.rest?.id, restStore.rest?.avatar ?? null, (id) => catalog.avatarArt(id));
const frameOf = (id: number) => catalog.looks?.frames?.find((f) => f.id === id);
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
      <template v-if="x.frame !== undefined">
        <span class="dt-ach-toast-art"><DtAvatar :art="myArt()" :frame="x.frame" :size="30" /></span>
        <span class="dt-ach-toast-text">
          <span class="dt-ach-toast-title">{{
            t.achieve.toastFrame(formatNum(x.pts), catalog.frameName(x.frame))
          }}</span>
          <span class="dt-meta">{{
            frameOf(x.frame)?.icon
              ? t.achieve.toastFrameTitle(catalog.icon(frameOf(x.frame)!.icon!)?.title ?? '')
              : t.achieve.toastFrameHint
          }}</span>
        </span>
      </template>
      <template v-else>
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
      </template>
    </button>
  </TransitionGroup>
</template>
