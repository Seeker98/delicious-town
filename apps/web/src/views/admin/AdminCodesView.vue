<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminCodeDto, RewardItems } from '@dt/shared';
import { adminApi } from '../../api/admin';
import RewardItemsEditor from '../../components/admin/RewardItemsEditor.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { rewardSummary } from '../../utils/reward';

/** 后台兑换码（子项目 6A-2）：通用码、批量一次性码；批次按整批停用、导出 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();

const kind = ref<'shared' | 'single'>('shared');
const code = ref('');
const maxUses = ref<number | ''>('');
const count = ref<number | ''>(10);
const scope = ref<'all' | 'shard'>('all');
const minLevel = ref<number | ''>('');
const startsAt = ref('');
const endsAt = ref('');
const note = ref('');
const rewards = ref<RewardItems>({});
const over = ref<string[]>([]);
const formKey = ref(0);
const busy = ref(false);
const list = ref<AdminCodeDto[]>([]);
const exported = ref<{ batchId: number; text: string } | null>(null);

const hasRewards = computed(() => Object.keys(rewards.value).length > 0);
const countOk = computed(
  () => kind.value === 'shared' || (Number(count.value) >= 1 && Number(count.value) <= 1000),
);

async function loadList() {
  try {
    list.value = await adminApi.codes(admin.shardId ?? undefined);
  } catch (e) {
    toast.push(errorMessage(e, '读取兑换码失败'), 'danger');
  }
}
onMounted(() => void loadList());
watch(() => admin.shardId, loadList);

/** datetime-local 的值按本地时间解析，转成 ISO；空就不传 */
const iso = (v: string) => (v ? { value: new Date(v).toISOString() } : null);

