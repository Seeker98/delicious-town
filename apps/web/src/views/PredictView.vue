<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { predictPercent, type PredictDetailDto, type PredictEventDto, type PredictListDto } from '@dt/shared';
import PredictDetailCard from '../components/predict/PredictDetailCard.vue';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import HiphopCard from '../components/hiphop/HiphopCard.vue';

/** 事件预测（238-1 设计 §7.2）：用银币买卖"是/否"份额，系统按公式报价 */
const toast = useToastStore();
const list = ref<PredictListDto | null>(null);
const detail = ref<PredictDetailDto | null>(null);
const selected = ref<number | null>(null);

const open = computed(() => list.value?.events.filter((e) => e.status === 'open') ?? []);
const ended = computed(() => list.value?.events.filter((e) => e.status !== 'open') ?? []);
/** 详情只展开在被点的那一行下面（问题记录 264）；新详情读回来之前不显示上一个的 */
const shown = (id: number) => selected.value === id && detail.value?.event.id === id;
const REASON: Record<string, (n: { level: number; days: number }) => string> = {
  predict_level: (n) => `餐厅 ${n.level} 级才能参与预测`,
  predict_age: (n) => `账号注册满 ${n.days} 天才能参与预测`,
  predict_email: () => '验证邮箱后才能参与预测',
};
const reasonText = computed(() => {
  const l = list.value;
  return l && l.reason ? (REASON[l.reason]?.(l.need) ?? l.reason) : '';
});
const STATUS = { open: '进行中', closed: '等待判定', resolved: '已判定', void: '已作废' } as const;
const resultText = (e: PredictEventDto) =>
  e.status === 'resolved' ? `结果：${e.outcome ? '是' : '否'}` : STATUS[e.status];
const profit = (e: PredictEventDto) => (e.payout === null ? null : e.payout - e.netCost);
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const leftText = (closeAt: string) => {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return '已截止';
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? `还剩 ${Math.floor(m / 60)} 小时 ${m % 60} 分` : `还剩 ${m} 分`;
};

async function loadList() {
  try {
    list.value = await endpoints.predictList();
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function loadDetail(id: number) {
  try {
    const d = await endpoints.predictDetail(id);
    if (selected.value === id) detail.value = d;
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
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
  <h5>事件预测</h5>
  <HiphopCard :place="11" />
  <div class="small text-muted mb-2">
    买"是"或"否"，结算时押对的一边每份得 1,000
    银币；价格就是大家认为发生的概率，随买卖涨跌。不必等开奖，截止前随时可以卖出止盈止损。点事件展开详情。
  </div>
  <div v-if="reasonText" class="alert alert-warning py-1 small" data-testid="pd-reason">{{ reasonText }}</div>

  <h6 class="dt-section">进行中</h6>
  <div v-if="list && open.length === 0" class="small text-muted mb-3">现在没有进行中的事件</div>
  <template v-for="e in open" :key="e.id">
    <button
      type="button"
      :class="['dt-card w-100 text-start mb-2', e.id === selected ? 'border-primary' : '']"
      :data-testid="`pd-event-${e.id}`"
      @click="pick(e.id)"
    >
      <div class="d-flex align-items-center gap-2">
        <span class="flex-fill dt-card-title"
          >{{ e.title
          }}<span v-if="e.auto" class="dt-tag ms-1 fw-normal" :data-testid="`pd-auto-${e.id}`"
            >系统出题</span
          ></span
        >
        <span class="text-success small text-nowrap">是 {{ predictPercent(e.price) }}%</span>
        <i :class="['bi', e.id === selected ? 'bi-chevron-up' : 'bi-chevron-down', 'text-muted']" />
      </div>
      <div class="small text-muted">
        {{ leftText(e.closeAt) }}
        <span v-if="e.yes > 0 || e.no > 0"> · 我持有 是 {{ e.yes }} / 否 {{ e.no }}</span>
      </div>
    </button>
    <PredictDetailCard v-if="shown(e.id) && list" :detail="detail!" :list="list" @refresh="refresh" />
  </template>

  <template v-if="ended.length > 0">
    <h6 class="dt-section">已结束</h6>
    <template v-for="e in ended" :key="e.id">
      <div
        role="button"
        :class="['small border-bottom py-1', e.id === selected ? 'fw-bold' : '']"
        :data-testid="`pd-ended-${e.id}`"
        @click="pick(e.id)"
      >
        <b>{{ e.title }}</b> · {{ resultText(e) }} · 持有 是 {{ e.yes }} / 否 {{ e.no }}
        <span v-if="profit(e) !== null" :class="profit(e)! >= 0 ? 'text-success' : 'text-danger'">
          · 盈亏 {{ signed(profit(e)!) }}</span
        >
        <div v-if="e.resultNote" class="text-muted" :data-testid="`pd-ended-note-${e.id}`">
          判定依据：{{ e.resultNote }}
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
