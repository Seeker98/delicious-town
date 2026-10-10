<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { FuturesContractDto, FuturesDto, FuturesFoodDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { timeLeft } from '../../utils/activity';
import { formatNum } from '../../utils/format';
import { matchText } from '../../utils/match';
import { newsTime } from '../../utils/news';
import { serverNowMs } from '../../utils/serverNow';

/** 交易所的期货标签（期货设计 §10）：点名订食材、我的期货单 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<FuturesDto | null>(null);
/** 本街还要几个（和橱柜同一口径），“本街要的”筛选用；读不到就当没有 */
const streetNeed = ref(new Map<number, number>());
const FILTERS = ['all', 'rare', 'normal', 'street'] as const;
const filter = ref<(typeof FILTERS)[number]>('all');
const search = ref('');
const selected = ref<number | null>(null);
const qty = ref<number | ''>(1);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.futures();
  } catch (e) {
    toast.push(errorMessage(e, t.value.futures.loadFailed), 'danger');
  }
}
onMounted(async () => {
  await load();
  try {
    const c = await endpoints.cupboard();
    streetNeed.value = new Map(c.items.filter((x) => x.streetNeed > 0).map((x) => [x.foodsId, x.streetNeed]));
  } catch {
    // 只影响“本街要的”筛选
  }
});

const canOrder = computed(() => !!data.value?.enabled && data.value.blocked === null);
const blockedText = computed(() => {
  const d = data.value;
  if (!d?.blocked) return '';
  const b = t.value.futures.blocked;
  if (d.blocked === 'exchange_level') return b.exchange_level(d.needLevel);
  if (d.blocked === 'exchange_age') return b.exchange_age(d.needDays);
  return b[d.blocked];
});
const shown = computed(() =>
  (data.value?.foods ?? []).filter((f) => {
    if (filter.value === 'rare' && !f.rare) return false;
    if (filter.value === 'normal' && f.rare) return false;
    if (filter.value === 'street' && !streetNeed.value.has(f.foodsId)) return false;
    return matchText(catalog.foodName(f.foodsId), search.value.trim());
  }),
);
const groups = computed(() => {
  const m = new Map<number, FuturesFoodDto[]>();
  for (const f of shown.value) m.set(f.level, [...(m.get(f.level) ?? []), f]);
  return [...m.entries()].sort(([a], [b]) => a - b);
});
const pick = computed(() => data.value?.foods.find((f) => f.foodsId === selected.value) ?? null);
const maxQty = computed(() => Math.max(0, Math.min(pick.value?.left ?? 0, data.value?.personLeft ?? 0)));
/** 份数：输入框里的整数；填 0、清空、不是整数时为 0，下单按钮不能点（终审：原来按 1 份下单） */
const n = computed(() => {
  const v = Number(qty.value);
  return qty.value !== '' && Number.isInteger(v) && v >= 1 ? v : 0;
});
const total = computed(() => (pick.value ? pick.value.unitPrice * n.value : 0));
const deposit = computed(() =>
  Math.ceil(Math.round(total.value * (data.value?.depositRate ?? 0) * 1e6) / 1e6),
);
const dueAt = computed(() =>
  newsTime(new Date(serverNowMs() + (data.value?.deliverHours ?? 0) * 3_600_000).toISOString()),
);

function choose(f: FuturesFoodDto) {
  selected.value = f.foodsId;
  qty.value = 1;
}

async function order() {
  const f = pick.value;
  if (!f || busy.value) return;
  busy.value = true;
  try {
    await endpoints.futuresOrder({ foodsId: f.foodsId, qty: n.value, unitPrice: f.unitPrice });
    toast.push(t.value.futures.ordered, 'success');
  } catch (e) {
    toast.push(errorMessage(e, t.value.futures.orderFailed), 'danger');
  } finally {
    busy.value = false;
  }
  // 成功或失败（价格变了、额度变了）都重读一次
  await load();
}

async function cancel(c: FuturesContractDto) {
  if (busy.value || !window.confirm(t.value.futures.cancelConfirm(formatNum(c.deposit)))) return;
  busy.value = true;
  try {
    await endpoints.futuresCancel(c.id);
    toast.push(t.value.futures.cancelDone, 'success');
  } catch (e) {
    toast.push(errorMessage(e, t.value.futures.cancelFailed), 'danger');
  } finally {
    busy.value = false;
  }
  await load();
}

function result(c: FuturesContractDto): string {
  const x = t.value.futures;
  if (c.status === 'delivered') return x.delivered(c.toWallet);
  if (c.status === 'defaulted') return x.defaulted(formatNum(c.deposit));
  return x.cancelled;
}
</script>

