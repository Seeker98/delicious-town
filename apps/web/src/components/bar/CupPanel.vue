<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BarDto, CupDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';
import { roundGone } from './gone';

/** 猜酒杯（问题记录 427-5）：一局闯关，杯子一轮比一轮多；猜中可以收手或继续，猜错什么都没有 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

const c = computed(() => props.data.cup);
/** 局面进度：每轮猜中 +1、进下一轮再 +1 */
const progress = (r: CupDto) => r.round * 2 + (r.won ? 1 : 0);
/** 当前局面：结束的结果留着展示，否则跟着概览里进行中的局 */
const local = ref<CupDto | null>(null);
watch(
  () => props.data.cup.round,
  (r) => {
    if (local.value?.result) return;
    // 概览可能比刚收到的结果晚到：比手上的局面旧就不覆盖
    if (r && local.value && progress(r) < progress(local.value)) return;
    local.value = r;
  },
  { immediate: true },
);
/** 读屏播报：每次猜的结果、进下一轮、结束 */
const live = ref('');

const streak = computed(() => (c.value.result === 'win' ? c.value.times : 0));
const block = computed(() =>
  !local.value && props.data.tickets < c.value.cost ? t.value.bar.cup.noTickets(c.value.cost) : '',
);
const tierRows = computed(() =>
  c.value.tiers.map((x, i) => t.value.bar.cup.tierLine(i + 1, c.value.cups[i]!, x.awards, x.news)),
);
/** 桌上几个杯子：没开局时是第 1 轮 */
const cupCount = computed(() => local.value?.cups ?? c.value.cups[0]!);
const decided = computed(() => !!local.value && (local.value.won || !!local.value.result));
/** 翻开的杯子：猜过以后才有 */
const shown = computed(() => (decided.value ? local.value!.last : null));
const cupState = (i: number) => {
  const s = shown.value;
  if (!s) return '';
  const x = t.value.bar.cup;
  return [s.pick === i ? x.yours : '', s.ball === i ? x.ball : ''].filter(Boolean).join(t.value.bar.cup.sep);
};

const pickText = (r: CupDto | null) => t.value.bar.cup.pick((r?.round ?? 0) + 1, r?.cups ?? c.value.cups[0]!);
const wonText = (r: CupDto) =>
  t.value.bar.cup.won(
    r.last?.lucky ? t.value.bar.luckily : '',
    c.value.tiers[r.round]?.awards ?? 0,
    r.round + 2,
    c.value.cups[r.round + 1] ?? 0,
  );
function resultHead(r: CupDto): string {
  const x = t.value.bar.cup;
  if (r.result === 'lose') return x.lose((r.last?.ball ?? 0) + 1);
  if (r.result === 'clear') return x.clear(r.last?.lucky ? t.value.bar.luckily : '');
  return x.stopped(r.round + 1);
}
const awardLines = (r: CupDto) => r.awards.map((a) => t.value.bar.cup.got(awardText(a, catalog)));
function liveOf(r: CupDto): string {
  if (r.result) return [resultHead(r), ...awardLines(r)].join(t.value.bar.cup.sep);
  return r.won ? wonText(r) : pickText(r);
}

async function run(fn: () => Promise<CupDto>) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await fn();
    local.value = r;
    live.value = liveOf(r);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.cup.failed), 'danger');
    // 局面没了就回到开局；别的错误（网络、和服务端对不上）先用概览里的局面，再重新读
    local.value = roundGone(e) ? null : props.data.cup.round;
    emit('reload');
  } finally {
    busy.value = false;
  }
}
function again() {
  local.value = null;
  live.value = '';
}
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">{{ t.bar.cup.rule(c.cost, c.cups.length) }}</div>
    <div v-if="streak > 0" class="mb-1" data-testid="cup-streak">{{ t.bar.streak(streak) }}</div>
    <template v-if="!local">
      <div v-for="(line, i) in tierRows" :key="i" class="dt-meta" :data-testid="`cup-tier-${i}`">
        {{ line }}
      </div>
      <div v-if="block" class="dt-meta text-danger mt-1" data-testid="block">{{ block }}</div>
    </template>
    <!-- 读屏的固定播报区：每次猜的结果、进下一轮、结束 -->
    <div class="visually-hidden" aria-live="polite" data-testid="cup-live">{{ live }}</div>
    <div v-if="!decided" class="mt-2 mb-1">{{ pickText(local) }}</div>
    <div
      class="dt-guess-grid my-2"
      :style="{ gridTemplateColumns: `repeat(${Math.min(cupCount, 5)}, minmax(0, 1fr))` }"
    >
      <button
        v-for="i in cupCount"
        :key="i - 1"
        type="button"
        :class="[
          'dt-guess',
          { 'dt-guess-pick': shown?.pick === i - 1, 'dt-guess-ball': shown?.ball === i - 1 },
        ]"
        :disabled="busy || !!block || decided"
        :aria-label="t.bar.cup.cupLabel(i, cupState(i - 1))"
        :data-testid="`cup-${i - 1}`"
        :data-cup="i - 1"
        @click="run(() => endpoints.barCupGuess(i - 1))"
      >
        <span class="fw-bold">{{ t.bar.cup.cup(i) }}</span>
        <span class="dt-guess-text">{{ cupState(i - 1) }}</span>
      </button>
    </div>
    <div v-if="local?.won && !local.result" class="dt-note mb-2">
      <div class="fw-bold mb-1" data-testid="cup-won">{{ wonText(local) }}</div>
      <div class="d-flex flex-wrap gap-1">
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy"
          data-testid="cup-stop"
          @click="run(() => endpoints.barCupStop())"
        >
          {{ t.bar.cup.stop }}
        </button>
        <button
          class="btn btn-sm btn-outline-primary"
          :disabled="busy"
          data-testid="cup-next"
          @click="run(() => endpoints.barCupNext())"
        >
          {{ t.bar.cup.next }}
        </button>
      </div>
    </div>
    <template v-if="local?.result">
      <div
        :class="['fw-bold', local.result === 'lose' ? 'text-danger' : 'text-success']"
        data-testid="cup-result"
      >
        <div>{{ resultHead(local) }}</div>
        <div v-for="(line, i) in awardLines(local)" :key="i" class="fw-normal" data-testid="cup-award">
          {{ line }}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-primary mt-2" data-testid="cup-again" @click="again">
        {{ t.bar.again }}
      </button>
    </template>
  </div>
</template>
