<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onMounted, ref, watch } from 'vue';
import type { TowerDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import FloorPanel from '../components/tower/FloorPanel.vue';
import RankPanel from '../components/tower/RankPanel.vue';
import ShopPanel from '../components/tower/ShopPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'tower' | 'rank' | 'shop';
const TABS: readonly Tab[] = ['tower', 'rank', 'shop'];
const KEY = 'dt_tower_tab';
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址、记住上次看的（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.tower.tabs[k] })));
const data = ref<TowerDto | null>(null);

async function load() {
  if (tab.value !== 'tower') return;
  try {
    data.value = await endpoints.tower();
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.loadFailed), 'danger');
  }
}
watch(tab, () => void load());
onMounted(load);
</script>

<template>
  <HiphopCard :place="5" @changed="load" />
  <DtTabs v-model="tab" :tabs="tabItems" />
  <template v-if="tab === 'tower'">
    <FloorPanel v-if="data" :data="data" @reload="load" />
  </template>
  <RankPanel v-else-if="tab === 'rank'" />
  <ShopPanel v-else />
</template>
