<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { BulkDto, BulkResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { newsTime } from '../../utils/news';

/** 交易所的大宗认购标签（大宗认购设计 §3.3）：当前批次、出价、我的出价、最近结果 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<BulkDto | null>(null);
const price = ref<number | ''>('');
const qty = ref<number | ''>(1);
const busy = ref(false);
/** 还要等几秒才能再出价（服务端给初值，这里每秒减） */
const cooldown = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function startCooldown(n: number) {
  if (timer) clearInterval(timer);
  cooldown.value = n;
  if (n <= 0) return;
  timer = setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0 && timer) clearInterval(timer);
  }, 1000);
}
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

/** 输入框按读到的数据重置：改出价填原值，第一次出价填入围门槛和 1 份 */
function reset() {
  const d = data.value;
  if (!d?.lot) return;
  price.value = d.mine ? d.mine.price : d.lot.threshold;
  qty.value = d.mine ? d.mine.qty : 1;
  startCooldown(d.mine?.cooldownLeft ?? 0);
}
async function load() {
  try {
    data.value = await endpoints.bulk();
    reset();
  } catch (e) {
    toast.push(errorMessage(e, t.value.bulk.loadFailed), 'danger');
  }
}
onMounted(load);

const lot = computed(() => data.value?.lot ?? null);
const mine = computed(() => data.value?.mine ?? null);
const canBid = computed(() => !!data.value?.enabled && data.value.blocked === null && !!lot.value);
const blockedText = computed(() => {
  const d = data.value;
  if (!d?.blocked) return '';
  const b = t.value.futures.blocked;
  if (d.blocked === 'exchange_level') return b.exchange_level(d.needLevel);
  if (d.blocked === 'exchange_age') return b.exchange_age(d.needDays);
  return b[d.blocked];
});
/** 输入框里的正整数；空、0、小数时为 0 */
const int = (v: number | '') => {
  const n = Number(v);
  return v !== '' && Number.isInteger(n) && n >= 1 ? n : 0;
};
const p = computed(() => int(price.value));
const q = computed(() => int(qty.value));
const ceilClean = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);
/** 改出价时单价至少加到多少（同服务端 minRaisePrice） */
const minRaise = computed(() =>
  mine.value && data.value ? ceilClean(mine.value.price * (1 + data.value.minRaise)) : 0,
);
const total = computed(() => p.value * q.value);
const extra = computed(() => total.value - (mine.value?.frozen ?? 0));
/** 我的入围情况；没全中时接一句“再加价可以多入围”（拼成一句，免得模板换行带出空格） */
const mineStatus = computed(() => {
  const m = mine.value;
  if (!m) return '';
  const b = t.value.bulk;
  // 停更期间不公布入围情况（问题记录 595）
  if (m.won === null) return b.blindMine;
  if (m.won === m.qty) return b.inAll(m.won);
  return (m.won > 0 ? b.inPart(m.won, m.qty) : b.out) + b.raiseMore;
});
/**
 * 出价框里的预计付款（终审 I2）：成交价不会高于自己的出价，按 min(出价, 预计成交价) × 份数算；
 * 已满 n 份、出价又低于入围门槛时照现在不入围
 */
const estimateText = computed(() => {
  const l = lot.value;
  if (!l || p.value < 1 || q.value < 1) return '';
  const b = t.value.bulk;
  // 停更期间看到的是停更那一刻的数，照它算付款不准（问题记录 595）
  if (l.blindAt) return b.estimateBlind;
  if (l.demand >= l.qty && p.value < l.threshold) return b.estimateOut;
  const unit = Math.min(p.value, l.price);
  return b.estimateAll(formatNum(unit), formatNum(unit * q.value));
});
const ratio = (demand: number, n: number) => (Math.round((demand / n) * 10) / 10).toString();

/** 不能提交的原因；能提交为空（服务端同样检查，这里只是提前提示） */
const reason = computed(() => {
  const d = data.value;
  const l = lot.value;
  if (!d || !l) return '';
  const r = t.value.bulk.reasons;
  if (p.value < 1 || q.value < 1) return r.invalid;
  if (p.value < l.reserve) return r.reserve(formatNum(l.reserve));
  if (q.value > l.cap) return r.cap(l.cap);
  const m = mine.value;
  if (m) {
    if (p.value < m.price || q.value < m.qty) return r.shrink;
    if (p.value === m.price && q.value === m.qty) return r.same;
    if (p.value > m.price && p.value < minRaise.value) return r.raise(formatNum(minRaise.value));
  }
  if (extra.value > d.coin) return r.coin;
  return '';
});
const canSubmit = computed(() => canBid.value && !busy.value && !reason.value && cooldown.value <= 0);

async function submit() {
  const l = lot.value;
  if (!l || !canSubmit.value) return;
  if (
    !window.confirm(
      t.value.bulk.confirm(formatNum(total.value), formatNum(Math.max(0, extra.value)), q.value),
    )
  )
    return;
  busy.value = true;
  try {
    data.value = await endpoints.bulkBid({ lotId: l.id, price: p.value, qty: q.value });
    toast.push(t.value.bulk.bidDone, 'success');
    reset();
  } catch (e) {
    toast.push(errorMessage(e, t.value.bulk.bidFailed), 'danger');
    // 被拒多半是状态变了（收盘了、别人改了价、冷却没到）：重新读取
    await load();
  } finally {
    busy.value = false;
  }
}

