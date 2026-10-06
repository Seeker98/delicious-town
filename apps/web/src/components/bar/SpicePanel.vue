<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BarDto, SpiceDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';
import { roundGone } from './gone';

/** 秘制调料（问题记录 427-2）：猜调料的排列，回答几 A 几 B，猜得越快奖励越好 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const t = useT();
const toast = useToastStore();
const catalog = useCatalogStore();
const busy = ref(false);

/** 当前局面：结束的结果留着展示，否则跟着概览里进行中的局 */
const local = ref<SpiceDto | null>(null);
watch(
  () => props.data.spice.round,
  (r) => {
    if (local.value?.result) return;
    local.value = r;
  },
  { immediate: true },
);
/** 已选的调料，按空位顺序；null 是空位 */
const picked = ref<Array<number | null>>([]);
const s = computed(() => props.data.spice);
const resetPicked = () => (picked.value = Array.from({ length: s.value.length }, () => null));
resetPicked();

const nameOf = (i: number) => t.value.bar.spice.kinds[i] ?? String(i);
const listOf = (ids: readonly number[]) => ids.map(nameOf).join(t.value.bar.spice.sep);
const full = computed(() => picked.value.every((x) => x !== null));
/** 按顺序填进第一个空位 */
function pick(i: number) {
  const at = picked.value.indexOf(null);
  if (at < 0 || picked.value.includes(i)) return;
  picked.value[at] = i;
}
function unpick(at: number) {
  picked.value[at] = null;
}

async function run(fn: () => Promise<SpiceDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    local.value = await fn();
    resetPicked();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 局面不在了就回到开局；别的错误（网络、和服务端对不上）先用概览里的局面，再重新读（审查）
    resetPicked();
    local.value = roundGone(e) ? null : props.data.spice.round;
    emit('reload');
  } finally {
    busy.value = false;
  }
}
const submit = () => run(() => endpoints.barSpiceGuess(picked.value as number[]), t.value.bar.spice.failed);

const leftToday = computed(() => Math.max(0, s.value.max - s.value.played));
const block = computed(() =>
  leftToday.value <= 0
    ? t.value.bar.spice.noLeft
    : props.data.tickets < s.value.cost
      ? t.value.bar.spice.noTickets
      : '',
);
const tierRows = computed(() =>
  s.value.tiers.map((x, i) => ({
    from: i === 0 ? 1 : s.value.tiers[i - 1]!.maxTries + 1,
    to: x.maxTries,
    renown: x.renown,
  })),
);
const liveText = computed(() => {
  const r = local.value;
  if (!r) return '';
  if (r.result) return resultText.value;
  const g = r.guesses.at(-1);
  return g ? t.value.bar.spice.row(r.guesses.length, listOf(g.guess), g.a, g.b) : '';
});
const resultText = computed(() => {
  const r = local.value;
  if (!r?.result) return '';
  const x = t.value.bar.spice;
  if (r.result === 'lose') return x.lose(r.guesses.length || s.value.tries);
  return (
    x.win(r.guesses.length) +
    (r.renown > 0 ? x.renown(r.renown) : '') +
    (r.award ? t.value.bar.gotAward(awardText(r.award, catalog)) : '')
  );
});
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">{{ t.bar.spice.rule(s.length, s.tries) }}</div>
    <template v-if="!local">
      <div v-for="(x, i) in tierRows" :key="i" class="dt-meta" :data-testid="`spice-tier-${i}`">
        {{ t.bar.spice.tierLine(x.from, x.to, x.renown) }}
      </div>
      <div class="mt-2 mb-1">{{ leftToday > 0 ? t.bar.spice.left(leftToday) : t.bar.spice.noLeft }}</div>
      <div v-if="block && leftToday > 0" class="dt-meta text-danger mb-1">{{ block }}</div>
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!block"
        data-testid="spice-start"
        @click="run(() => endpoints.barSpiceStart(), t.bar.startFailed)"
      >
        {{ t.bar.spice.start(s.cost) }}
      </button>
    </template>
    <template v-else>
      <!-- 读屏的固定播报区：最新一次的回答，结束时是结果（审查 I1：新插入的节点带 aria-live 不播报） -->
      <div class="visually-hidden" aria-live="polite" data-testid="spice-live">{{ liveText }}</div>
      <div v-for="(g, i) in local.guesses" :key="i" class="dt-spice-row" :data-testid="`spice-row-${i}`">
        {{ t.bar.spice.row(i + 1, listOf(g.guess), g.a, g.b) }}
      </div>
      <template v-if="!local.result">
        <div class="dt-meta my-1">{{ t.bar.spice.triesLeft(local.left) }}</div>
        <div class="dt-spice-slots mb-2">
          <button
            v-for="(x, i) in picked"
            :key="i"
            type="button"
            class="dt-spice-slot"
            :aria-label="t.bar.spice.slot(i + 1, x === null ? null : nameOf(x))"
            :disabled="busy || x === null"
            :data-testid="`spice-slot-${i}`"
            @click="unpick(i)"
          >
            {{ x === null ? '' : nameOf(x) }}
          </button>
        </div>
        <div class="dt-spice-kinds mb-2">
          <button
            v-for="i in s.kinds"
            :key="i - 1"
            type="button"
            class="btn btn-sm btn-outline-secondary"
            :disabled="busy || picked.includes(i - 1) || full"
            :data-testid="`spice-kind-${i - 1}`"
            @click="pick(i - 1)"
          >
            {{ nameOf(i - 1) }}
          </button>
        </div>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || !full"
          data-testid="spice-submit"
          @click="submit"
        >
          {{ t.bar.spice.submit }}
        </button>
      </template>
      <template v-else>
        <div
          :class="['mt-2', 'fw-bold', local.result === 'win' ? 'text-success' : 'text-danger']"
          data-testid="spice-result"
        >
          {{ resultText }}
        </div>
        <div v-if="local.secret" class="mt-1" data-testid="spice-secret">
          {{ t.bar.spice.secret(listOf(local.secret)) }}
        </div>
        <button class="btn btn-sm btn-outline-primary mt-2" data-testid="spice-again" @click="local = null">
          {{ t.bar.again }}
        </button>
      </template>
    </template>
  </div>
</template>
