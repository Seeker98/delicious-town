<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LaunchCheckDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

/** 上线检查（子项目 6B-2，设计 §7）：开发期关掉的开关，管理员一键改成上线值 */
const admin = useAdminStore();
const toast = useToastStore();
const data = ref<LaunchCheckDto | null>(null);
const busy = ref(false);

onMounted(async () => {
  try {
    data.value = await adminApi.launchCheck();
  } catch (e) {
    toast.push(errorMessage(e, '读取上线检查失败'), 'danger');
  }
});

const failing = (s: LaunchCheckDto['shards'][number]) => s.items.filter((i) => !i.ok);

async function fix(s: LaunchCheckDto['shards'][number]) {
  const n = failing(s).length;
  if (busy.value || !window.confirm(`把「${s.shardName}」的 ${n} 项改成上线值，并记一条修改历史？`)) return;
  busy.value = true;
  try {
    data.value = await adminApi.launchCheckFix({ shardId: s.shardId, version: s.version });
    toast.push('已改成上线值');
  } catch (e) {
    toast.push(errorMessage(e, '修复失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data" class="border rounded p-2 mb-3 small">
    <div v-if="data.allOk" class="text-success" data-testid="launch-ok">
      <i class="bi bi-check-circle me-1"></i>上线检查：全部通过，可以上线
    </div>
    <template v-else>
      <div class="fw-bold text-danger mb-1">
        <i class="bi bi-exclamation-triangle me-1"></i>上线检查：有开关还没打开
      </div>
      <template v-for="s in data.shards" :key="s.shardId">
        <div v-if="failing(s).length > 0" class="mb-2">
          <div class="d-flex align-items-center gap-2">
            <b>{{ s.shardName }}</b>
            <button
              v-if="admin.isAdmin"
              type="button"
              class="btn btn-sm btn-outline-danger py-0 ms-auto"
              :disabled="busy"
              :data-testid="`launch-fix-${s.shardId}`"
              @click="fix(s)"
            >
              改成上线值
            </button>
          </div>
          <div v-for="i in failing(s)" :key="i.path">
            <code>{{ i.path }}</code> 现在 {{ JSON.stringify(i.current) }}，应为 {{ JSON.stringify(i.want) }}
            <span class="text-muted">（{{ i.why }}）</span>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
