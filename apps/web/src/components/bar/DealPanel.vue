<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { SHARED_FOODS, type BarDto, type DealDto, type DealPrizeDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';
import BarInfo from './BarInfo.vue';
import { roundGone } from './gone';

/**
 * 一掷千金（问题记录 427-3）：选自己的箱子，一轮轮开别的箱子，银行家报银币买断价。
 * 界面改版 P9：十个箱子两排，开了的写里面是什么；报价是一张琥珀色的卡，成交、不成交两个按钮
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const t = useT();
const toast = useToastStore();
const catalog = useCatalogStore();
const busy = ref(false);

/** 局面进度：选箱子 → 每开一个 → 报价 → 回答（进下一轮） */
const progress = (r: DealDto) =>
  (r.mine === null ? 0 : 1) + r.opened.length * 10 + r.round * 2 + (r.offer === null ? 0 : 1);
/** 当前局面：结束的结果留着展示，否则跟着概览里进行中的局 */
const local = ref<DealDto | null>(null);
watch(
  () => props.data.deal.round,
  (r) => {
    if (local.value?.result) return;
    // 概览可能比刚收到的结果晚到：比手上的局面旧就不覆盖（审查：连点开箱子）
    if (r && local.value && progress(r) < progress(local.value)) return;
    local.value = r;
  },
  { immediate: true },
);
/** 读屏播报：刚开出的东西、报价、结果 */
const live = ref('');
const root = ref<HTMLElement | null>(null);
/** 按钮变灰或换掉后键盘焦点会丢：挪到接下来要点的地方（#192 审查） */
async function focusNext() {
  await nextTick();
  const r = local.value;
  const el = root.value;
  if (!r || !el) return;
  if (r.result) return el.querySelector<HTMLElement>('[data-testid="deal-again"]')?.focus();
  if (r.offer !== null) return el.querySelector<HTMLElement>('[data-testid="deal-yes"]')?.focus();
  el.querySelector<HTMLElement>('.dt-deal-box:not([disabled])')?.focus();
}

async function run(fn: () => Promise<DealDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const before = local.value?.opened.length ?? 0;
    const r = await fn();
    local.value = r;
    live.value = liveOf(r, before);
    emit('reload');
    void focusNext();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 局面没了就回到开局；别的错误（网络、和服务端对不上）先用概览里的局面，再重新读
    local.value = roundGone(e) ? null : props.data.deal.round;
    emit('reload');
  } finally {
    busy.value = false;
  }
}

const d = computed(() => props.data.deal);
const prizeText = (p: DealPrizeDto) => t.value.bar.deal.item(catalog.foodName(p.foodsId), p.num);
const tablePrizeText = (p: BarDto['deal']['prizes'][number]) =>
  p.kind === 'master'
    ? t.value.bar.deal.item(catalog.foodName(SHARED_FOODS.masterBase + p.level), p.num)
    : t.value.bar.deal.prizeFood(p.level, p.num);

function liveOf(r: DealDto, before: number): string {
  const x = t.value.bar.deal;
  if (r.result) return resultLines(r).join(' ');
  const parts: string[] = [];
  const last = r.opened.at(-1);
  if (last && r.opened.length > before) parts.push(x.opened(last.box + 1, prizeText(last)));
  if (r.offer !== null) parts.push(x.offer(formatNum(r.offer)));
  return parts.join(' ');
}

const leftToday = computed(() => Math.max(0, d.value.max - d.value.played));
const block = computed(() =>
  leftToday.value <= 0
    ? t.value.bar.deal.noLeft
    : props.data.coin < d.value.cost
      ? t.value.bar.deal.noCoin
      : '',
);

