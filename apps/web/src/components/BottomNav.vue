<script setup lang="ts">
import { RouterLink } from 'vue-router';

const tabs = [
  { to: '/', icon: 'bi-shop', label: '餐厅' },
  { to: '/cookbooks', icon: 'bi-journal-text', label: '食谱' },
  { to: '/cupboard', icon: 'bi-box-seam', label: '橱柜' },
  { to: '/market', icon: 'bi-basket', label: '菜场' },
  { to: '/more', icon: 'bi-grid', label: '更多' },
];
</script>

<template>
  <nav class="dt-bottom-nav d-flex">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="flex-fill text-center small py-1">
      <i :class="['bi', t.icon, 'd-block', 'fs-5']"></i>{{ t.label }}
    </RouterLink>
  </nav>
</template>
