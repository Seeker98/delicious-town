<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import TableGrid from '../components/TableGrid.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const DINE_MINUTES = 30;
const session = useSessionStore();
const toast = useToastStore();
const t = useT();
const tables = ref<TableDto[]>([]);
const picked = ref<TableDto | null>(null);
const error = ref('');
const busy = ref(false);
const me = computed(() => session.me?.restaurantId ?? 0);

async function load() {
  try {
    tables.value = await endpoints.floor();
    if (picked.value) picked.value = tables.value.find((x) => x.no === picked.value!.no) ?? null;
  } catch (e) {
    error.value = errorMessage(e, t.value.rest.floor.loadFailed);
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

const dinedMinutes = (x: TableDto) =>
  x.freeloaderSince ? Math.floor((Date.now() - Date.parse(x.freeloaderSince)) / 60_000) : 0;

onMounted(load);
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <TableGrid :tables="tables" :selected="picked?.no ?? null" @pick="(x) => (picked = x)" />
  <div v-if="picked" class="border rounded p-2 mt-2 small">
    <div class="mb-1">{{ t.rest.floor.tableNo(picked.no) }}</div>
    <div v-if="picked.last && picked.last.type !== 0" class="text-muted mb-1">
      {{ t.rest.floor.last(formatNum(Math.floor(picked.last.coin)), formatNum(Math.floor(picked.last.exp))) }}
    </div>
    <button
      v-if="picked.customer === 3"
      class="btn btn-sm btn-primary"
      data-testid="act-kill"
      :disabled="busy"
      @click="act(() => endpoints.roachKill(me, picked!.no), t.rest.floor.killed, t.rest.floor.killFailed)"
    >
      {{ t.rest.floor.kill }}
    </button>
    <template v-else-if="picked.customer === 9">
      <div class="mb-1">
        {{ t.rest.floor.dined(picked.freeloaderName ?? t.rest.floor.friend, dinedMinutes(picked)) }}
      </div>
      <button
        class="btn btn-sm btn-outline-danger"
        data-testid="act-expel"
        :disabled="busy || dinedMinutes(picked) < DINE_MINUTES"
        @click="act(() => endpoints.dineExpel(picked!.no), t.rest.floor.expelled, t.rest.floor.expelFailed)"
      >
        {{ t.rest.floor.expel(DINE_MINUTES) }}
      </button>
    </template>
  </div>
</template>
