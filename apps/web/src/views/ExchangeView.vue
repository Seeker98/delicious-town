<script setup lang="ts">
import JobCardNote from '../components/JobCardNote.vue';
import { computed, onMounted, ref } from 'vue';
import type { ExchangeBookDto, ExchangeFoodDto, ExchangeMeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtSheet from '../components/DtSheet.vue';
import DtStepper from '../components/DtStepper.vue';
import DtTabs from '../components/DtTabs.vue';
import FoodArt from '../components/FoodArt.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { timeLeft } from '../utils/activity';
import { foodLevelLabel, formatNum, formatPct } from '../utils/format';
import { matchText } from '../utils/match';
import FuturesPanel from '../components/exchange/FuturesPanel.vue';
import BulkPanel from '../components/exchange/BulkPanel.vue';
import { useRestaurantStore } from '../stores/restaurant';
import { serverNowMs } from '../utils/serverNow';

/**
 * 交易所（问题记录 156，156-1 设计 §8）。界面改版 P8（设计图“交易所 · 现货”）：
 * 上面一张卡片放账户、我的挂单、近 7 天成交、规则；食材按等级一行一种，点一行从下面弹出盘口和下单
 */
const catalog = useCatalogStore();
const restStore = useRestaurantStore();
/**
 * 现货、期货、大宗认购三个标签（期货设计 §10、大宗认购设计 §3.3）；地址带 ?tab=futures / ?tab=bulk 直接打开。
 * 测试里没有路由时按现货
 */
type Tab = 'spot' | 'futures' | 'bulk';
/** 本区服关了期货时，有进行中的单才显示期货标签（只看我的期货单） */
const futuresOpen = ref(false);
const showFutures = computed(() => restStore.featureOn('futures') || futuresOpen.value);
const showBulk = computed(() => restStore.featureOn('bulk'));
/** 只有现货一个时不显示标签栏 */
const tabs = computed<Tab[]>(() => [
  'spot',
  ...(showFutures.value ? (['futures'] as const) : []),
  ...(showBulk.value ? (['bulk'] as const) : []),
]);
/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs });
const tabItems = computed(() => tabs.value.map((k) => ({ key: k, label: tabName(k) })));
const tabName = (k: Tab) =>
  k === 'spot' ? t.value.futures.tabSpot : k === 'futures' ? t.value.futures.tabFutures : t.value.bulk.tab;
onMounted(() => {
  if (restStore.featureOn('futures')) return;
  endpoints
    .futures()
    .then((v) => (futuresOpen.value = v.contracts.some((c) => c.status === 'open')))
    .catch(() => undefined);
});
const toast = useToastStore();
const t = useT();
const foods = ref<ExchangeFoodDto[]>([]);
const me = ref<ExchangeMeDto | null>(null);
const book = ref<ExchangeBookDto | null>(null);
const selected = ref<number | null>(null);
const search = ref('');
const side = ref<'buy' | 'sell'>('buy');
const price = ref(0);
const qty = ref(1);
const busy = ref(false);
/** 上面卡片点开的面板：我的挂单、近 7 天成交、规则 */
const panel = ref<'orders' | 'trades' | 'help' | null>(null);

