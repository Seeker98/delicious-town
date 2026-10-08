<script setup lang="ts">
import { computed, ref } from 'vue';
import { predictPercent, predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum, gameDateTime } from '../../utils/format';
import { predictDesc, predictNote } from '../../utils/serverText';
import { useCatalogStore } from '../../stores/catalog';

/** 事件预测的详情卡片：展开在被点的那一行下面（问题记录 264）；买卖后通知父组件刷新 */
const props = defineProps<{ detail: PredictDetailDto; list: PredictListDto }>();
const emit = defineEmits<{ refresh: [] }>();

const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const side = ref<'yes' | 'no'>('yes');
const dir = ref<'buy' | 'sell'>('buy');
const qty = ref<number | ''>(1);
const busy = ref(false);

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const action = (x: { dir: 'buy' | 'sell'; side: 'yes' | 'no' }) =>
  t.value.predict.detail.action(x.dir === 'buy', x.side === 'yes');
/** 每份均价：成交额 ÷ 份数（不含手续费） */
const perShare = (x: { amount: number; qty: number }) => formatNum(Math.round(x.amount / x.qty));
const time = (s: string) => gameDateTime(s);

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
/** 单笔、持有上限（backlog 238-1）：服务端也会拒，这里先提示，免得点了才报错 */
const limitText = computed(() => {
  const k = Number(qty.value);
  if (!Number.isInteger(k) || k < 1) return '';
  const x = t.value.predict.detail;
  if (k > props.list.maxTrade) return x.overTrade(props.list.maxTrade);
  const held = side.value === 'yes' ? props.detail.event.yes : props.detail.event.no;
  if (dir.value === 'buy' && held + k > props.list.maxHold)
    return x.overHold(props.list.maxHold, Math.max(0, props.list.maxHold - held));
  return '';
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
  <!-- 详情分成 行情、我的持仓、交易、记录 四块（问题记录 288，方案 A） -->
  <div class="dt-card mb-2" data-testid="pd-detail">
    <section data-testid="pd-sec-market">
      <h6 class="dt-section mt-0">{{ t.predict.detail.sections.market }}</h6>
      <div class="d-flex gap-3 my-1">
        <span class="text-success">{{ t.predict.yesPct(predictPercent(detail.event.price)) }}</span>
        <span class="text-danger">{{ t.predict.noPct(100 - predictPercent(detail.event.price)) }}</span>
        <span class="small text-muted ms-auto">{{
          t.predict.detail.closeAt(time(detail.event.closeAt))
        }}</span>
      </div>
      <div class="progress mb-1" style="height: 8px">
        <div
          class="progress-bar bg-success"
          :style="{ width: `${predictPercent(detail.event.price)}%` }"
        ></div>
        <div
          class="progress-bar bg-danger"
          :style="{ width: `${100 - predictPercent(detail.event.price)}%` }"
        ></div>
      </div>
      <!-- 不到两个点画出来是一大块空白（问题记录 278） -->
      <div v-if="detail.points.length < 2" class="dt-meta mb-1" data-testid="pd-chart-empty">
        {{ t.predict.detail.noChart }}
      </div>
      <svg v-else data-testid="pd-chart" viewBox="0 0 300 60" class="w-100 mb-1" style="height: 60px">
        <polyline :points="chart" fill="none" stroke="currentColor" stroke-width="1.5" class="text-success" />
      </svg>
      <div class="small text-muted">{{ t.predict.detail.unitLine(formatNum(detail.event.unit)) }}</div>
      <div v-if="predictDesc(detail.event)" class="small text-muted">{{ predictDesc(detail.event) }}</div>
      <!-- 判定依据（238-2）：比如天气题写明自动轮换出的天气、之后有没有人用雷神锤改 -->
      <div v-if="predictNote(detail.event, catalog)" class="small text-muted" data-testid="pd-note">
        {{ t.predict.note(predictNote(detail.event, catalog)!) }}
      </div>
    </section>

    <!-- 我的持仓：进行中有持仓才显示；已结束显示本局盈亏 -->
    <section
      v-if="detail.event.status !== 'open' || detail.event.yes > 0 || detail.event.no > 0"
      data-testid="pd-sec-hold"
    >
      <h6 class="dt-section">{{ t.predict.detail.sections.hold }}</h6>
      <div v-if="detail.event.status === 'open'" class="small" data-testid="pd-hold">
        {{ t.predict.detail.hold(detail.event.yes, detail.event.no, formatNum(detail.event.netCost)) }}
        <span v-if="sellAll > 0" class="text-muted">{{ t.predict.detail.sellAll(formatNum(sellAll)) }}</span>
        <div v-for="o in outcomes" :key="o.label">
          {{ t.predict.detail.outcome(o.label, formatNum(o.got)) }}
          <span :class="o.got - detail.event.netCost >= 0 ? 'text-success' : 'text-danger'">{{
            signed(o.got - detail.event.netCost)
          }}</span>
        </div>
      </div>
      <div v-else class="small" data-testid="pd-result">
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
    </section>

    <section v-if="detail.event.status === 'open'" data-testid="pd-sec-trade">
      <h6 class="dt-section">{{ t.predict.detail.sections.trade }}</h6>
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
          :disabled="
            busy || !list.eligible || !list.enabled || detail.event.own || quote === null || limitText !== ''
          "
          data-testid="pd-submit"
          @click="submit"
        >
          {{ t.predict.detail.submit }}
        </button>
      </div>
      <!-- 出题人不能交易自己出的题（backlog 238-1） -->
      <div v-if="detail.event.own" class="small text-muted mt-1" data-testid="pd-own">
        {{ t.predict.detail.own }}
      </div>
      <div v-if="limitText" class="small text-danger mt-1" data-testid="pd-limit">{{ limitText }}</div>
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
    </section>

    <!-- 记录默认收起，标题带条数，不把下面的事件推得很远 -->
    <section data-testid="pd-sec-records">
      <h6 class="dt-section">{{ t.predict.detail.sections.records }}</h6>
      <details v-if="detail.mine.trades.length > 0" class="small mb-1" data-testid="pd-mine">
        <summary>{{ t.predict.detail.mine }} ({{ detail.mine.trades.length }})</summary>
        <div class="text-muted">{{ t.predict.detail.mineHint }}</div>
        <div v-for="(x, i) in detail.mine.trades" :key="i" class="border-bottom py-1">
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
      </details>
      <details class="small" data-testid="pd-trades">
        <summary>{{ t.predict.detail.trades }} ({{ detail.trades.length }})</summary>
        <div class="text-muted">{{ t.predict.detail.tradesHint }}</div>
        <div v-if="detail.trades.length === 0" class="text-muted">{{ t.predict.detail.noTrades }}</div>
        <div v-for="(x, i) in detail.trades" :key="i" class="border-bottom py-1">
          {{ t.predict.detail.tradeLine(action(x), x.qty, perShare(x), predictPercent(x.priceAfter)) }}
          <span class="text-muted">{{ time(x.createdAt) }}</span>
        </div>
      </details>
    </section>
  </div>
</template>
