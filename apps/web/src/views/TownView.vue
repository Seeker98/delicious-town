<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import ClassroomPanel from '../components/town/ClassroomPanel.vue';
import ExchangePanel from '../components/town/ExchangePanel.vue';
import FundPanel from '../components/town/FundPanel.vue';
import NewsPanel from '../components/town/NewsPanel.vue';
import RankPanel from '../components/town/RankPanel.vue';
import TownPanel from '../components/town/TownPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import HiphopCard from '../components/hiphop/HiphopCard.vue';

/** 'town' 是"居民"标签，键名沿用旧的，免得已存的上次标签和旧链接失效 */
type Tab = 'news' | 'town' | 'exchange' | 'rank' | 'classroom' | 'fund';
const KEY = 'dt_town_tab';
/** 页面叫"广场"，避免和游戏名"美味小镇"混淆；教室也在这里（问题记录 122）；发展基金按区服开关显示（240-2） */
const ALL_TABS: readonly Tab[] = ['news', 'town', 'exchange', 'rank', 'classroom', 'fund'];
const restaurant = useRestaurantStore();
const TABS = computed(() => ALL_TABS.filter((x) => x !== 'fund' || restaurant.featureOn('fund')));
const isTab = (v: unknown): v is Tab => TABS.value.includes(v as Tab);
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
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const route = useRoute();
const router = useRouter();
const tab = ref<Tab>(initialTab(route.query.tab));
// 餐厅数据后到、区服关了某个标签的功能时（发展基金），当前标签退回新闻
watch(TABS, (list) => {
  if (!list.includes(tab.value)) tab.value = 'news';
});
const data = ref<TownDto | null>(null);

/** 读取序号：几次读取同时进行时只采用最新一次的结果 */
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const v = await endpoints.town();
    if (mine === seq) data.value = v;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.town.loadFailed), 'danger');
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
    <h5>{{ t.town.title }}</h5>
    <RouterLink to="/forum" class="small" data-testid="town-forum"
      ><i class="bi bi-chat-square-text"></i> {{ t.town.forum }}</RouterLink
    >
  </div>
  <HiphopCard :place="13" />
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x }]"
        href="#"
        :data-testid="`tab-${x}`"
        @click.prevent="tab = x"
        >{{ t.town.tabs[x] }}</a
      >
    </li>
  </ul>
  <ExchangePanel v-if="tab === 'exchange'" />
  <ClassroomPanel v-else-if="tab === 'classroom'" />
  <FundPanel v-else-if="tab === 'fund'" />
  <RankPanel v-else-if="tab === 'rank'" />
  <template v-else-if="data">
    <NewsPanel v-if="tab === 'news'" :data="data" @reload="load" />
    <TownPanel v-else :data="data" @reload="load" />
  </template>
</template>
