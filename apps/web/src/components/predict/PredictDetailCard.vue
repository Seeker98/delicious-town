<script setup lang="ts">
import { computed, ref } from 'vue';
import { predictPercent, predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 事件预测的详情卡片：展开在被点的那一行下面（问题记录 264）；买卖后通知父组件刷新 */
const props = defineProps<{ detail: PredictDetailDto; list: PredictListDto }>();
const emit = defineEmits<{ refresh: [] }>();

const toast = useToastStore();
const side = ref<'yes' | 'no'>('yes');
const dir = ref<'buy' | 'sell'>('buy');
const qty = ref<number | ''>(1);
const busy = ref(false);

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const action = (x: { dir: 'buy' | 'sell'; side: 'yes' | 'no' }) =>
  `${x.dir === 'buy' ? '买入' : '卖出'}${x.side === 'yes' ? '是' : '否'}`;
/** 每份均价：成交额 ÷ 份数（不含手续费） */
const perShare = (x: { amount: number; qty: number }) => formatNum(Math.round(x.amount / x.qty));
const time = (s: string) => new Date(s).toLocaleString('zh-CN');

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
  { label: '是', got: props.detail.event.unit * props.detail.event.yes },
  { label: '否', got: props.detail.event.unit * props.detail.event.no },
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
    toast.push(`${action(r)} ${r.qty} 份，${r.dir === 'buy' ? '花费' : '得到'} ${formatNum(r.total)} 银币`);
    emit('refresh');
  } catch (e) {
    toast.push(errorMessage(e, '交易失败'), 'danger');
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
      判定依据：{{ detail.event.resultNote }}
    </div>
    <div class="d-flex gap-3 my-1">
      <span class="text-success">是 {{ predictPercent(detail.event.price) }}%</span>
      <span class="text-danger">否 {{ 100 - predictPercent(detail.event.price) }}%</span>
      <span class="small text-muted ms-auto">截止 {{ time(detail.event.closeAt) }}</span>
    </div>
    <!-- 不到两个点画出来是一大块空白（问题记录 278） -->
    <div v-if="detail.points.length < 2" class="dt-meta mb-2" data-testid="pd-chart-empty">
      还没有成交，有人买卖后显示价格走势
    </div>
    <svg v-else data-testid="pd-chart" viewBox="0 0 300 60" class="w-100 mb-2" style="height: 60px">
      <polyline :points="chart" fill="none" stroke="currentColor" stroke-width="1.5" class="text-success" />
    </svg>
    <div class="small mb-2" data-testid="pd-hold">
      我持有：是 {{ detail.event.yes }} 份、否 {{ detail.event.no }} 份，净投入
      {{ formatNum(detail.event.netCost) }} 银币
      <span v-if="sellAll > 0" class="text-muted">（按当前价全部卖出约 {{ formatNum(sellAll) }} 银币）</span>
      <div v-if="detail.event.yes > 0 || detail.event.no > 0">
        <div v-for="o in outcomes" :key="o.label">
          结果为{{ o.label }}：得 {{ formatNum(o.got) }} 银币，盈亏
          <span :class="o.got - detail.event.netCost >= 0 ? 'text-success' : 'text-danger'">{{
            signed(o.got - detail.event.netCost)
          }}</span>
        </div>
      </div>
    </div>
    <details class="small mb-2" data-testid="pd-help">
      <summary>怎么算盈亏</summary>
      <ul class="mb-0 ps-3">
        <li>
          结算时押对的一边每份得 {{ formatNum(detail.event.unit) }} 银币，押错的一边作废。比如"是"的价格是
          63%，买 1 份约花 {{ formatNum(Math.round(detail.event.unit * 0.63)) }} 银币；结果为"是"就拿回
          {{ formatNum(detail.event.unit) }}，为"否"就亏掉买入的钱。
        </li>
        <li>
          价格就是大家认为发生的概率：买"是"的人越多，"是"越贵、"否"越便宜；一次买得越多，后面每份越贵。
        </li>
        <li>
          不必等开奖：截止前随时可以按当前价卖出。觉得押错了就卖掉止损，价格涨到满意就卖掉止盈，赚到或亏掉的是卖出所得和买入花费的差。
        </li>
        <li>买入和卖出都收手续费 {{ Math.round(list.feeRate * 100) }}%（按成交额算，向上取整）。</li>
        <li>净投入 = 买入花的（含手续费）− 卖出拿回的；盈亏 = 结算所得 − 净投入。</li>
        <li>事件被作废时退回净投入；如果有人提前卖出赚了钱、系统收到的钱不够退，就按比例退。</li>
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
          :max="list.maxTrade"
          class="form-control form-control-sm"
          style="width: 6rem"
          data-testid="pd-qty"
        />
        份
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy || !list.eligible || quote === null"
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
    </template>
    <div v-else class="dt-card small mb-2" data-testid="pd-result">
      <b>本局盈亏</b>
      <div>
        买入共花 {{ formatNum(detail.mine.bought) }}，卖出共得 {{ formatNum(detail.mine.sold) }}（手续费合计
        {{ formatNum(detail.mine.fees) }}），净投入 {{ formatNum(detail.event.netCost) }}
      </div>
      <div v-if="detail.event.status === 'resolved'">
        结果为{{ detail.event.outcome ? '是' : '否' }}：{{ detail.event.outcome ? '是' : '否' }}
        {{ detail.event.outcome ? detail.event.yes : detail.event.no }} 份 ×
        {{ formatNum(detail.event.unit) }} =
        {{ formatNum(detail.event.payout ?? 0) }}
      </div>
      <div v-else-if="detail.event.status === 'void'">
        已作废：退回净投入的 {{ Math.round((detail.mine.voidRatio ?? 1) * 100) }}%，共
        {{ formatNum(detail.event.payout ?? 0) }}
      </div>
      <div v-else class="text-muted">已截止，等待判定</div>
      <div v-if="detail.event.payout !== null">
        本局盈亏
        <b :class="detail.event.payout - detail.event.netCost >= 0 ? 'text-success' : 'text-danger'">{{
          signed(detail.event.payout - detail.event.netCost)
        }}</b>
        （结算所得 − 净投入）
      </div>
    </div>
    <template v-if="detail.mine.trades.length > 0">
      <h6 class="dt-section mt-2">我的买卖记录</h6>
      <div class="small text-muted">我在这个事件里的每一笔买卖，花费和得到都含手续费</div>
      <div data-testid="pd-mine">
        <div v-for="(x, i) in detail.mine.trades" :key="i" class="small border-bottom py-1">
          {{ action(x) }} {{ x.qty }} 份，每份约 {{ perShare(x) }}，{{ x.dir === 'buy' ? '花费' : '得到' }}
          {{ formatNum(x.dir === 'buy' ? x.amount + x.fee : x.amount - x.fee) }}
          <span class="text-muted">{{ time(x.createdAt) }}</span>
        </div>
      </div>
    </template>
    <div data-testid="pd-trades">
      <h6 class="dt-section mt-2">全服最近成交</h6>
      <div class="small text-muted">
        所有人最近 20 笔买卖（不显示是谁），能看出价格是被哪些买卖推上去或拉下来的
      </div>
      <div v-if="detail.trades.length === 0" class="small text-muted">还没有成交</div>
      <div v-for="(x, i) in detail.trades" :key="i" class="small border-bottom py-1">
        {{ action(x) }} {{ x.qty }} 份，每份约 {{ perShare(x) }}，成交后"是"
        {{ predictPercent(x.priceAfter) }}%
        <span class="text-muted">{{ time(x.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>
