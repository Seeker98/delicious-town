<script setup lang="ts">
import { computed, ref } from 'vue';
import { predictPercent, predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { activeLocale } from '../../i18n';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 事件预测的详情卡片：展开在被点的那一行下面（问题记录 264）；买卖后通知父组件刷新 */
const props = defineProps<{ detail: PredictDetailDto; list: PredictListDto }>();
const emit = defineEmits<{ refresh: [] }>();

const toast = useToastStore();
const t = useT();
const side = ref<'yes' | 'no'>('yes');
const dir = ref<'buy' | 'sell'>('buy');
const qty = ref<number | ''>(1);
const busy = ref(false);

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const action = (x: { dir: 'buy' | 'sell'; side: 'yes' | 'no' }) =>
  t.value.predict.detail.action(x.dir === 'buy', x.side === 'yes');
/** 每份均价：成交额 ÷ 份数（不含手续费） */
const perShare = (x: { amount: number; qty: number }) => formatNum(Math.round(x.amount / x.qty));
const time = (s: string) => new Date(s).toLocaleString(activeLocale());

const quote = computed(() => {
  const d = props.detail;
  const k = Number(qty.value);
  if (!Number.isInteger(k) || k < 1) return null;
  const held = side.value === 'yes' ? d.event.yes : d.event.no;
  if (dir.value === 'sell' && k > held) return null;
  return predictQuote({ y: d.event.qYes, n: d.event.qNo, b: d.event.b }, side.value, dir.value, k, {
    unit: d.event.unit,
    feeRate: props.list.feeRate,
  });
});
/** 结果为是 / 否时这份持仓结算能得多少（问题记录 252） */
const outcomes = computed(() => [
  { label: t.value.predict.yes, got: props.detail.event.unit * props.detail.event.yes },
  { label: t.value.predict.no, got: props.detail.event.unit * props.detail.event.no },
]);
/** 按当前价把持仓全部卖出约能拿回多少（两边分别按当前状态算） */
const sellAll = computed(() => {
  const e = props.detail.event;
  const s = { y: e.qYes, n: e.qNo, b: e.b };
  const t = { unit: e.unit, feeRate: props.list.feeRate };
  return (
    (e.yes > 0 ? predictQuote(s, 'yes', 'sell', e.yes, t).total : 0) +
    (e.no > 0 ? predictQuote(s, 'no', 'sell', e.no, t).total : 0)
  );
});
const helpItems = computed(() =>
  t.value.predict.detail.helpItems(
    formatNum(props.detail.event.unit),
    formatNum(Math.round(props.detail.event.unit * 0.63)),
    Math.round(props.list.feeRate * 100),
  ),
);
const chart = computed(() => {
  const pts = props.detail.points;
  if (pts.length === 0) return '';
  const w = 300;
  const h = 60;
  const step = pts.length > 1 ? w / (pts.length - 1) : 0;
  return pts.map((p, i) => `${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`).join(' ');
});

async function submit() {
  if (quote.value === null) return;
  busy.value = true;
  try {
    // 带上预估金额：价格被别人推动后服务端拒绝，不会按意外的价格成交（终审 I2）
    const r = await endpoints.predictTrade(props.detail.event.id, {
      side: side.value,
      dir: dir.value,
      qty: Number(qty.value),
      limit: quote.value.total,
    });
    toast.push(t.value.predict.detail.traded(action(r), r.qty, r.dir === 'buy', formatNum(r.total)));
    emit('refresh');
  } catch (e) {
    toast.push(errorMessage(e, t.value.predict.detail.failed), 'danger');
    if (e instanceof ApiError && e.params.reason === 'predict_price_moved') emit('refresh');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-card mb-2" data-testid="pd-detail">
    <div v-if="detail.event.description" class="small text-muted">{{ detail.event.description }}</div>
    <!-- 判定依据（238-2）：比如天气题写明自动轮换出的天气、之后有没有人用雷神锤改 -->
    <div v-if="detail.event.resultNote" class="small text-muted" data-testid="pd-note">
      {{ t.predict.note(detail.event.resultNote) }}
    </div>
    <div class="d-flex gap-3 my-1">
      <span class="text-success">{{ t.predict.yesPct(predictPercent(detail.event.price)) }}</span>
      <span class="text-danger">{{ t.predict.noPct(100 - predictPercent(detail.event.price)) }}</span>
      <span class="small text-muted ms-auto">{{ t.predict.detail.closeAt(time(detail.event.closeAt)) }}</span>
    </div>
    <!-- 不到两个点画出来是一大块空白（问题记录 278） -->
    <div v-if="detail.points.length < 2" class="dt-meta mb-2" data-testid="pd-chart-empty">
      {{ t.predict.detail.noChart }}
    </div>
    <svg v-else data-testid="pd-chart" viewBox="0 0 300 60" class="w-100 mb-2" style="height: 60px">
      <polyline :points="chart" fill="none" stroke="currentColor" stroke-width="1.5" class="text-success" />
    </svg>
    <div class="small mb-2" data-testid="pd-hold">
      {{ t.predict.detail.hold(detail.event.yes, detail.event.no, formatNum(detail.event.netCost)) }}
      <span v-if="sellAll > 0" class="text-muted">{{ t.predict.detail.sellAll(formatNum(sellAll)) }}</span>
      <div v-if="detail.event.yes > 0 || detail.event.no > 0">
        <div v-for="o in outcomes" :key="o.label">
          {{ t.predict.detail.outcome(o.label, formatNum(o.got)) }}
          <span :class="o.got - detail.event.netCost >= 0 ? 'text-success' : 'text-danger'">{{
            signed(o.got - detail.event.netCost)
          }}</span>
        </div>
      </div>
    </div>
    <details class="small mb-2" data-testid="pd-help">
      <summary>{{ t.predict.detail.help }}</summary>
      <ul class="mb-0 ps-3">
        <li v-for="(x, i) in helpItems" :key="i">{{ x }}</li>
      </ul>
    </details>
    <template v-if="detail.event.status === 'open'">
      <div class="d-flex flex-wrap gap-2 align-items-center small">
        <div class="btn-group btn-group-sm">
          <button
            type="button"
            :class="['btn', side === 'yes' ? 'btn-success' : 'btn-outline-success']"
            data-testid="pd-side-yes"
            @click="side = 'yes'"
          >
            {{ t.predict.yes }}
          </button>
          <button
            type="button"
            :class="['btn', side === 'no' ? 'btn-danger' : 'btn-outline-danger']"
            data-testid="pd-side-no"
            @click="side = 'no'"
          >
            {{ t.predict.no }}
          </button>
        </div>
        <div class="btn-group btn-group-sm">
          <button
            type="button"
            :class="['btn', dir === 'buy' ? 'btn-primary' : 'btn-outline-primary']"
            data-testid="pd-dir-buy"
            @click="dir = 'buy'"
          >
            {{ t.predict.detail.buy }}
          </button>
          <button
            type="button"
            :class="['btn', dir === 'sell' ? 'btn-primary' : 'btn-outline-primary']"
            data-testid="pd-dir-sell"
            @click="dir = 'sell'"
          >
            {{ t.predict.detail.sell }}
          </button>
        </div>
        <input
          v-model.number="qty"
          type="number"
          min="1"
          :max="list.maxTrade"
          class="form-control form-control-sm"
          style="width: 6rem"
          data-testid="pd-qty"
        />
        {{ t.predict.detail.shares }}
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy || !list.eligible || quote === null"
          data-testid="pd-submit"
          @click="submit"
        >
          {{ t.predict.detail.submit }}
        </button>
      </div>
      <div class="small text-muted mt-1" data-testid="pd-quote">
        <template v-if="quote">
          {{
            t.predict.detail.estimate(
              dir === 'buy',
              formatNum(quote.total),
              formatNum(quote.fee),
              predictPercent(quote.priceAfter),
            )
          }}
        </template>
        <template v-else>{{ t.predict.detail.enterQty }}</template>
      </div>
    </template>
    <div v-else class="dt-card small mb-2" data-testid="pd-result">
      <b>{{ t.predict.detail.summary }}</b>
      <div>
        {{
          t.predict.detail.summaryLine(
            formatNum(detail.mine.bought),
            formatNum(detail.mine.sold),
            formatNum(detail.mine.fees),
            formatNum(detail.event.netCost),
          )
        }}
      </div>
      <div v-if="detail.event.status === 'resolved'">
        {{
          t.predict.detail.resolved(
            detail.event.outcome ? t.predict.yes : t.predict.no,
            detail.event.outcome ? detail.event.yes : detail.event.no,
            formatNum(detail.event.unit),
            formatNum(detail.event.payout ?? 0),
          )
        }}
      </div>
      <div v-else-if="detail.event.status === 'void'">
        {{
          t.predict.detail.voided(
            Math.round((detail.mine.voidRatio ?? 1) * 100),
            formatNum(detail.event.payout ?? 0),
          )
        }}
      </div>
      <div v-else class="text-muted">{{ t.predict.detail.waiting }}</div>
      <div v-if="detail.event.payout !== null">
        {{ t.predict.detail.summary }}
        <b :class="detail.event.payout - detail.event.netCost >= 0 ? 'text-success' : 'text-danger'">{{
          signed(detail.event.payout - detail.event.netCost)
        }}</b>
        {{ t.predict.detail.summaryHint }}
      </div>
    </div>
    <template v-if="detail.mine.trades.length > 0">
      <h6 class="dt-section mt-2">{{ t.predict.detail.mine }}</h6>
      <div class="small text-muted">{{ t.predict.detail.mineHint }}</div>
      <div data-testid="pd-mine">
        <div v-for="(x, i) in detail.mine.trades" :key="i" class="small border-bottom py-1">
          {{
            t.predict.detail.mineLine(
              action(x),
              x.qty,
              perShare(x),
              x.dir === 'buy',
              formatNum(x.dir === 'buy' ? x.amount + x.fee : x.amount - x.fee),
            )
          }}
          <span class="text-muted">{{ time(x.createdAt) }}</span>
        </div>
      </div>
    </template>
    <div data-testid="pd-trades">
      <h6 class="dt-section mt-2">{{ t.predict.detail.trades }}</h6>
      <div class="small text-muted">{{ t.predict.detail.tradesHint }}</div>
      <div v-if="detail.trades.length === 0" class="small text-muted">{{ t.predict.detail.noTrades }}</div>
      <div v-for="(x, i) in detail.trades" :key="i" class="small border-bottom py-1">
        {{ t.predict.detail.tradeLine(action(x), x.qty, perShare(x), predictPercent(x.priceAfter)) }}
        <span class="text-muted">{{ time(x.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>
