<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { setEventsListener } from './api/client';
import AnnouncePopup from './components/AnnouncePopup.vue';
import AppHeader from './components/AppHeader.vue';
import BottomNav from './components/BottomNav.vue';
import EventToast from './components/EventToast.vue';
import { useCatalogStore } from './stores/catalog';
import { useToastStore } from './stores/toast';
import { eventsSummary } from './utils/events';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const inGame = computed(() => route.meta.needRestaurant === true);
/** 后台页面用宽布局 */
const wide = computed(() => route.path.startsWith('/admin'));

/** 一次操作的得失合成一条提示（问题记录：弹出的消息框太多） */
setEventsListener((events) => {
  if (events.length === 0) return;
  toast.push(
    eventsSummary(events, catalog),
    events.some((e) => e.type === 'gain') ? 'success' : 'info',
    4000,
  );
});

onMounted(() => {
  catalog.load().catch(() => undefined);
});
</script>

<template>
  <div :class="['dt-app', { 'dt-app-wide': wide }]">
    <AppHeader :in-game="inGame" />
    <main :class="['dt-main', { 'dt-main-nav': inGame }]">
      <RouterView />
    </main>
    <AnnouncePopup v-if="inGame" />
    <EventToast />
    <BottomNav v-if="inGame" />
  </div>
</template>
