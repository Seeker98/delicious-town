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
import { paybackDays, resaleSplit } from '../utils/acquire';
import { formatNum, formatPct, gameDate, timeHM } from '../utils/format';
import { remainText } from '../utils/remain';

/**
 * 收购（问题记录 421，设计 §1.5）：身价榜、在售、投资榜、我的。
 * 界面改版 P8：榜单一行整行可点，点开从下面弹出这家店（谁得多少、税多少），收购在面板里；
 * 名下的店同样点开面板打理、挂牌、撤牌、放手；长规则收进“收购规则”一行。
 * 收购改版（2026-10-16）：被收购的店看让渡和老板打理的情况；老板打理名下的店（可以全部打理）；强收只对没有老板的店
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
const pct = (x: number) => formatPct(x);
/** 热度、倍数最多两位小数，小数点按语言（法文、西文写逗号） */
const num2 = (h: number) => formatNum(Number(h.toFixed(2)));
const priceLine = (b: AcquireBriefDto) =>
  `${t.value.acquire.price(coin(b.price))} · ${t.value.acquire.heat(num2(b.heat))}`;
const rules = computed(() => view.value?.rules ?? null);
/** 今天还能买几家 */
const buyLeft = computed(() =>
  view.value ? Math.max(0, view.value.rules.buyerMaxPerDay - view.value.boughtToday) : 0,
);

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

