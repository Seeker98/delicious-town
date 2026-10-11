<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type {
  AcquireBriefDto,
  AcquireHoldingDto,
  AcquireInvestRowDto,
  AcquireRestDto,
  AcquireViewDto,
} from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtRow from '../components/DtRow.vue';
import DtSheet from '../components/DtSheet.vue';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { acquireReason, errorMessage } from '../i18n/zh-CN';
import { useConfirmStore } from '../stores/confirm';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { sellerGets } from '../utils/acquire';
import { formatNum, formatPct } from '../utils/format';
import { remainText } from '../utils/remain';

/**
 * 收购（问题记录 421，设计 §1.5）：身价榜、在售、投资榜、我的。
 * 界面改版 P8：榜单一行整行可点，点开从下面弹出这家店（谁得多少、税多少），收购在面板里；
 * 名下的店同样点开面板挂牌、撤牌、放手；长规则收进“收购规则”一行
 */
type Tab = 'price' | 'market' | 'invest' | 'mine';
const TABS: Tab[] = ['price', 'market', 'invest', 'mine'];
const t = useT();
const toast = useToastStore();
const confirm = useConfirmStore();
const session = useSessionStore();
const me = computed(() => session.me?.restaurantId ?? null);

/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.acquire.tabs[k] })));
const view = ref<AcquireViewDto | null>(null);
const price = ref<AcquireBriefDto[]>([]);
const invest = ref<AcquireInvestRowDto[]>([]);
const market = ref<AcquireBriefDto[]>([]);
const loaded = ref(false);
const busy = ref(false);

const coin = (n: number) => formatNum(n);
const pct = (x: number) => formatPct(x, { digits: 0 });
/** 热度最多两位小数，小数点按语言（法文、西文写逗号） */
const heat = (h: number) => formatNum(Number(h.toFixed(2)));
const priceLine = (b: AcquireBriefDto) =>
  `${t.value.acquire.price(coin(b.price))} · ${t.value.acquire.heat(heat(b.heat))}`;

async function load() {
  // “我的”之外也要知道规则数、我是不是被收购了（身价榜、在售的面板用）；和榜单一起读（性能排查 2026-10-08）
  const mine = tab.value === 'mine' || !view.value ? endpoints.acquire() : null;
  // 先挂上处理：榜单读失败提前跳出时，这个的失败不成为没人接的 rejection
  mine?.catch(() => undefined);
  try {
    if (tab.value === 'price') price.value = (await endpoints.acquireRank('price')).price;
    else if (tab.value === 'invest') invest.value = (await endpoints.acquireRank('invest')).invest;
    else if (tab.value === 'market') market.value = (await endpoints.acquireMarket()).items;
    if (mine) view.value = await mine;
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
    closeAll();
  } catch (e) {
    toast.push(errorMessage(e, t.value.acquire.failed), 'danger');
  } finally {
    busy.value = false;
    // 成功、失败都重读：价格、老板、挂牌可能都变了
    view.value = null;
    await load();
  }
}

/** 身价榜、在售点开的那家：先读这家店现在能不能买（身价榜不逐行算原因，计划裁定 1） */
const target = ref<{ brief: AcquireBriefDto; way: 'acquire' | 'listed'; rest: AcquireRestDto | null } | null>(
  null,
);
async function openTarget(b: AcquireBriefDto, way: 'acquire' | 'listed') {
  target.value = { brief: b, way, rest: null };
  if (!canTry(b)) return;
  try {
    const r = await endpoints.acquireRest(b.restId);
    if (target.value?.brief.restId === b.restId) target.value = { ...target.value, rest: r };
  } catch (e) {
    toast.push(errorMessage(e, t.value.acquire.loadFailed), 'danger');
  }
}
const targetCost = computed(() => {
  const x = target.value;
  if (!x?.rest) return 0;
  return x.way === 'acquire' ? x.rest.price : (x.rest.listed?.price ?? x.rest.price);
});
const targetBlock = computed(() => {
  const r = target.value?.rest;
  if (!r) return null;
  return target.value!.way === 'acquire' ? r.acquireBlock : r.listedBlock;
});
function buy() {
  const x = target.value;
  if (!x?.rest || targetBlock.value) return;
  const r = x.rest;
  const cost = targetCost.value;
  return run(
    () => endpoints.acquireBuy(r.restId, x.way, cost),
    () => t.value.acquire.bought(r.name),
  );
}

function tend() {
  return run(
    () => endpoints.acquireTend(),
    (v) => t.value.acquire.tendDone(v.foods.reduce((s, f) => s + f.num, 0)),
  );
}

