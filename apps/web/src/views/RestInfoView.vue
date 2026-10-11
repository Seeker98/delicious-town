<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
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
/** 日志时间只写月日时分（界面改版 P3：和动态一样） */
const logTime = (iso: string) =>
  gameDateTime(iso, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<template>
  <DtSkeleton v-if="!rest" :rows="6" data-testid="info-skeleton" />
  <div v-else>
    <h6 class="dt-section mt-0">{{ t.rest.info.attrs }}</h6>
    <!-- 两列键值行（界面改版 P3） -->
    <dl class="dt-kv dt-kv-2 small mb-1" data-testid="info-attrs">
      <template v-for="k in ATTR_KEYS" :key="k">
        <dt>{{ ATTR_NAMES[k] }}</dt>
        <dd>{{ k === 'luck' ? rest.luck : rest.attrs[k] }}</dd>
      </template>
    </dl>
    <RouterLink
      :to="rest.attrLeft > 0 ? '/rest/equip#attr-points' : '/rest/equip'"
      class="small dt-go"
      data-testid="to-points"
      >{{ rest.attrLeft > 0 ? t.rest.info.toPoints(rest.attrLeft) : t.rest.info.toEquip }}</RouterLink
    >
    <h6 class="dt-section">{{ t.rest.info.capacity }}</h6>
    <dl class="dt-kv dt-kv-2 small" data-testid="info-capacity">
      <dt>{{ t.rest.info.tableNum }}</dt>
      <dd>{{ rest.tableNum }}</dd>
      <dt>{{ t.rest.info.cupboardNum }}</dt>
      <dd>{{ rest.cupboardNum }}</dd>
      <dt>{{ t.rest.info.foodsMaxNum }}</dt>
      <dd>{{ rest.foodsMaxNum }}</dd>
      <dt>{{ t.rest.info.foodsLockNum }}</dt>
      <dd>{{ rest.foodsLockNum }}</dd>
      <dt>{{ t.rest.info.storeNum }}</dt>
      <dd>{{ rest.storeNum }}</dd>
      <dt>{{ t.rest.info.oilLabel }}</dt>
      <dd>{{ t.rest.info.oilLevel(rest.oilLevel) }}</dd>
      <!-- 累计获赞（问题记录 553） -->
      <template v-if="typeof rest.thumbs === 'number'">
        <dt>{{ t.rest.info.thumbsLabel }}</dt>
        <dd data-testid="info-thumbs">{{ formatNum(rest.thumbs) }}</dd>
      </template>
    </dl>
    <h6 class="dt-section">{{ t.rest.info.logs }}</h6>
    <DtEmpty
      v-if="logsState === 'ok' && logs.length === 0"
      :title="t.rest.info.noLogs"
      data-testid="logs-empty"
    />
    <div v-else-if="logsState === 'failed'" class="dt-empty" data-testid="logs-failed">
      {{ t.rest.info.logsFailed }}
    </div>
    <!-- 每条一行，时间写月日时分（界面改版 P3） -->
    <div v-for="(l, i) in logs" :key="i" class="dt-feed">
      <span class="dt-feed-time">{{ logTime(l.at) }}</span>
      <span class="dt-feed-text">{{ logText(l, catalog) }}</span>
    </div>
    <button v-if="next" class="btn btn-sm btn-outline-secondary w-100" @click="moreLogs">
      {{ t.rest.info.moreLogs }}
    </button>
  </div>
</template>
