<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { timeHM } from '../../utils/format';
import type { BarDto, DevilDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import DtArt from '../DtArt.vue';
import BarInfo from './BarInfo.vue';
import { roundGone } from './gone';

/**
 * 魔鬼辣杯（界面改版 P9）：没开局时选押注（押注和拿回张数是一张表），开局后 6 个杯子轮流挑；
 * 下面一条进度写活过几杯拿回多少
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
/** 当前局面：优先用刚收到的结果（结束后还要展示），否则用概览里进行中的局 */
const local = ref<DevilDto | null>(null);
watch(
  () => props.data.devil.round,
  (r) => {
    const l = local.value;
    // 结束的结果留着展示；概览里同一个局面没有"调酒师刚喝了哪杯"，保留刚收到的（终审 I1）
    if (l?.result) return;
    if (l && r && l.cups.join() === r.cups.join()) return;
    local.value = r;
  },
  { immediate: true },
);
const round = computed(() => local.value);
/** 今天的局数用完了（2026-10-09 起每天最多 dailyMax 局） */
const limited = computed(() => props.data.devil.played >= props.data.devil.max);
const finished = computed(() => !!round.value?.result);
/** 选中的押注：默认第一档押得起的 */
const canStake = (s: number) => s <= props.data.tickets;
const stake = ref<number>(
  props.data.devil.stakes.find((s) => s <= props.data.tickets) ?? props.data.devil.stakes[0]!,
);
/** 礼券变少（一局输了）后选中的那档押不起了：换成押得起的最高一档（P9 终审 M3） */
watch(
  () => props.data.tickets,
  () => {
    if (canStake(stake.value)) return;
    const ok = props.data.devil.stakes.filter(canStake);
    if (ok.length > 0) stake.value = ok[ok.length - 1]!;
  },
);
/** 押注是一组单选：方向键在押得起的几档之间移动（P9 终审 M3） */
function stakeKey(e: KeyboardEvent, i: number) {
  const step =
    e.key === 'ArrowDown' || e.key === 'ArrowRight'
      ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
        ? -1
        : 0;
  if (!step) return;
  e.preventDefault();
  const all = props.data.devil.stakes;
  for (let j = i + step; j >= 0 && j < all.length; j += step) {
    if (!canStake(all[j]!)) continue;
    stake.value = all[j]!;
    const el = (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(
      `[data-testid="devil-stake-${all[j]}"]`,
    );
    el?.focus();
    return;
  }
}
const stakeRow = computed(() => props.data.devil.stakes.indexOf(round.value?.stake ?? stake.value));
const payouts = computed(() => props.data.devil.payouts[stakeRow.value] ?? []);
const poorStakes = computed(() => props.data.devil.stakes.filter((s) => !canStake(s)));
const info = computed(() => {
  const d = t.value.bar.devil;
  const r = round.value;
  if (!r) return { title: d.title, sub: d.sub(props.data.devil.played, props.data.devil.max) };
  const next = payouts.value
    .map((v, k) => ({ k: k + 1, v }))
    .filter((x) => x.k > r.survived)
    .map((x) => d.nextPay(x.k, x.v))
    .join(t.value.bar.devil.sep);
  return { title: d.playing(r.stake, r.survived), sub: next || d.maxed };
});
/** 喝过的杯子是空杯 */
const cupArt = (c: DevilDto['cups'][number]) => (c !== null ? 'game-shot-empty' : 'game-shot');

const hhmm = (iso: string) => timeHM(iso);
/** 我刚喝的那一杯：状态里先说我的结果，再说调酒师的（PR28 遗留：分两步说明） */
const mineCup = ref<number | null>(null);
const status = computed(() => {
  const r = round.value;
  if (!r || r.result || r.lastBartender === null) return '';
  const d = t.value.bar.devil;
  const head = mineCup.value !== null ? d.statusMine(mineCup.value + 1) : d.statusBartender;
  return d.status(head, r.lastBartender + 1, mineCup.value !== null);
});
const resultText = computed(() => {
  const r = round.value;
  if (!r?.result) return '';
  const d = t.value.bar.devil;
  if (r.result === 'win') return d.win(r.survived, r.payout);
  return d.lose(r.stake, r.hangoverUntil ? hhmm(r.hangoverUntil) : '');
});
const cupLabel = (c: DevilDto['cups'][number], i: number) =>
  c === 'me'
    ? t.value.bar.devil.drankMe
    : c === 'bartender'
      ? t.value.bar.devil.drankBartender
      : t.value.bar.devil.cup(i + 1);

/** 喝一杯：成功后才记下我喝的是哪杯，失败时状态行不会说错杯号（终审） */
async function drink(i: number) {
  const before = local.value;
  await run(() => endpoints.barDevilDrink(i), t.value.bar.devil.drinkFailed);
  if (local.value !== before && local.value !== null) mineCup.value = i;
}

async function run(fn: () => Promise<DevilDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    local.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    if (roundGone(e)) {
      local.value = null;
      emit('reload');
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BarInfo game="devil" :title="info.title" :sub="info.sub">
    <template #rules>
      <table class="dt-bar-table" data-testid="devil-payouts">
        <thead>
          <tr>
            <th>{{ t.bar.devil.payoutHead }}</th>
            <th v-for="(_, k) in data.devil.payouts[0]" :key="k">{{ t.bar.devil.payoutCol(k + 1) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in data.devil.payouts" :key="i">
            <td>{{ data.devil.stakes[i] }}</td>
            <td v-for="(v, k) in row" :key="k">{{ v }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </BarInfo>
  <template v-if="!round">
    <section class="dt-card dt-bar-stage dt-devil-intro">
      <div class="dt-devil-shots" aria-hidden="true">
        <DtArt v-for="i in 6" :key="i" name="game-shot" :size="36" />
      </div>
      <p>{{ t.bar.devil.intro }}</p>
    </section>
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.bar.devil.askStake }}</h2>
      <span class="dt-block-more">{{ t.bar.devil.payNote }}</span>
    </div>
    <div
      class="dt-card dt-devil-table"
      role="radiogroup"
      :aria-label="t.bar.devil.askStake"
      :style="{ '--dt-devil-cols': data.devil.payouts[0]?.length ?? 3 }"
    >
      <div class="dt-devil-row is-head" aria-hidden="true">
        <span>{{ t.bar.devil.payoutHead }}</span>
        <span v-for="(_, k) in data.devil.payouts[0]" :key="k">{{
          k === 0 ? t.bar.devil.payoutCol(k + 1) : t.bar.devil.payoutColShort(k + 1)
        }}</span>
      </div>
      <button
        v-for="(row, i) in data.devil.payouts"
        :key="i"
        type="button"
        role="radio"
        class="dt-devil-row"
        :aria-checked="stake === data.devil.stakes[i]"
        :tabindex="stake === data.devil.stakes[i] ? 0 : -1"
        :disabled="busy || limited || !canStake(data.devil.stakes[i]!)"
        :data-testid="`devil-stake-${data.devil.stakes[i]}`"
        @click="stake = data.devil.stakes[i]!"
        @keydown="stakeKey($event, i)"
      >
        <b>{{ t.bar.devil.stake(data.devil.stakes[i]!) }}</b>
        <span v-for="(v, k) in row" :key="k" data-testid="devil-payout-row">{{ v }}</span>
      </button>
    </div>
    <p v-if="poorStakes.length > 0" class="dt-bar-block">
      {{ t.bar.devil.poor(poorStakes.join(t.bar.devil.sep)) }}
    </p>
    <p class="dt-block-note mt-2" data-testid="devil-played">
      {{ t.bar.devil.today(data.devil.played, data.devil.max) }}
      <span v-if="limited" class="text-danger ms-1">{{ t.bar.noMoreToday }}</span>
    </p>
    <button
      type="button"
      class="btn btn-primary dt-btn-block dt-bar-go"
      :disabled="busy || limited || !canStake(stake)"
      data-testid="devil-start"
      @click="run(() => endpoints.barDevilStart(stake), t.bar.startFailed)"
    >
      {{ t.bar.devil.go(stake) }}
    </button>
  </template>
  <template v-else>
    <section class="dt-card dt-bar-stage">
      <div class="dt-devil-cups">
        <button
          v-for="(c, i) in round.cups"
          :key="i"
          type="button"
          :class="[
            'dt-devil-cup',
            {
              'is-me': c === 'me',
              'is-bar': c === 'bartender',
              'is-spiked': round.spiked === i,
              // 结束后没喝的杯子变灰（PR28 遗留）
              'is-left': finished && c === null && round.spiked !== i,
            },
          ]"
          :disabled="busy || finished || c !== null"
          :data-testid="`devil-cup-${i}`"
          @click="drink(i)"
        >
          <DtArt :name="cupArt(c)" :size="44" />
          <span>{{ t.bar.devil.cup(i + 1) }}</span>
          <span v-if="round.spiked === i || c !== null" class="dt-devil-cup-state">{{
            round.spiked === i ? t.bar.devil.spiked : cupLabel(c, i)
          }}</span>
        </button>
      </div>
      <p v-if="status" class="dt-bar-status" aria-live="polite" data-testid="devil-status">{{ status }}</p>
    </section>
    <section
      v-if="finished"
      :class="['dt-bar-result', round.result === 'win' ? 'is-ok' : 'is-bad']"
      aria-live="polite"
      data-testid="devil-result"
    >
      <b>{{ resultText }}</b>
      <button
        type="button"
        class="btn btn-outline-primary dt-btn-block"
        data-testid="devil-again"
        @click="local = null"
      >
        {{ t.bar.again }}
      </button>
    </section>
    <section class="dt-card dt-bar-stage">
      <ol class="dt-bar-track">
        <li
          v-for="(v, k) in payouts"
          :key="k"
          :class="{ 'is-done': k < round.survived, 'is-now': k === round.survived && !finished }"
        >
          <span class="dt-bar-track-dot" aria-hidden="true">{{ k < round.survived ? '✓' : k + 1 }}</span
          >{{ t.bar.devil.payStep(k + 1, v) }}
        </li>
      </ol>
    </section>
  </template>
</template>
