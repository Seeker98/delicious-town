<script setup lang="ts">
import { adminTime, fromGameInput } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import { predictPercent, type PredictAdminRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 后台事件预测（238-1 设计 §7.3）：协管出题和查看，管理员判定和作废 */
const admin = useAdminStore();
const toast = useToastStore();
const rows = ref<PredictAdminRow[]>([]);
const busy = ref(false);
const isAdmin = computed(() => admin.me?.role === 'admin');
const title = ref('');
const description = ref('');
const closeAt = ref('');
const p0 = ref(50);
const b = ref<number | ''>('');
const STATUS = { open: '进行中', closed: '等待判定', resolved: '已判定', void: '已作废' } as const;

async function load() {
  if (admin.shardId === null) return;
  try {
    rows.value = await adminApi.predictList(admin.shardId);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function run(fn: () => Promise<unknown>, ok: string) {
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
function create() {
  if (admin.shardId === null || !title.value.trim() || !closeAt.value) return;
  const shardId = admin.shardId;
  void run(
    () =>
      adminApi.predictCreate({
        shardId,
        title: title.value.trim(),
        description: description.value.trim(),
        closeAt: fromGameInput(closeAt.value),
        p0: Number(p0.value),
        ...(b.value === '' ? {} : { b: Number(b.value) }),
      }),
    '已出题',
  );
}
/** 用输入框确认，顺便填备注写进审计（backlog 238-1）；点取消就不提交 */
const askNote = (q: string) =>
  window
    .prompt(
      `${q}

备注（可空，写进审计日志）：`,
    )
    ?.trim() ?? null;
function resolve(r: PredictAdminRow, outcome: boolean) {
  const note = askNote(`判定「${r.title}」结果为${outcome ? '是' : '否'}？判定后不能修改。`);
  if (note === null) return;
  void run(() => adminApi.predictResolve(r.id, outcome, note), '已判定');
}
function voidEvent(r: PredictAdminRow) {
  const note = askNote(`作废「${r.title}」？会按净投入退款，不能恢复。`);
  if (note === null) return;
  void run(() => adminApi.predictVoid(r.id, note), '已作废');
}
watch(
  () => admin.shardId,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <h6 class="dt-section">出题</h6>
  <div class="d-flex flex-wrap gap-2 align-items-center small mb-3">
    <input
      v-model="title"
      class="form-control form-control-sm"
      style="max-width: 20rem"
      maxlength="60"
      placeholder="问题（是/否）"
      data-testid="apd-title"
    />
    <input
      v-model="description"
      class="form-control form-control-sm"
      style="max-width: 20rem"
      maxlength="500"
      placeholder="说明、判定依据（选填）"
      data-testid="apd-desc"
    />
    截止（北京时间）
    <input
      v-model="closeAt"
      type="datetime-local"
      class="form-control form-control-sm w-auto"
      data-testid="apd-close"
    />
    初始概率
    <input
      v-model.number="p0"
      type="number"
      min="5"
      max="95"
      class="form-control form-control-sm"
      style="width: 5rem"
      data-testid="apd-p0"
    />% b
    <input
      v-model.number="b"
      type="number"
      min="10"
      max="10000"
      placeholder="默认"
      class="form-control form-control-sm"
      style="width: 6rem"
      data-testid="apd-b"
    />
    <button
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy"
      data-testid="apd-create"
      @click="create"
    >
      出题
    </button>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>事件</th>
        <th>状态</th>
        <th>截止</th>
        <th class="text-end">是</th>
        <th class="text-end">成交 / 持仓人</th>
        <th class="text-end">手续费</th>
        <th class="text-end">结果为是 / 否时系统收支</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id" :data-testid="`apd-row-${r.id}`">
        <td>
          {{ r.title }}<span class="text-muted">（{{ r.auto ? '系统' : (r.creator ?? '?') }}）</span>
        </td>
        <td>
          {{ r.status === 'resolved' ? `结果：${r.outcome ? '是' : '否'}` : STATUS[r.status] }}
          <div v-if="r.resultNote" class="text-muted" :data-testid="`apd-note-${r.id}`">
            {{ r.resultNote }}
          </div>
        </td>
        <td>{{ adminTime(r.closeAt) }}</td>
        <td class="text-end">{{ predictPercent(r.price) }}%</td>
        <td class="text-end">{{ r.trades }} / {{ r.holders }}</td>
        <td class="text-end">{{ formatNum(r.fees) }}</td>
        <td class="text-end">{{ formatNum(r.ifYes) }} / {{ formatNum(r.ifNo) }}</td>
        <td class="text-nowrap">
          <template v-if="isAdmin && (r.status === 'open' || r.status === 'closed')">
            <button
              type="button"
              class="btn btn-sm btn-link p-0 me-2"
              :disabled="busy"
              :data-testid="`apd-yes-${r.id}`"
              @click="resolve(r, true)"
            >
              判定为是
            </button>
            <button
              type="button"
              class="btn btn-sm btn-link p-0 me-2"
              :disabled="busy"
              :data-testid="`apd-no-${r.id}`"
              @click="resolve(r, false)"
            >
              判定为否
            </button>
            <button
              type="button"
              class="btn btn-sm btn-link text-danger p-0"
              :disabled="busy"
              :data-testid="`apd-void-${r.id}`"
              @click="voidEvent(r)"
            >
              作废
            </button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-if="rows.length === 0" class="text-muted small">这个区服还没有事件</div>
</template>
