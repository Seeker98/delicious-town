<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import DtArt from '../components/DtArt.vue';
import DtSheet from '../components/DtSheet.vue';
import TableGrid from '../components/TableGrid.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { useCatalogStore } from '../stores/catalog';
import { CUSTOMER_NAMES } from '../utils/labels';
import { tableOrderLines } from '../utils/tableOrder';
import { serverNowMs } from '../utils/serverNow';

const DINE_MINUTES = 30;
const session = useSessionStore();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
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
  x.freeloaderSince ? Math.floor((serverNowMs() - Date.parse(x.freeloaderSince)) / 60_000) : 0;
/** 面板标题：第几桌 · 谁在这桌 */
const sheetTitle = computed(() =>
  picked.value
    ? `${t.value.rest.floor.tableNo(picked.value.no)} · ${CUSTOMER_NAMES[String(picked.value.customer)] ?? ''}`
    : '',
);
const canAct = computed(() => picked.value?.customer === 3 || picked.value?.customer === 9);

onMounted(load);
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <TableGrid :tables="tables" :selected="picked?.no ?? null" @pick="(x) => (picked = x)" />
  <!-- 点一桌从底部弹出（界面改版 P7：原来插在格子下面）：点了什么、上一轮收入；蟑螂、白食有操作 -->
  <DtSheet :open="!!picked" :title="sheetTitle" @close="picked = null">
    <div v-if="picked" class="dt-detail" data-testid="table-detail">
      <div class="dt-detail-head">
        <span
          :class="['dt-detail-art', { 'is-danger': picked.customer === 3, 'is-warn': picked.customer === 9 }]"
        >
          <DtArt v-if="picked.customer === 3" name="fac-bug" :size="40" />
          <b v-else class="dt-detail-no">{{ picked.no }}</b>
        </span>
        <div class="dt-detail-info">
          <div v-if="picked.customer === 3" class="dt-detail-sub">{{ t.rest.floor.roachNote }}</div>
          <div v-else-if="picked.customer === 9" class="dt-detail-sub">
            {{ t.rest.floor.dined(picked.freeloaderName ?? t.rest.floor.friend, dinedMinutes(picked)) }}
          </div>
          <template v-else>
            <!-- 点了什么、要几品、你的几品、满不满意；吃了特色菜再写一行（问题记录 559） -->
            <div
              v-for="(line, i) in tableOrderLines(picked.last, catalog)"
              :key="i"
              data-testid="table-order"
            >
              {{ line }}
            </div>
            <div v-if="picked.last && picked.last.type !== 0" class="dt-detail-sub">
              {{
                t.rest.floor.last(
                  formatNum(Math.floor(picked.last.coin)),
                  formatNum(Math.floor(picked.last.exp)),
                )
              }}
            </div>
          </template>
        </div>
      </div>
    </div>
    <template v-if="canAct" #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="picked = null">{{ t.common.close }}</button>
        <button
          v-if="picked?.customer === 3"
          type="button"
          class="btn btn-primary"
          data-testid="act-kill"
          :disabled="busy"
          @click="
            act(() => endpoints.roachKill(me, picked!.no), t.rest.floor.killed, t.rest.floor.killFailed)
          "
        >
          {{ t.rest.floor.kill }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn-outline-danger"
          data-testid="act-expel"
          :disabled="busy || (picked ? dinedMinutes(picked) < DINE_MINUTES : true)"
          @click="act(() => endpoints.dineExpel(picked!.no), t.rest.floor.expelled, t.rest.floor.expelFailed)"
        >
          {{ t.rest.floor.expel(DINE_MINUTES) }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
