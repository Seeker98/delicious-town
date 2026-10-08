<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { predictPercent, type PredictDetailDto, type PredictEventDto, type PredictListDto } from '@dt/shared';
import PredictDetailCard from '../components/predict/PredictDetailCard.vue';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { predictNote, predictTitle } from '../utils/serverText';
import { useCatalogStore } from '../stores/catalog';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { serverNowMs } from '../utils/serverNow';

/** 事件预测（238-1 设计 §7.2）：用银币买卖"是/否"份额，系统按公式报价 */
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const list = ref<PredictListDto | null>(null);
const detail = ref<PredictDetailDto | null>(null);
const selected = ref<number | null>(null);

const open = computed(() => list.value?.events.filter((e) => e.status === 'open') ?? []);
/** 已结束的按截止时间从新到旧（问题记录 449）；同一时间编号大的在前 */
const ended = computed(() =>
  (list.value?.events.filter((e) => e.status !== 'open') ?? []).sort(
    (a, b) => b.closeAt.localeCompare(a.closeAt) || b.id - a.id,
  ),
);
/** 详情只展开在被点的那一行下面（问题记录 264）；新详情读回来之前不显示上一个的 */
const shown = (id: number) => selected.value === id && detail.value?.event.id === id;
const reasonText = computed(() => {
  const l = list.value;
  if (!l || !l.reason) return '';
  const r = t.value.predict.reasons;
  if (l.reason === 'predict_level') return r.predict_level(l.need.level);
  if (l.reason === 'predict_age') return r.predict_age(l.need.days);
  if (l.reason === 'predict_email') return r.predict_email;
  if (l.reason === 'predict_frozen') return r.predict_frozen;
  return l.reason;
});
const profit = (e: PredictEventDto) => (e.payout === null ? null : e.payout - e.netCost);
/** 已结束的结果标签：是 / 否，没判定的写状态（等待判定、已作废）（问题记录 288） */
const endedTag = (e: PredictEventDto) =>
  e.status === 'resolved'
    ? e.outcome
      ? t.value.predict.yes
      : t.value.predict.no
    : t.value.predict.status[e.status];
const endedTagClass = (e: PredictEventDto) =>
  e.status === 'resolved' ? (e.outcome ? 'text-success' : 'text-danger') : 'text-muted';
/** 已结束的超过 5 个先收起（问题记录 288） */
const ENDED_SHOWN = 5;
const endedAll = ref(false);
const endedShown = computed(() => (endedAll.value ? ended.value : ended.value.slice(0, ENDED_SHOWN)));
/** "怎么玩"整页只放一份（以前每张详情卡里各一份，问题记录 288）；金额按区服默认的每份结算 */
const helpItems = computed(() => {
  const l = list.value;
  if (!l) return [];
  return t.value.predict.detail.helpItems(
    formatNum(l.unit),
    formatNum(Math.round(l.unit * 0.63)),
    Math.round(l.feeRate * 100),
  );
});
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const leftText = (closeAt: string) => {
  const ms = new Date(closeAt).getTime() - serverNowMs();
  const p = t.value.predict;
  if (ms <= 0) return p.closedAt;
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? p.leftHm(Math.floor(m / 60), m % 60) : p.leftM(m);
};

