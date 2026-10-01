<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useAdminStore } from '../../stores/admin';

const admin = useAdminStore();
onMounted(() => {
  if (!admin.loaded) void admin.load();
});

const links = computed(() => [
  { to: '/admin', label: '概览' },
  { to: `/admin/shards/${admin.shardId ?? 1}`, label: '区服数值' },
  { to: '/admin/players', label: '玩家' },
  { to: '/admin/grants', label: '补偿' },
  { to: '/admin/mail', label: '邮件' },
  { to: '/admin/announce', label: '公告' },
  { to: '/admin/codes', label: '兑换码' },
  { to: '/admin/stats', label: '统计' },
  { to: '/admin/audit', label: '审计' },
]);
</script>

<template>
  <div v-if="!admin.loaded" class="p-3 text-muted">加载中…</div>
  <div v-else-if="!admin.me" class="p-4 text-center" data-testid="admin-404">
    <h5>页面不存在</h5>
    <RouterLink to="/">回到首页</RouterLink>
  </div>
  <div v-else>
    <nav class="d-flex flex-wrap align-items-center gap-2 border-bottom pb-2 mb-2">
      <RouterLink v-for="l in links" :key="l.label" :to="l.to" class="btn btn-sm btn-outline-secondary">
        {{ l.label }}
      </RouterLink>
      <select
        v-model.number="admin.shardId"
        class="form-select form-select-sm w-auto ms-auto"
        data-testid="admin-shard"
      >
        <option v-for="s in admin.shards" :key="s.id" :value="s.id">
          {{ s.name }}（{{ s.restaurants }} 店）
        </option>
      </select>
      <span class="small text-muted" data-testid="admin-who">
        {{ admin.me.username }} · {{ admin.me.role === 'admin' ? '管理员' : '协管' }}
      </span>
    </nav>
    <RouterView />
  </div>
</template>
