<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const base = [
  { to: '/rest/tasks', icon: 'bi-check2-square', label: '任务与活跃' },
  { to: '/store', icon: 'bi-archive', label: '仓库' },
  { to: '/shop', icon: 'bi-bag', label: '商店' },
  { to: '/mc', icon: 'bi-stars', label: '特色菜' },
  { to: '/temple', icon: 'bi-bank2', label: '神殿' },
  { to: '/classroom', icon: 'bi-easel', label: '教室' },
  { to: '/society', icon: 'bi-bank', label: '协会' },
  { to: '/rest/floor', icon: 'bi-grid-3x3', label: '楼层餐桌' },
  { to: '/rest/income', icon: 'bi-graph-up', label: '收益记录' },
  { to: '/rest/info', icon: 'bi-person-badge', label: '餐厅信息' },
  { to: '/rest/look', icon: 'bi-palette', label: '装扮' },
  { to: '/weather', icon: 'bi-cloud-sun', label: '天气' },
  { to: '/shards', icon: 'bi-arrow-left-right', label: '切换区服' },
];
/** 协管和管理员多一个后台入口 */
const links = computed(() =>
  session.me && session.me.role !== 'player'
    ? [...base, { to: '/admin', icon: 'bi-shield-lock', label: '管理后台' }]
    : base,
);
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
