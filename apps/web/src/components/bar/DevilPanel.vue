<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BarDto, DevilDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { activeLocale } from '../../i18n';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { roundGone } from './gone';

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
const finished = computed(() => !!round.value?.result);

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });
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
  <div class="small">
    <div class="dt-meta mb-2">
      <div>{{ t.bar.devil.rule1 }}</div>
      <div>{{ t.bar.devil.rule2 }}</div>
      <div>{{ t.bar.devil.rule3 }}</div>
    </div>
    <template v-if="!round">
      <div class="mb-1">{{ t.bar.devil.askStake }}</div>
      <div class="d-flex flex-wrap gap-1">
        <button
          v-for="s in data.devil.stakes"
          :key="s"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || data.tickets < s"
          :data-testid="`devil-stake-${s}`"
          @click="run(() => endpoints.barDevilStart(s), t.bar.startFailed)"
        >
          {{ t.bar.devil.stake(s) }}
        </button>
      </div>
    </template>
    <template v-else>
      <div class="dt-meta mb-1">{{ t.bar.devil.progress(round.stake, round.survived) }}</div>
      <div class="dt-cups">
        <button
          v-for="(c, i) in round.cups"
          :key="i"
          :class="[
            'dt-cup',
            'dt-tap',
            {
              'dt-cup-me': c === 'me',
              'dt-cup-bar': c === 'bartender',
              'dt-cup-spiked': round.spiked === i,
              'dt-cup-left': finished && c === null && round.spiked !== i,
            },
          ]"
          :disabled="busy || finished || c !== null"
          :data-testid="`devil-cup-${i}`"
          @click="drink(i)"
        >
          <i class="bi bi-cup-straw"></i>
          <span>{{ round.spiked === i ? t.bar.devil.spiked : cupLabel(c, i) }}</span>
        </button>
      </div>
      <div v-if="status" class="mt-2" aria-live="polite" data-testid="devil-status">{{ status }}</div>
      <template v-if="finished">
        <div
          :class="['mt-2', 'fw-bold', round.result === 'win' ? 'text-success' : 'text-danger']"
          aria-live="polite"
          data-testid="devil-result"
        >
          {{ resultText }}
        </div>
        <button class="btn btn-sm btn-outline-primary mt-2" data-testid="devil-again" @click="local = null">
          {{ t.bar.again }}
        </button>
      </template>
    </template>
  </div>
</template>
