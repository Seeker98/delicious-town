<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { onMounted, ref, watch } from 'vue';
import type { TowerDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import DuelRules from '../components/tower/DuelRules.vue';
import FloorPanel from '../components/tower/FloorPanel.vue';
import RankPanel from '../components/tower/RankPanel.vue';
import ShopPanel from '../components/tower/ShopPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'tower' | 'rank' | 'shop';
const TABS: readonly Tab[] = ['tower', 'rank', 'shop'];
const KEY = 'dt_tower_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.includes(v as Tab) ? (v as Tab) : 'tower';
  } catch {
    return 'tower';
  }
}
const toast = useToastStore();
const t = useT();
const tab = ref<Tab>(savedTab());
const data = ref<TowerDto | null>(null);

async function load() {
  if (tab.value !== 'tower') return;
  try {
    data.value = await endpoints.tower();
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.loadFailed), 'danger');
  }
}
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
  void load();
});
onMounted(load);
</script>

<template>
  <h5>{{ t.tower.title }}</h5>
  <HiphopCard :place="5" @changed="load" />
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x }]"
        href="#"
        :data-testid="`tab-${x}`"
        @click.prevent="tab = x"
        >{{ t.tower.tabs[x] }}</a
      >
    </li>
  </ul>
  <DuelRules v-if="tab !== 'shop'" />
  <template v-if="tab === 'tower'">
    <FloorPanel v-if="data" :data="data" @reload="load" />
  </template>
  <RankPanel v-else-if="tab === 'rank'" />
  <ShopPanel v-else />
</template>
