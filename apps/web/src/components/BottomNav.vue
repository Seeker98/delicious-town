<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useFriendsStore } from '../stores/friends';
import MoreLinks from './MoreLinks.vue';

const tabs = [
  { to: '/', icon: 'bi-shop', label: '餐厅' },
  { to: '/cookbooks', icon: 'bi-journal-text', label: '食谱' },
  { to: '/cupboard', icon: 'bi-box-seam', label: '橱柜' },
  { to: '/market', icon: 'bi-basket', label: '菜场' },
  { to: '/friends', icon: 'bi-people', label: '好友' },
];
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
      v-for="t in tabs"
      :key="t.to"
      :to="t.to"
      class="flex-fill text-center small py-1 position-relative"
    >
      <i :class="['bi', t.icon, 'd-block', 'fs-5']"></i>{{ t.label }}
      <span
        v-if="t.to === '/friends' && friends.pending > 0"
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
      <i class="bi bi-grid d-block fs-5"></i>更多
    </a>
  </nav>
</template>