const openedOf = (i: number) => local.value?.opened.find((o) => o.box === i) ?? null;
/** 箱子能不能点：选箱子时都能点；开箱子时自己的、已开的、有报价时都不能点 */
const canClick = (i: number) => {
  const r = local.value;
  if (!r || r.result || busy.value) return false;
  if (r.mine === null) return true;
  return r.offer === null && i !== r.mine && !openedOf(i);
};
function clickBox(i: number) {
  const r = local.value;
  if (!r) return;
  if (r.mine === null) return run(() => endpoints.barDealPick(i), t.value.bar.deal.failed);
  return run(() => endpoints.barDealOpen(i), t.value.bar.deal.failed);
}
const boxText = (i: number) => {
  const o = openedOf(i);
  if (o) return prizeText(o);
  if (local.value?.mine === i) return t.value.bar.deal.mine;
  return '';
};
/** 结束时每个箱子里是什么；自己的箱子前面写“你的” */
const allText = (i: number) => {
  const p = local.value?.all?.[i];
  if (!p) return '';
  return local.value?.mine === i ? t.value.bar.deal.mineIs(prizeText(p)) : prizeText(p);
};

function resultLines(r: DealDto): string[] {
  const x = t.value.bar.deal;
  if (r.result === 'deal')
    return [x.dealt(formatNum(r.coin)), ...(r.prize ? [x.yourBox(prizeText(r.prize))] : [])];
  return [
    ...(r.prize ? [x.gotBox(prizeText(r.prize))] : []),
    ...(r.fridge > 0 ? [x.fridge(r.fridge)] : []),
    ...(r.dropped > 0 ? [x.dropped(r.dropped)] : []),
  ];
}
const result = computed(() => (local.value?.result ? resultLines(local.value) : []));
/** 箱子里写的奖品（格子窄，样式里最多两行） */
const prizeShort = (p: DealPrizeDto | null | undefined) => (p ? prizeText(p) : '');
/** 箱子上面一行：选箱子、再开几个、等你回答报价、结束了 */
const stageHint = computed(() => {
  const r = local.value;
  const x = t.value.bar.deal;
  if (!r) return '';
  if (r.result) return x.ended;
  if (r.mine === null) return x.pickHint;
  if (r.offer !== null) return x.roundDone(r.round + 1);
  return x.openHint(r.toOpen);
});
/** 按轮分开的开箱记录：opened 按开的先后排，前 opens[0] 个是第 1 轮，依次往后（问题记录 467） */
const roundsOpened = computed(() => {
  const r = local.value;
  if (!r) return [];
  const out: string[] = [];
  let at = 0;
  for (const [i, n] of (r.opens ?? []).entries()) {
    const items = r.opened.slice(at, at + n);
    at += n;
    if (items.length === 0) break;
    const x = t.value.bar.deal;
    out.push(x.roundLine(i + 1, items.map((o) => `${x.box(o.box + 1)} ${prizeText(o)}`).join(x.sep)));
  }
  return out;
});
function again() {
  local.value = null;
  live.value = '';
  void nextTick(() => root.value?.querySelector<HTMLElement>('[data-testid="deal-start"]')?.focus());
}
</script>

