<script setup lang="ts">
import { computed, onMounted } from 'vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { RouterLink } from 'vue-router';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';

const t = useT();
const restaurant = useRestaurantStore();
// 直接打开、刷新协会页时还没有餐厅数据：读一次，关掉的功能才不显示入口
onMounted(() => {
  if (!restaurant.rest) restaurant.refresh().catch(() => {});
});
const links = computed(() => {
  const s = t.value.society.links;
  const n = t.value.npc.links;
  return [
    { to: '/society/star', icon: 'bi-star', ...s.star },
    { to: '/society/oil', icon: 'bi-droplet-half', ...s.oil },
    { to: '/society/rename', icon: 'bi-pencil', ...s.rename },
    { to: '/society/move', icon: 'bi-signpost', ...s.move },
    // 从广场搬过来的（问题记录 441、443）：区服关掉的功能不显示入口
    { to: '/society/classroom', icon: 'bi-easel', feature: 'mysterious', ...n.classroom },
    { to: '/society/mayor', icon: 'bi-person-badge', feature: 'town', ...n.mayor },
    { to: '/society/bro13', icon: 'bi-megaphone', feature: 'town', ...n.bro13 },
    { to: '/society/carmen', icon: 'bi-stars', feature: 'town', ...n.carmen },
    { to: '/society/fund', icon: 'bi-bank', feature: 'fund', ...n.fund },
  ].filter((l) => !('feature' in l) || restaurant.featureOn(l.feature));
});
</script>

<template>
  <h5>{{ t.society.title }}</h5>
  <HiphopCard :place="4" />
  <RouterLink
    v-for="l in links"
    :key="l.to"
    :to="l.to"
    class="d-flex align-items-center border rounded p-2 mb-2 text-decoration-none"
  >
    <i :class="['bi', l.icon, 'fs-4', 'me-2']"></i>
    <div>
      <div class="fw-bold">{{ l.label }}</div>
      <div class="small text-muted">{{ l.desc }}</div>
    </div>
  </RouterLink>
</template>