function resultLine(r: BulkResultDto): string {
  const b = t.value.bulk;
  const name = catalog.foodName(r.foodsId);
  if (r.status === 'failed') return b.failed(name);
  if (r.status === 'cancelled') return b.cancelled(name);
  return b.result(name, r.sold, formatNum(r.price ?? 0), ratio(r.demand, r.qty));
}
function myResult(r: BulkResultDto): string {
  const m = r.mine;
  if (!m) return '';
  const b = t.value.bulk;
  if (m.paid === null || m.refunded === null) return b.myPending;
  if (m.won > 0) return b.myWon(m.won, formatNum(m.paid), formatNum(m.refunded));
  return b.myLost(formatNum(m.refunded), m.consolation);
}
</script>

<template>
  <div v-if="data">
    <div class="small text-muted mb-2">{{ t.bulk.intro }}</div>
    <details class="small text-muted mb-2" data-testid="bk-help">
      <summary>{{ t.bulk.helpTitle }}</summary>
      <ul class="mb-0 ps-3">
        <li
          v-for="(x, i) in t.bulk.help(
            lot?.cap ?? 0,
            lot?.groupQty ?? 0,
            Math.round(data.minRaise * 100),
            data.cooldownSec,
            data.closeWindowMin,
            data.openHour,
            data.blindMin,
          )"
          :key="i"
        >
          {{ x }}
        </li>
      </ul>
    </details>
    <div v-if="!data.enabled" class="alert alert-secondary py-1 small" data-testid="bk-off">
      {{ t.bulk.off }}
    </div>
    <div v-else-if="!lot" class="dt-empty small" data-testid="bk-none">{{ t.bulk.none(data.openHour) }}</div>
    <template v-if="lot">
      <div class="dt-card mb-2 small" data-testid="bk-lot">
        <div class="fw-bold mb-1">{{ t.bulk.food(catalog.foodName(lot.foodsId), lot.level) }}</div>
        <div>{{ t.bulk.lotLine(lot.qty, formatNum(lot.reserve), lot.cap) }}</div>
        <div data-testid="bk-price">{{ t.bulk.price(formatNum(lot.price)) }}</div>
        <div data-testid="bk-threshold">{{ t.bulk.threshold(formatNum(lot.threshold)) }}</div>
        <div data-testid="bk-demand">{{ t.bulk.demand(ratio(lot.demand, lot.qty), lot.bidders) }}</div>
        <div data-testid="bk-grouped" :class="lot.grouped ? 'text-success' : 'text-muted'">
          {{ t.bulk.grouped(lot.grouped, lot.groupQty) }}
        </div>
        <div class="text-muted">{{ t.bulk.ends(newsTime(lot.endsAt), data.closeWindowMin) }}</div>
        <div v-if="lot.blindAt" class="text-warning-emphasis" data-testid="bk-blind">
          {{ t.bulk.blindNote(newsTime(lot.blindAt)) }}
        </div>
      </div>

      <div v-if="mine" class="dt-card mb-2 small" data-testid="bk-mine">
        <div class="fw-bold mb-1">{{ t.bulk.mineTitle }}</div>
        <div>{{ t.bulk.mineLine(formatNum(mine.price), mine.qty, formatNum(mine.frozen)) }}</div>
        <!-- 停更期间不公布入围情况（won 为 null）：灰字，免得看着像没入围 -->
        <div
          :class="mine.won === null ? 'text-muted' : mine.won === mine.qty ? 'text-success' : 'text-danger'"
          data-testid="bk-mine-status"
        >
          {{ mineStatus }}
        </div>
        <div v-if="mine.estimate !== null" class="text-muted">
          {{ t.bulk.estimate(formatNum(mine.estimate)) }}
        </div>
      </div>

      <div v-if="blockedText" class="alert alert-warning py-1 small" data-testid="bk-blocked">
        {{ blockedText }}
      </div>
      <div v-else-if="canBid" class="dt-card mb-3 small" data-testid="bk-form">
        <div class="d-flex align-items-center gap-2 mb-1">
          <label class="text-nowrap" for="bk-price">{{ t.bulk.priceLabel }}</label>
          <input
            id="bk-price"
            v-model.number="price"
            type="number"
            :min="lot.reserve"
            class="form-control form-control-sm"
            style="width: 8rem"
            data-testid="bk-price-input"
          />
          <label class="text-nowrap" for="bk-qty">{{ t.bulk.qtyLabel }}</label>
          <input
            id="bk-qty"
            v-model.number="qty"
            type="number"
            min="1"
            :max="lot.cap"
            class="form-control form-control-sm"
            style="width: 5rem"
            data-testid="bk-qty-input"
          />
        </div>
        <div v-if="mine" class="text-muted" data-testid="bk-min-raise">
          {{ t.bulk.minRaise(formatNum(minRaise)) }}
        </div>
        <div data-testid="bk-freeze">
          {{ t.bulk.freeze(formatNum(total), formatNum(Math.max(0, extra)), !!mine) }}
          {{ t.bulk.settleNote }}
          {{ estimateText }}
        </div>
        <div class="text-muted" data-testid="bk-partial-hint">{{ t.bulk.partialHint }}</div>
        <div v-if="reason" class="text-danger" data-testid="bk-reason">{{ reason }}</div>
        <button
          type="button"
          class="btn btn-sm btn-primary mt-1"
          :disabled="!canSubmit"
          data-testid="bk-submit"
          @click="submit"
        >
          {{ cooldown > 0 ? t.bulk.cooldown(cooldown) : mine ? t.bulk.raise : t.bulk.bid }}
        </button>
      </div>
    </template>

    <h6 class="dt-section">{{ t.bulk.recentTitle }}</h6>
    <div v-if="data.recent.length === 0" class="small text-muted">{{ t.bulk.noRecent }}</div>
    <div
      v-for="r in data.recent"
      :key="r.id"
      class="small border-bottom py-1"
      :data-testid="`bk-recent-${r.id}`"
    >
      <div>{{ resultLine(r) }}</div>
      <div v-if="r.mine" class="text-muted">{{ myResult(r) }}</div>
    </div>
  </div>
</template>
