<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ExchangePanel from '../components/town/ExchangePanel.vue';
import NewsPanel from '../components/town/NewsPanel.vue';
import TownPanel from '../components/town/TownPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

type Tab = 'news' | 'town' | 'exchange';
const KEY = 'dt_town_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'town' || v === 'exchange' ? v : 'news';
  } catch {
    return 'news';
  }
}
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'news', label: '新闻' },
  { key: 'town', label: '小镇' },
  { key: 'exchange', label: '兑换' },
];
const toast = useToastStore();
const catalog = useCatalogStore();
const tab = ref<Tab>(savedTab());
const data = ref<TownDto | null>(null);

/** 读取序号：几次读取同时进行时只采用最新一次的结果 */
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const v = await endpoints.town();
    if (mine === seq) data.value = v;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, '读取小镇失败'), 'danger');
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
onMounted(() => {
  void catalog.load();
  void load();
});
</script>

<template>
  <h5>小镇</h5>
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
  <ExchangePanel v-if="tab === 'exchange'" />
  <template v-else-if="data">
    <NewsPanel v-if="tab === 'news'" :data="data" @reload="load" />
    <TownPanel v-else :data="data" @reload="load" />
  </template>
</template>
