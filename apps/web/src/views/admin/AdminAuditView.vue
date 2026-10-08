<script setup lang="ts">
import { adminTime } from '../../utils/gameInput';
import { onMounted, ref } from 'vue';
import type { AuditRowDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { ACTION_LABEL } from '../../utils/adminLabels';

const toast = useToastStore();
const actor = ref('');
const action = ref('');
const rows = ref<AuditRowDto[]>([]);
const next = ref<string | null>(null);

async function load(reset: boolean) {
  try {
    const p = await adminApi.audit({
      actor: actor.value.trim() || undefined,
      action: action.value.trim() || undefined,
      before: reset ? undefined : (next.value ?? undefined),
    });
    rows.value = reset ? p.items : [...rows.value, ...p.items];
    next.value = p.nextBefore;
  } catch (e) {
    toast.push(errorMessage(e, '读取审计日志失败'), 'danger');
  }
}
onMounted(() => void load(true));
</script>

<template>
  <h5>审计日志</h5>
  <form class="d-flex gap-2 mb-2" @submit.prevent="load(true)">
    <input v-model="actor" class="form-control form-control-sm w-auto" placeholder="操作人用户名" />
    <select v-model="action" class="form-select form-select-sm w-auto">
      <option value="">全部动作</option>
      <option v-for="(label, a) in ACTION_LABEL" :key="a" :value="a">{{ label }}</option>
    </select>
    <button class="btn btn-sm btn-outline-primary">筛选</button>
  </form>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>时间</th>
        <th>操作人</th>
        <th>动作</th>
        <th>对象</th>
        <th>详情</th>
        <th>IP</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id">
        <td>{{ adminTime(r.at) }}</td>
        <td>{{ r.actor ?? '命令行' }}</td>
        <td>{{ ACTION_LABEL[r.action] ?? r.action }}</td>
        <td>{{ r.target }}</td>
        <td class="text-break font-monospace">{{ JSON.stringify(r.detail) }}</td>
        <td>{{ r.ip ?? '—' }}</td>
      </tr>
    </tbody>
  </table>
  <button v-if="next" class="btn btn-link btn-sm" data-testid="audit-more" @click="load(false)">
    加载更多
  </button>
</template>
