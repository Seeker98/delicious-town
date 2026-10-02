<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  predictPercent,
  predictQuote,
  type PredictDetailDto,
  type PredictEventDto,
  type PredictListDto,
} from '@dt/shared';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/** 事件预测（238-1 设计 §7.2）：用银币买卖"是/否"份额，系统按公式报价 */
const toast = useToastStore();
const list = ref<PredictListDto | null>(null);
const detail = ref<PredictDetailDto | null>(null);
const selected = ref<number | null>(null);
const side = ref<'yes' | 'no'>('yes');
const dir = ref<'buy' | 'sell'>('buy');
const qty = ref<number | ''>(1);
const busy = ref(false);

const open = computed(() => list.value?.events.filter((e) => e.status === 'open') ?? []);
const ended = computed(() => list.value?.events.filter((e) => e.status !== 'open') ?? []);
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

const quote = computed(() => {
  const d = detail.value;
  const l = list.value;
  const k = Number(qty.value);
  if (!d || !l || !Number.isInteger(k) || k < 1) return null;
  const held = side.value === 'yes' ? d.event.yes : d.event.no;
  if (dir.value === 'sell' && k > held) return null;
  return predictQuote({ y: d.event.qYes, n: d.event.qNo, b: d.event.b }, side.value, dir.value, k, {
    unit: d.event.unit,
    feeRate: l.feeRate,
  });
});
/** 按当前价把持仓全部卖出约能拿回多少（两边分别按当前状态算） */
const sellAll = computed(() => {
  const d = detail.value;
  const l = list.value;
  if (!d || !l) return 0;
  const s = { y: d.event.qYes, n: d.event.qNo, b: d.event.b };
  const t = { unit: d.event.unit, feeRate: l.feeRate };
  return (
    (d.event.yes > 0 ? predictQuote(s, 'yes', 'sell', d.event.yes, t).total : 0) +
    (d.event.no > 0 ? predictQuote(s, 'no', 'sell', d.event.no, t).total : 0)
  );
});
const chart = computed(() => {
  const pts = detail.value?.points ?? [];
  if (pts.length === 0) return '';
  const w = 300;
  const h = 60;
  const step = pts.length > 1 ? w / (pts.length - 1) : 0;
  return pts.map((p, i) => `${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`).join(' ');
});

