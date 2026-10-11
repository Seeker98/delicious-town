<script setup lang="ts">
import { computed } from 'vue';
import CookbookListPanel from '../components/cookbook/CookbookListPanel.vue';
import McPanel from '../components/cookbook/McPanel.vue';
import ProgressPanel from '../components/cookbook/ProgressPanel.vue';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { useRestaurantStore } from '../stores/restaurant';

/**
 * 食谱页三个标签：食谱、特色菜、进度一览（界面改版 P2b：原来特色菜 /mc、进度一览 /cookbooks/progress 各占一页）。
 * 特色菜看区服开关；街道、筛选、页码由列表面板写在网址里，切标签只改 tab，回来时还在
 */
const t = useT();
const restaurant = useRestaurantStore();
type Tab = 'list' | 'mc' | 'progress';
const TABS = computed<Tab[]>(() =>
  restaurant.featureOn('mysterious') ? ['list', 'mc', 'progress'] : ['list', 'progress'],
);
const tab = useTabQuery({ tabs: TABS });
const label = (k: Tab) =>
  k === 'list'
    ? t.value.nav.titles.cookbooks
    : k === 'mc'
      ? t.value.mc.title
      : t.value.cookbook.progress.link;
const tabItems = computed(() => TABS.value.map((k) => ({ key: k, label: label(k) })));
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" />
  <McPanel v-if="tab === 'mc'" />
  <ProgressPanel v-else-if="tab === 'progress'" />
  <CookbookListPanel v-else />
</template>
