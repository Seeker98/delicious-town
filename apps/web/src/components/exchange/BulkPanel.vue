<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { BULK_PRICE_MAX, type BulkDto, type BulkResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtEmpty from '../DtEmpty.vue';
import DtSheet from '../DtSheet.vue';
import DtStepper from '../DtStepper.vue';
import FoodArt from '../FoodArt.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { newsTime } from '../../utils/news';

/**
 * 交易所的大宗认购标签（大宗认购设计 §3.3）：当前批次、出价、我的出价、最近结果。
 * 界面改版 P8：批次一张卡片（成交价和门槛、认购进度、收盘时间、我的出价），出价在底部面板里
 */
const catalog = useCatalogStore();
const confirm = useConfirmStore();
const toast = useToastStore();
const t = useT();
const data = ref<BulkDto | null>(null);
const price = ref(0);
const qty = ref(1);
const busy = ref(false);
/** 出价面板、怎么算面板 */
const sheet = ref<'bid' | 'help' | null>(null);
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
function resetInputs() {
  const d = data.value;
  if (!d?.lot) return;
  price.value = d.mine ? d.mine.price : d.lot.threshold;
  qty.value = d.mine ? d.mine.qty : 1;
}
/** 读到新数据时：输入框重置、冷却按服务端给的重新倒数（只在这时，打开面板不重新倒数，P8 终审 I1） */
function reset() {
  resetInputs();
  startCooldown(data.value?.mine?.cooldownLeft ?? 0);
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
/** 步进器里的正整数；不是整数或小于 1 时为 0 */
const int = (v: number) => (Number.isInteger(v) && v >= 1 ? v : 0);
const p = computed(() => int(price.value));
const q = computed(() => int(qty.value));
const ceilClean = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);
/** 改出价时单价至少加到多少（同服务端 minRaisePrice） */
const minRaise = computed(() =>
  mine.value && data.value ? ceilClean(mine.value.price * (1 + data.value.minRaise)) : 0,
);
/** 单价步进：按起拍价的量级，2,640 一步 10 */
const priceStep = computed(() => Math.max(1, 10 ** (String(Math.round(lot.value?.reserve ?? 1)).length - 3)));
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
const pctOf = (n: number, of: number) => `${Math.min(100, Math.round((n / Math.max(1, of)) * 100))}%`;

/** 不能提交的原因；能提交为空（服务端同样检查，这里只是提前提示） */
const reason = computed(() => {
  const d = data.value;
  const l = lot.value;
  if (!d || !l) return '';
  const r = t.value.bulk.reasons;
  if (p.value < 1 || q.value < 1) return r.invalid;
  if (p.value > BULK_PRICE_MAX) return r.priceMax(formatNum(BULK_PRICE_MAX));
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

function openBid() {
  resetInputs();
  sheet.value = 'bid';
}
async function submit() {
  const l = lot.value;
  if (!l || !canSubmit.value) return;
  const [title = '', ...body] = t.value.bulk
    .confirm(formatNum(total.value), formatNum(Math.max(0, extra.value)), q.value)
    .split('\n');
  if (
    !(await confirm.ask({
      title,
      body: body.join('\n'),
      ok: mine.value ? t.value.bulk.raise : t.value.bulk.bid,
    }))
  )
    return;
  busy.value = true;
  try {
    data.value = await endpoints.bulkBid({ lotId: l.id, price: p.value, qty: q.value });
    toast.push(t.value.bulk.bidDone, 'success');
    sheet.value = null;
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
    <div v-if="!data.enabled" class="dt-act-note" data-testid="bk-off">{{ t.bulk.off }}</div>
    <DtEmpty v-else-if="!lot" :title="t.bulk.none(data.openHour)" data-testid="bk-none" />
    <section v-if="lot" class="dt-card dt-rows-card" data-testid="bk-lot">
      <div class="dt-row">
        <span class="dt-row-ico"><FoodArt :id="lot.foodsId" :size="28" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title dt-bulk-name">{{
            t.bulk.food(catalog.foodName(lot.foodsId), lot.level)
          }}</span>
          <span class="dt-row-sub">{{ t.bulk.lotLine(lot.qty, formatNum(lot.reserve), lot.cap) }}</span>
        </span>
        <span :class="lot.grouped ? 'dt-tag-ok' : 'dt-tag dt-tag-warn'" data-testid="bk-grouped-tag">{{
          t.bulk.groupedTag(lot.grouped)
        }}</span>
      </div>
      <div class="dt-bulk-sec dt-bulk-stats">
        <div data-testid="bk-price">
          <span>{{ t.bulk.statPrice }}</span
          ><b>{{ formatNum(lot.price) }}</b>
        </div>
        <div data-testid="bk-threshold">
          <span>{{ t.bulk.statThreshold }}</span
          ><b>{{ formatNum(lot.threshold) }}</b>
        </div>
      </div>
      <div class="dt-bulk-sec">
        <div class="dt-bulk-demand" data-testid="bk-demand">
          <span>{{ t.bulk.demandLine(lot.demand, lot.qty, ratio(lot.demand, lot.qty)) }}</span>
          <span class="dt-meta">{{ t.bulk.biddersLine(lot.bidders) }}</span>
        </div>
        <div class="dt-bulk-bar" aria-hidden="true">
          <b :style="{ width: pctOf(lot.demand, lot.qty) }"></b
          ><i :style="{ left: pctOf(lot.groupQty, lot.qty) }"></i>
        </div>
        <div class="dt-meta" data-testid="bk-grouped">{{ t.bulk.grouped(lot.grouped, lot.groupQty) }}</div>
      </div>
      <div class="dt-bulk-sec dt-bulk-ends">
        <i class="bi bi-clock" aria-hidden="true"></i>
        <span>{{ t.bulk.ends(newsTime(lot.endsAt), data.closeWindowMin) }}</span>
      </div>
      <div v-if="lot.blindAt" class="dt-bulk-sec text-warning-emphasis" data-testid="bk-blind">
        {{ t.bulk.blindNote(newsTime(lot.blindAt)) }}
      </div>
      <div class="dt-bulk-sec">
        <div v-if="mine" class="dt-bulk-mine" data-testid="bk-mine">
          <div class="dt-bulk-mine-head">
            <span class="dt-row-main"
              ><span class="dt-meta">{{ t.bulk.mineTitle }}</span
              ><b>{{ t.bulk.mineLine(formatNum(mine.price), mine.qty, formatNum(mine.frozen)) }}</b></span
            >
            <span
              :class="
                mine.won === null ? 'dt-tag-mute' : mine.won === mine.qty ? 'dt-tag-ok' : 'dt-tag-danger'
              "
              data-testid="bk-mine-status"
              >{{ mineStatus }}</span
            >
          </div>
          <div v-if="mine.estimate !== null" class="dt-meta">
            {{ t.bulk.estimate(formatNum(mine.estimate)) }}
          </div>
        </div>
        <div v-if="blockedText" class="dt-act-note is-warn mb-0" data-testid="bk-blocked">
          {{ blockedText }}
        </div>
        <button
          v-else-if="canBid"
          type="button"
          class="btn btn-primary dt-btn-block"
          data-testid="bk-open"
          @click="openBid"
        >
          {{ mine ? t.bulk.raise : t.bulk.bid }}
        </button>
      </div>
    </section>
    <div class="dt-card dt-rows-card mt-3">
      <button type="button" class="dt-row is-link" data-testid="bk-help" @click="sheet = 'help'">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.bulk.helpTitle }}</span
          ><span class="dt-row-sub">{{ t.bulk.intro }}</span></span
        >
      </button>
    </div>

    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.bulk.recentTitle }}</h2>
      </div>
      <DtEmpty v-if="data.recent.length === 0" :title="t.bulk.noRecent" />
      <div v-else class="dt-card dt-rows-card">
        <div
          v-for="r in data.recent"
          :key="r.id"
          class="dt-row dt-row-wrap"
          :data-testid="`bk-recent-${r.id}`"
        >
          <span class="dt-row-main">
            <span class="dt-row-title">{{ resultLine(r) }}</span>
            <span v-if="r.mine" class="dt-row-sub">{{ myResult(r) }}</span>
          </span>
        </div>
      </div>
    </section>

    <DtSheet
      :open="sheet === 'bid' && !!lot"
      :title="lot ? t.bulk.sheetTitle(!!mine, catalog.foodName(lot.foodsId)) : ''"
      @close="sheet = null"
    >
      <div v-if="lot" data-testid="bk-form">
        <div class="dt-detail-sub">
          {{
            mine
              ? t.bulk.mineNow(formatNum(mine.price), mine.qty)
              : t.bulk.lotLine(lot.qty, formatNum(lot.reserve), lot.cap)
          }}
        </div>
        <div class="dt-field-row">
          <span class="dt-field-label"
            ><b>{{ t.bulk.priceLabel }}</b
            ><small v-if="mine" data-testid="bk-min-raise">{{ t.bulk.minRaise(formatNum(minRaise)) }}</small
            ><small v-else>{{ t.bulk.reserveLine(formatNum(lot.reserve)) }}</small></span
          >
          <DtStepper
            v-model="price"
            :min="mine ? mine.price : lot.reserve"
            :step="priceStep"
            testid="bk-price-input"
            size="wide"
          />
        </div>
        <div class="dt-field-row">
          <span class="dt-field-label"
            ><b>{{ t.bulk.qtyLabel }}</b
            ><small>{{ t.bulk.reasons.cap(lot.cap) }}</small></span
          >
          <DtStepper v-model="qty" :min="mine ? mine.qty : 1" :max="lot.cap" testid="bk-qty-input" />
        </div>
        <div class="dt-sum dt-bulk-freeze" data-testid="bk-freeze">
          <div class="dt-bulk-freeze-main">
            {{ t.bulk.freeze(formatNum(total), formatNum(Math.max(0, extra)), !!mine) }}
          </div>
          <div class="dt-meta">{{ estimateText }} {{ t.bulk.settleNote }}</div>
        </div>
        <div class="dt-detail-note" data-testid="bk-partial-hint">{{ t.bulk.partialHint }}</div>
        <div v-if="reason" class="dt-detail-note text-danger" data-testid="bk-reason">{{ reason }}</div>
      </div>
      <template v-if="lot" #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="sheet = null">{{ t.common.cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canSubmit"
            data-testid="bk-submit"
            @click="submit"
          >
            {{ cooldown > 0 ? t.bulk.cooldown(cooldown) : mine ? t.bulk.raise : t.bulk.bid }}
          </button>
        </div>
      </template>
    </DtSheet>

    <DtSheet :open="sheet === 'help'" :title="t.bulk.helpTitle" @close="sheet = null">
      <div class="dt-help">
        <p>{{ t.bulk.intro }}</p>
        <ul>
          <li
            v-for="(x, i) in t.bulk.help(
              lot?.cap ?? null,
              lot?.groupQty ?? null,
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
      </div>
    </DtSheet>
  </div>
</template>