const levelOf = (id: number) => catalog.foodsMap.get(id)?.level ?? 0;
/** 在售：玩家卖单或系统库存；在收：玩家买单（问题记录 282） */
const saleNum = (f: ExchangeFoodDto) => f.selling + f.sysStock;
type Filter = 'all' | 'sale' | 'buy';
const FILTER_KEY = 'dt_exchange_filter';
function savedFilter(): Filter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    return v === 'sale' || v === 'buy' ? v : 'all';
  } catch {
    return 'all';
  }
}
const filter = ref<Filter>(savedFilter());
function setFilter(v: Filter) {
  filter.value = v;
  try {
    localStorage.setItem(FILTER_KEY, v);
  } catch {
    // 存储不可用时忽略
  }
}
const FILTERS: readonly Filter[] = ['all', 'sale', 'buy'];
const groups = computed(() => {
  const q = search.value.trim();
  const list = foods.value.filter(
    (f) =>
      // 不区分大小写、忽略重音（问题记录 316）
      matchText(catalog.foodName(f.foodsId), q) &&
      (filter.value === 'all' || (filter.value === 'sale' ? saleNum(f) > 0 : f.buying > 0)),
  );
  const by = new Map<number, ExchangeFoodDto[]>();
  for (const f of list) by.set(levelOf(f.foodsId), [...(by.get(levelOf(f.foodsId)) ?? []), f]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
});
const pct = (x: number | null) => (x === null ? '' : formatPct(x, { sign: true }));
function reasonOf(m: ExchangeMeDto): string {
  const r = t.value.exchange.reasons;
  if (m.reason === 'exchange_level') return r.exchange_level(m.need.level, m.level);
  if (m.reason === 'exchange_age') return r.exchange_age(m.need.days);
  if (m.reason === 'exchange_email') return r.exchange_email;
  return t.value.exchange.cannotTrade;
}
const blocked = computed(() =>
  me.value?.frozen ? t.value.exchange.frozen : me.value && !me.value.eligible ? reasonOf(me.value) : '',
);
/** 冷静期的所得（156-2 设计 §8）：到期的转进账户要靠"全部取出"，所以分开显示（终审 I2） */
const isReady = (at: string) => new Date(at).getTime() <= serverNowMs();
const readyHolds = computed(() => me.value?.holds.filter((h) => isReady(h.releaseAt)) ?? []);
const pendingHolds = computed(() => me.value?.holds.filter((h) => !isReady(h.releaseAt)) ?? []);
function holdText(list: ExchangeMeDto['holds']): string {
  const coin = list.reduce((n, h) => n + h.coin, 0);
  const foods = new Map<number, number>();
  for (const h of list)
    if (h.foodsId !== null && h.num > 0) foods.set(h.foodsId, (foods.get(h.foodsId) ?? 0) + h.num);
  return [
    ...(coin > 0 ? [t.value.exchange.coin(formatNum(coin))] : []),
    ...[...foods].map(([id, n]) => t.value.common.qty(catalog.foodName(id), n)),
  ].join(t.value.events.sep);
}
const walletText = computed(() =>
  me.value
    ? [
        t.value.exchange.coin(formatNum(me.value.wallet.coin)),
        ...me.value.wallet.foods.map((f) => t.value.common.qty(catalog.foodName(f.foodsId), f.num)),
      ].join(t.value.events.sep)
    : '',
);
const valid = computed(
  () =>
    book.value !== null &&
    Number.isInteger(price.value) &&
    Number.isInteger(qty.value) &&
    price.value >= book.value.min &&
    price.value <= book.value.max &&
    qty.value >= 1 &&
    // 单笔上限按区服设置（backlog 156-1，以前写死 999）
    qty.value <= (me.value?.maxQty ?? 999),
);
const estimate = computed(() => {
  if (!valid.value || !me.value) return '';
  const total = price.value * qty.value;
  return side.value === 'buy'
    ? t.value.exchange.estimateBuy(formatNum(total))
    : t.value.exchange.estimateSell(formatNum(total - Math.floor(total * me.value.feeRate)));
});
/** 单价步进：按参考价的量级，1,600 一步 10 */
const priceStep = computed(() => {
  const ref = book.value?.ref ?? 1;
  return Math.max(1, 10 ** (String(Math.round(ref)).length - 3));
});
/** 盘口每档的深度条：按这本盘口里最多的那一档算 */
const depthMax = computed(() =>
  Math.max(1, ...(book.value ? [...book.value.asks, ...book.value.bids].map((x) => x.qty) : [])),
);
const depth = (n: number) => `${Math.round((n / depthMax.value) * 100)}%`;

/** 卖给系统（问题记录 244）：盘口里系统收购那一档；兜底价低于挂单下限，只能这样卖 */
const sysBid = computed(() => book.value?.bids.find((b) => b.system) ?? null);
/**
 * 挂卖单会和系统收购档成交，但数量超过系统还能收的（backlog 156-3）：超出部分按自己的价格挂着，
 * 可能低于系统收购价、被别人低价买走再卖给系统，下单前提示
 */
const overSystem = computed(() => {
  const b = sysBid.value;
  if (side.value !== 'sell' || !b || b.floor) return null;
  return price.value <= b.price && qty.value > b.qty ? b.qty : null;
});
const sysOpen = ref(false);
const sysQty = ref(1);
const sysValid = computed(
  () =>
    sysBid.value !== null &&
    Number.isInteger(sysQty.value) &&
    sysQty.value >= 1 &&
    sysQty.value <= sysBid.value.qty,
);
const sysEstimate = computed(() => {
  if (!sysValid.value || !me.value) return '';
  const total = sysBid.value!.price * sysQty.value;
  const fee = Math.floor(total * me.value.feeRate);
  return t.value.exchange.sysEstimate(
    formatNum(sysBid.value!.price),
    sysQty.value,
    formatNum(total),
    formatNum(fee),
    formatNum(total - fee),
  );
});
async function sellToSystem() {
  const id = selected.value;
  const b = sysBid.value;
  if (!sysValid.value || id === null || !b) return;
  const n = sysQty.value;
  busy.value = true;
  try {
    await endpoints.tradeSellSystem({ foodsId: id, price: b.price, qty: n });
    toast.push(t.value.exchange.soldToSystem(n, formatNum(b.price)));
    sysOpen.value = false;
    await loadMe();
  } catch (e) {
    toast.push(errorMessage(e, t.value.exchange.sellSystemFailed), 'danger');
  } finally {
    busy.value = false;
  }
  // 成功或价格变了都重新读盘口
  const fresh = await endpoints.tradeBook(id).catch(() => null);
  if (fresh && selected.value === id) book.value = fresh;
}

async function loadMe() {
  me.value = await endpoints.tradeMe();
}
/** 选食材：弹出面板，单价先填最新成交价（没有就参考价）；连点时只认最后一次点的那个（终审：先发的请求后回来会覆盖） */
async function pick(id: number) {
  selected.value = id;
  book.value = null;
  sysOpen.value = false;
  try {
    const b = await endpoints.tradeBook(id);
    if (selected.value !== id) return;
    book.value = b;
    price.value = Math.min(b.max, Math.max(b.min, b.last ?? b.ref));
  } catch (e) {
    if (selected.value !== id) return;
    toast.push(errorMessage(e, t.value.exchange.bookFailed), 'danger');
    // 盘口读不到：关掉面板，免得一直“读取中”（P8 终审）
    closeBook();
  }
}
function closeBook() {
  selected.value = null;
  book.value = null;
}
/** 点盘口一档：按那一档的价格填（兜底价低于挂单下限，不能填） */
function takeLevel(p: number, floor?: boolean) {
  if (!floor) price.value = p;
}
async function run(fn: () => Promise<unknown>, ok: (r: unknown) => string, fallback: string) {
  busy.value = true;
  try {
    const r = await fn();
    toast.push(ok(r));
    await loadMe();
    const id = selected.value;
    if (id !== null) {
      const b = await endpoints.tradeBook(id);
      if (selected.value === id) book.value = b;
    }
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function submit() {
  if (!valid.value || selected.value === null) return;
  const b = { foodsId: selected.value, side: side.value, price: price.value, qty: qty.value };
  void run(
    () => endpoints.tradePlace(b),
    (r) => {
      const fills = (r as { fills: Array<{ qty: number; held: boolean }> }).fills;
      const n = fills.reduce((s, x) => s + x.qty, 0);
      const x = t.value.exchange;
      if (n === 0) return x.placed;
      // 可疑成交的所得进冷静期（156-2 设计 §8）
      const held = fills.some((f) => f.held) ? x.heldNote(me.value?.holdHours ?? 24) : '';
      return x.filled(n, n < b.qty, held);
    },
    t.value.exchange.placeFailed,
  );
}
const cancel = (id: number) =>
  run(
    () => endpoints.tradeCancel(id),
    () => t.value.exchange.cancelled,
    t.value.exchange.cancelFailed,
  );
const withdraw = () =>
  run(
    () => endpoints.tradeWithdraw(),
    (r) => {
      const left = (r as { left: Array<{ num: number }> }).left.reduce((s, x) => s + x.num, 0);
      return left > 0 ? t.value.exchange.withdrawnLeft(left) : t.value.exchange.withdrawn;
    },
    t.value.exchange.withdrawFailed,
  );

onMounted(async () => {
  try {
    [foods.value] = await Promise.all([endpoints.tradeFoods(), loadMe()]);
  } catch (e) {
    toast.push(errorMessage(e, t.value.exchange.loadFailed), 'danger');
  }
});
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" testid-prefix="ex-tab-" />
  <FuturesPanel v-if="tab === 'futures' && showFutures" />
  <BulkPanel v-else-if="tab === 'bulk' && showBulk" />
  <template v-else>
    <JobCardNote v-if="me?.feeCard" :card="me.feeCard" />
    <div v-if="me?.frozen" class="dt-act-note is-danger" data-testid="ex-frozen">
      {{ t.exchange.frozenNotice(me.frozen.reason) }}
    </div>
    <div v-else-if="blocked" class="dt-act-note is-warn" data-testid="ex-blocked">{{ blocked }}</div>
    <div v-if="me" class="dt-card dt-rows-card" data-testid="ex-me">
      <div class="dt-row dt-row-wrap" data-testid="ex-wallet">
        <span class="dt-row-main">
          <span class="dt-row-title">{{ t.exchange.account }}</span>
          <span class="dt-row-sub">{{ walletText }}</span>
          <span v-if="readyHolds.length > 0" class="dt-row-sub text-success" data-testid="ex-holds-ready">{{
            t.exchange.holdsReady(holdText(readyHolds))
          }}</span>
          <span v-if="pendingHolds.length > 0" class="dt-row-sub" data-testid="ex-holds">{{
            t.exchange.holdsPending(holdText(pendingHolds), timeLeft(pendingHolds[0]!.releaseAt))
          }}</span>
        </span>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :disabled="
            busy ||
            !!me.frozen ||
            (me.wallet.coin === 0 && me.wallet.foods.length === 0 && readyHolds.length === 0)
          "
          data-testid="ex-withdraw"
          @click="withdraw"
        >
          {{ t.exchange.withdraw }}
        </button>
      </div>
      <button type="button" class="dt-row is-link" data-testid="ex-orders-open" @click="panel = 'orders'">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.exchange.myOrders }}</span></span
        >
        <span class="dt-row-value">{{ me.orders.length }}</span>
      </button>
      <button type="button" class="dt-row is-link" data-testid="ex-trades-open" @click="panel = 'trades'">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.exchange.trades }}</span></span
        >
        <span class="dt-row-value">{{ me.trades.length }}</span>
      </button>
      <button type="button" class="dt-row is-link" data-testid="ex-sys-help" @click="panel = 'help'">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.exchange.rulesTitle }}</span
          ><span class="dt-row-sub">{{ t.exchange.rulesSub }}</span></span
        >
      </button>
    </div>

    <input
      v-model="search"
      type="search"
      class="form-control dt-search"
      :placeholder="t.exchange.search"
      :aria-label="t.exchange.search"
      data-testid="ex-search"
    />
    <div class="dt-pills" role="group" :aria-label="t.exchange.filterLabel">
      <button
        v-for="x in FILTERS"
        :key="x"
        type="button"
        :class="{ active: filter === x }"
        :aria-pressed="filter === x"
        :data-testid="`ex-filter-${x}`"
        @click="setFilter(x)"
      >
        {{ t.exchange.filters[x] }}
      </button>
    </div>
    <div class="dt-block-note" data-testid="ex-legend">
      <span class="dt-tag-ok">{{ t.exchange.legendSale }}</span
      >{{ t.exchange.legendSaleText }}<span class="dt-tag-primary">{{ t.exchange.legendBuy }}</span
      >{{ t.exchange.legendBuyText }}
    </div>
    <section v-for="[lv, list] in groups" :key="lv" class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.exchange.level(lv) }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <button
          v-for="f in list"
          :key="f.foodsId"
          type="button"
          class="dt-row is-link"
          :data-testid="`ex-food-${f.foodsId}`"
          @click="pick(f.foodsId)"
        >
          <span class="dt-row-ico"><FoodArt :id="f.foodsId" :size="28" /></span>
          <span class="dt-row-main">
            <span class="dt-row-title is-strong"
              >{{ catalog.foodName(f.foodsId)
              }}<span v-if="saleNum(f) > 0" class="dt-tag-ok">{{ t.exchange.saleTag(saleNum(f)) }}</span
              ><span v-if="f.buying > 0" class="dt-tag-primary">{{ t.exchange.buyTag(f.buying) }}</span></span
            >
          </span>
          <span class="dt-ex-price">
            <b>{{ formatNum(f.last ?? f.ref) }}</b>
            <small
              v-if="f.changePct !== null && f.changePct !== 0"
              :class="f.changePct > 0 ? 'is-up' : 'is-down'"
              >{{ pct(f.changePct) }}</small
            >
          </span>
        </button>
      </div>
    </section>
  </template>

  <!-- 盘口和下单（界面改版 P8 设计图“现货 · 盘口和下单”） -->
  <DtSheet
    :open="selected !== null"
    :title="selected !== null ? catalog.foodName(selected) : ''"
    @close="closeBook"
  >
    <div v-if="selected !== null" data-testid="ex-sheet">
      <div class="dt-detail-head">
        <span class="dt-detail-art"><FoodArt :id="selected" :size="52" /></span>
        <div class="dt-detail-info">
          <div>{{ foodLevelLabel(levelOf(selected)) }}</div>
          <div v-if="book" class="dt-detail-sub">
            {{ t.exchange.ref(formatNum(book.ref)) }} · {{ t.exchange.volume(formatNum(book.volume)) }}
          </div>
        </div>
      </div>
      <div v-if="!book" class="dt-detail-note">{{ t.common.loading }}</div>
      <template v-else>
        <div class="dt-book" data-testid="ex-book">
          <button
            v-for="a in [...book.asks].reverse()"
            :key="`a${a.system ? 's' : ''}${a.price}`"
            type="button"
            class="dt-book-row is-ask"
            :data-testid="`ex-ask-${a.system ? 'sys-' : ''}${a.price}`"
            @click="takeLevel(a.price)"
          >
            <i :style="{ width: depth(a.qty) }"></i>
            <span>{{ a.system ? t.exchange.askSys : t.exchange.ask }}</span>
            <b>{{ formatNum(a.price) }}</b>
            <span class="dt-book-qty">× {{ formatNum(a.qty) }}</span>
          </button>
          <!-- 最新成交价放在卖档和买档中间（156-1 设计 §8，backlog 156-1） -->
          <div class="dt-book-mid" data-testid="ex-last">
            {{ book.last === null ? t.exchange.noTrade : t.exchange.last(formatNum(book.last)) }}
          </div>
          <button
            v-for="b in book.bids"
            :key="`b${b.system ? 's' : ''}${b.price}`"
            type="button"
            class="dt-book-row is-bid"
            :data-testid="`ex-bid-${b.system ? 'sys-' : ''}${b.price}`"
            @click="takeLevel(b.price, b.floor)"
          >
            <i :style="{ width: depth(b.qty) }"></i>
            <span>{{ b.system ? (b.floor ? t.exchange.bidFloor : t.exchange.bidSys) : t.exchange.bid }}</span>
            <b>{{ formatNum(b.price) }}</b>
            <span class="dt-book-qty">× {{ formatNum(b.qty) }}</span>
          </button>
        </div>
        <div class="dt-seg mt-3" role="group" :aria-label="t.exchange.sideLabel">
          <button
            type="button"
            :aria-pressed="side === 'buy'"
            data-testid="ex-side-buy"
            @click="side = 'buy'"
          >
            {{ t.exchange.buy }}
          </button>
          <button
            type="button"
            :aria-pressed="side === 'sell'"
            data-testid="ex-side-sell"
            @click="side = 'sell'"
          >
            {{ t.exchange.sell }}
          </button>
        </div>
        <div class="dt-field-row">
          <span class="dt-field-label"
            ><b>{{ t.exchange.price }}</b
            ><small data-testid="ex-band">{{
              t.exchange.band(formatNum(book.min), formatNum(book.max))
            }}</small></span
          >
          <DtStepper
            v-model="price"
            :min="book.min"
            :max="book.max"
            :step="priceStep"
            testid="ex-price"
            size="wide"
          />
        </div>
        <div class="dt-field-row">
          <span class="dt-field-label"
            ><b>{{ t.exchange.qty }}</b
            ><small>{{ t.exchange.max(me?.maxQty ?? 999) }}</small></span
          >
          <DtStepper v-model="qty" :min="1" :max="me?.maxQty ?? 999" testid="ex-qty" />
        </div>
        <div class="dt-ex-estimate" data-testid="ex-estimate">{{ estimate }}</div>
        <div v-if="overSystem !== null" class="dt-detail-note text-warning" data-testid="ex-over-sys">
          {{ t.exchange.overSystem(overSystem) }}
        </div>
        <div v-if="blocked" class="dt-detail-note text-danger">{{ blocked }}</div>
        <!-- 卖出时：系统收购那一档可以直接卖给系统（兜底价只能这样卖） -->
        <div v-if="side === 'sell' && sysBid" class="dt-ex-sys">
          <button
            type="button"
            class="btn btn-outline-primary dt-btn-block"
            :disabled="busy || !!blocked"
            data-testid="ex-sell-sys"
            :aria-expanded="sysOpen"
            @click="sysOpen = !sysOpen"
          >
            {{ t.exchange.sellSys(formatNum(sysBid.price), !!sysBid.floor) }}
          </button>
          <template v-if="sysOpen">
            <div class="dt-field-row">
              <span class="dt-field-label"
                ><b>{{ t.exchange.qty }}</b
                ><small>{{ t.exchange.max(sysBid.qty) }}</small></span
              >
              <DtStepper v-model="sysQty" :min="1" :max="sysBid.qty" testid="ex-sys-qty" />
            </div>
            <div class="dt-ex-estimate" data-testid="ex-sys-estimate">{{ sysEstimate }}</div>
            <button
              type="button"
              class="btn btn-primary dt-btn-block"
              :disabled="busy || !sysValid || !!blocked"
              data-testid="ex-sys-submit"
              @click="sellToSystem"
            >
              {{ t.exchange.confirmSell }}
            </button>
          </template>
        </div>
      </template>
    </div>
    <!-- 展开“卖给系统”时只留它的确定按钮，免得两个主按钮叠在一起 -->
    <template v-if="selected !== null && book && !(side === 'sell' && sysOpen)" #actions>
      <button
        type="button"
        class="btn btn-primary dt-btn-block"
        :disabled="busy || !valid || !!blocked"
        data-testid="ex-submit"
        @click="submit"
      >
        {{ side === 'buy' ? t.exchange.placeBuy : t.exchange.placeSell }}
      </button>
    </template>
  </DtSheet>

  <DtSheet :open="panel === 'orders'" :title="t.exchange.myOrders" @close="panel = null">
    <div v-if="me" data-testid="ex-orders">
      <div v-if="me.orders.length === 0" class="dt-detail-note">{{ t.exchange.noOrders }}</div>
      <div v-else class="dt-sheet-list">
        <div v-for="o in me.orders" :key="o.id" class="dt-row">
          <span class="dt-row-main">
            <span class="dt-row-title"
              ><span :class="o.side === 'buy' ? 'dt-tag-primary' : 'dt-tag-ok'">{{
                o.side === 'buy' ? t.exchange.bid : t.exchange.ask
              }}</span>
              {{
                t.exchange.orderLine(catalog.foodName(o.foodsId), formatNum(o.price), o.qty, o.filled)
              }}</span
            >
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger"
            :disabled="busy"
            :data-testid="`ex-cancel-${o.id}`"
            @click="cancel(o.id)"
          >
            {{ t.exchange.cancel }}
          </button>
        </div>
      </div>
    </div>
  </DtSheet>

  <DtSheet :open="panel === 'trades'" :title="t.exchange.trades" @close="panel = null">
    <div v-if="me" data-testid="ex-trades">
      <div v-if="me.trades.length === 0" class="dt-detail-note">{{ t.exchange.noTrades }}</div>
      <div v-else class="dt-sheet-list">
        <div v-for="(x, i) in me.trades" :key="i" class="dt-row">
          <span class="dt-row-main">
            <span class="dt-row-title"
              >{{
                t.exchange.tradeLine(
                  x.side === 'buy',
                  catalog.foodName(x.foodsId),
                  formatNum(x.price),
                  x.qty,
                )
              }}<span v-if="x.system" class="text-muted">{{ t.exchange.system }}</span></span
            >
            <span v-if="x.fee > 0" class="dt-row-sub">{{ t.exchange.fee(formatNum(x.fee)) }}</span>
          </span>
        </div>
      </div>
    </div>
  </DtSheet>

  <DtSheet :open="panel === 'help'" :title="t.exchange.rulesTitle" @close="panel = null">
    <div class="dt-help" data-testid="ex-help">
      <p>{{ t.exchange.intro }}</p>
      <ul>
        <li v-for="(x, i) in t.exchange.sysHelpItems" :key="i">{{ x }}</li>
      </ul>
    </div>
  </DtSheet>
</template>
