<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useFriendsStore } from '../stores/friends';

const tabs = [
  { to: '/', icon: 'bi-shop', label: '餐厅' },
  { to: '/cookbooks', icon: 'bi-journal-text', label: '食谱' },
  { to: '/cupboard', icon: 'bi-box-seam', label: '橱柜' },
  { to: '/market', icon: 'bi-basket', label: '菜场' },
  { to: '/friends', icon: 'bi-people', label: '好友' },
  { to: '/more', icon: 'bi-grid', label: '更多' },
];
const friends = useFriendsStore();
const route = useRoute();
onMounted(() => friends.refreshPending());
watch(
  () => route.path,
  () => friends.refreshPending(),
);
</script>

<template>
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
  </nav>
</template>
