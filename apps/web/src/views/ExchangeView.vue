<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ExchangeBookDto, ExchangeFoodDto, ExchangeMeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { timeLeft } from '../utils/activity';
import { formatNum } from '../utils/format';
import { matchText } from '../utils/match';
import HiphopCard from '../components/hiphop/HiphopCard.vue';

/** 交易所（问题记录 156，156-1 设计 §8）：选食材 → 盘口 → 下单；我的挂单、账户、成交 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const foods = ref<ExchangeFoodDto[]>([]);
const me = ref<ExchangeMeDto | null>(null);
const book = ref<ExchangeBookDto | null>(null);
const selected = ref<number | null>(null);
const search = ref('');
const side = ref<'buy' | 'sell'>('buy');
const price = ref<number | ''>('');
const qty = ref<number | ''>(1);
const busy = ref(false);

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
const pct = (x: number | null) => (x === null ? '' : `${x >= 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`);
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
const isReady = (at: string) => new Date(at).getTime() <= Date.now();
const readyHolds = computed(() => me.value?.holds.filter((h) => isReady(h.releaseAt)) ?? []);
const pendingHolds = computed(() => me.value?.holds.filter((h) => !isReady(h.releaseAt)) ?? []);
function holdText(list: ExchangeMeDto['holds']): string {
  const coin = list.reduce((n, h) => n + h.coin, 0);
  const foods = new Map<number, number>();
  for (const h of list)
    if (h.foodsId !== null && h.num > 0) foods.set(h.foodsId, (foods.get(h.foodsId) ?? 0) + h.num);
  return [
    ...(coin > 0 ? [t.value.exchange.coin(formatNum(coin))] : []),
    ...[...foods].map(([id, n]) => `${catalog.foodName(id)}×${n}`),
  ].join(t.value.events.sep);
}
const valid = computed(
  () =>
    book.value !== null &&
    typeof price.value === 'number' &&
    typeof qty.value === 'number' &&
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
  const total = (price.value as number) * (qty.value as number);
  return side.value === 'buy'
    ? t.value.exchange.estimateBuy(formatNum(total))
    : t.value.exchange.estimateSell(formatNum(total - Math.floor(total * me.value.feeRate)));
});

/** 卖给系统（问题记录 244）：盘口里系统收购那一档；兜底价低于挂单下限，只能这样卖 */
const sysBid = computed(() => book.value?.bids.find((b) => b.system) ?? null);
/**
 * 挂卖单会和系统收购档成交，但数量超过系统还能收的（backlog 156-3）：超出部分按自己的价格挂着，
 * 可能低于系统收购价、被别人低价买走再卖给系统，下单前提示
 */
