<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { TowerDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import FloorPanel from '../components/tower/FloorPanel.vue';
import RankPanel from '../components/tower/RankPanel.vue';
import ShopPanel from '../components/tower/ShopPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'tower' | 'rank' | 'shop';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'tower', label: '厨塔' },
  { key: 'rank', label: '赛厨榜' },
  { key: 'shop', label: '声望商店' },
];
const KEY = 'dt_tower_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((x) => x.key === v) ? (v as Tab) : 'tower';
  } catch {
    return 'tower';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<TowerDto | null>(null);

async function load() {
  if (tab.value !== 'tower') return;
  try {
    data.value = await endpoints.tower();
  } catch (e) {
    toast.push(errorMessage(e, '读取厨塔失败'), 'danger');
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
  <h5>厨塔</h5>
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x.key" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x.key }]"
        href="#"
        :data-testid="`tab-${x.key}`"
        @click.prevent="tab = x.key"
        >{{ x.label }}</a
      >
    </li>
  </ul>
  <template v-if="tab === 'tower'">
    <FloorPanel v-if="data" :data="data" @reload="load" />
  </template>
  <RankPanel v-else-if="tab === 'rank'" />
  <ShopPanel v-else />
</template>
