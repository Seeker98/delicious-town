<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { AcquireBriefDto, AcquireHoldingDto, AcquireInvestRowDto, AcquireViewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { acquireReason, errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { sellerGets } from '../utils/acquire';
import { formatNum, formatPct } from '../utils/format';
import { remainText } from '../utils/remain';

/** 收购（问题记录 421，设计 §1.5）：身价榜、在售、投资榜、我的 */
type Tab = 'price' | 'market' | 'invest' | 'mine';
const TABS: Tab[] = ['price', 'market', 'invest', 'mine'];
const route = useRoute();
const router = useRouter();
const t = useT();
const toast = useToastStore();
const session = useSessionStore();
const me = computed(() => session.me?.restaurantId ?? null);

const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'price');
const view = ref<AcquireViewDto | null>(null);
const price = ref<AcquireBriefDto[]>([]);
const invest = ref<AcquireInvestRowDto[]>([]);
const market = ref<AcquireBriefDto[]>([]);
const loaded = ref(false);
const busy = ref(false);
/** 名下每家店挂牌时选的折扣 */
const rates = ref<Record<number, number>>({});

const coin = (n: number) => formatNum(n);
const pct = (x: number) => formatPct(x, { digits: 0 });
/** 热度最多两位小数，小数点按语言（法文、西文写逗号） */
const heat = (h: number) => formatNum(Number(h.toFixed(2)));

async function load() {
  try {
    if (tab.value === 'price') price.value = (await endpoints.acquireRank('price')).price;
    else if (tab.value === 'invest') invest.value = (await endpoints.acquireRank('invest')).invest;
    else if (tab.value === 'market') market.value = (await endpoints.acquireMarket()).items;
    // “我的”之外也要知道规则数、我是不是被收购了（身价榜、在售的按钮用）
    if (tab.value === 'mine' || !view.value) view.value = await endpoints.acquire();
    loaded.value = true;
  } catch (e) {
    toast.push(errorMessage(e, t.value.acquire.loadFailed), 'danger');
  }
}

async function run<T>(fn: () => Promise<T>, done: (v: T) => string) {
  if (busy.value) return;
  busy.value = true;
  try {
    toast.push(done(await fn()));
  } catch (e) {
    toast.push(errorMessage(e, t.value.acquire.failed), 'danger');
  } finally {
    busy.value = false;
    // 成功、失败都重读：价格、老板、挂牌可能都变了
    view.value = null;
    await load();
  }
}

/** 收购或买下：先读这家店现在能不能买（身价榜不逐行算原因，计划裁定 1），能买再确认 */
async function buy(restId: number, way: 'acquire' | 'listed') {
  if (busy.value) return;
  let r;
  try {
    r = await endpoints.acquireRest(restId);
  } catch (e) {
    toast.push(errorMessage(e, t.value.acquire.loadFailed), 'danger');
    return;
  }
  const block = way === 'acquire' ? r.acquireBlock : r.listedBlock;
  if (block) {
    toast.push(acquireReason(block), 'danger');
    return;
  }
  const cost = way === 'acquire' ? r.price : (r.listed?.price ?? r.price);
  const got = sellerGets(cost, r.taxRate);
  const seller = r.owner?.name ?? r.name;
  const a = t.value.acquire;
  const ask = way === 'acquire' ? a.confirmAcquire : a.confirmListed;
  if (!window.confirm(ask(r.name, coin(cost), seller, coin(got), coin(cost - got)))) return;
  await run(
    () => endpoints.acquireBuy(restId, way, cost),
    () => a.bought(r.name),
  );
}

function tend() {
  return run(
    () => endpoints.acquireTend(),
    (v) => t.value.acquire.tendDone(v.foods.reduce((s, f) => s + f.num, 0)),
  );
}

function redeem() {
  const v = view.value;
  if (!v?.me.owner) return;
  const got = sellerGets(v.me.price, v.taxRate);
  const a = t.value.acquire;
  if (
    !window.confirm(
      a.confirmRedeem(coin(v.me.price), v.me.owner.name, coin(got), coin(v.me.price - got), v.protectDays),
    )
  )
    return;
  return run(
    () => endpoints.acquireRedeem(v.me.price),
    () => a.redeemed,
  );
}

/** 挂牌可选的折扣：listMinRate ~ 100%，5% 一档 */
const rateOptions = computed(() => {
  const min = view.value?.listMinRate ?? 0.5;
  const out: number[] = [];
  for (let k = 20; k >= Math.round(min * 20); k--) out.push(k / 20);
  return out;
});
const rateOf = (h: AcquireHoldingDto) => rates.value[h.restId] ?? 1;

function list(h: AcquireHoldingDto) {
  const v = view.value;
  if (!v) return;
  const rate = rateOf(h);
  const cost = Math.round(h.price * rate);
  const a = t.value.acquire;
  if (
    !window.confirm(
      a.confirmList(h.name, pct(rate), coin(cost), coin(sellerGets(cost, v.taxRate)), v.listDays),
    )
  )
    return;
  return run(
    () => endpoints.acquireList(h.restId, rate),
    () => a.listDone(h.name),
  );
}
function unlist(h: AcquireHoldingDto) {
  return run(
    () => endpoints.acquireUnlist(h.restId),
    () => t.value.acquire.unlistDone(h.name),
  );
}
function release(h: AcquireHoldingDto) {
  const a = t.value.acquire;
  if (!window.confirm(a.confirmRelease(h.name))) return;
  return run(
    () => endpoints.acquireRelease(h.restId),
    () => a.releaseDone(h.name),
  );
}

/** 身价榜、在售里要不要给按钮：自己的、自己名下的不给 */
const canTry = (b: AcquireBriefDto) => b.restId !== me.value && b.owner?.restId !== me.value;

function pick(x: Tab) {
  tab.value = x;
  void router.replace({ query: { ...route.query, tab: x } });
}
// 切标签时先回到“读取中”：新数据回来之前不显示上一个标签留下的“没有数据”
watch(tab, () => {
  loaded.value = false;
  void load();
});
onMounted(load);
</script>

<template>
  <div>
    <h5 class="mb-2">{{ t.acquire.title }}</h5>
    <ul class="nav nav-tabs mb-2">
      <li v-for="x in TABS" :key="x" class="nav-item">
        <a
          :class="['nav-link', { active: tab === x }]"
          href="#"
          :data-testid="`acquire-tab-${x}`"
          @click.prevent="pick(x)"
          >{{ t.acquire.tabs[x] }}</a
        >
      </li>
    </ul>

    <template v-if="tab === 'price'">
      <div v-if="loaded && price.length === 0" class="dt-empty">{{ t.acquire.rankEmpty }}</div>
      <div v-for="(b, i) in price" :key="b.restId" class="dt-item" :data-testid="`acquire-price-${b.restId}`">
        <div class="dt-item-main">
          <div class="dt-item-title">
            {{ i + 1 }}. <RouterLink :to="`/friends/${b.restId}`">{{ b.name }}</RouterLink>
          </div>
          <div class="small">{{ t.acquire.price(coin(b.price)) }} · {{ t.acquire.heat(heat(b.heat)) }}</div>
          <div class="small text-muted">{{ b.owner ? t.acquire.owner(b.owner.name) : t.acquire.free }}</div>
        </div>
        <div v-if="canTry(b)" class="dt-item-actions">
          <button
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`acquire-buy-${b.restId}`"
            @click="buy(b.restId, 'acquire')"
          >
            {{ t.acquire.acquire }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'market'">
      <div v-if="loaded && market.length === 0" class="dt-empty">{{ t.acquire.marketEmpty }}</div>
      <div v-for="b in market" :key="b.restId" class="dt-item" :data-testid="`acquire-market-${b.restId}`">
        <div class="dt-item-main">
          <div class="dt-item-title">
            <RouterLink :to="`/friends/${b.restId}`">{{ b.name }}</RouterLink>
          </div>
          <div class="small text-muted">{{ b.owner ? t.acquire.owner(b.owner.name) : t.acquire.free }}</div>
          <div v-if="b.listed" class="small">
            {{ t.acquire.listed(pct(b.listed.rate), coin(b.listed.price), remainText(b.listed.until)) }}
          </div>
        </div>
        <div v-if="canTry(b)" class="dt-item-actions">
          <button
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`acquire-listed-${b.restId}`"
            @click="buy(b.restId, 'listed')"
          >
            {{ t.acquire.buyListed }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'invest'">
      <div v-if="loaded && invest.length === 0" class="dt-empty">{{ t.acquire.investEmpty }}</div>
      <div
        v-for="(r, i) in invest"
        :key="r.restId"
        class="dt-item"
        :data-testid="`acquire-invest-${r.restId}`"
      >
        <div class="dt-item-main">
          <div class="dt-item-title">
            {{ i + 1 }}. <RouterLink :to="`/friends/${r.restId}`">{{ r.name }}</RouterLink>
          </div>
          <div class="small">
            {{ t.acquire.colHoldings(r.holdings) }} · {{ t.acquire.colValue(coin(r.value)) }}
          </div>
          <div class="small text-muted">{{ t.acquire.colDividend(coin(r.dividendTotal)) }}</div>
        </div>
      </div>
    </template>

    <template v-else-if="view">
      <p class="small text-muted mb-2" data-testid="acquire-rule">
        {{
          t.acquire.rule(
            pct(1 - view.taxRate),
            pct(view.taxRate),
            view.maxHoldings,
            pct(view.dividendRate),
            pct(view.tendBonus),
            view.protectDays,
          )
        }}
      </p>
      <div class="border rounded p-2 mb-3" data-testid="acquire-me">
        <div class="fw-bold small">{{ t.acquire.myPrice }}</div>
        <div class="small">
          {{ t.acquire.price(coin(view.me.price)) }} · {{ t.acquire.heat(heat(view.me.heat)) }}
        </div>
        <div class="small">
          {{ view.me.owner ? t.acquire.ownedBy(view.me.owner.name) : t.acquire.independent }}
        </div>
        <div v-if="view.me.protectedUntil" class="small text-muted">
          {{ t.acquire.protectedLeft(remainText(view.me.protectedUntil)) }}
        </div>
        <div v-if="view.me.owner" class="d-flex flex-wrap gap-1 mt-2">
          <button
            class="btn btn-sm btn-success"
            :disabled="busy || view.tendedToday"
            data-testid="acquire-tend"
            @click="tend"
          >
            {{ view.tendedToday ? t.acquire.tendedToday : t.acquire.tend(view.tendFoods) }}
          </button>
          <button
            class="btn btn-sm btn-outline-primary"
            :disabled="busy"
            data-testid="acquire-redeem"
            @click="redeem"
          >
            {{ t.acquire.redeem(coin(view.me.price)) }}
          </button>
        </div>
      </div>

      <div class="fw-bold small mb-1">{{ t.acquire.holdings(view.holdings.length, view.maxHoldings) }}</div>
      <div v-if="view.me.owner" class="small text-muted mb-1">{{ t.acquire.ownedNoBuy }}</div>
      <div v-if="view.holdings.length === 0" class="dt-empty">{{ t.acquire.holdingsEmpty }}</div>
      <div
        v-for="h in view.holdings"
        :key="h.restId"
        class="dt-item"
        :data-testid="`acquire-hold-${h.restId}`"
      >
        <div class="dt-item-main">
          <div class="dt-item-title">
            <RouterLink :to="`/friends/${h.restId}`">{{ h.name }}</RouterLink>
          </div>
          <div class="small">{{ t.acquire.price(coin(h.price)) }} · {{ t.acquire.heat(heat(h.heat)) }}</div>
          <div class="small text-muted">
            {{
              h.dividend ? t.acquire.dividend(coin(h.dividend.coin), h.dividend.tended) : t.acquire.noDividend
            }}
            · {{ h.tendedToday ? t.acquire.holdTended : t.acquire.holdNotTended }}
          </div>
          <div v-if="h.listed" class="small">
            {{ t.acquire.listed(pct(h.listed.rate), coin(h.listed.price), remainText(h.listed.until)) }}
          </div>
          <div class="d-flex flex-wrap align-items-center gap-1 mt-1">
            <template v-if="h.listed">
              <button
                class="btn btn-sm btn-outline-secondary"
                :disabled="busy"
                :data-testid="`acquire-unlist-${h.restId}`"
                @click="unlist(h)"
              >
                {{ t.acquire.unlist }}
              </button>
            </template>
            <template v-else>
              <select
                class="form-select form-select-sm w-auto"
                :value="rateOf(h)"
                :data-testid="`acquire-rate-${h.restId}`"
                @change="rates[h.restId] = Number(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="r in rateOptions" :key="r" :value="r">
                  {{ t.acquire.rateOption(pct(r), coin(Math.round(h.price * r))) }}
                </option>
              </select>
              <button
                class="btn btn-sm btn-outline-primary"
                :disabled="busy"
                :data-testid="`acquire-list-${h.restId}`"
                @click="list(h)"
              >
                {{ t.acquire.list }}
              </button>
            </template>
            <button
              class="btn btn-sm btn-outline-danger"
              :disabled="busy"
              :data-testid="`acquire-release-${h.restId}`"
              @click="release(h)"
            >
              {{ t.acquire.release }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
