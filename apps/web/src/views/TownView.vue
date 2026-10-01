<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ExchangePanel from '../components/town/ExchangePanel.vue';
import NewsPanel from '../components/town/NewsPanel.vue';
import RankPanel from '../components/town/RankPanel.vue';
import TownPanel from '../components/town/TownPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

type Tab = 'news' | 'town' | 'exchange' | 'rank';
const KEY = 'dt_town_tab';
const isTab = (v: unknown): v is Tab => v === 'news' || v === 'town' || v === 'exchange' || v === 'rank';
/** 链接里指定了标签（首页新闻的"更多"带 ?tab=news）就用它，否则用上次停留的（问题记录 106） */
function initialTab(query: unknown): Tab {
  if (isTab(query)) return query;
  try {
    const v = localStorage.getItem(KEY);
    return isTab(v) ? v : 'news';
  } catch {
    return 'news';
  }
}
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'news', label: '新闻' },
  { key: 'town', label: '小镇' },
  { key: 'exchange', label: '兑换' },
  { key: 'rank', label: '排行' },
];
const toast = useToastStore();
const catalog = useCatalogStore();
const route = useRoute();
const router = useRouter();
const tab = ref<Tab>(initialTab(route.query.tab));
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
  // 地址跟着标签走：刷新后停在当前标签，而不是一直回到 ?tab= 指定的那个（PR27 遗留）
  if (route.query.tab !== undefined && route.query.tab !== v)
    void router.replace({ query: { ...route.query, tab: v } });
  void load();
});
onMounted(() => {
  void catalog.load();
  void load();
});
</script>

<template>
  <div class="dt-page-title">
    <h5>小镇</h5>
    <RouterLink to="/forum" class="small" data-testid="town-forum"
      ><i class="bi bi-chat-square-text"></i> 论坛</RouterLink
    >
  </div>
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
  <RankPanel v-else-if="tab === 'rank'" />
  <template v-else-if="data">
    <NewsPanel v-if="tab === 'news'" :data="data" @reload="load" />
    <TownPanel v-else :data="data" @reload="load" />
  </template>
</template>