async function create() {
  const shardId = admin.shardId;
  if (busy.value || !hasRewards.value || over.value.length > 0 || !countOk.value) return;
  if (scope.value === 'shard' && !shardId) return;
  const s = iso(startsAt.value);
  const e = iso(endsAt.value);
  const common = {
    ...(scope.value === 'shard' ? { shardId: shardId! } : {}),
    ...(minLevel.value ? { minLevel: Number(minLevel.value) } : {}),
    ...(s ? { startsAt: s.value } : {}),
    ...(e ? { endsAt: e.value } : {}),
    note: note.value.trim(),
    items: rewards.value,
  };
  busy.value = true;
  try {
    if (kind.value === 'shared') {
      const c = code.value.trim().toUpperCase();
      const r = await adminApi.createCode({
        ...(c ? { code: c } : {}),
        ...(maxUses.value ? { maxUses: Number(maxUses.value) } : {}),
        ...common,
      });
      toast.push(`已建兑换码 ${r.code ?? ''}`);
    } else {
      const r = await adminApi.createCodeBatch({ count: Number(count.value), ...common });
      toast.push(`已生成 ${r.count} 个一次性码`);
      if (r.batchId !== null) await showExport(r.batchId);
    }
    code.value = '';
    note.value = '';
    rewards.value = {};
    formKey.value++;
    await loadList();
  } catch (err) {
    toast.push(errorMessage(err, '建码失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

async function showExport(batchId: number) {
  try {
    const r = await adminApi.exportCodeBatch(batchId);
    exported.value = { batchId, text: r.codes.join('\n') };
  } catch (e) {
    toast.push(errorMessage(e, '导出失败'), 'danger');
  }
}

async function copyExport() {
  if (!exported.value) return;
  try {
    await navigator.clipboard.writeText(exported.value.text);
    toast.push('已复制');
  } catch {
    toast.push('复制失败，请手动选中复制', 'danger');
  }
}

function downloadExport() {
  if (!exported.value) return;
  const url = URL.createObjectURL(new Blob([exported.value.text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `codes-batch-${exported.value.batchId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function disable(c: AdminCodeDto) {
  const what = c.code ? `兑换码 ${c.code}` : `这一批 ${c.count} 个一次性码`;
  if (!window.confirm(`停用${what}？停用后不能再兑换，已兑换的不追回。`)) return;
  try {
    await adminApi.disableCode(c.id);
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '停用失败'), 'danger');
  }
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '');
const period = (c: AdminCodeDto) =>
  c.startsAt || c.endsAt ? `${fmt(c.startsAt) || '现在'} ~ ${fmt(c.endsAt) || '不限'}` : '不限';
</script>

<template>
  <h5>兑换码</h5>
  <p v-if="!admin.isAdmin" class="small text-muted">只有管理员能建码，你可以查看记录。</p>
  <form v-else class="small border rounded p-2 mb-3" @submit.prevent="create">
    <div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
      <select v-model="kind" class="form-select form-select-sm w-auto" data-testid="code-kind">
        <option value="shared">通用码（每家店一次）</option>
        <option value="single">一次性码（批量生成）</option>
      </select>
      <template v-if="kind === 'shared'">
        <input
          v-model="code"
          class="form-control form-control-sm w-auto"
          maxlength="20"
          placeholder="自定码（可空，空就随机）"
          data-testid="code-text"
        />
        <input
          v-model.number="maxUses"
          type="number"
          min="1"
          class="form-control form-control-sm w-auto"
          placeholder="总次数上限（可空）"
          data-testid="code-max"
        />
      </template>
      <input
        v-else
        v-model.number="count"
        type="number"
        min="1"
        max="1000"
        class="form-control form-control-sm w-auto"
        placeholder="数量（1~1000）"
        data-testid="code-count"
      />
      <select v-model="scope" class="form-select form-select-sm w-auto" data-testid="code-scope">
        <option value="all">全部区服</option>
        <option value="shard">当前区服</option>
      </select>
      <input
        v-model.number="minLevel"
        type="number"
        min="1"
        class="form-control form-control-sm w-auto"
        placeholder="最低等级（可空）"
        data-testid="code-min-level"
      />
    </div>
    <div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
      <label
        >开始
        <input
          v-model="startsAt"
          type="datetime-local"
          class="form-control form-control-sm d-inline-block w-auto"
          data-testid="code-starts"
      /></label>
      <label
        >结束
        <input
          v-model="endsAt"
          type="datetime-local"
          class="form-control form-control-sm d-inline-block w-auto"
          data-testid="code-ends"
      /></label>
    </div>
    <input
      v-model="note"
      class="form-control form-control-sm mb-2"
      maxlength="200"
      placeholder="备注（运营自己看，≤ 200 字）"
      data-testid="code-note"
    />
    <RewardItemsEditor :key="formKey" v-model="rewards" :hats="true" @over="over = $event" />
    <button
      type="button"
      class="btn btn-primary btn-sm"
      :disabled="busy || !hasRewards || over.length > 0 || !countOk"
      data-testid="code-create"
      @click="create"
    >
      {{ kind === 'shared' ? '建码' : '批量生成' }}
    </button>
  </form>

  <div v-if="exported" class="small border rounded p-2 mb-3">
    <div class="d-flex align-items-center gap-2 mb-1">
      <span class="flex-fill">批次 {{ exported.batchId }} 的全部兑换码</span>
      <button type="button" class="btn btn-sm btn-outline-primary py-0" @click="copyExport">复制全部</button>
      <button type="button" class="btn btn-sm btn-outline-primary py-0" @click="downloadExport">
        下载 .txt
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="exported = null">
        关闭
      </button>
    </div>
    <textarea
      class="form-control form-control-sm font-monospace"
      rows="6"
      readonly
      :value="exported.text"
      data-testid="code-export-text"
    ></textarea>
  </div>

  <table class="table table-sm small">
    <thead>
      <tr>
        <th>码</th>
        <th>范围</th>
        <th>附件</th>
        <th>已用</th>
        <th>时间段</th>
        <th>备注</th>
        <th>操作人</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in list" :key="c.id" :class="{ 'text-muted': c.disabled }">
        <td class="font-monospace">{{ c.code ?? `一次性码 ×${c.count}` }}</td>
        <td>
          {{ c.shardId ? `区服 ${c.shardId}` : '全部区服' }}{{ c.minLevel ? `（≥${c.minLevel} 级）` : '' }}
        </td>
        <td>{{ rewardSummary(c.items, catalog) }}</td>
        <td>{{ c.usedCount }} / {{ c.code === null ? c.count : (c.maxUses ?? '不限') }}</td>
        <td>{{ period(c) }}</td>
        <td>{{ c.note }}</td>
        <td>{{ c.actor ?? '系统' }}</td>
        <td class="text-nowrap">
          <span v-if="c.disabled">已停用</span>
          <template v-if="admin.isAdmin">
            <button
              v-if="c.code === null && c.batchId !== null"
              type="button"
              class="btn btn-sm btn-outline-primary py-0 me-1"
              :data-testid="`code-export-${c.id}`"
              @click="showExport(c.batchId)"
            >
              导出
            </button>
            <button
              v-if="!c.disabled"
              type="button"
              class="btn btn-sm btn-outline-danger py-0"
              :data-testid="`code-disable-${c.id}`"
              @click="disable(c)"
            >
              停用
            </button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>