<template>
  <div ref="root">
    <BarInfo
      game="deal"
      :title="t.bar.deal.title(formatNum(d.cost))"
      :sub="t.bar.deal.sub(d.played, d.max)"
    />
    <template v-if="!local">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.bar.deal.prizesTitle }}</h2>
        <span class="dt-block-more">{{ t.bar.deal.left(leftToday) }}</span>
      </div>
      <div class="dt-chip-list">
        <span v-for="(p, i) in d.prizes" :key="i" :data-testid="`deal-prize-${i}`">{{
          tablePrizeText(p)
        }}</span>
      </div>
      <button
        type="button"
        class="btn btn-primary dt-btn-block dt-bar-go"
        :disabled="busy || !!block"
        data-testid="deal-start"
        @click="run(() => endpoints.barDealStart(), t.bar.startFailed)"
      >
        {{ t.bar.deal.start(formatNum(d.cost)) }}
      </button>
      <div v-if="block" class="dt-bar-block">{{ block }}</div>
    </template>
    <template v-else>
      <!-- 读屏的固定播报区：刚开出的东西、报价、结果 -->
      <div class="visually-hidden" aria-live="polite" data-testid="deal-live">{{ live }}</div>
      <section class="dt-card dt-bar-stage">
        <p class="dt-bar-label">{{ stageHint }}</p>
        <div class="dt-deal-grid">
          <button
            v-for="i in local.count"
            :key="i - 1"
            type="button"
            :class="[
              'dt-deal-box',
              { 'is-mine': local.mine === i - 1, 'is-open': !!openedOf(i - 1) || !!local.result },
            ]"
            :disabled="!canClick(i - 1)"
            :aria-label="t.bar.deal.boxLabel(i, local.result ? allText(i - 1) : boxText(i - 1))"
            :data-testid="`deal-box-${i - 1}`"
            @click="clickBox(i - 1)"
          >
            <span v-if="local.mine === i - 1" class="dt-deal-mine">{{ t.bar.deal.mine }}</span>
            <DtArt v-if="!openedOf(i - 1) && !local.result" name="game-box" :size="28" />
            <b>{{ t.bar.deal.box(i) }}</b>
            <span v-if="openedOf(i - 1) || local.result" class="dt-deal-prize">{{
              local.result ? prizeShort(local.all?.[i - 1]) : prizeShort(openedOf(i - 1))
            }}</span>
          </button>
        </div>
      </section>
      <section
        v-if="local.offer !== null && !local.result"
        class="dt-bar-result is-warn"
        data-testid="deal-offer"
      >
        <span class="dt-deal-offer-label">{{ t.bar.deal.offerLabel }}</span>
        <b class="dt-deal-offer">{{ t.bar.deal.coin(formatNum(local.offer)) }}</b>
        <div class="dt-bar-detail">{{ t.bar.deal.offerNote(local.opens[local.round + 1] ?? 0) }}</div>
        <div class="dt-bar-pair">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            data-testid="deal-yes"
            @click="run(() => endpoints.barDealAnswer(true), t.bar.deal.failed)"
          >
            {{ t.bar.deal.yes }}
          </button>
          <button
            type="button"
            class="btn btn-outline-primary"
            :disabled="busy"
            data-testid="deal-no"
            @click="run(() => endpoints.barDealAnswer(false), t.bar.deal.failed)"
          >
            {{ t.bar.deal.no }}
          </button>
        </div>
      </section>
      <!-- 结束时结果放最前面，开箱记录在后（终审） -->
      <section
        v-if="local.result"
        :class="['dt-bar-result', local.result === 'deal' ? 'is-warn' : 'is-ok']"
        data-testid="deal-result"
      >
        <b>{{ result[0] }}</b>
        <div v-for="(line, i) in result.slice(1)" :key="i" class="dt-bar-detail">{{ line }}</div>
        <button
          type="button"
          class="btn btn-outline-primary dt-btn-block"
          data-testid="deal-again"
          @click="again"
        >
          {{ t.bar.again }}
        </button>
      </section>
      <template v-if="!local.result">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.bar.deal.leftTitle }}</h2>
        </div>
        <div class="dt-chip-list" data-testid="deal-left">
          <span v-for="(p, i) in local.left" :key="i">{{ prizeText(p) }}</span>
        </div>
      </template>
      <template v-else>
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.bar.deal.allTitle }}</h2>
        </div>
        <div class="dt-chip-list">
          <span v-for="(p, i) in local.all ?? []" :key="i" :data-testid="`deal-all-${i}`"
            >{{ t.bar.deal.box(i + 1) }} {{ prizeText(p) }}</span
          >
        </div>
      </template>
      <template v-if="roundsOpened.length > 0">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.bar.deal.roundsTitle }}</h2>
        </div>
        <div class="dt-card dt-rows-card">
          <div
            v-for="(line, i) in roundsOpened"
            :key="i"
            class="dt-row dt-deal-round"
            :data-testid="`deal-round-${i}`"
          >
            {{ line }}
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
