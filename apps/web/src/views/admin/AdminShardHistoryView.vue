<script setup lang="ts">
import { adminTime } from '../../utils/gameInput';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ShardHistoryDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

const route = useRoute();
const admin = useAdminStore();
const toast = useToastStore();
const shardId = computed(() => Number(route.params.id));
const rows = ref<ShardHistoryDto[]>([]);

async function load() {
  try {
    rows.value = await adminApi.history(shardId.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取历史失败'), 'danger');
  }
}
watch(shardId, load, { immediate: true });

async function rollback(version: number) {
  const note = window.prompt(`回滚到版本 ${version}，请填写说明`);
  if (!note?.trim()) return;
  try {
    const r = await adminApi.rollback(shardId.value, { version, note: note.trim() });
    toast.push(`已回滚，当前版本 ${r.version}`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '回滚失败'), 'danger');
  }
}
</script>

<template>
  <div class="d-flex align-items-center mb-2">
    <h5 class="mb-0">修改历史</h5>
    <RouterLink :to="`/admin/shards/${shardId}`" class="small ms-auto">返回数值</RouterLink>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>版本</th>
        <th>时间</th>
        <th>操作人</th>
        <th>说明</th>
        <th>改动</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="r.version">
        <td>{{ r.version }}</td>
        <td>{{ adminTime(r.at) }}</td>
        <td>{{ r.actor ?? '—' }}</td>
        <td>{{ r.note }}</td>
        <td class="text-break">{{ r.changed.join('、') || '（无）' }}</td>
        <td>
          <button
            v-if="admin.isAdmin && i > 0"
            class="btn btn-link btn-sm p-0"
            :data-testid="`rollback-${r.version}`"
            @click="rollback(r.version)"
          >
            回滚到此版
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
