<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import NewsPanel from '../components/town/NewsPanel.vue';
import RankPanel from '../components/town/RankPanel.vue';
import TownPanel from '../components/town/TownPanel.vue';
import WishTreePanel from '../components/town/WishTreePanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import HiphopCard from '../components/hiphop/HiphopCard.vue';

/** 'town' 是"居民"标签，键名沿用旧的，免得已存的上次标签和旧链接失效 */
type Tab = 'news' | 'town' | 'rank' | 'wishtree';
const KEY = 'dt_town_tab';
/** 页面叫"广场"，避免和游戏名"美味小镇"混淆；教室、兑换、发展基金搬到了协会（问题记录 441） */
const ALL_TABS: readonly Tab[] = ['news', 'town', 'rank', 'wishtree'];
const toast = useToastStore();
const restStore = useRestaurantStore();
/** 许愿树（许愿树设计 §3.3）：区服关了时不显示这个标签 */
const TABS = computed(() => ALL_TABS.filter((x) => x !== 'wishtree' || restStore.featureOn('wishtree')));
const t = useT();
const catalog = useCatalogStore();
/**
 * 当前标签写进网址、记住上次看的（界面改版 P2b）；搬走的旧标签（?tab=exchange 等）由路由转到协会、银行。
 * 本地存储里存过已搬走的值时，按不存在的值处理，打开新闻
 */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const tabItems = computed(() => TABS.value.map((k) => ({ key: k, label: t.value.town.tabs[k] })));
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
watch(tab, () => void load());
onMounted(() => {
  void catalog.load();
  void load();
});
</script>

<template>
  <div class="dt-page-meta">
    <RouterLink to="/forum" class="dt-go" data-testid="town-forum"
      ><i class="bi bi-chat-square-text"></i> {{ t.town.forum }}</RouterLink
    >
  </div>
  <HiphopCard :place="13" />
  <DtTabs v-model="tab" :tabs="tabItems" />
  <RankPanel v-if="tab === 'rank'" />
  <WishTreePanel v-else-if="tab === 'wishtree'" />
  <template v-else-if="data">
    <NewsPanel v-if="tab === 'news'" :data="data" @reload="load" />
    <TownPanel v-else-if="tab === 'town'" :data="data" @reload="load" />
  </template>
</template>