async function redeem() {
  const v = view.value;
  if (!v?.me.owner) return;
  const got = sellerGets(v.me.price, v.taxRate);
  const a = t.value.acquire;
  const [title = '', ...body] = a
    .confirmRedeem(coin(v.me.price), v.me.owner.name, coin(got), coin(v.me.price - got), v.protectDays)
    .split('\n');
  if (!(await confirm.ask({ title, body: body.join('\n') }))) return;
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
/** 名下点开的那家、挂牌选的折扣 */
const holdId = ref<number | null>(null);
const hold = computed(() => view.value?.holdings.find((h) => h.restId === holdId.value) ?? null);
const rate = ref(1);
function openHold(h: AcquireHoldingDto) {
  holdId.value = h.restId;
  rate.value = 1;
}
const listCost = computed(() => (hold.value ? Math.round(hold.value.price * rate.value) : 0));

function list(h: AcquireHoldingDto) {
  const r = rate.value;
  return run(
    () => endpoints.acquireList(h.restId, r),
    () => t.value.acquire.listDone(h.name),
  );
}
function unlist(h: AcquireHoldingDto) {
  return run(
    () => endpoints.acquireUnlist(h.restId),
    () => t.value.acquire.unlistDone(h.name),
  );
}
async function release(h: AcquireHoldingDto) {
  const a = t.value.acquire;
  const [title = '', ...body] = a.confirmRelease(h.name).split('\n');
  if (!(await confirm.ask({ title, body: body.join('\n'), ok: a.release, danger: true }))) return;
  return run(
    () => endpoints.acquireRelease(h.restId),
    () => a.releaseDone(h.name),
  );
}
const ruleOpen = ref(false);
function closeAll() {
  target.value = null;
  holdId.value = null;
}

/** 自己的、自己名下的不能收 */
const canTry = (b: AcquireBriefDto) => b.restId !== me.value && b.owner?.restId !== me.value;
const dividendText = (h: AcquireHoldingDto) =>
  h.dividend
    ? t.value.acquire.dividend(coin(h.dividend.coin), h.dividend.tended)
    : view.value?.dividendPaid
      ? t.value.acquire.noDividend
      : t.value.acquire.dividendPending;

// 切标签时先回到“读取中”：新数据回来之前不显示上一个标签留下的“没有数据”
watch(tab, () => {
  loaded.value = false;
  void load();
});
onMounted(load);
</script>

<template>
  <div>
    <DtTabs v-model="tab" :tabs="tabItems" testid-prefix="acquire-tab-" />

    <template v-if="tab === 'price'">
      <DtEmpty v-if="loaded && price.length === 0" :title="t.acquire.rankEmpty" />
      <div v-else class="dt-card dt-rows-card">
        <button
          v-for="(b, i) in price"
          :key="b.restId"
          type="button"
          class="dt-row is-link"
          :data-testid="`acquire-price-${b.restId}`"
          @click="openTarget(b, 'acquire')"
        >
          <span :class="['dt-rank-badge', { 'is-top': i < 3 }]">{{ i + 1 }}</span>
          <span class="dt-row-main">
            <span class="dt-row-title">{{ b.name }}</span>
            <span class="dt-row-sub">{{ priceLine(b) }}</span>
            <span v-if="b.owner" class="dt-row-sub"
              ><span class="dt-tag-primary">{{ t.acquire.ownerTag(b.owner.name) }}</span></span
            >
          </span>
        </button>
      </div>
    </template>

    <template v-else-if="tab === 'market'">
      <DtEmpty v-if="loaded && market.length === 0" :title="t.acquire.marketEmpty" />
      <div v-else class="dt-card dt-rows-card">
        <button
          v-for="b in market"
          :key="b.restId"
          type="button"
          class="dt-row is-link"
          :data-testid="`acquire-market-${b.restId}`"
          @click="openTarget(b, 'listed')"
        >
          <span class="dt-row-main">
            <span class="dt-row-title">{{ b.name }}</span>
            <span class="dt-row-sub"
              >{{ t.acquire.price(coin(b.price)) }} ·
              {{ b.owner ? t.acquire.ownerTag(b.owner.name) : t.acquire.free }}</span
            >
            <span v-if="b.listed" class="dt-row-sub"
              ><span class="dt-tag dt-tag-warn">{{ t.acquire.listedTag(pct(b.listed.rate)) }}</span
              >{{ t.acquire.leftLine(remainText(b.listed.until)) }}</span
            >
          </span>
          <span v-if="b.listed" class="dt-acq-cost"
            ><b>{{ coin(b.listed.price) }}</b
            ><small>{{ t.acquire.coinUnit }}</small></span
          >
        </button>
      </div>
    </template>

    <template v-else-if="tab === 'invest'">
      <DtEmpty v-if="loaded && invest.length === 0" :title="t.acquire.investEmpty" />
      <div v-else class="dt-card dt-rows-card">
        <DtRow
          v-for="(r, i) in invest"
          :key="r.restId"
          :to="`/friends/${r.restId}`"
          class="dt-row-wrap"
          :data-testid="`acquire-invest-${r.restId}`"
        >
          <template #icon
            ><span :class="['dt-rank-badge', { 'is-top': i < 3 }]">{{ i + 1 }}</span></template
          >
          <template #title>{{ r.name }}</template>
          <template #sub
            >{{ t.acquire.colHoldings(r.holdings) }} · {{ t.acquire.colValue(coin(r.value)) }}<br />{{
              t.acquire.colDividend(coin(r.dividendTotal))
            }}</template
          >
        </DtRow>
      </div>
    </template>

    <template v-else-if="view">
      <div class="dt-card dt-rows-card" data-testid="acquire-me">
        <div class="dt-row dt-row-wrap">
          <span class="dt-row-main">
            <span class="dt-row-title"
              >{{ t.acquire.myPrice }} <b class="dt-num">{{ coin(view.me.price) }}</b></span
            >
            <span class="dt-row-sub">{{ t.acquire.heat(heat(view.me.heat)) }}</span>
            <span v-if="view.me.protectedUntil" class="dt-row-sub">{{
              t.acquire.protectedLeft(remainText(view.me.protectedUntil))
            }}</span>
          </span>
          <span :class="view.me.owner ? 'dt-tag dt-tag-warn' : 'dt-tag-ok'">{{
            view.me.owner ? t.acquire.ownerTag(view.me.owner.name) : t.acquire.free
          }}</span>
        </div>
        <div v-if="view.me.owner" class="dt-row">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.acquire.ownedBy(view.me.owner.name) }}</span></span
          >
        </div>
        <div v-if="view.me.owner" class="dt-acq-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || view.tendedToday"
            data-testid="acquire-tend"
            @click="tend"
          >
            {{ view.tendedToday ? t.acquire.tendedToday : t.acquire.tend(view.tendFoods) }}
          </button>
          <button
            type="button"
            class="btn btn-light"
            :disabled="busy"
            data-testid="acquire-redeem"
            @click="redeem"
          >
            {{ t.acquire.redeem(coin(view.me.price)) }}
          </button>
        </div>
        <button type="button" class="dt-row is-link" data-testid="acquire-rule-open" @click="ruleOpen = true">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.acquire.rulesTitle }}</span
            ><span class="dt-row-sub">{{
              t.acquire.rulesSub(pct(1 - view.taxRate), pct(view.taxRate))
            }}</span></span
          >
        </button>
      </div>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.acquire.holdingsTitle }}</h2>
          <span class="dt-block-more">{{ t.acquire.holdCount(view.holdings.length, view.maxHoldings) }}</span>
        </div>
        <div v-if="view.me.owner" class="dt-block-note">{{ t.acquire.ownedNoBuy }}</div>
        <DtEmpty v-if="view.holdings.length === 0" :title="t.acquire.holdingsEmpty" />
        <div v-else class="dt-card dt-rows-card">
          <button
            v-for="h in view.holdings"
            :key="h.restId"
            type="button"
            class="dt-row is-link dt-row-wrap"
            :data-testid="`acquire-hold-${h.restId}`"
            @click="openHold(h)"
          >
            <span class="dt-row-main">
              <span class="dt-row-title"
                >{{ h.name
                }}<span :class="h.tendedToday ? 'dt-tag-ok' : 'dt-tag-mute'">{{
                  h.tendedToday ? t.acquire.holdTended : t.acquire.holdNotTended
                }}</span></span
              >
              <span class="dt-row-sub">{{ t.acquire.price(coin(h.price)) }} · {{ dividendText(h) }}</span>
              <span v-if="h.listed" class="dt-row-sub"
                ><span class="dt-tag dt-tag-warn">{{ t.acquire.listedTag(pct(h.listed.rate)) }}</span
                >{{ t.acquire.leftLine(remainText(h.listed.until)) }}</span
              >
            </span>
          </button>
        </div>
      </section>
    </template>

    <!-- 身价榜、在售点开一家 -->
    <DtSheet :open="!!target" :title="target ? target.brief.name : ''" @close="target = null">
      <div v-if="target" data-testid="acquire-sheet">
        <div class="dt-detail-sub">{{ priceLine(target.brief) }}</div>
        <div class="mt-1">
          <span :class="target.brief.owner ? 'dt-tag-primary' : 'dt-tag-ok'">{{
            target.brief.owner ? t.acquire.ownerTag(target.brief.owner.name) : t.acquire.free
          }}</span>
        </div>
        <div class="dt-sheet-list mt-2">
          <RouterLink
            :to="`/friends/${target.brief.restId}`"
            class="dt-row is-link"
            data-testid="acquire-visit"
          >
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ t.acquire.visit }}</span></span
            >
          </RouterLink>
        </div>
        <dl v-if="target.rest" class="dt-sum" data-testid="acquire-split">
          <div>
            <dt>{{ t.acquire.youPay }}</dt>
            <dd>
              <b>{{ coin(targetCost) }}</b>
            </dd>
          </div>
          <div>
            <dt>
              {{
                t.acquire.sellerGot(target.rest.owner?.name ?? target.rest.name, pct(1 - target.rest.taxRate))
              }}
            </dt>
            <dd>{{ coin(sellerGets(targetCost, target.rest.taxRate)) }}</dd>
          </div>
          <div>
            <dt>{{ t.acquire.taxLine(pct(target.rest.taxRate)) }}</dt>
            <dd>{{ coin(targetCost - sellerGets(targetCost, target.rest.taxRate)) }}</dd>
          </div>
          <div v-if="view">
            <dt>{{ t.acquire.afterHold }}</dt>
            <dd>{{ t.acquire.holdCount(view.holdings.length + 1, view.maxHoldings) }}</dd>
          </div>
        </dl>
        <div v-if="targetBlock" class="dt-detail-note text-danger" data-testid="acquire-block">
          {{ acquireReason(targetBlock) }}
        </div>
      </div>
      <template v-if="target && canTry(target.brief)" #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="target = null">{{ t.common.cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || !target.rest || !!targetBlock"
            :data-testid="
              target.way === 'acquire'
                ? `acquire-buy-${target.brief.restId}`
                : `acquire-listed-${target.brief.restId}`
            "
            @click="buy"
          >
            {{ target.way === 'acquire' ? t.acquire.acquire : t.acquire.buyListed }}
          </button>
        </div>
      </template>
    </DtSheet>

    <!-- 名下的一家：挂牌、撤牌、放手 -->
    <DtSheet :open="!!hold" :title="hold ? hold.name : ''" @close="holdId = null">
      <div v-if="hold && view" data-testid="acquire-hold-sheet">
        <div class="dt-detail-sub">{{ t.acquire.price(coin(hold.price)) }} · {{ dividendText(hold) }}</div>
        <div class="mt-1">
          <span :class="hold.tendedToday ? 'dt-tag-ok' : 'dt-tag-mute'">{{
            hold.tendedToday ? t.acquire.holdTended : t.acquire.holdNotTended
          }}</span>
        </div>
        <div class="dt-sheet-list mt-2">
          <RouterLink :to="`/friends/${hold.restId}`" class="dt-row is-link">
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ t.acquire.visit }}</span></span
            >
          </RouterLink>
        </div>
        <div v-if="hold.listed" class="dt-detail-note" data-testid="acquire-listed-line">
          {{
            t.acquire.listed(pct(hold.listed.rate), coin(hold.listed.price), remainText(hold.listed.until))
          }}
        </div>
        <template v-else>
          <div class="dt-detail-qty">
            <span>{{ t.acquire.rateLabel }}</span>
          </div>
          <div class="dt-pills dt-pills-scroll mt-2" role="group" :aria-label="t.acquire.rateLabel">
            <button
              v-for="r in rateOptions"
              :key="r"
              type="button"
              :class="{ active: rate === r }"
              :aria-pressed="rate === r"
              :data-testid="`acquire-rate-${r}`"
              @click="rate = r"
            >
              {{ pct(r) }}
            </button>
          </div>
          <dl class="dt-sum">
            <div>
              <dt>{{ t.acquire.listPrice }}</dt>
              <dd>
                <b>{{ coin(listCost) }}</b>
              </dd>
            </div>
            <div>
              <dt>{{ t.acquire.listGot }}</dt>
              <dd>{{ coin(sellerGets(listCost, view.taxRate)) }}</dd>
            </div>
          </dl>
          <div class="dt-detail-note">{{ t.acquire.listNote(view.listDays) }}</div>
        </template>
      </div>
      <template v-if="hold" #actions>
        <div class="dt-sheet-pair">
          <button
            type="button"
            class="btn btn-outline-danger"
            :disabled="busy"
            :data-testid="`acquire-release-${hold.restId}`"
            @click="release(hold)"
          >
            {{ t.acquire.release }}
          </button>
          <button
            v-if="hold.listed"
            type="button"
            class="btn btn-light"
            :disabled="busy"
            :data-testid="`acquire-unlist-${hold.restId}`"
            @click="unlist(hold)"
          >
            {{ t.acquire.unlist }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            :data-testid="`acquire-list-${hold.restId}`"
            @click="list(hold)"
          >
            {{ t.acquire.list }}
          </button>
        </div>
      </template>
    </DtSheet>

    <DtSheet :open="ruleOpen" :title="t.acquire.rulesTitle" @close="ruleOpen = false">
      <div v-if="view" class="dt-help" data-testid="acquire-rule">
        <p>
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
      </div>
    </DtSheet>
  </div>
</template>
