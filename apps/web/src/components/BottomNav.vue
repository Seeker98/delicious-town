<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useFriendsStore } from '../stores/friends';
import { useRestaurantStore } from '../stores/restaurant';
import { useT } from '../composables/useT';
import MoreLinks from './MoreLinks.vue';

const TABS = [
  { to: '/', icon: 'bi-shop', key: 'rest' },
  { to: '/cookbooks', icon: 'bi-journal-text', key: 'cookbooks', feature: 'cookbook' },
  { to: '/cupboard', icon: 'bi-box-seam', key: 'cupboard', feature: 'cupboard' },
  { to: '/market', icon: 'bi-basket', key: 'market', feature: 'market' },
  { to: '/friends', icon: 'bi-people', key: 'friends', feature: 'friend' },
] as const;
const t = useT();
const restStore = useRestaurantStore();
/** 区服关掉的功能不显示标签（问题记录 248） */
const tabs = computed(() => TABS.filter((x) => !('feature' in x) || restStore.featureOn(x.feature)));
const friends = useFriendsStore();
const route = useRoute();
/** "更多"不跳页，从底部弹出面板（问题记录：更多里的功能放到全局） */
const moreOpen = ref(false);
onMounted(() => friends.refreshPending());
watch(
  () => route.path,
  () => {
    moreOpen.value = false;
    void friends.refreshPending();
  },
);
</script>

<template>
  <template v-if="moreOpen">
    <div class="dt-more-backdrop" data-testid="more-backdrop" @click="moreOpen = false"></div>
    <div class="dt-more-sheet" data-testid="more-sheet">
      <MoreLinks @pick="moreOpen = false" />
    </div>
  </template>
  <nav class="dt-bottom-nav d-flex">
    <RouterLink
      v-for="x in tabs"
      :key="x.to"
      :to="x.to"
      class="flex-fill text-center small py-1 position-relative"
      @click="moreOpen = false"
    >
      <i :class="['bi', x.icon, 'd-block', 'fs-5']"></i>{{ t.nav.tabs[x.key] }}
      <span
        v-if="x.to === '/friends' && friends.pending > 0"
        class="position-absolute top-0 start-50 badge rounded-pill bg-danger"
        data-testid="friend-dot"
        >{{ friends.pending }}</span
      >
    </RouterLink>
    <a
      href="#"
      :class="['flex-fill text-center small py-1', { 'dt-more-on': moreOpen }]"
      data-testid="tab-more"
      @click.prevent="moreOpen = !moreOpen"
    >
      <i class="bi bi-grid d-block fs-5"></i>{{ t.nav.tabs.more }}
    </a>
  </nav>
</template>
