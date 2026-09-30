<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import TableGrid from '../components/TableGrid.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const DINE_MINUTES = 30;
const session = useSessionStore();
const toast = useToastStore();
const tables = ref<TableDto[]>([]);
const picked = ref<TableDto | null>(null);
const error = ref('');
const busy = ref(false);
const me = computed(() => session.me?.restaurantId ?? 0);

async function load() {
  try {
    tables.value = await endpoints.floor();
    if (picked.value) picked.value = tables.value.find((t) => t.no === picked.value!.no) ?? null;
  } catch (e) {
    error.value = errorMessage(e, '读取餐桌失败');
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    picked.value = null;
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const dinedMinutes = (t: TableDto) =>
  t.freeloaderSince ? Math.floor((Date.now() - Date.parse(t.freeloaderSince)) / 60_000) : 0;

onMounted(load);
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <TableGrid :tables="tables" :selected="picked?.no ?? null" @pick="(t) => (picked = t)" />
  <div v-if="picked" class="border rounded p-2 mt-2 small">
    <div class="mb-1">第 {{ picked.no }} 桌</div>
    <div v-if="picked.last && picked.last.type !== 0" class="text-muted mb-1">
      上一轮 {{ formatNum(Math.floor(picked.last.coin)) }} 银 /
      {{ formatNum(Math.floor(picked.last.exp)) }} 经
    </div>
    <button
      v-if="picked.customer === 3"
      class="btn btn-sm btn-success"
      data-testid="act-kill"
      :disabled="busy"
      @click="act(() => endpoints.roachKill(me, picked!.no), '消灭了蟑螂', '灭蟑螂失败')"
    >
      消灭蟑螂
    </button>
    <template v-else-if="picked.customer === 9">
      <div class="mb-1">{{ picked.freeloaderName ?? '好友' }} 已经白食 {{ dinedMinutes(picked) }} 分钟</div>
      <button
        class="btn btn-sm btn-outline-danger"
        data-testid="act-expel"
        :disabled="busy || dinedMinutes(picked) < DINE_MINUTES"
        @click="act(() => endpoints.dineExpel(picked!.no), '已请走白食者', '请走失败')"
      >
        请走（满 {{ DINE_MINUTES }} 分钟）
      </button>
    </template>
  </div>
</template>