async function loadList() {
  try {
    list.value = await endpoints.predictList();
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
async function loadDetail(id: number) {
  try {
    const d = await endpoints.predictDetail(id);
    if (selected.value === id) detail.value = d;
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
/** 点一行展开详情，再点一次收起 */
async function pick(id: number) {
  if (selected.value === id) {
    selected.value = null;
    detail.value = null;
    return;
  }
  selected.value = id;
  await loadDetail(id);
}
async function refresh() {
  await loadList();
  if (selected.value !== null) await loadDetail(selected.value);
}
onMounted(() => void loadList());
</script>

<template>
  <h5>{{ t.predict.title }}</h5>
  <HiphopCard :place="11" />
  <div class="small text-muted mb-2">
    {{ t.predict.intro }}
  </div>
  <!-- 玩法说明整页一份，默认收起（问题记录 288：以前每张详情卡里各一份） -->
  <details v-if="list" class="small mb-2" data-testid="pd-help">
    <summary>{{ t.predict.detail.help }}</summary>
    <ul class="mb-0 ps-3">
      <li v-for="(x, i) in helpItems" :key="i">{{ x }}</li>
    </ul>
  </details>
  <div v-if="list && !list.enabled" class="alert alert-secondary py-1 small" data-testid="pd-off">
    {{ t.predict.off }}
  </div>
  <div v-if="reasonText" class="alert alert-warning py-1 small" data-testid="pd-reason">{{ reasonText }}</div>

  <h6 class="dt-section">{{ t.predict.running }}</h6>
  <div v-if="list && open.length === 0" class="small text-muted mb-3">{{ t.predict.noRunning }}</div>
  <template v-for="e in open" :key="e.id">
    <button
      type="button"
      :class="['dt-card w-100 text-start mb-2', e.id === selected ? 'border-primary' : '']"
      :data-testid="`pd-event-${e.id}`"
      @click="pick(e.id)"
    >
      <div class="d-flex align-items-center gap-2">
        <span class="flex-fill dt-card-title"
          >{{ predictTitle(e)
          }}<span v-if="e.auto" class="dt-tag ms-1 fw-normal" :data-testid="`pd-auto-${e.id}`">{{
            t.predict.auto
          }}</span></span
        >
        <span class="text-success small text-nowrap">{{ t.predict.yesPct(predictPercent(e.price)) }}</span>
        <i :class="['bi', e.id === selected ? 'bi-chevron-up' : 'bi-chevron-down', 'text-muted']" />
      </div>
      <!-- 是/否概率条（问题记录 288） -->
      <div class="progress my-1" style="height: 4px" :data-testid="`pd-bar-${e.id}`">
        <div
          class="progress-bar bg-success"
          data-testid="pd-bar-yes"
          :style="{ width: `${predictPercent(e.price)}%` }"
        ></div>
        <div class="progress-bar bg-danger" :style="{ width: `${100 - predictPercent(e.price)}%` }"></div>
      </div>
      <div class="small text-muted">
        {{ leftText(e.closeAt) }}
        <span v-if="e.yes > 0 || e.no > 0">{{ t.predict.holding(e.yes, e.no) }}</span>
      </div>
    </button>
    <PredictDetailCard v-if="shown(e.id) && list" :detail="detail!" :list="list" @refresh="refresh" />
  </template>

  <template v-if="ended.length > 0">
    <h6 class="dt-section">{{ t.predict.ended }}</h6>
    <!-- 已结束：小卡片，标出结果和我的盈亏；超过 5 个先收起（问题记录 288） -->
    <template v-for="e in endedShown" :key="e.id">
      <div
        role="button"
        :class="['dt-card small mb-2', e.id === selected ? 'border-primary' : '']"
        :data-testid="`pd-ended-${e.id}`"
        @click="pick(e.id)"
      >
        <div class="d-flex align-items-center gap-2">
          <span class="flex-fill dt-card-title">{{ predictTitle(e) }}</span>
          <span :class="['dt-tag', endedTagClass(e)]" data-testid="pd-ended-tag">{{ endedTag(e) }}</span>
        </div>
        <span class="text-muted">{{ t.predict.endedHold(e.yes, e.no) }}</span>
        <span
          v-if="profit(e) !== null"
          data-testid="pd-ended-profit"
          :class="profit(e)! >= 0 ? 'text-success' : 'text-danger'"
          >{{ t.predict.profit(signed(profit(e)!)) }}</span
        >
        <div v-if="predictNote(e, catalog)" class="text-muted" :data-testid="`pd-ended-note-${e.id}`">
          {{ t.predict.note(predictNote(e, catalog)!) }}
        </div>
      </div>
      <PredictDetailCard
        v-if="shown(e.id) && list"
        class="mt-1"
        :detail="detail!"
        :list="list"
        @refresh="refresh"
      />
    </template>
    <!-- .dt-link-btn 的字号跟着外层走：外面包一层 small -->
    <div v-if="ended.length > ENDED_SHOWN" class="small">
      <button type="button" class="dt-link-btn" data-testid="pd-ended-more" @click="endedAll = !endedAll">
        {{ endedAll ? t.predict.endedLess : t.predict.endedMore(ended.length) }}
      </button>
    </div>
  </template>
</template>
