<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { setEventsListener } from './api/client';
import BottomNav from './components/BottomNav.vue';
import EventToast from './components/EventToast.vue';
import { useCatalogStore } from './stores/catalog';
import { useToastStore } from './stores/toast';
import { eventText } from './utils/events';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const inGame = computed(() => route.meta.needRestaurant === true);

setEventsListener((events) => {
  for (const e of events) toast.push(eventText(e, catalog), e.type === 'gain' ? 'success' : 'info');
});

onMounted(() => {
  catalog.load().catch(() => undefined);
});
</script>

<template>
  <div class="dt-app">
    <header class="dt-header d-flex align-items-center px-2">
      <i class="bi bi-shop me-1"></i>
      <span class="fw-bold">美味小镇</span>
    </header>
    <main :class="['dt-main', { 'dt-main-nav': inGame }]">
      <RouterView />
    </main>
    <EventToast />
    <BottomNav v-if="inGame" />
  </div>
</template>