async function run<T>(fn: () => Promise<T>, done: (v: T) => string, close = true) {
  if (busy.value) return;
  busy.value = true;
  let ok = false;
  try {
    toast.push(done(await fn()));
    ok = true;
    if (close) closeAll();
  } catch (e) {
    toast.push(errorMessage(e, t.value.acquire.failed), 'danger');
  } finally {
    busy.value = false;
    // 成功、失败都重读：价格、老板、挂牌可能都变了。失败时不先清空，免得开着的名下店面板闪一下（P8 终审）
    if (ok) view.value = null;
    await load();
  }
  return ok;
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
/** 有老板的店在身价榜点开：不能强收，只能等挂牌 */
const targetOwned = computed(() => target.value?.way === 'acquire' && !!target.value.brief.owner);
const targetCost = computed(() => {
  const x = target.value;
  if (!x?.rest) return 0;
  return x.way === 'acquire' ? x.rest.price : (x.rest.listed?.price ?? x.rest.price);
});
const targetSplit = computed(() => {
  const r = target.value?.rest;
  if (!r) return null;
  return target.value!.way === 'acquire' ? r.acquireSplit : r.listedSplit;
});
const targetBlock = computed(() => {
  const r = target.value?.rest;
  if (!r) return null;
  return target.value!.way === 'acquire' ? r.acquireBlock : r.listedBlock;
});
/** 收下以后：每天抽成约多少、回本天数 */
const targetAfter = computed(() => {
  const r = target.value?.rest;
  const ru = rules.value;
  if (!r || !ru) return null;
  return {
    cede: Math.floor(r.avg * ru.cedeRate),
    payback: paybackDays(targetCost.value, r.avg, ru),
  };
});
async function buy() {
  const x = target.value;
  if (!x?.rest || targetBlock.value) return;
  const r = x.rest;
  const cost = targetCost.value;
  const ok = await run(
    () => endpoints.acquireBuy(r.restId, x.way, cost),
    () => t.value.acquire.bought(r.name),
  );
  // 失败多半是身价变了（price_changed）：面板还开着就重读这家店，显示新价（P8 终审 I2）
  if (!ok && target.value?.brief.restId === r.restId) await openTarget(target.value.brief, target.value.way);
}

async function redeem() {
  const v = view.value;
  const o = v?.owned;
  if (!v?.me.owner || !o) return;
  const a = t.value.acquire;
  const s = o.redeemSplit;
  const r = v.rules;
  const ok = await confirm.ask({
    title: a.confirmRedeem(coin(o.redeemPrice)),
    body: a.confirmRedeemBody(
      v.me.owner.name,
      coin(s.sellerGot),
      pct(1 - r.redeemBurnRate - r.taxRate),
      coin(s.burn),
      pct(r.redeemBurnRate),
      coin(s.tax),
      pct(r.taxRate),
      r.protectDays,
    ),
    ok: a.redeem,
  });
  if (!ok) return;
  return run(
    () => endpoints.acquireRedeem(o.redeemPrice),
    () => a.redeemed,
  );
}

/** 挂牌可选的比例：listMaxRate ~ listMinRate，5% 一档，从高到低 */
const rateOptions = computed(() => {
  const ru = rules.value;
  const min = ru?.listMinRate ?? 0.5;
  const max = ru?.listMaxRate ?? 1.2;
  const out: number[] = [];
  for (let k = Math.round(max * 20); k >= Math.round(min * 20); k--) out.push(k / 20);
  return out;
});
/** 名下点开的那家、挂牌选的比例 */
const holdId = ref<number | null>(null);
const hold = computed(() => view.value?.holdings.find((h) => h.restId === holdId.value) ?? null);
const rate = ref(1);
function openHold(h: AcquireHoldingDto) {
  holdId.value = h.restId;
  rate.value = 1;
}
const listCost = computed(() => (hold.value ? Math.round(hold.value.price * rate.value) : 0));
const listSplit = computed(() => (rules.value ? resaleSplit(listCost.value, rules.value) : null));

/** 名下今天还没打理的店：全部打理的家数和成本 */
const untended = computed(() => view.value?.holdings.filter((h) => !h.tendedToday) ?? []);
const untendedCost = computed(() => untended.value.reduce((s, h) => s + h.tendCost, 0));

function tend(h: AcquireHoldingDto) {
  return run(
    () => endpoints.acquireTend(h.restId),
    (v) => t.value.acquire.tendDone(h.name, coin(v.cost)),
    false,
  );
}
function tendAll() {
  return run(
    () => endpoints.acquireTendAll(),
    (v) => t.value.acquire.tendAllDone(v.items.length, coin(v.cost)),
  );
}
/** 名下一家的标签：今天打理过 / 今天没打理 / 几天没打理 */
const holdTag = (h: AcquireHoldingDto) =>
  h.tendedToday
    ? { cls: 'dt-tag-ok', text: t.value.acquire.holdTended }
    : h.idleDays >= (rules.value?.tendHalfDays ?? 3)
      ? { cls: 'dt-tag-danger', text: t.value.acquire.holdIdle(h.idleDays) }
      : { cls: 'dt-tag-mute', text: t.value.acquire.holdNotTended };
/** 几天没打理时的提醒：减半了还是已经不抽了，还剩几天自动放手 */
const holdNote = (h: AcquireHoldingDto) => {
  const ru = rules.value;
  if (!ru || h.tendedToday || h.idleDays < ru.tendHalfDays) return null;
  const releaseIn = Math.max(0, ru.tendReleaseDays - h.idleDays);
  return h.idleDays < ru.tendStopDays
    ? t.value.acquire.holdHalfNote(ru.tendStopDays - h.idleDays, releaseIn)
    : t.value.acquire.holdStopNote(releaseIn);
};

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

/** 被收购时“今天的抽成”下面那一小行 */
const cedeNote = computed(() => {
  const o = view.value?.owned;
  const ru = rules.value;
  if (!o || !ru) return '';
  const a = t.value.acquire;
  if (o.tendedToday) return a.cedeTended;
  if (o.idleDays >= ru.tendStopDays) return a.cedeStopped;
  if (o.idleDays >= ru.tendHalfDays) return a.cedeHalf;
  return a.cedeUntended;
});

const ruleOpen = ref(false);
const ruleList = computed(() => {
  const r = rules.value;
  if (!r) return [];
  return t.value.acquire.ruleItems({
    mult: num2(r.priceMultiple),
    heatStep: num2(r.heatStep),
    minStar: r.minStar,
    newStarDays: r.newStarProtectDays,
    firstStore: pct(r.firstStoreRate),
    firstBurn: pct(r.firstBurnRate),
    tax: pct(r.taxRate),
    listMin: pct(r.listMinRate),
    listMax: pct(r.listMaxRate),
    resaleSeller: pct(1 - r.resaleStoreRate - r.taxRate),
    resaleStore: pct(r.resaleStoreRate),
    buyerStar: r.buyerMinStar,
    buyerDays: r.buyerMinAccountDays,
    buyerPerDay: r.buyerMaxPerDay,
    maxHoldings: r.maxHoldings,
    cede: pct(r.cedeRate),
    cedeTend: pct(r.cedeTendRate),
    tendCost: pct(r.tendCostRate),
    tendMult: formatNum(r.tendMultiplier),
    packStep: coin(r.tendPackStep),
    packMax: r.tendPackMax,
    halfDays: r.tendHalfDays,
    stopDays: r.tendStopDays,
    releaseDays: r.tendReleaseDays,
    redeemOwner: pct(1 - r.redeemBurnRate - r.taxRate),
    redeemBurn: pct(r.redeemBurnRate),
    protectDays: r.protectDays,
  });
});
function closeAll() {
  target.value = null;
  holdId.value = null;
}

/** 自己的、自己名下的不能收 */
const canTry = (b: AcquireBriefDto) => b.restId !== me.value && b.owner?.restId !== me.value;

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
            <span class="dt-row-sub">{{
              t.acquire.myPriceSub(coin(view.me.avg), num2(view.rules.priceMultiple), num2(view.me.heat))
            }}</span>
            <span v-if="view.me.protectedUntil" class="dt-row-sub">{{
              t.acquire.protectedLeft(remainText(view.me.protectedUntil))
            }}</span>
          </span>
          <span :class="view.me.owner ? 'dt-tag dt-tag-warn' : 'dt-tag-ok'">{{
            view.me.owner ? t.acquire.ownerTag(view.me.owner.name) : t.acquire.free
          }}</span>
        </div>
      </div>

      <!-- 被收购中：让了多少、老板打理的情况、赎身 -->
      <section v-if="view.owned" class="dt-block" data-testid="acquire-owned">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.acquire.ownedTitle }}</h2>
          <span v-if="view.owned.since" class="dt-block-more">{{
            t.acquire.ownedSince(gameDate(view.owned.since))
          }}</span>
        </div>
        <div class="dt-card dt-rows-card">
          <div class="dt-acq-stats">
            <div class="dt-stat">
              <div class="dt-stat-label">{{ t.acquire.cededToday }}</div>
              <div class="dt-stat-value">{{ coin(view.owned.cededToday) }}</div>
            </div>
            <div class="dt-stat">
              <div class="dt-stat-label">{{ t.acquire.ceded30 }}</div>
              <div class="dt-stat-value">{{ coin(view.owned.ceded30) }}</div>
            </div>
            <div class="dt-stat">
              <div class="dt-stat-label">{{ t.acquire.cedeNow }}</div>
              <div class="dt-stat-value" data-testid="acquire-cede-rate">{{ pct(view.owned.cedeRate) }}</div>
              <div class="dt-stat-label">{{ cedeNote }}</div>
            </div>
            <div class="dt-stat">
              <div class="dt-stat-label">{{ t.acquire.tendDays7 }}</div>
              <div class="dt-stat-value">{{ t.acquire.tendDaysVal(view.owned.tendDays7) }}</div>
            </div>
          </div>
          <div class="dt-acq-line" data-testid="acquire-tend-line">
            {{
              view.owned.tendedAt
                ? t.acquire.tendedLine(
                    timeHM(view.owned.tendedAt),
                    formatNum(view.rules.tendMultiplier),
                    view.owned.packsToday,
                  )
                : t.acquire.untendedLine(formatNum(view.rules.tendMultiplier))
            }}
          </div>
          <div class="dt-acq-actions">
            <button
              type="button"
              class="btn btn-light"
              :disabled="busy"
              data-testid="acquire-redeem"
              @click="redeem"
            >
              {{ t.acquire.redeemBtn(coin(view.owned.redeemPrice)) }}
            </button>
          </div>
        </div>
        <div class="dt-block-note">
          {{
            t.acquire.ownedNote(view.rules.tendHalfDays, view.rules.tendStopDays, view.rules.tendReleaseDays)
          }}
        </div>
      </section>

      <div class="dt-card dt-rows-card mt-3">
        <button type="button" class="dt-row is-link" data-testid="acquire-rule-open" @click="ruleOpen = true">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.acquire.rulesTitle }}</span
            ><span class="dt-row-sub">{{ t.acquire.rulesSub(pct(view.rules.cedeRate)) }}</span></span
          >
        </button>
      </div>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.acquire.holdingsTitle }}</h2>
          <span class="dt-block-more">{{
            t.acquire.holdHead(view.holdings.length, view.rules.maxHoldings, buyLeft)
          }}</span>
        </div>
        <div v-if="view.me.owner" class="dt-block-note">{{ t.acquire.ownedNoBuy }}</div>
        <DtEmpty v-if="view.holdings.length === 0" :title="t.acquire.holdingsEmpty" />
        <template v-else>
          <div class="dt-card dt-rows-card" data-testid="acquire-hold-sum">
            <div class="dt-acq-stats">
              <div class="dt-stat">
                <div class="dt-stat-label">{{ t.acquire.pendingTotal }}</div>
                <div class="dt-stat-value">{{ coin(view.pendingTotal) }}</div>
                <div class="dt-stat-label">{{ t.acquire.pendingSub }}</div>
              </div>
              <div class="dt-stat">
                <div class="dt-stat-label">{{ t.acquire.yesterdayTotal }}</div>
                <div class="dt-stat-value">
                  {{ view.dividendPaid ? coin(view.yesterdayTotal) : t.acquire.yesterdayPending }}
                </div>
              </div>
            </div>
            <div class="dt-acq-all">
              <span class="dt-row-sub">{{
                untended.length > 0
                  ? t.acquire.tendAllLine(untended.length, coin(untendedCost))
                  : t.acquire.allTended
              }}</span>
              <button
                v-if="untended.length > 0"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="busy"
                data-testid="acquire-tend-all"
                @click="tendAll"
              >
                {{ t.acquire.tendAll }}
              </button>
            </div>
          </div>
          <div class="dt-card dt-rows-card mt-2">
            <div
              v-for="h in view.holdings"
              :key="h.restId"
              class="dt-row dt-row-wrap dt-acq-hold"
              :data-testid="`acquire-hold-${h.restId}`"
            >
              <button
                type="button"
                class="dt-row-main dt-acq-hold-open"
                :data-testid="`acquire-hold-open-${h.restId}`"
                @click="openHold(h)"
              >
                <span class="dt-row-title"
                  >{{ h.name }}<span :class="holdTag(h).cls">{{ holdTag(h).text }}</span></span
                >
                <span class="dt-row-sub">{{
                  t.acquire.holdSub(coin(h.avg), pct(h.cedeRate), coin(h.pending))
                }}</span>
                <span v-if="holdNote(h)" class="dt-row-sub text-danger">{{ holdNote(h) }}</span>
                <span v-if="h.listed" class="dt-row-sub"
                  ><span class="dt-tag dt-tag-warn">{{ t.acquire.listedTag(pct(h.listed.rate)) }}</span
                  >{{ t.acquire.leftLine(remainText(h.listed.until)) }}</span
                >
              </button>
              <button
                v-if="!h.tendedToday"
                type="button"
                class="btn btn-outline-primary btn-sm"
                :disabled="busy"
                :data-testid="`acquire-tend-${h.restId}`"
                @click="tend(h)"
              >
                {{ t.acquire.tendBtn(coin(h.tendCost)) }}
              </button>
            </div>
          </div>
        </template>
      </section>
    </template>

    <!-- 身价榜、在售点开一家 -->
    <DtSheet :open="!!target" :title="target ? target.brief.name : ''" @close="target = null">
      <div v-if="target" data-testid="acquire-sheet">
        <div class="dt-detail-sub">
          {{ t.acquire.targetSub(coin(target.brief.price), coin(target.brief.avg), num2(target.brief.heat)) }}
        </div>
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
          <RouterLink
            v-if="targetOwned"
            to="/acquire?tab=market"
            class="dt-row is-link"
            data-testid="acquire-go-market"
            @click="target = null"
          >
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ t.acquire.goMarket }}</span></span
            >
          </RouterLink>
        </div>
        <div v-if="targetOwned" class="dt-detail-note dt-acq-why" data-testid="acquire-owned-why">
          {{ t.acquire.ownedWhy }}
        </div>
        <template v-else-if="target.rest && targetSplit && rules">
          <dl class="dt-sum" data-testid="acquire-split">
            <div>
              <dt>{{ t.acquire.youPay }}</dt>
              <dd>
                <b>{{ coin(targetCost) }}</b>
              </dd>
            </div>
            <div v-if="targetSplit.sellerGot > 0 && target.rest.owner">
              <dt>
                {{
                  t.acquire.sellerGot(target.rest.owner.name, pct(1 - rules.resaleStoreRate - rules.taxRate))
                }}
              </dt>
              <dd>{{ coin(targetSplit.sellerGot) }}</dd>
            </div>
            <div>
              <dt>
                {{
                  t.acquire.sellerGot(
                    target.rest.name,
                    pct(target.way === 'acquire' ? rules.firstStoreRate : rules.resaleStoreRate),
                  )
                }}
              </dt>
              <dd>{{ coin(targetSplit.storeGot) }}</dd>
            </div>
            <div v-if="targetSplit.burn > 0">
              <dt>{{ t.acquire.burnLine(pct(rules.firstBurnRate)) }}</dt>
              <dd>{{ coin(targetSplit.burn) }}</dd>
            </div>
            <div>
              <dt>{{ t.acquire.taxLine(pct(rules.taxRate)) }}</dt>
              <dd>{{ coin(targetSplit.tax) }}</dd>
            </div>
          </dl>
          <div class="dt-detail-qty mt-3">
            <span>{{ t.acquire.afterTitle }}</span>
          </div>
          <dl v-if="targetAfter && view" class="dt-sum mt-1" data-testid="acquire-after">
            <div>
              <dt>{{ t.acquire.afterCede }}</dt>
              <dd>{{ t.acquire.afterCedeVal(coin(targetAfter.cede), pct(rules.cedeRate)) }}</dd>
            </div>
            <div>
              <dt>{{ t.acquire.afterTend }}</dt>
              <dd>{{ t.acquire.afterTendVal(pct(rules.cedeTendRate), pct(rules.tendCostRate)) }}</dd>
            </div>
            <div v-if="targetAfter.payback">
              <dt>{{ t.acquire.payback }}</dt>
              <dd>{{ t.acquire.paybackVal(targetAfter.payback.plain, targetAfter.payback.tended) }}</dd>
            </div>
            <div>
              <dt>{{ t.acquire.afterHold }}</dt>
              <dd>
                {{
                  t.acquire.holdHead(view.holdings.length + 1, rules.maxHoldings, Math.max(0, buyLeft - 1))
                }}
              </dd>
            </div>
          </dl>
          <div class="dt-detail-note">
            {{
              t.acquire.buyNote(
                rules.tendHalfDays,
                rules.tendStopDays,
                rules.tendReleaseDays,
                pct(1 - rules.redeemBurnRate - rules.taxRate),
              )
            }}
          </div>
        </template>
        <div
          v-if="targetBlock && !targetOwned"
          class="dt-detail-note text-danger"
          data-testid="acquire-block"
        >
          {{ acquireReason(targetBlock) }}
        </div>
      </div>
      <template v-if="target && canTry(target.brief)" #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="target = null">
            {{ targetOwned ? t.common.close : t.common.cancel }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || targetOwned || !target.rest || !!targetBlock"
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

    <!-- 名下的一家：打理、挂牌、撤牌、放手 -->
    <DtSheet :open="!!hold" :title="hold ? hold.name : ''" @close="holdId = null">
      <div v-if="hold && view" data-testid="acquire-hold-sheet">
        <div class="dt-detail-sub">
          {{ t.acquire.holdSheetSub(coin(hold.price), coin(hold.avg)) }} ·
          <span :class="holdTag(hold).cls">{{ holdTag(hold).text }}</span>
        </div>
        <div class="dt-sheet-list mt-2">
          <RouterLink :to="`/friends/${hold.restId}`" class="dt-row is-link">
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ t.acquire.visit }}</span></span
            >
          </RouterLink>
        </div>

        <div class="dt-detail-qty mt-3">
          <span>{{ t.acquire.tendTitle }}</span>
        </div>
        <dl class="dt-sum mt-1" data-testid="acquire-tend-sum">
          <div>
            <dt>{{ t.acquire.tendPay(pct(view.rules.tendCostRate)) }}</dt>
            <dd>{{ coin(hold.tendCost) }}</dd>
          </div>
          <div>
            <dt>{{ t.acquire.tendMultLine }}</dt>
            <dd>× {{ formatNum(view.rules.tendMultiplier) }}</dd>
          </div>
          <div>
            <dt>{{ t.acquire.tendPack }}</dt>
            <dd>
              {{
                hold.tendPacks > 0
                  ? t.acquire.tendPackN(hold.tendPacks)
                  : t.acquire.tendPackNone(coin(view.rules.tendPackStep))
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t.acquire.tendRate }}</dt>
            <dd>{{ pct(view.rules.cedeRate) }} → {{ pct(view.rules.cedeTendRate) }}</dd>
          </div>
        </dl>
        <button
          v-if="!hold.tendedToday"
          type="button"
          class="btn btn-primary w-100 mt-2"
          :disabled="busy"
          :data-testid="`acquire-tend-sheet-${hold.restId}`"
          @click="tend(hold)"
        >
          {{ t.acquire.tendSheetBtn(coin(hold.tendCost)) }}
        </button>
        <div class="dt-detail-note">{{ t.acquire.tendNote }}</div>

        <div v-if="hold.listed" class="dt-detail-note" data-testid="acquire-listed-line">
          {{
            t.acquire.listed(pct(hold.listed.rate), coin(hold.listed.price), remainText(hold.listed.until))
          }}
        </div>
        <template v-else>
          <div class="dt-detail-qty mt-3">
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
          <dl v-if="listSplit" class="dt-sum">
            <div>
              <dt>{{ t.acquire.listPrice }}</dt>
              <dd>
                <b>{{ coin(listCost) }}</b>
              </dd>
            </div>
            <div>
              <dt>{{ t.acquire.listSellerGot(pct(1 - view.rules.resaleStoreRate - view.rules.taxRate)) }}</dt>
              <dd>{{ coin(listSplit.sellerGot) }}</dd>
            </div>
            <div>
              <dt>{{ t.acquire.sellerGot(hold.name, pct(view.rules.resaleStoreRate)) }}</dt>
              <dd>{{ coin(listSplit.storeGot) }}</dd>
            </div>
            <div>
              <dt>{{ t.acquire.taxLine(pct(view.rules.taxRate)) }}</dt>
              <dd>{{ coin(listSplit.tax) }}</dd>
            </div>
          </dl>
          <div class="dt-detail-note">{{ t.acquire.listNote(view.rules.listDays) }}</div>
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
            class="btn btn-outline-primary"
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
        <ul>
          <li v-for="(x, i) in ruleList" :key="i">{{ x }}</li>
        </ul>
      </div>
    </DtSheet>
  </div>
</template>
