<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { predictPercent, predictQuote, type PredictDetailDto, type PredictListDto } from '@dt/shared';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtStepper from '../components/DtStepper.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum, gameDateTime } from '../utils/format';
import { predictDesc, predictNote, predictTitle } from '../utils/serverText';
import { predictLeft, predictReason } from '../utils/predict';

/**
 * 事件预测详情（界面改版 P8，设计图“事件预测 · 详情页”）：单独一页，能返回、能分享链接。
 * 行情（大号概率、走势）、我的持仓（结果为是 / 否各盈亏多少）、买是 / 买否 / 卖出（底部面板）、两段记录
 */
const route = useRoute();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const id = computed(() => Number(route.params.id));
const list = ref<PredictListDto | null>(null);
const detail = ref<PredictDetailDto | null>(null);
const failed = ref(false);
const busy = ref(false);

async function load() {
  const want = id.value;
  failed.value = false;
  try {
    const [l, d] = await Promise.all([endpoints.predictList(), endpoints.predictDetail(want)]);
    if (want !== id.value) return;
    list.value = l;
    detail.value = d;
  } catch (e) {
    // 换了编号以后旧请求的失败不算（P8 终审）
    if (want !== id.value) return;
    failed.value = true;
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
onMounted(load);
watch(id, () => {
  detail.value = null;
  void load();
});

const ev = computed(() => detail.value?.event ?? null);
const yesPct = computed(() => (ev.value ? predictPercent(ev.value.price) : 0));
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;
const time = (s: string) => gameDateTime(s);
const action = (x: { dir: 'buy' | 'sell'; side: 'yes' | 'no' }) =>
  t.value.predict.detail.action(x.dir === 'buy', x.side === 'yes');
/** 每份均价：成交额 ÷ 份数（不含手续费） */
const perShare = (x: { amount: number; qty: number }) => formatNum(Math.round(x.amount / x.qty));
/** 结果为是 / 否时这份持仓结算能得多少（问题记录 252） */
const outcomes = computed(() =>
  ev.value
    ? [
        { key: 'yes', label: t.value.predict.yes, got: ev.value.unit * ev.value.yes },
        { key: 'no', label: t.value.predict.no, got: ev.value.unit * ev.value.no },
      ]
    : [],
);
/** 按当前价把持仓全部卖出约能拿回多少（两边分别按当前状态算） */
const sellAll = computed(() => {
  const e = ev.value;
  if (!e || !list.value) return 0;
  const s = { y: e.qYes, n: e.qNo, b: e.b };
  const o = { unit: e.unit, feeRate: list.value.feeRate };
  return (
    (e.yes > 0 ? predictQuote(s, 'yes', 'sell', e.yes, o).total : 0) +
    (e.no > 0 ? predictQuote(s, 'no', 'sell', e.no, o).total : 0)
  );
});
/** 走势：按 0~100% 画在 340 × 120 里 */
const W = 340;
const H = 120;
const chart = computed(() => {
  const pts = detail.value?.points ?? [];
  if (pts.length < 2) return '';
  const step = W / (pts.length - 1);
  return pts.map((p, i) => `${(i * step).toFixed(1)},${(H - 10 - p * (H - 20)).toFixed(1)}`).join(' ');
});
const chartEnd = computed(() => {
  const pts = detail.value?.points ?? [];
  const p = pts[pts.length - 1] ?? 0;
  return { x: W, y: H - 10 - p * (H - 20) };
});

/** 买卖面板 */
const trading = ref(false);
const side = ref<'yes' | 'no'>('yes');
const dir = ref<'buy' | 'sell'>('buy');
const qty = ref(1);
function openTrade(d: 'buy' | 'sell', s: 'yes' | 'no') {
  dir.value = d;
  side.value = s;
  qty.value = 1;
  trading.value = true;
}
const held = computed(() => (ev.value ? (side.value === 'yes' ? ev.value.yes : ev.value.no) : 0));
/** 卖出不能超过持有；买入一次最多 maxTrade */
const qtyMax = computed(() => Math.max(1, dir.value === 'sell' ? held.value : (list.value?.maxTrade ?? 1)));
const quote = computed(() => {
  const e = ev.value;
  const k = qty.value;
  if (!e || !list.value || !Number.isInteger(k) || k < 1) return null;
  if (dir.value === 'sell' && k > held.value) return null;
  return predictQuote({ y: e.qYes, n: e.qNo, b: e.b }, side.value, dir.value, k, {
    unit: e.unit,
    feeRate: list.value.feeRate,
  });
});
/** 单笔、持有上限（backlog 238-1）：服务端也会拒，这里先提示，免得点了才报错 */
const limitText = computed(() => {
  const l = list.value;
  const k = qty.value;
  if (!l || !Number.isInteger(k) || k < 1) return '';
  const x = t.value.predict.detail;
  // 卖出时这一边一份都没有：写“没有持有”，不是“请输入份数”（backlog P8）
  if (dir.value === 'sell' && held.value === 0) return x.noHold;
  if (k > l.maxTrade) return x.overTrade(l.maxTrade);
  if (dir.value === 'buy' && held.value + k > l.maxHold)
    return x.overHold(l.maxHold, Math.max(0, l.maxHold - held.value));
  return '';
});
const canTrade = computed(
  () =>
    !!list.value?.eligible &&
    !!list.value.enabled &&
    !!ev.value &&
    !ev.value.own &&
    ev.value.status === 'open',
);

async function submit() {
  const e = ev.value;
  if (!e || quote.value === null) return;
  busy.value = true;
  try {
    // 带上预估金额：价格被别人推动后服务端拒绝，不会按意外的价格成交（终审 I2）
    const r = await endpoints.predictTrade(e.id, {
      side: side.value,
      dir: dir.value,
      qty: qty.value,
      limit: quote.value.total,
    });
    toast.push(t.value.predict.detail.traded(action(r), r.qty, r.dir === 'buy', formatNum(r.total)));
    trading.value = false;
    await load();
  } catch (err) {
    toast.push(errorMessage(err, t.value.predict.detail.failed), 'danger');
    if (err instanceof ApiError && err.params.reason === 'predict_price_moved') await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtEmpty v-if="!detail && failed" :title="t.common.loadFailed" />
  <DtSkeleton v-else-if="!detail || !ev || !list" :rows="6" />
  <template v-else>
    <h1 class="dt-pd-title" data-testid="pd-title">
      {{ predictTitle(ev, catalog) }}<span v-if="ev.auto" class="dt-tag-primary">{{ t.predict.auto }}</span>
    </h1>
    <div class="dt-pd-meta">
      {{ t.predict.detail.closeAt(time(ev.closeAt)) }}
      <template v-if="ev.status === 'open'"> · {{ predictLeft(ev.closeAt) }}</template>
      · {{ t.predict.detail.unitLine(formatNum(ev.unit)) }}
    </div>
    <div v-if="predictDesc(ev)" class="dt-pd-meta">{{ predictDesc(ev) }}</div>
    <!-- 判定依据（238-2）：比如天气题写明自动轮换出的天气、之后有没有人用雷神锤改 -->
    <div v-if="predictNote(ev, catalog)" class="dt-pd-meta" data-testid="pd-note">
      {{ t.predict.note(predictNote(ev, catalog)!) }}
    </div>
    <div v-if="!list.enabled" class="dt-act-note mt-2" data-testid="pd-off">{{ t.predict.off }}</div>
    <!-- 不能参与的原因：从分享链接直接进来也看得到为什么买不了（P8 终审） -->
    <div v-if="predictReason(list)" class="dt-act-note is-warn mt-2" data-testid="pd-reason">
      {{ predictReason(list) }}
    </div>

    <section class="dt-card dt-pd-market" data-testid="pd-sec-market">
      <div class="dt-pd-pct">
        <b>{{ t.predict.yesPct(yesPct) }}</b>
        <span>{{ t.predict.noPct(100 - yesPct) }}</span>
      </div>
      <span class="dt-pd-split" aria-hidden="true"><i :style="{ width: `${yesPct}%` }"></i></span>
      <!-- 不到两个点画出来是一大块空白（问题记录 278） -->
      <div v-if="!chart" class="dt-meta mt-3" data-testid="pd-chart-empty">
        {{ t.predict.detail.noChart }}
      </div>
      <svg
        v-else
        class="dt-pd-chart"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="t.predict.detail.chartLabel"
        data-testid="pd-chart"
      >
        <path :d="`M0 10H${W}M0 ${H / 2}H${W}M0 ${H - 10}H${W}`" class="dt-pd-grid" />
        <polyline :points="chart" class="dt-pd-line" />
        <circle :cx="chartEnd.x - 4" :cy="chartEnd.y" r="3.5" class="dt-pd-dot" />
      </svg>
    </section>

    <!-- 我的持仓：进行中有持仓才显示；已结束显示本局盈亏 -->
    <section
      v-if="ev.status !== 'open' || ev.yes > 0 || ev.no > 0"
      class="dt-block"
      data-testid="pd-sec-hold"
    >
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.predict.detail.sections.hold }}</h2>
      </div>
      <div class="dt-card dt-pd-hold">
        <template v-if="ev.status === 'open'">
          <div class="dt-pd-hold-main" data-testid="pd-hold">
            {{ t.predict.detail.holdShort(ev.yes, ev.no) }}
          </div>
          <dl class="dt-sum">
            <div>
              <dt>{{ t.predict.detail.netCost }}</dt>
              <dd>{{ formatNum(ev.netCost) }}</dd>
            </div>
            <div v-if="sellAll > 0">
              <dt>{{ t.predict.detail.sellAllLabel }}</dt>
              <dd>{{ formatNum(sellAll) }}</dd>
            </div>
            <div v-for="o in outcomes" :key="o.key">
              <dt>{{ t.predict.detail.ifResult(o.label) }}</dt>
              <dd>
                {{ t.predict.detail.gotShort(formatNum(o.got)) }} ·
                <b :class="o.got - ev.netCost >= 0 ? 'text-success' : 'text-danger'">{{
                  signed(o.got - ev.netCost)
                }}</b>
              </dd>
            </div>
          </dl>
        </template>
        <div v-else data-testid="pd-result">
          <div>
            {{
              t.predict.detail.summaryLine(
                formatNum(detail.mine.bought),
                formatNum(detail.mine.sold),
                formatNum(detail.mine.fees),
                formatNum(ev.netCost),
              )
            }}
          </div>
          <div v-if="ev.status === 'resolved'">
            {{
              t.predict.detail.resolved(
                ev.outcome ? t.predict.yes : t.predict.no,
                ev.outcome ? ev.yes : ev.no,
                formatNum(ev.unit),
                formatNum(ev.payout ?? 0),
              )
            }}
          </div>
          <div v-else-if="ev.status === 'void'">
            {{
              t.predict.detail.voided(
                Math.round((detail.mine.voidRatio ?? 1) * 100),
                formatNum(ev.payout ?? 0),
              )
            }}
          </div>
          <div v-else class="text-muted">{{ t.predict.detail.waiting }}</div>
          <div v-if="ev.payout !== null" class="mt-1">
            {{ t.predict.detail.summary }}
            <b :class="ev.payout - ev.netCost >= 0 ? 'text-success' : 'text-danger'">{{
              signed(ev.payout - ev.netCost)
            }}</b>
            <span class="dt-meta">{{ t.predict.detail.summaryHint }}</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="ev.status === 'open'" class="dt-pd-actions" data-testid="pd-sec-trade">
      <div class="dt-pd-buy">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canTrade"
          data-testid="pd-buy-yes"
          @click="openTrade('buy', 'yes')"
        >
          {{ t.predict.detail.action(true, true) }}
        </button>
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="!canTrade"
          data-testid="pd-buy-no"
          @click="openTrade('buy', 'no')"
        >
          {{ t.predict.detail.action(true, false) }}
        </button>
      </div>
      <button
        v-if="ev.yes > 0 || ev.no > 0"
        type="button"
        class="btn btn-light dt-btn-block"
        :disabled="!canTrade"
        data-testid="pd-sell"
        @click="openTrade('sell', ev.yes > 0 ? 'yes' : 'no')"
      >
        {{ t.predict.detail.sell }}
      </button>
      <!-- 出题人不能交易自己出的题（backlog 238-1） -->
      <div v-if="ev.own" class="dt-detail-note" data-testid="pd-own">{{ t.predict.detail.own }}</div>
    </section>

    <section class="dt-block" data-testid="pd-sec-records">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.predict.detail.mine }}</h2>
        <span class="dt-block-more">{{ t.predict.detail.mineHintShort }}</span>
      </div>
      <DtEmpty v-if="detail.mine.trades.length === 0" :title="t.predict.detail.noMine" />
      <div v-else class="dt-card dt-rows-card" data-testid="pd-mine">
        <div v-for="(x, i) in detail.mine.trades" :key="i" class="dt-row dt-row-wrap">
          <span class="dt-row-main">
            <span class="dt-row-title">{{
              t.predict.detail.mineLine(
                action(x),
                x.qty,
                perShare(x),
                x.dir === 'buy',
                formatNum(x.dir === 'buy' ? x.amount + x.fee : x.amount - x.fee),
              )
            }}</span>
            <span class="dt-row-sub">{{ time(x.createdAt) }}</span>
          </span>
        </div>
      </div>
    </section>
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.predict.detail.trades }}</h2>
        <span class="dt-block-more">{{ t.predict.detail.tradesHintShort }}</span>
      </div>
      <DtEmpty v-if="detail.trades.length === 0" :title="t.predict.detail.noTrades" />
      <div v-else class="dt-card dt-rows-card" data-testid="pd-trades">
        <div v-for="(x, i) in detail.trades" :key="i" class="dt-row dt-row-wrap">
          <span class="dt-row-main">
            <span class="dt-row-title">{{
              t.predict.detail.tradeLine(action(x), x.qty, perShare(x), predictPercent(x.priceAfter))
            }}</span>
            <span class="dt-row-sub">{{ time(x.createdAt) }}</span>
          </span>
        </div>
      </div>
    </section>

    <DtSheet :open="trading" :title="predictTitle(ev, catalog)" @close="trading = false">
      <div data-testid="pd-trade-sheet">
        <div class="dt-detail-sub">
          {{ t.predict.yesPct(yesPct) }} · {{ t.predict.detail.unitLine(formatNum(ev.unit)) }}
        </div>
        <div class="dt-pd-segs">
          <div class="dt-seg" role="group" :aria-label="t.predict.detail.dirLabel">
            <button type="button" :aria-pressed="dir === 'buy'" data-testid="pd-dir-buy" @click="dir = 'buy'">
              {{ t.predict.detail.buy }}
            </button>
            <button
              type="button"
              :aria-pressed="dir === 'sell'"
              :disabled="ev.yes === 0 && ev.no === 0"
              data-testid="pd-dir-sell"
              @click="dir = 'sell'"
            >
              {{ t.predict.detail.sell }}
            </button>
          </div>
          <div class="dt-seg" role="group" :aria-label="t.predict.detail.sideLabel">
            <button
              type="button"
              :aria-pressed="side === 'yes'"
              data-testid="pd-side-yes"
              @click="side = 'yes'"
            >
              {{ t.predict.yes }}
            </button>
            <button type="button" :aria-pressed="side === 'no'" data-testid="pd-side-no" @click="side = 'no'">
              {{ t.predict.no }}
            </button>
          </div>
        </div>
        <div class="dt-field-row">
          <span class="dt-field-label"
            ><b>{{ t.predict.detail.shares }}</b
            ><small>{{
              dir === 'sell'
                ? t.predict.detail.heldLine(held)
                : t.predict.detail.limitLine(list.maxTrade, list.maxHold)
            }}</small></span
          >
          <DtStepper v-model="qty" :min="1" :max="qtyMax" testid="pd-qty" />
        </div>
        <div class="dt-sum" data-testid="pd-quote">
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
        <div v-if="limitText" class="dt-detail-note text-danger" data-testid="pd-limit">{{ limitText }}</div>
      </div>
      <template #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="trading = false">{{ t.common.cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || !canTrade || quote === null || limitText !== ''"
            data-testid="pd-submit"
            @click="submit"
          >
            {{ t.predict.detail.submitN(action({ dir, side }), qty) }}
          </button>
        </div>
      </template>
    </DtSheet>
  </template>
</template>
