<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BarDto, NimDto, NimTable } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';
import { roundGone } from './gone';

/** 最后一颗糖（问题记录 427-1）：两张桌子，和调酒师轮流拿 1~k 颗，拿到最后一颗的赢 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const t = useT();
const toast = useToastStore();
const catalog = useCatalogStore();
const busy = ref(false);
const TABLES: readonly NimTable[] = ['novice', 'expert'];
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
const logText = computed(() =>
  (view.value?.log ?? [])
    .map((m) => (m.who === 'me' ? t.value.bar.nim.logMe(m.take) : t.value.bar.nim.logBartender(m.take)))
    .join(' · '),
);
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
  <div class="small">
    <div class="dt-meta mb-2">{{ t.bar.nim.rule }}</div>
    <template v-if="!view">
      <div class="mb-1">{{ leftToday > 0 ? t.bar.nim.left(leftToday) : t.bar.nim.noLeft }}</div>
      <div v-for="x in TABLES" :key="x" class="dt-item" :data-testid="`nim-table-${x}`">
        <div class="dt-item-main">
          <div class="dt-item-title">{{ t.bar.nim.tables[x] }}</div>
          <div class="dt-meta">
            {{ t.bar.nim.tableLine(n.tables[x].cost, kText(n.tables[x].k), n.tables[x].renown) }}
          </div>
          <div class="dt-meta">
            {{ t.bar.nim.hint(n.tables[x].first, n.tables[x].careless) }}
          </div>
          <div v-if="blockOf(x)" class="dt-meta text-danger">{{ blockOf(x) }}</div>
        </div>
        <div class="dt-item-actions">
          <button
            class="btn btn-sm btn-outline-primary"
            :disabled="busy || !!blockOf(x)"
            :data-testid="`nim-start-${x}`"
            @click="run(() => endpoints.barNimStart(x), t.bar.startFailed)"
          >
            {{ t.bar.nim.start }}
          </button>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="visually-hidden" aria-live="polite" data-testid="nim-live">{{ liveText }}</div>
      <div class="fw-bold mb-1">{{ t.bar.nim.tables[view.table] }}</div>
      <div v-if="view.coin" class="dt-meta mb-1" data-testid="nim-coin">
        {{ view.coin === 'me' ? t.bar.nim.coinMe : t.bar.nim.coinBartender }}
      </div>
      <div v-if="!view.result" class="mb-1" data-testid="nim-status">
        {{ t.bar.nim.status(view.left, view.k) }}
      </div>
      <div class="dt-nim-board mb-2" aria-hidden="true">
        <span v-for="i in view.left" :key="i" class="dt-nim-candy"></span>
      </div>
      <div v-if="lastBartender !== null && !view.result" class="mb-1" data-testid="nim-bartender">
        {{ t.bar.nim.bartenderTook(lastBartender) }}
      </div>
      <div v-if="view.needFirst" class="d-flex flex-wrap gap-1">
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy"
          data-testid="nim-first-me"
          @click="run(() => endpoints.barNimFirst('me'), t.bar.nim.failed)"
        >
          {{ t.bar.nim.meFirst }}
        </button>
        <button
          class="btn btn-sm btn-outline-primary"
          :disabled="busy"
          data-testid="nim-first-bartender"
          @click="run(() => endpoints.barNimFirst('bartender'), t.bar.nim.failed)"
        >
          {{ t.bar.nim.bartenderFirst }}
        </button>
      </div>
      <div v-else-if="!view.result" class="d-flex flex-wrap gap-1">
        <button
          v-for="k in takes"
          :key="k"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || waiting || k > view.left"
          :data-testid="`nim-take-${k}`"
          @click="run(() => endpoints.barNimTake(k), t.bar.nim.failed)"
        >
          {{ t.bar.nim.take(k) }}
        </button>
      </div>
      <div v-if="logText" class="dt-meta mt-2" data-testid="nim-log">{{ logText }}</div>
      <template v-if="view.result">
        <div
          :class="['mt-2', 'fw-bold', view.result === 'win' ? 'text-success' : 'text-danger']"
          data-testid="nim-result"
        >
          {{ resultText }}
        </div>
        <button class="btn btn-sm btn-outline-primary mt-2" data-testid="nim-again" @click="reset">
          {{ t.bar.again }}
        </button>
      </template>
    </template>
  </div>
</template>
