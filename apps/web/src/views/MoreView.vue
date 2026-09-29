<script setup lang="ts">
import { RouterLink } from 'vue-router';

const links = [
  { to: '/rest/tasks', icon: 'bi-check2-square', label: '任务与活跃' },
  { to: '/store', icon: 'bi-archive', label: '仓库' },
  { to: '/shop', icon: 'bi-bag', label: '商店' },
  { to: '/society', icon: 'bi-bank', label: '协会' },
  { to: '/rest/floor', icon: 'bi-grid-3x3', label: '楼层餐桌' },
  { to: '/rest/income', icon: 'bi-graph-up', label: '收益记录' },
  { to: '/rest/info', icon: 'bi-person-badge', label: '餐厅信息' },
  { to: '/weather', icon: 'bi-cloud-sun', label: '天气' },
  { to: '/shards', icon: 'bi-arrow-left-right', label: '切换区服' },
];
</script>

<template>
  <div class="row g-2">
    <div v-for="l in links" :key="l.to" class="col-4">
      <RouterLink :to="l.to" class="d-block border rounded text-center py-3 small text-decoration-none">
        <i :class="['bi', l.icon, 'd-block', 'fs-4']"></i>{{ l.label }}
      </RouterLink>
    </div>
  </div>
</template>
