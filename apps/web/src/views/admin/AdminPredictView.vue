<script setup lang="ts">
import { adminShort, fromGameInput } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import { predictPercent, type PredictAdminRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import DtSheet from '../../components/DtSheet.vue';

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
const STATUS_TONE = { open: 'is-p', closed: 'is-w', resolved: 'is-ok', void: '' } as const;
const shardName = computed(() => admin.shards.find((s) => s.id === admin.shardId)?.name ?? '');

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
/**
 * 判定、作废（界面改版 P12）：面板里确认，顺便填备注写进审计（backlog 238-1 原来用浏览器输入框）；点取消就不提交
 */
const pending = ref<{
  kind: 'resolve' | 'void';
  row: PredictAdminRow;
  outcome: boolean;
  title: string;
  body: string;
  ok: string;
} | null>(null);
const note = ref('');
function resolve(r: PredictAdminRow, outcome: boolean) {
  note.value = '';
  pending.value = {
    kind: 'resolve',
    row: r,
    outcome,
    title: `判定「${r.title}」结果为${outcome ? '是' : '否'}？`,
    body: '判定后不能修改, 按结果给买对的人兑付。',
    ok: `判定为${outcome ? '是' : '否'}`,
  };
}
function voidEvent(r: PredictAdminRow) {
  note.value = '';
  pending.value = {
    kind: 'void',
    row: r,
    outcome: false,
    title: `作废「${r.title}」？`,
    body: '会按净投入退款, 不能恢复。',
    ok: '作废',
  };
}
function confirmPending() {
  const p = pending.value;
  if (!p) return;
  pending.value = null;
  const n = note.value.trim();
  if (p.kind === 'resolve') void run(() => adminApi.predictResolve(p.row.id, p.outcome, n), '已判定');
  else void run(() => adminApi.predictVoid(p.row.id, n), '已作废');
}
watch(
  () => admin.shardId,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="预测" :desc="`${shardName} · 玩家买“是”或“否”, 截止后判定; 系统按 LMSR 做市`" />
    <AdmBox title="出题">
      <form @submit.prevent="create">
        <AdmField label="问题" hint="只能答是或否, ≤ 60 字">
          <input v-model="title" class="dt-adm-in dt-adm-full" maxlength="60" data-testid="apd-title" />
        </AdmField>
        <AdmField label="说明" hint="判定依据, 选填">
          <input v-model="description" class="dt-adm-in dt-adm-full" maxlength="500" data-testid="apd-desc" />
        </AdmField>
        <AdmField label="截止" hint="北京时间">
          <input v-model="closeAt" type="datetime-local" class="dt-adm-in" data-testid="apd-close" />
        </AdmField>
        <AdmField label="做市" hint="初始概率 5~95, b 不填用默认">
          <div class="dt-adm-line">
            <input
              v-model.number="p0"
              type="number"
              min="5"
              max="95"
              class="dt-adm-in dt-adm-w-xs"
              aria-label="初始概率"
              data-testid="apd-p0"
            />
            <span class="dt-adm-mu">%</span>
            <span class="dt-adm-mu">b</span>
            <input
              v-model.number="b"
              type="number"
              min="10"
              max="10000"
              placeholder="默认"
              class="dt-adm-in dt-adm-w-xs"
              aria-label="b"
              data-testid="apd-b"
            />
          </div>
        </AdmField>
        <AdmField>
          <button
            type="button"
            class="dt-adm-btn is-p"
            :disabled="busy"
            data-testid="apd-create"
            @click="create"
          >
            出题
          </button>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox title="这个区服的事件" :sub="`${rows.length} 个`" flush>
      <AdmEmpty v-if="rows.length === 0" title="这个区服还没有事件" />
      <div v-else class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>事件</th>
              <th>状态</th>
              <th>截止</th>
              <th class="num">是</th>
              <th class="num">成交 / 持仓人</th>
              <th class="num">手续费</th>
              <th class="num">结果为是 / 否时系统收支</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" :data-testid="`apd-row-${r.id}`">
              <td>
                {{ r.title }} <span class="dt-adm-mu">({{ r.auto ? '系统' : (r.creator ?? '?') }})</span>
              </td>
              <td>
                <span :class="['dt-adm-tag', STATUS_TONE[r.status]]">{{
                  r.status === 'resolved' ? `结果: ${r.outcome ? '是' : '否'}` : STATUS[r.status]
                }}</span>
                <div v-if="r.resultNote" class="dt-adm-mu dt-adm-small" :data-testid="`apd-note-${r.id}`">
                  {{ r.resultNote }}
                </div>
              </td>
              <td class="dt-adm-mu nowrap">{{ adminShort(r.closeAt) }}</td>
              <td class="num">{{ predictPercent(r.price) }}%</td>
              <td class="num">{{ r.trades }} / {{ r.holders }}</td>
              <td class="num">{{ formatNum(r.fees) }}</td>
              <td class="num nowrap">
                <span :class="r.ifYes < 0 ? 'dt-adm-dn' : ''">{{ formatNum(r.ifYes) }}</span> /
                <span :class="r.ifNo < 0 ? 'dt-adm-dn' : ''">{{ formatNum(r.ifNo) }}</span>
              </td>
              <td class="acts">
                <template v-if="isAdmin && (r.status === 'open' || r.status === 'closed')">
                  <button
                    type="button"
                    class="dt-adm-btn is-s is-sm"
                    :disabled="busy"
                    :data-testid="`apd-yes-${r.id}`"
                    @click="resolve(r, true)"
                  >
                    判定为是
                  </button>
                  <button
                    type="button"
                    class="dt-adm-btn is-s is-sm"
                    :disabled="busy"
                    :data-testid="`apd-no-${r.id}`"
                    @click="resolve(r, false)"
                  >
                    判定为否
                  </button>
                  <button
                    type="button"
                    class="dt-adm-btn is-d is-sm"
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
      </div>
    </AdmBox>

    <DtSheet :open="pending !== null" :title="pending?.title ?? ''" @close="pending = null">
      <p class="dt-sheet-text">{{ pending?.body }}</p>
      <input
        v-model="note"
        class="dt-adm-in dt-adm-full"
        placeholder="备注 (可空, 写进审计日志)"
        data-testid="apd-note-input"
      />
      <template #actions>
        <button type="button" class="btn btn-outline-secondary" @click="pending = null">取消</button>
        <button
          type="button"
          :class="['btn', pending?.kind === 'void' ? 'btn-outline-danger' : 'btn-primary']"
          :disabled="busy"
          data-testid="apd-confirm"
          @click="confirmPending"
        >
          {{ pending?.ok }}
        </button>
      </template>
    </DtSheet>
  </div>
</template>