async function loadList() {
  try {
    list.value = await endpoints.predictList();
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function pick(id: number) {
  selected.value = id;
  try {
    const d = await endpoints.predictDetail(id);
    if (selected.value === id) detail.value = d;
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function submit() {
  if (selected.value === null || quote.value === null) return;
  busy.value = true;
  try {
    // 带上预估金额：价格被别人推动后服务端拒绝，不会按意外的价格成交（终审 I2）
    const r = await endpoints.predictTrade(selected.value, {
      side: side.value,
      dir: dir.value,
      qty: Number(qty.value),
      limit: quote.value.total,
    });
    toast.push(
      `${r.dir === 'buy' ? '买入' : '卖出'}${r.side === 'yes' ? '是' : '否'} ${r.qty} 份，${r.dir === 'buy' ? '花费' : '得到'} ${formatNum(r.total)} 银币`,
    );
    await loadList();
    await pick(selected.value);
  } catch (e) {
    toast.push(errorMessage(e, '交易失败'), 'danger');
    if (e instanceof ApiError && e.params.reason === 'predict_price_moved') await pick(selected.value);
  } finally {
    busy.value = false;
  }
}
onMounted(() => void loadList());
</script>

<template>
  <h5>事件预测</h5>
  <div class="small text-muted mb-2">
    买"是"或"否"，结算时押对的一边每份得 1,000
    银币；价格就是大家认为发生的概率，随买卖涨跌，截止前随时可以卖出。
  </div>
  <div v-if="reasonText" class="alert alert-warning py-1 small" data-testid="pd-reason">{{ reasonText }}</div>

  <h6 class="dt-section">进行中</h6>
  <div v-if="list && open.length === 0" class="small text-muted mb-3">现在没有进行中的事件</div>
  <button
    v-for="e in open"
    :key="e.id"
    type="button"
    :class="['dt-card w-100 text-start mb-2', e.id === selected ? 'border-primary' : '']"
    :data-testid="`pd-event-${e.id}`"
    @click="pick(e.id)"
  >
    <div class="d-flex align-items-center gap-2">
      <b class="flex-fill">{{ e.title }}</b>
      <span class="text-success">是 {{ predictPercent(e.price) }}%</span>
    </div>
    <div class="small text-muted">
      {{ leftText(e.closeAt) }}
      <span v-if="e.yes > 0 || e.no > 0"> · 我持有 是 {{ e.yes }} / 否 {{ e.no }}</span>
    </div>
  </button>

  <div v-if="detail && selected !== null" class="dt-card mb-3" data-testid="pd-detail">
    <b>{{ detail.event.title }}</b>
    <div v-if="detail.event.description" class="small text-muted">{{ detail.event.description }}</div>
    <div class="d-flex gap-3 my-1">
      <span class="text-success">是 {{ predictPercent(detail.event.price) }}%</span>
      <span class="text-danger">否 {{ 100 - predictPercent(detail.event.price) }}%</span>
      <span class="small text-muted ms-auto"
        >截止 {{ new Date(detail.event.closeAt).toLocaleString('zh-CN') }}</span
      >
    </div>
    <svg data-testid="pd-chart" viewBox="0 0 300 60" class="w-100 mb-2" style="height: 60px">
      <polyline :points="chart" fill="none" stroke="currentColor" stroke-width="1.5" class="text-success" />
    </svg>
    <div class="small mb-2" data-testid="pd-hold">
      我持有：是 {{ detail.event.yes }} 份、否 {{ detail.event.no }} 份
      <span v-if="sellAll > 0" class="text-muted">（按当前价全部卖出约 {{ formatNum(sellAll) }} 银币）</span>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center small">
      <div class="btn-group btn-group-sm">
        <button
          type="button"
          :class="['btn', side === 'yes' ? 'btn-success' : 'btn-outline-success']"
          data-testid="pd-side-yes"
          @click="side = 'yes'"
        >
          是
        </button>
        <button
          type="button"
          :class="['btn', side === 'no' ? 'btn-danger' : 'btn-outline-danger']"
          data-testid="pd-side-no"
          @click="side = 'no'"
        >
          否
        </button>
      </div>
      <div class="btn-group btn-group-sm">
        <button
          type="button"
          :class="['btn', dir === 'buy' ? 'btn-primary' : 'btn-outline-primary']"
          data-testid="pd-dir-buy"
          @click="dir = 'buy'"
        >
          买入
        </button>
        <button
          type="button"
          :class="['btn', dir === 'sell' ? 'btn-primary' : 'btn-outline-primary']"
          data-testid="pd-dir-sell"
          @click="dir = 'sell'"
        >
          卖出
        </button>
      </div>
      <input
        v-model.number="qty"
        type="number"
        min="1"
        :max="list?.maxTrade"
        class="form-control form-control-sm"
        style="width: 6rem"
        data-testid="pd-qty"
      />
      份
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="busy || !list?.eligible || quote === null"
        data-testid="pd-submit"
        @click="submit"
      >
        确定
      </button>
    </div>
    <div class="small text-muted mt-1" data-testid="pd-quote">
      <template v-if="quote">
        {{ dir === 'buy' ? '预计花费' : '预计得到' }} {{ formatNum(quote.total) }} 银币（含手续费
        {{ formatNum(quote.fee) }}），成交后"是" {{ predictPercent(quote.priceAfter) }}%
      </template>
      <template v-else>输入份数（卖出不能超过持有）</template>
    </div>
    <h6 class="dt-section mt-2">最近成交</h6>
    <div v-if="detail.trades.length === 0" class="small text-muted">还没有成交</div>
    <div v-for="(x, i) in detail.trades" :key="i" class="small border-bottom py-1">
      {{ x.dir === 'buy' ? '买入' : '卖出' }}{{ x.side === 'yes' ? '是' : '否' }} {{ x.qty }} 份，成交额
      {{ formatNum(x.amount) }}
    </div>
  </div>

  <template v-if="ended.length > 0">
    <h6 class="dt-section">已结束</h6>
    <div v-for="e in ended" :key="e.id" class="small border-bottom py-1" :data-testid="`pd-ended-${e.id}`">
      <b>{{ e.title }}</b> · {{ resultText(e) }} · 持有 是 {{ e.yes }} / 否 {{ e.no }}
      <span v-if="profit(e) !== null" :class="profit(e)! >= 0 ? 'text-success' : 'text-danger'">
        · 盈亏 {{ signed(profit(e)!) }}</span
      >
    </div>
  </template>
</template>
