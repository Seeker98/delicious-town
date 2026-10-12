<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { setEventsListener } from './api/client';
import AnnouncePopup from './components/AnnouncePopup.vue';
import AppHeader from './components/AppHeader.vue';
import BottomNav from './components/BottomNav.vue';
import DtConfirmHost from './components/DtConfirmHost.vue';
import EventToast from './components/EventToast.vue';
import ShilingIntroPopup from './components/ShilingIntroPopup.vue';
import { useCatalogStore } from './stores/catalog';
import { useLocaleStore } from './stores/locale';
import { useSessionStore } from './stores/session';
import { useToastStore } from './stores/toast';
import { eventsSummary } from './utils/events';
import { isInGame } from './utils/inGame';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const session = useSessionStore();
/** 切换语言后整页重新挂载：新闻、日志、标签这些非响应式的文案也跟着换（问题记录 272） */
const locale = useLocaleStore();
const inGame = computed(() => isInGame(route.meta, session.me?.restaurantId));
/** 后台页面（界面改版 P12）：占满宽度、不要游戏的顶栏，左边是后台自己的侧栏 */
const wide = computed(() => route.path.startsWith('/admin'));

/** 一次操作的得失合成一条提示（问题记录：弹出的消息框太多） */
setEventsListener((events) => {
  if (events.length === 0) return;
  toast.push(
    eventsSummary(events, catalog),
    events.some((e) => e.type === 'gain') ? 'success' : 'info',
    4000,
    () => eventsSummary(events, catalog),
  );
});

onMounted(() => {
  catalog.load().catch(() => undefined);
});
</script>

<template>
  <div :class="['dt-app', { 'dt-app-wide': wide }]">
    <AppHeader v-if="!route.meta.bare && !wide" :in-game="inGame" />
    <main
      :class="['dt-main', { 'dt-main-nav': inGame, 'dt-main-bare': route.meta.bare, 'dt-main-wide': wide }]"
    >
      <RouterView :key="locale.locale" />
    </main>
    <AnnouncePopup v-if="inGame" />
    <ShilingIntroPopup v-if="inGame" />
    <DtConfirmHost />
    <EventToast :nav="inGame" />
    <BottomNav v-if="inGame" />
  </div>
</template>
