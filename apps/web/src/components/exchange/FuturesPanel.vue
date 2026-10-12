<script setup lang="ts">
import JobCardNote from '../JobCardNote.vue';
import { computed, onMounted, ref } from 'vue';
import type { FuturesContractDto, FuturesDto, FuturesFoodDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtArt from '../DtArt.vue';
import DtEmpty from '../DtEmpty.vue';
import DtSheet from '../DtSheet.vue';
import DtStepper from '../DtStepper.vue';
import FoodArt from '../FoodArt.vue';
import { useConfirmStore } from '../../stores/confirm';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { timeLeft } from '../../utils/activity';
import { formatNum } from '../../utils/format';
import { matchText } from '../../utils/match';
import { newsTime } from '../../utils/news';
import { serverNowMs } from '../../utils/serverNow';

/**
 * 交易所的期货标签（期货设计 §10）：点名订食材、我的期货单。
 * 界面改版 P8：上面一张卡片放今天的额度、我的期货单、怎么算；食材一行一种，点价格弹出下单面板
 */
const catalog = useCatalogStore();
const confirm = useConfirmStore();
/** 点开的面板：下单（selected）、我的期货单、怎么算 */
const panel = ref<'mine' | 'help' | null>(null);
const toast = useToastStore();
const t = useT();
const data = ref<FuturesDto | null>(null);
/** 本街还要几个（和橱柜同一口径），“本街要的”筛选用；读不到就当没有 */
const streetNeed = ref(new Map<number, number>());
const FILTERS = ['all', 'rare', 'normal', 'street'] as const;
const filter = ref<(typeof FILTERS)[number]>('all');
const search = ref('');
const selected = ref<number | null>(null);
const qty = ref(1);
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
/** 份数：步进器夹在 1 和最多能订之间；一份都订不了时为 0，下单按钮不能点（终审：原来按 1 份下单） */
const n = computed(() => (maxQty.value < 1 ? 0 : Math.min(maxQty.value, Math.max(1, Math.floor(qty.value)))));
/** 进行中的期货单：第一张写在上面卡片的副行 */
const openOnes = computed(() => data.value?.contracts.filter((c) => c.status === 'open') ?? []);
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
    selected.value = null;
  } catch (e) {
    toast.push(errorMessage(e, t.value.futures.orderFailed), 'danger');
  } finally {
    busy.value = false;
  }
  // 成功或失败（价格变了、额度变了）都重读一次
  await load();
}

