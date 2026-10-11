<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BarDto, NimDto, NimTable } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';
import { awardText } from './award';
import { roundGone } from './gone';

/**
 * 最后一颗糖（问题记录 427-1）：两张桌子，和调酒师轮流拿 1~k 颗，拿到最后一颗的赢。
 * 界面改版 P9：没开局时两张桌子各一行；开局后是剩下的糖果堆、每一步的记录和“拿几颗”按钮
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const t = useT();
const toast = useToastStore();
const catalog = useCatalogStore();
const busy = ref(false);
const TABLES: readonly NimTable[] = ['novice', 'expert'];
const CANDY_ART: readonly ArtName[] = ['game-candy-purple', 'game-candy', 'game-candy-gold'];
/** 调酒师那一步晚多久显示 */
const BARTENDER_DELAY = 600;

/** 当前局面：结束的结果留着展示，否则跟着概览里进行中的局 */
const local = ref<NimDto | null>(null);
/** 显示的局面：调酒师刚拿的那一步先不算进去，等 BARTENDER_DELAY 后再显示 */
const shown = ref<NimDto | null>(null);
const waiting = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.data.nim.round,
  (r) => {
    if (local.value?.result) return;
    if (waiting.value) return;
    // 概览可能比刚收到的结果晚到：比手上的局面旧（拿的步数更少）就不覆盖（#191 审查）
    if (r && local.value && r.log.length < local.value.log.length) return;
    local.value = r;
    shown.value = r;
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 收到新局面：最后一步是调酒师刚拿的，就先只显示到我那一步 */
function apply(r: NimDto) {
  const before = local.value?.log.length ?? 0;
  local.value = r;
  const last = r.log.at(-1);
  clearTimeout(timer);
  if (last?.who === 'bartender' && r.log.length > before && !reduceMotion()) {
    shown.value = { ...r, left: r.left + last.take, log: r.log.slice(0, -1), result: null };
    waiting.value = true;
    timer = setTimeout(() => {
      shown.value = local.value;
      waiting.value = false;
    }, BARTENDER_DELAY);
  } else {
    shown.value = r;
    waiting.value = false;
  }
}

async function run(fn: () => Promise<NimDto>, fallback: string) {
  if (busy.value || waiting.value) return;
  busy.value = true;
  try {
    apply(await fn());
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 局面不在了，或者和服务端对不上（另一个标签页动过）：都按概览重新读，不停在旧画面（审查）
    reset();
    if (!roundGone(e)) {
      local.value = props.data.nim.round;
      shown.value = props.data.nim.round;
    }
    emit('reload');
  } finally {
    busy.value = false;
  }
}

function reset() {
  clearTimeout(timer);
  waiting.value = false;
  local.value = null;
  shown.value = null;
}

const n = computed(() => props.data.nim);
const leftToday = computed(() => Math.max(0, n.value.max - n.value.played));
const kText = (k: [number, number]) => (k[0] === k[1] ? String(k[0]) : `${k[0]}~${k[1]}`);
/** 开不了局的原因；能开为空 */
const blockOf = (table: NimTable) =>
  leftToday.value <= 0
    ? t.value.bar.nim.noLeft
    : props.data.tickets < n.value.tables[table].cost
      ? t.value.bar.nim.noTickets
      : '';

const view = computed(() => shown.value);
const takes = computed(() => (view.value ? Array.from({ length: view.value.k }, (_, i) => i + 1) : []));
const lastBartender = computed(() => {
  const v = view.value;
  const last = v?.log.at(-1);
  return v && v.log.length > 0 && last?.who === 'bartender' ? last.take : null;
});
const resultText = computed(() => {
  const v = view.value;
  if (!v?.result) return '';
  const x = t.value.bar.nim;
  if (v.result === 'lose') return x.lose;
  return x.win(v.renown) + (v.award ? t.value.bar.gotAward(awardText(v.award, catalog)) : '');
});
/** 固定播报区：调酒师那一步和剩余；结束时是结果（#190 审查：原来的 aria-live 在新插入的节点上，读屏不播报） */
const liveText = computed(() => {
  const v = view.value;
  if (!v) return '';
  if (v.result) return resultText.value;
  const x = t.value.bar.nim;
  return [lastBartender.value !== null ? x.bartenderTook(lastBartender.value) : '', x.status(v.left, v.k)]
    .filter(Boolean)
    .join(' ');
});
</script>

<template>
  <!-- 固定播报区：一直在，开局后的第一条（抛硬币、调酒师先拿）也念得出来（终审） -->
  <div class="visually-hidden" aria-live="polite" data-testid="nim-live">{{ liveText }}</div>
  <template v-if="!view">
    <BarInfo
      game="nim"
      :title="t.bar.nim.title"
      :sub="leftToday > 0 ? t.bar.nim.left(leftToday) : t.bar.nim.noLeft"
    />
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.bar.nim.pickTable }}</h2>
    </div>
    <div class="dt-card dt-rows-card">
      <div
        v-for="x in TABLES"
        :key="x"
        class="dt-row dt-row-wrap dt-nim-table"
        :data-testid="`nim-table-${x}`"
      >
        <span class="dt-row-ico"
          ><DtArt :name="x === 'novice' ? 'game-candy' : 'game-candy-purple'" :size="28"
        /></span>
        <span class="dt-row-main">
          <span class="dt-row-title">{{ t.bar.nim.tables[x] }}</span>
          <span class="dt-row-sub">{{ t.bar.nim.tableLine(n.tables[x].cost, kText(n.tables[x].k)) }}</span>
          <span class="dt-row-sub">{{ t.bar.nim.hint(n.tables[x].first, n.tables[x].careless) }}</span>
          <span class="dt-row-sub">{{ t.bar.nim.prize(n.tables[x].renown) }}</span>
          <span v-if="blockOf(x)" class="dt-row-sub text-danger">{{ blockOf(x) }}</span>
        </span>
        <span class="dt-row-end">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            :disabled="busy || !!blockOf(x)"
            :data-testid="`nim-start-${x}`"
            @click="run(() => endpoints.barNimStart(x), t.bar.startFailed)"
          >
            {{ t.bar.nim.start }}
          </button>
        </span>
      </div>
    </div>
  </template>
  <template v-else>
    <BarInfo
      game="nim"
      :title="t.bar.nim.tableTitle(t.bar.nim.tables[view.table], view.k)"
      :sub="
        view.coin
          ? view.coin === 'me'
            ? t.bar.nim.coinMe
            : t.bar.nim.coinBartender
          : t.bar.nim.hint(n.tables[view.table].first, n.tables[view.table].careless)
      "
    />
    <section class="dt-card dt-bar-stage dt-nim-stage">
      <!-- 结束后不再写“还剩 0 颗” -->
      <div v-if="!view.result" class="dt-nim-left" data-testid="nim-status">
        <span>{{ t.bar.nim.leftLabel }}</span>
        <b>{{ view.left }}</b>
        <small>{{ t.bar.nim.unit }}</small>
      </div>
      <div class="dt-nim-candies" aria-hidden="true">
        <DtArt v-for="i in view.left" :key="i" :name="CANDY_ART[i % 3]!" :size="30" />
      </div>
      <div v-if="view.log.length > 0" class="dt-nim-log" data-testid="nim-log">
        <span v-for="(m, i) in view.log" :key="i" :class="{ 'is-me': m.who === 'me' }">{{
          m.who === 'me' ? t.bar.nim.logMe(m.take) : t.bar.nim.logBartender(m.take)
        }}</span>
      </div>
      <p v-if="lastBartender !== null && !view.result" class="dt-bar-status" data-testid="nim-bartender">
        {{ t.bar.nim.bartenderTook(lastBartender) }}
      </p>
    </section>
    <div v-if="view.needFirst" class="dt-bar-pair">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="busy"
        data-testid="nim-first-me"
        @click="run(() => endpoints.barNimFirst('me'), t.bar.nim.failed)"
      >
        {{ t.bar.nim.meFirst }}
      </button>
      <button
        type="button"
        class="btn btn-outline-primary"
        :disabled="busy"
        data-testid="nim-first-bartender"
        @click="run(() => endpoints.barNimFirst('bartender'), t.bar.nim.failed)"
      >
        {{ t.bar.nim.bartenderFirst }}
      </button>
    </div>
    <template v-else-if="!view.result">
      <p class="dt-bar-label">{{ t.bar.nim.howMany }}</p>
      <div class="dt-nim-takes" :style="{ gridTemplateColumns: `repeat(${takes.length}, minmax(0, 1fr))` }">
        <button
          v-for="k in takes"
          :key="k"
          type="button"
          class="btn btn-outline-primary"
          :disabled="busy || waiting || k > view.left"
          :aria-label="t.bar.nim.take(k)"
          :data-testid="`nim-take-${k}`"
          @click="run(() => endpoints.barNimTake(k), t.bar.nim.failed)"
        >
          {{ k }}
        </button>
      </div>
    </template>
    <section
      v-if="view.result"
      :class="['dt-bar-result', view.result === 'win' ? 'is-ok' : 'is-bad']"
      data-testid="nim-result"
    >
      <b>{{ view.result === 'win' ? t.bar.nim.win(view.renown) : t.bar.nim.lose }}</b>
      <div v-if="view.award" class="dt-award-chips"><AwardChip :award="view.award" /></div>
      <button
        type="button"
        class="btn btn-outline-primary dt-btn-block"
        data-testid="nim-again"
        @click="reset"
      >
        {{ t.bar.again }}
      </button>
    </section>
  </template>
</template>