<template>
  <div v-if="data">
    <div class="small text-muted mb-2">{{ t.futures.intro }}</div>
    <details class="small text-muted mb-2" data-testid="fu-help">
      <summary>{{ t.futures.helpTitle }}</summary>
      <ul class="mb-0 ps-3">
        <li v-for="(x, i) in t.futures.help(data.deliverHours, Math.round(data.depositRate * 100))" :key="i">
          {{ x }}
        </li>
      </ul>
    </details>
    <div v-if="!data.enabled" class="alert alert-secondary py-1 small" data-testid="fu-off">
      {{ t.futures.off }}
    </div>
    <template v-else>
      <div v-if="blockedText" class="alert alert-warning py-1 small" data-testid="fu-blocked">
        {{ blockedText }}
      </div>
      <div class="small fw-bold mb-1" data-testid="fu-person">
        {{ t.futures.personLeft(data.personLeft, data.personDaily) }}
      </div>
      <input
        v-model="search"
        class="form-control form-control-sm mb-2"
        :placeholder="t.futures.search"
        data-testid="fu-search"
      />
      <div class="dt-pills mb-2 small">
        <button
          v-for="x in FILTERS"
          :key="x"
          type="button"
          :class="{ active: filter === x }"
          :aria-pressed="filter === x"
          :data-testid="`fu-filter-${x}`"
          @click="filter = x"
        >
          {{ t.futures.filters[x] }}
        </button>
      </div>
      <div class="dt-card mb-2" style="max-height: 16rem; overflow-y: auto" data-testid="fu-foods">
        <div v-if="groups.length === 0" class="small text-muted">{{ t.futures.empty }}</div>
        <div v-for="[lv, list] in groups" :key="lv" class="mb-1">
          <div class="dt-group-label">{{ t.futures.level(lv) }}</div>
          <!-- 一行两个：185 种一个一行太长 -->
          <div class="row g-1">
            <div v-for="f in list" :key="f.foodsId" class="col-6">
              <button
                type="button"
                :class="[
                  'btn btn-sm w-100 h-100 text-start',
                  f.foodsId === selected ? 'btn-primary' : 'btn-outline-secondary',
                ]"
                :disabled="f.left === 0"
                :data-testid="`fu-food-${f.foodsId}`"
                @click="choose(f)"
              >
                <span class="fw-bold">{{ catalog.foodName(f.foodsId) }}</span>
                <span class="d-block small">{{
                  f.left === 0 ? t.futures.soldOut : t.futures.foodLine(formatNum(f.unitPrice), f.left)
                }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="pick" class="dt-card mb-3 small" data-testid="fu-order-box">
        <div class="fw-bold mb-1">{{ catalog.foodName(pick.foodsId) }}</div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <label class="text-nowrap" for="fu-qty">{{ t.futures.qty }}</label>
          <input
            id="fu-qty"
            v-model.number="qty"
            type="number"
            min="1"
            :max="maxQty"
            class="form-control form-control-sm"
            style="width: 6rem"
            data-testid="fu-qty"
          />
        </div>
        <div>
          {{ t.futures.total(formatNum(total)) }} · {{ t.futures.deposit(formatNum(deposit)) }} ·
          {{ t.futures.balance(formatNum(total - deposit)) }}
        </div>
        <div class="text-muted">{{ t.futures.dueAt(dueAt) }}</div>
        <div class="text-danger my-1">{{ t.futures.warn }}</div>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy || !canOrder || n < 1 || n > maxQty"
          data-testid="fu-order"
          @click="order"
        >
          {{ t.futures.order }}
        </button>
      </div>
    </template>

    <h6 class="dt-section">{{ t.futures.mine }}</h6>
    <div v-if="data.contracts.length === 0" class="small text-muted">{{ t.futures.none }}</div>
    <div
      v-for="c in data.contracts"
      :key="c.id"
      class="d-flex align-items-center gap-2 small border-bottom py-1"
      :data-testid="`fu-c-${c.id}`"
    >
      <span class="flex-fill">
        {{ t.futures.line(catalog.foodName(c.foodsId), c.qty, formatNum(c.unitPrice)) }}
        <span v-if="c.status === 'open'" class="d-block text-muted">{{
          t.futures.openLine(timeLeft(c.dueAt), formatNum(c.balance))
        }}</span>
        <span v-else :class="['d-block', c.status === 'delivered' ? 'text-success' : 'text-danger']">{{
          result(c)
        }}</span>
      </span>
      <button
        v-if="c.status === 'open'"
        type="button"
        class="dt-link-btn text-danger"
        :disabled="busy"
        :data-testid="`fu-cancel-${c.id}`"
        @click="cancel(c)"
      >
        {{ t.futures.cancel }}
      </button>
    </div>
  </div>
</template>