async function cancel(c: FuturesContractDto) {
  if (busy.value) return;
  const yes = await confirm.ask({
    title: t.value.futures.cancelConfirm(formatNum(c.deposit)),
    ok: t.value.futures.cancel,
    danger: true,
  });
  if (!yes) return;
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
    <div v-if="!data.enabled" class="dt-act-note" data-testid="fu-off">{{ t.futures.off }}</div>
    <div v-else-if="blockedText" class="dt-act-note is-warn" data-testid="fu-blocked">{{ blockedText }}</div>
    <JobCardNote v-if="data.card" :card="data.card" />
    <div class="dt-card dt-rows-card">
      <div v-if="data.enabled" class="dt-row" data-testid="fu-person">
        <span class="dt-row-main">
          <span class="dt-quota-head"
            ><span class="dt-row-title">{{ t.futures.quotaTitle }}</span
            ><span class="dt-quota-num"
              ><b>{{ data.personLeft }}</b> / {{ t.futures.quotaUnit(data.personDaily) }}</span
            ></span
          >
          <span class="dt-meter mt-2"
            ><i :style="{ width: `${(data.personLeft / Math.max(1, data.personDaily)) * 100}%` }"></i
          ></span>
        </span>
      </div>
      <button type="button" class="dt-row is-link" data-testid="fu-mine-open" @click="panel = 'mine'">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.futures.mine }}</span
          ><span v-if="openOnes[0]" class="dt-row-sub"
            >{{
              t.futures.line(
                catalog.foodName(openOnes[0].foodsId),
                openOnes[0].qty,
                formatNum(openOnes[0].unitPrice),
              )
            }}
            · {{ t.futures.openLine(timeLeft(openOnes[0].dueAt), formatNum(openOnes[0].balance)) }}</span
          ></span
        >
        <span class="dt-row-value">{{ openOnes.length }}</span>
      </button>
      <button type="button" class="dt-row is-link" data-testid="fu-help" @click="panel = 'help'">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.futures.helpTitle }}</span
          ><span class="dt-row-sub">{{ t.futures.intro }}</span></span
        >
      </button>
    </div>
    <template v-if="data.enabled">
      <input
        v-model="search"
        type="search"
        class="form-control dt-search"
        :placeholder="t.futures.search"
        :aria-label="t.futures.search"
        data-testid="fu-search"
      />
      <div class="dt-pills" role="group" :aria-label="t.exchange.filterLabel">
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
      <div data-testid="fu-foods">
        <DtEmpty v-if="groups.length === 0" :title="t.futures.empty" />
        <section v-for="[lv, list] in groups" :key="lv" class="dt-block">
          <div class="dt-block-head">
            <h2 class="dt-block-title">{{ t.futures.level(lv) }}</h2>
          </div>
          <div class="dt-card dt-rows-card">
            <div v-for="f in list" :key="f.foodsId" class="dt-row">
              <span class="dt-row-ico"><FoodArt :id="f.foodsId" :size="28" /></span>
              <span class="dt-row-main">
                <span class="dt-row-title is-strong">{{ catalog.foodName(f.foodsId) }}</span>
                <span class="dt-row-sub"
                  ><span v-if="f.left === 0" class="dt-tag-mute">{{ t.futures.soldOut }}</span
                  ><template v-else>{{ t.futures.leftLine(f.left) }}</template></span
                >
              </span>
              <button
                type="button"
                class="dt-price-btn"
                :disabled="f.left === 0"
                :aria-label="t.futures.sheetTitle(catalog.foodName(f.foodsId))"
                :data-testid="`fu-food-${f.foodsId}`"
                @click="choose(f)"
              >
                <DtArt name="res-coin-silver" :size="16" />{{ formatNum(f.unitPrice) }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </template>

    <DtSheet
      :open="!!pick"
      :title="pick ? t.futures.sheetTitle(catalog.foodName(pick.foodsId)) : ''"
      @close="selected = null"
    >
      <div v-if="pick" data-testid="fu-order-box">
        <div class="dt-detail-head">
          <span class="dt-detail-art"><FoodArt :id="pick.foodsId" :size="52" /></span>
          <div class="dt-detail-info">
            <div>{{ t.futures.level(pick.level) }}</div>
            <div class="dt-detail-sub">{{ t.futures.lockLine(formatNum(pick.unitPrice), pick.left) }}</div>
          </div>
        </div>
        <div class="dt-detail-qty">
          <span class="flex-fill">{{ t.futures.qty }}</span>
          <button
            v-if="maxQty > 1"
            type="button"
            class="dt-choice"
            :aria-pressed="n === maxQty"
            data-testid="fu-max"
            @click="qty = maxQty"
          >
            {{ t.exchange.max(maxQty) }}
          </button>
          <DtStepper
            v-model="qty"
            :min="1"
            :max="Math.max(1, maxQty)"
            :disabled="maxQty < 1"
            testid="fu-qty"
          />
        </div>
        <dl class="dt-sum">
          <div>
            <dt>{{ t.futures.sumTotal }}</dt>
            <dd>{{ formatNum(total) }}</dd>
          </div>
          <div>
            <dt>{{ t.futures.sumDeposit }}</dt>
            <dd>
              <b>{{ formatNum(deposit) }}</b>
            </dd>
          </div>
          <div>
            <dt>{{ t.futures.sumBalance }}</dt>
            <dd>{{ formatNum(total - deposit) }}</dd>
          </div>
          <div>
            <dt>{{ t.futures.sumDue }}</dt>
            <dd>{{ dueAt }}</dd>
          </div>
        </dl>
        <div class="dt-act-note is-warn mt-3 mb-0">{{ t.futures.warn }}</div>
        <div v-if="blockedText" class="dt-detail-note text-danger">{{ blockedText }}</div>
      </div>
      <template v-if="pick" #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="selected = null">{{ t.common.cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || !canOrder || n < 1"
            data-testid="fu-order"
            @click="order"
          >
            {{ t.futures.order }}
          </button>
        </div>
      </template>
    </DtSheet>

    <DtSheet :open="panel === 'mine'" :title="t.futures.mine" @close="panel = null">
      <div data-testid="fu-mine">
        <div v-if="data.contracts.length === 0" class="dt-detail-note">{{ t.futures.none }}</div>
        <div v-else class="dt-sheet-list">
          <div
            v-for="c in data.contracts"
            :key="c.id"
            class="dt-row dt-row-wrap"
            :data-testid="`fu-c-${c.id}`"
          >
            <span class="dt-row-main">
              <span class="dt-row-title">{{
                t.futures.line(catalog.foodName(c.foodsId), c.qty, formatNum(c.unitPrice))
              }}</span>
              <span v-if="c.status === 'open'" class="dt-row-sub">{{
                t.futures.openLine(timeLeft(c.dueAt), formatNum(c.balance))
              }}</span>
              <span
                v-else
                :class="['dt-row-sub', c.status === 'delivered' ? 'text-success' : 'text-danger']"
                >{{ result(c) }}</span
              >
            </span>
            <button
              v-if="c.status === 'open'"
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="busy"
              :data-testid="`fu-cancel-${c.id}`"
              @click="cancel(c)"
            >
              {{ t.futures.cancel }}
            </button>
          </div>
        </div>
      </div>
    </DtSheet>

    <DtSheet :open="panel === 'help'" :title="t.futures.helpTitle" @close="panel = null">
      <div class="dt-help">
        <p>{{ t.futures.intro }}</p>
        <ul>
          <li
            v-for="(x, i) in t.futures.help(data.deliverHours, Math.round(data.depositRate * 100))"
            :key="i"
          >
            {{ x }}
          </li>
        </ul>
      </div>
    </DtSheet>
  </div>
</template>
