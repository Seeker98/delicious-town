<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { LedgerRecordDto, StoreDto, StoreItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { recordLabel } from '../utils/events';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const tab = ref<'items' | 'records'>('items');
const type = ref<number | undefined>(undefined);
const data = ref<StoreDto | null>(null);
const records = ref<LedgerRecordDto[]>([]);
const range = ref('1h');
const qty = reactive<Record<number, number>>({});
const busy = ref(false);
const TYPES = [
  { v: undefined, label: '全部' },
  { v: 0, label: '消耗品' },
  { v: 1, label: '道具' },
  { v: 2, label: '礼包' },
  { v: 3, label: '设施' },
  { v: 9, label: '勋章' },
];
const RANGES = [
  { v: '1h', label: '1 小时' },
  { v: '6h', label: '6 小时' },
  { v: '12h', label: '12 小时' },
  { v: 'today', label: '今天' },
  { v: 'yesterday', label: '昨天' },
  { v: 'before', label: '前天' },
];

async function load() {
  data.value = await endpoints.store(type.value);
}
async function loadRecords() {
  records.value = await endpoints.storeRecords(range.value);
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
/** 填的数超过上限时按上限算（使用：单次上限 maxUse；出售：持有数） */
const useN = (it: StoreItemDto) => Math.max(1, Math.min(qty[it.goodsId] ?? 1, it.maxUse));
const sellN = (it: StoreItemDto) => Math.max(1, Math.min(qty[it.goodsId] ?? 1, it.num));
const expires = (at: string | null) =>
  at ? `剩余 ${Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000))} 小时` : '';
const recordName = (r: LedgerRecordDto) => recordLabel(r, catalog);

watch(type, () => void load());
watch(range, () => void loadRecords());
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取仓库失败'), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'items' }]" href="#" @click.prevent="tab = 'items'">仓库</a>
    </li>
    <li class="nav-item">
      <a
        :class="['nav-link', { active: tab === 'records' }]"
        href="#"
        @click.prevent="((tab = 'records'), loadRecords())"
        >道具流水</a
      >
    </li>
  </ul>
  <template v-if="tab === 'items' && data">
    <div class="d-flex align-items-center mb-2 small">
      <select v-model="type" class="form-select form-select-sm w-auto">
        <option v-for="t in TYPES" :key="t.label" :value="t.v">{{ t.label }}</option>
      </select>
      <span class="ms-auto text-muted">已用 {{ data.kinds }}/{{ data.storeNum }} 种</span>
    </div>
    <div v-if="data.equips > 0" class="small text-muted mb-2">
      另有 {{ data.equips }} 件厨具在 <RouterLink to="/rest/equip">厨具页</RouterLink>（每件占一格）
    </div>
    <div
      v-for="it in data.items"
      :key="it.goodsId"
      class="dt-row d-flex align-items-center gap-1 border-bottom py-1 small"
    >
      <div class="flex-fill text-truncate" style="min-width: 0">
        <b>{{ catalog.goodsName(it.goodsId) }}</b> ×{{ formatNum(it.num) }}
        <span class="text-muted">{{ expires(it.expiresAt) }}</span>
      </div>
      <div class="dt-row-actions">
        <input
          v-if="it.batch || it.sellPrice !== null"
          v-model.number="qty[it.goodsId]"
          type="number"
          min="1"
          :max="it.num"
          class="form-control form-control-sm"
          style="width: 60px"
        />
        <span v-if="it.usable && it.maxUse === 0" class="text-danger">已达上限</span>
        <span v-else-if="it.batch" class="text-muted">最多 {{ it.maxUse }}</span>
        <button
          v-if="it.usable"
          class="btn btn-sm btn-primary"
          :disabled="busy || it.maxUse === 0"
          @click="run(() => endpoints.useGoods(it.goodsId, it.batch ? useN(it) : 1), '使用失败')"
        >
          {{ it.batch ? `使用 ×${useN(it)}` : '使用' }}
        </button>
        <button
          v-if="it.sellPrice !== null"
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          @click="run(() => endpoints.sell(it.goodsId, sellN(it)), '出售失败')"
        >
          卖 {{ formatNum(it.sellPrice * sellN(it)) }}
        </button>
        <button
          v-if="it.goodsId === 87"
          class="btn btn-sm btn-outline-danger"
          :disabled="busy"
          @click="run(() => endpoints.discard(87), '丢弃失败')"
        >
          丢弃
        </button>
      </div>
    </div>
  </template>
  <template v-if="tab === 'records'">
    <select v-model="range" class="form-select form-select-sm w-auto mb-2">
      <option v-for="r in RANGES" :key="r.v" :value="r.v">{{ r.label }}</option>
    </select>
    <div v-for="(r, i) in records" :key="i" class="d-flex border-bottom py-1 small">
      <span class="text-muted me-2">{{ new Date(r.at).toLocaleTimeString('zh-CN') }}</span>
      {{ recordName(r) }}
      <b :class="['ms-auto', r.delta >= 0 ? 'text-success' : 'text-danger']"
        >{{ r.delta >= 0 ? '+' : '' }}{{ formatNum(r.delta) }}</b
      >
    </div>
    <div v-if="records.length === 0" class="small text-muted">这段时间没有变动</div>
  </template>
</template>
