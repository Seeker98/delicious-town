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

/** 事件预测（238-1 设计 §7.2）：用银币买卖"是/否"份额，系统按公式报价 */
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const list = ref<PredictListDto | null>(null);
const detail = ref<PredictDetailDto | null>(null);
const selected = ref<number | null>(null);

const open = computed(() => list.value?.events.filter((e) => e.status === 'open') ?? []);
const ended = computed(() => list.value?.events.filter((e) => e.status !== 'open') ?? []);
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
const resultText = (e: PredictEventDto) =>
  e.status === 'resolved' ? t.value.predict.result(!!e.outcome) : t.value.predict.status[e.status];
const profit = (e: PredictEventDto) => (e.payout === null ? null : e.payout - e.netCost);
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const leftText = (closeAt: string) => {
  const ms = new Date(closeAt).getTime() - Date.now();
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
      <div class="small text-muted">
        {{ leftText(e.closeAt) }}
        <span v-if="e.yes > 0 || e.no > 0">{{ t.predict.holding(e.yes, e.no) }}</span>
      </div>
    </button>
    <PredictDetailCard v-if="shown(e.id) && list" :detail="detail!" :list="list" @refresh="refresh" />
  </template>

  <template v-if="ended.length > 0">
    <h6 class="dt-section">{{ t.predict.ended }}</h6>
    <template v-for="e in ended" :key="e.id">
      <div
        role="button"
        :class="['small border-bottom py-1', e.id === selected ? 'fw-bold' : '']"
        :data-testid="`pd-ended-${e.id}`"
        @click="pick(e.id)"
      >
        <b>{{ predictTitle(e) }}</b> · {{ resultText(e) }} · {{ t.predict.endedHold(e.yes, e.no) }}
        <span v-if="profit(e) !== null" :class="profit(e)! >= 0 ? 'text-success' : 'text-danger'">{{
          t.predict.profit(signed(profit(e)!))
        }}</span>
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
  </template>
</template>