const overSystem = computed(() => {
  const b = sysBid.value;
  if (
    side.value !== 'sell' ||
    !b ||
    b.floor ||
    typeof price.value !== 'number' ||
    typeof qty.value !== 'number'
  )
    return null;
  return price.value <= b.price && qty.value > b.qty ? b.qty : null;
});
const sysOpen = ref(false);
const sysQty = ref<number | ''>(1);
const sysValid = computed(
  () =>
    sysBid.value !== null &&
    typeof sysQty.value === 'number' &&
    Number.isInteger(sysQty.value) &&
    sysQty.value >= 1 &&
    sysQty.value <= sysBid.value.qty,
);
const sysEstimate = computed(() => {
  if (!sysValid.value || !me.value) return '';
  const total = sysBid.value!.price * (sysQty.value as number);
  const fee = Math.floor(total * me.value.feeRate);
  return t.value.exchange.sysEstimate(
    formatNum(sysBid.value!.price),
    sysQty.value as number,
    formatNum(total),
    formatNum(fee),
    formatNum(total - fee),
  );
});
async function sellToSystem() {
  const id = selected.value;
  const b = sysBid.value;
  if (!sysValid.value || id === null || !b) return;
  const n = sysQty.value as number;
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
/** 选食材：清空单价；连点时只认最后一次点的那个（终审：先发的请求后回来会覆盖） */
async function pick(id: number) {
  selected.value = id;
  book.value = null;
  price.value = '';
  try {
    const b = await endpoints.tradeBook(id);
    if (selected.value === id) book.value = b;
  } catch (e) {
    if (selected.value === id) toast.push(errorMessage(e, t.value.exchange.bookFailed), 'danger');
  }
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
  const b = {
    foodsId: selected.value,
    side: side.value,
    price: price.value as number,
    qty: qty.value as number,
  };
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
  <h5>{{ t.exchange.title }}</h5>
  <HiphopCard :place="10" />
  <div v-if="me?.frozen" class="alert alert-danger py-1 small" data-testid="ex-frozen">
    {{ t.exchange.frozenNotice(me.frozen.reason) }}
  </div>
  <div class="small text-muted mb-2">
    {{ t.exchange.intro }}
  </div>
  <details class="small text-muted mb-2" data-testid="ex-sys-help">
    <summary>{{ t.exchange.sysHelp }}</summary>
    <ul class="mb-0 ps-3">
      <li v-for="(x, i) in t.exchange.sysHelpItems" :key="i">{{ x }}</li>
    </ul>
  </details>
  <input
    v-model="search"
    class="form-control form-control-sm mb-2"
    :placeholder="t.exchange.search"
    data-testid="ex-search"
  />
  <div class="d-flex flex-wrap align-items-center gap-2 mb-2 small">
    <div class="dt-pills mb-0">
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
    <span class="dt-meta" data-testid="ex-legend"
      ><span class="dt-sale-tag">{{ t.exchange.legendSale }}</span
      >{{ t.exchange.legendSaleText }}<span class="dt-buy-tag">{{ t.exchange.legendBuy }}</span
      >{{ t.exchange.legendBuyText }}</span
    >
  </div>
  <div class="dt-card mb-3" style="max-height: 14rem; overflow-y: auto">
    <div v-for="[lv, list] in groups" :key="lv" class="mb-1">
      <div class="dt-group-label">{{ t.exchange.level(lv) }}</div>
      <button
        v-for="f in list"
        :key="f.foodsId"
        type="button"
        :class="[
          'btn btn-sm me-1 mb-1',
          f.foodsId === selected ? 'btn-primary' : 'btn-outline-secondary',
          { 'dt-on-sale': saleNum(f) > 0 },
        ]"
        :data-testid="`ex-food-${f.foodsId}`"
        @click="pick(f.foodsId)"
      >
        {{ catalog.foodName(f.foodsId) }}
        <span class="small opacity-75">{{ formatNum(f.last ?? f.ref) }} {{ pct(f.changePct) }}</span>
        <span v-if="saleNum(f) > 0" class="dt-sale-tag ms-1">{{ t.exchange.saleTag(saleNum(f)) }}</span>
        <span v-if="f.buying > 0" class="dt-buy-tag ms-1">{{ t.exchange.buyTag(f.buying) }}</span>
      </button>
    </div>
  </div>

  <div v-if="book" class="dt-card mb-3" data-testid="ex-book">
    <div class="d-flex flex-wrap gap-2 small mb-1">
      <b>{{ catalog.foodName(book.foodsId) }}</b>
      <span>{{ t.exchange.ref(formatNum(book.ref)) }}</span>
      <span>{{ t.exchange.volume(formatNum(book.volume)) }}</span>
      <span class="text-muted" data-testid="ex-band">{{
        t.exchange.band(formatNum(book.min), formatNum(book.max))
      }}</span>
    </div>
    <table class="table table-sm small mb-2">
      <tbody>
        <tr
          v-for="a in [...book.asks].reverse()"
          :key="`a${a.system ? 's' : ''}${a.price}`"
          :class="a.system ? 'text-primary' : 'text-danger'"
          role="button"
          :data-testid="`ex-ask-${a.system ? 'sys-' : ''}${a.price}`"
          @click="price = a.price"
        >
          <td>{{ a.system ? t.exchange.askSys : t.exchange.ask }}</td>
          <td>{{ formatNum(a.price) }}</td>
          <td class="text-end">{{ formatNum(a.qty) }}</td>
        </tr>
        <!-- 最新成交价放在卖档和买档中间（156-1 设计 §8，backlog 156-1） -->
        <tr data-testid="ex-last">
          <td colspan="3" class="text-center fw-semibold" :class="{ 'text-muted': book.last === null }">
            {{ book.last === null ? t.exchange.noTrade : t.exchange.last(formatNum(book.last)) }}
          </td>
        </tr>
        <tr
          v-for="b in book.bids"
          :key="`b${b.system ? 's' : ''}${b.price}`"
          :class="b.system ? 'text-primary' : 'text-success'"
          role="button"
          :data-testid="`ex-bid-${b.system ? 'sys-' : ''}${b.price}`"
          @click="if (!b.floor) price = b.price;"
        >
          <td>{{ b.system ? (b.floor ? t.exchange.bidFloor : t.exchange.bidSys) : t.exchange.bid }}</td>
          <td>{{ formatNum(b.price) }}</td>
          <td class="text-end">{{ formatNum(b.qty) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="sysBid" class="mb-2 small">
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!blocked"
        data-testid="ex-sell-sys"
        @click="sysOpen = !sysOpen"
      >
        {{ t.exchange.sellSys(formatNum(sysBid.price), !!sysBid.floor) }}
      </button>
      <div v-if="sysOpen" class="d-flex flex-wrap gap-2 align-items-center mt-1">
        {{ t.exchange.qty }}
        <input
          v-model.number="sysQty"
          type="number"
          min="1"
          :max="sysBid.qty"
          class="form-control form-control-sm"
          style="width: 5rem"
          data-testid="ex-sys-qty"
        />
        <span class="text-muted">{{ t.exchange.max(sysBid.qty) }}</span>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy || !sysValid || !!blocked"
          data-testid="ex-sys-submit"
          @click="sellToSystem"
        >
          {{ t.exchange.confirmSell }}
        </button>
        <div class="w-100 text-muted" data-testid="ex-sys-estimate">{{ sysEstimate }}</div>
      </div>
    </div>
    <div class="btn-group btn-group-sm mb-2">
      <button
        type="button"
        :class="['btn', side === 'buy' ? 'btn-success' : 'btn-outline-success']"
        data-testid="ex-side-buy"
        @click="side = 'buy'"
      >
        {{ t.exchange.buy }}
      </button>
      <button
        type="button"
        :class="['btn', side === 'sell' ? 'btn-danger' : 'btn-outline-danger']"
        data-testid="ex-side-sell"
        @click="side = 'sell'"
      >
        {{ t.exchange.sell }}
      </button>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center small">
      {{ t.exchange.price }}
      <input
        v-model.number="price"
        type="number"
        :min="book.min"
        :max="book.max"
        class="form-control form-control-sm"
        style="width: 7rem"
        data-testid="ex-price"
      />
      {{ t.exchange.qty }}
      <input
        v-model.number="qty"
        type="number"
        min="1"
        :max="me?.maxQty ?? 999"
        class="form-control form-control-sm"
        style="width: 5rem"
        data-testid="ex-qty"
      />
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="busy || !valid || !!blocked"
        data-testid="ex-submit"
        @click="submit"
      >
        {{ side === 'buy' ? t.exchange.placeBuy : t.exchange.placeSell }}
      </button>
    </div>
    <div class="small text-muted mt-1" data-testid="ex-estimate">{{ estimate }}</div>
    <div v-if="overSystem !== null" class="small text-warning mt-1" data-testid="ex-over-sys">
      {{ t.exchange.overSystem(overSystem) }}
    </div>
    <div v-if="blocked" class="small text-danger mt-1">{{ blocked }}</div>
  </div>

  <template v-if="me">
    <h6 class="dt-section">{{ t.exchange.account }}</h6>
    <div class="dt-card mb-3 d-flex flex-wrap align-items-center gap-2 small" data-testid="ex-wallet">
      <span>{{ t.exchange.coin(formatNum(me.wallet.coin)) }}</span>
      <span v-for="f in me.wallet.foods" :key="f.foodsId">{{ catalog.foodName(f.foodsId) }}×{{ f.num }}</span>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary ms-auto"
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
    <div v-if="readyHolds.length > 0" class="small text-success mb-1" data-testid="ex-holds-ready">
      {{ t.exchange.holdsReady(holdText(readyHolds)) }}
    </div>
    <div v-if="pendingHolds.length > 0" class="small text-muted mb-3" data-testid="ex-holds">
      {{ t.exchange.holdsPending(holdText(pendingHolds), timeLeft(pendingHolds[0]!.releaseAt)) }}
    </div>
    <h6 class="dt-section">{{ t.exchange.myOrders }}</h6>
    <div v-if="me.orders.length === 0" class="small text-muted mb-3">{{ t.exchange.noOrders }}</div>
    <div v-for="o in me.orders" :key="o.id" class="d-flex align-items-center gap-2 small border-bottom py-1">
      <span :class="o.side === 'buy' ? 'text-success' : 'text-danger'">{{
        o.side === 'buy' ? t.exchange.bid : t.exchange.ask
      }}</span>
      <span class="flex-fill">{{
        t.exchange.orderLine(catalog.foodName(o.foodsId), formatNum(o.price), o.qty, o.filled)
      }}</span>
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="busy"
        :data-testid="`ex-cancel-${o.id}`"
        @click="cancel(o.id)"
      >
        {{ t.exchange.cancel }}
      </button>
    </div>
    <h6 class="dt-section mt-3">{{ t.exchange.trades }}</h6>
    <div v-if="me.trades.length === 0" class="small text-muted">{{ t.exchange.noTrades }}</div>
    <div v-for="(x, i) in me.trades" :key="i" class="small border-bottom py-1">
      {{ t.exchange.tradeLine(x.side === 'buy', catalog.foodName(x.foodsId), formatNum(x.price), x.qty) }}
      <span v-if="x.system" class="text-primary">{{ t.exchange.system }}</span>
      <span v-if="x.fee > 0" class="text-muted">{{ t.exchange.fee(formatNum(x.fee)) }}</span>
    </div>
  </template>
</template>
