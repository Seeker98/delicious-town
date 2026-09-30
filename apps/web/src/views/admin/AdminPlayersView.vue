<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { PlayerBriefDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';

const toast = useToastStore();
const q = ref('');
const rows = ref<PlayerBriefDto[] | null>(null);
const busy = ref(false);
const ROLE: Record<string, string> = { player: '玩家', mod: '协管', admin: '管理员' };

async function search() {
  if (!q.value.trim()) return;
  busy.value = true;
  try {
    rows.value = await adminApi.searchPlayers(q.value.trim());
  } catch (e) {
    toast.push(errorMessage(e, '搜索失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h5>玩家</h5>
  <form class="d-flex gap-2 mb-2" @submit.prevent="search">
    <input
      v-model="q"
      class="form-control form-control-sm"
      placeholder="用户名 / 邮箱 / 店名 / 账号 id"
      data-testid="player-q"
    />
    <button class="btn btn-primary btn-sm text-nowrap" :disabled="busy">搜索</button>
  </form>
  <p v-if="rows && rows.length === 0" class="small text-muted">没有找到。</p>
  <table v-if="rows && rows.length > 0" class="table table-sm small">
    <thead>
      <tr>
        <th>账号</th>
        <th>用户名</th>
        <th>邮箱</th>
        <th>角色</th>
        <th>状态</th>
        <th>餐厅</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.accountId">
        <td>
          <RouterLink :to="`/admin/players/${r.accountId}`">{{ r.accountId }}</RouterLink>
        </td>
        <td>{{ r.username }}</td>
        <td>{{ r.email }}</td>
        <td>{{ ROLE[r.role] }}</td>
        <td :class="{ 'text-danger': r.banned }">{{ r.banned ? '已封禁' : '正常' }}</td>
        <td>
          <div v-for="s in r.restaurants" :key="s.id">
            {{ s.shardName }} · {{ s.name }}（餐厅 id {{ s.id }}） · {{ s.level }} 级 {{ s.star }} 星{{
              s.state === 2 ? ' · 停业' : ''
            }}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
