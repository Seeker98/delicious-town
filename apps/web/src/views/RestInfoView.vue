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
/** 加点的属性（不含厨具）；幸运单独一个字段 */
const attrValue = (k: (typeof ATTR_KEYS)[number]) => (k === 'luck' ? rest.value!.luck : rest.value!.attrs[k]);
/** 容量那组：名字和数值成对（界面改版 P3）；累计获赞旧服务端没有（问题记录 553） */
const capacity = computed(() => {
  const r = rest.value;
  if (!r) return [];
  const x = t.value.rest.info;
  const rows: Array<{ label: string; value: string | number; testid?: string }> = [
    { label: x.tableNum, value: r.tableNum },
    { label: x.cupboardNum, value: r.cupboardNum },
    { label: x.foodsMaxNum, value: r.foodsMaxNum },
    { label: x.foodsLockNum, value: r.foodsLockNum },
    { label: x.storeNum, value: r.storeNum },
    { label: x.oilLabel, value: x.oilLevel(r.oilLevel) },
  ];
  if (typeof r.thumbs === 'number')
    rows.push({ label: x.thumbsLabel, value: formatNum(r.thumbs), testid: 'info-thumbs' });
  return rows;
});
</script>

<template>
  <DtSkeleton v-if="!rest" :rows="6" data-testid="info-skeleton" />
  <div v-else>
    <!-- 属性（界面改版 P7）：3×2 小数字块，0 灰掉；下面一句说明，句末是去加点的句中链接 -->
    <section class="dt-block mt-2">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.info.attrs }}</h2>
      </div>
      <dl class="dt-attr-tiles" data-testid="info-attrs">
        <div v-for="k in ATTR_KEYS" :key="k" class="dt-stat">
          <dt class="dt-stat-label">{{ ATTR_NAMES[k] }}</dt>
          <dd :class="['dt-stat-value', { 'is-zero': attrValue(k) === 0 }]">{{ attrValue(k) }}</dd>
        </div>
      </dl>
      <p class="dt-attr-note">
        {{ t.rest.info.attrsNote
        }}<template v-if="rest.attrLeft > 0">{{ t.rest.info.pointsLeft(rest.attrLeft) }}</template>
        <RouterLink
          :to="rest.attrLeft > 0 ? '/rest/equip#attr-points' : '/rest/equip'"
          class="dt-go"
          data-testid="to-points"
          >{{ rest.attrLeft > 0 ? t.rest.info.goPoints : t.rest.info.toEquip }}</RouterLink
        >
      </p>
    </section>
    <!-- 容量：一张卡片一行一项，名字左、数值右 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.info.capacity }}</h2>
      </div>
      <dl class="dt-card dt-kv-rows" data-testid="info-capacity">
        <div v-for="x in capacity" :key="x.label" class="dt-kv-row">
          <dt>{{ x.label }}</dt>
          <dd :data-testid="x.testid">{{ x.value }}</dd>
        </div>
      </dl>
    </section>
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.info.logs }}</h2>
      </div>
      <DtEmpty
        v-if="logsState === 'ok' && logs.length === 0"
        :title="t.rest.info.noLogs"
        data-testid="logs-empty"
      />
      <div v-else-if="logsState === 'failed'" class="dt-empty" data-testid="logs-failed">
        {{ t.rest.info.logsFailed }}
      </div>
      <!-- 每条一行，和首页动态一样是“时间 + 文字”（界面改版 P7：去掉虚线，放进卡片） -->
      <div v-if="logs.length > 0" class="dt-card dt-list-card" data-testid="info-logs">
        <div v-for="(l, i) in logs" :key="i" class="dt-feed">
          <span class="dt-feed-time">{{ logTime(l.at) }}</span>
          <span class="dt-feed-text">{{ logText(l, catalog) }}</span>
        </div>
      </div>
      <div v-if="next" class="dt-more-row">
        <button type="button" class="btn btn-outline-primary" data-testid="logs-more" @click="moreLogs">
          {{ t.rest.info.moreLogs }}
        </button>
      </div>
    </section>
  </div>
</template>
