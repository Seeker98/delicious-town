<script setup lang="ts">
import { RouterLink } from 'vue-router';

const links = [
  { to: '/society/star', icon: 'bi-star', label: '升星', desc: '等级、食谱、凭证够了就能升星' },
  { to: '/society/oil', icon: 'bi-droplet-half', label: '油壶扩容', desc: '提高油上限，减少停业' },
  { to: '/society/rename', icon: 'bi-pencil', label: '改名', desc: '需要改名卡' },
  { to: '/society/move', icon: 'bi-signpost', label: '搬家', desc: '换一条街，街道勋章跟着换' },
];
</script>

<template>
  <h5>协会</h5>
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
