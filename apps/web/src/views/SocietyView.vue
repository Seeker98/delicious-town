<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { RouterLink } from 'vue-router';
import { useT } from '../composables/useT';

const t = useT();
const links = [
  { to: '/society/star', icon: 'bi-star', key: 'star' },
  { to: '/society/oil', icon: 'bi-droplet-half', key: 'oil' },
  { to: '/society/rename', icon: 'bi-pencil', key: 'rename' },
  { to: '/society/move', icon: 'bi-signpost', key: 'move' },
] as const;
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
      <div class="fw-bold">{{ t.society.links[l.key].label }}</div>
      <div class="small text-muted">{{ t.society.links[l.key].desc }}</div>
    </div>
  </RouterLink>
</template>
