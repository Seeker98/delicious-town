<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatNum, gameDateTime } from '../utils/format';
import { RouterLink } from 'vue-router';
import type { RestLogDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { logText } from '../utils/events';
import { ATTR_KEYS, ATTR_NAMES } from '../utils/labels';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const t = useT();
const rest = computed(() => store.rest);
const logs = ref<RestLogDto[]>([]);
const next = ref<string | null>(null);
/** 第一页日志的状态：读完是空的才写"还没有日志"，读失败写出来（问题记录 100 终审） */
const logsState = ref<'loading' | 'ok' | 'failed'>('loading');

async function moreLogs() {
  const page = await endpoints.restLog(next.value ?? undefined);
  logs.value.push(...page.items);
  next.value = page.nextBefore;
}
onMounted(async () => {
  // 餐厅和日志一起读（性能排查 2026-10-08：原来一个接一个，线上多一轮往返）
  void store.refresh().catch(() => undefined);
  try {
    await moreLogs();
    logsState.value = 'ok';
  } catch {
    logsState.value = 'failed';
  }
});
</script>

<template>
  <div v-if="rest">
    <h6 class="dt-section mt-0">{{ t.rest.info.attrs }}</h6>
    <div class="row g-1 small align-items-center">
      <div v-for="k in ATTR_KEYS" :key="k" class="col-6">
        {{ ATTR_NAMES[k] }} {{ k === 'luck' ? rest.luck : rest.attrs[k] }}
      </div>
    </div>
    <RouterLink
      :to="rest.attrLeft > 0 ? '/rest/equip#attr-points' : '/rest/equip'"
      class="small dt-go"
      data-testid="to-points"
      >{{ rest.attrLeft > 0 ? t.rest.info.toPoints(rest.attrLeft) : t.rest.info.toEquip }}</RouterLink
    >
    <h6 class="dt-section">{{ t.rest.info.capacity }}</h6>
    <div class="row g-1 small">
      <div class="col-6">{{ t.rest.info.tableNum }} {{ rest.tableNum }}</div>
      <div class="col-6">{{ t.rest.info.cupboardNum }} {{ rest.cupboardNum }}</div>
      <div class="col-6">{{ t.rest.info.foodsMaxNum }} {{ rest.foodsMaxNum }}</div>
      <div class="col-6">{{ t.rest.info.foodsLockNum }} {{ rest.foodsLockNum }}</div>
      <div class="col-6">{{ t.rest.info.storeNum }} {{ rest.storeNum }}</div>
      <div class="col-6">{{ t.rest.info.oil(rest.oilLevel) }}</div>
      <!-- 累计获赞（问题记录 553） -->
      <div v-if="typeof rest.thumbs === 'number'" class="col-6" data-testid="info-thumbs">
        {{ t.rest.info.thumbs(formatNum(rest.thumbs)) }}
      </div>
    </div>
    <h6 class="dt-section">{{ t.rest.info.logs }}</h6>
    <div v-if="logsState === 'ok' && logs.length === 0" class="dt-empty" data-testid="logs-empty">
      {{ t.rest.info.noLogs }}
    </div>
    <div v-else-if="logsState === 'failed'" class="dt-empty" data-testid="logs-failed">
      {{ t.rest.info.logsFailed }}
    </div>
    <ul class="list-unstyled small">
      <li v-for="(l, i) in logs" :key="i">
        <span class="text-muted">{{ gameDateTime(l.at) }}</span>
        {{ logText(l, catalog) }}
      </li>
    </ul>
    <button v-if="next" class="btn btn-sm btn-outline-secondary w-100" @click="moreLogs">
      {{ t.rest.info.moreLogs }}
    </button>
  </div>
</template>
