<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BarDto, DartsAimDto, DartsThrowDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';
import { roundGone } from './gone';

/** 准星位置：三角波，和服务端 dartX 同一个公式；返回 [-1, 1] */
function dartX(elapsedMs: number, period: number, phase: number): number {
  const p = (((elapsedMs / period + phase) % 1) + 1) % 1;
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}

/** 靶条从左到右的分区（和区服数值 rings 一致：半径 0.05/0.15/0.3/0.5 内是 50/25/10/5 分），宽度见样式 */
const ZONES = [0, 5, 10, 25, 50, 25, 10, 5, 0] as const;

/**
 * 飞镖（界面改版 P9）：上面三镖的分数，中间靶条和左右摆动的准星，下面整宽的瞄准 / 投掷按钮
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

/** 本局已投的分数；null 表示没有进行中的局 */
const throws = ref<number[] | null>(null);
watch(
  () => props.data.darts.round,
  (r) => {
    if (!last.value?.finished) throws.value = r ? r.throws : null;
  },
);
const aim = ref<DartsAimDto | null>(null);
const t0 = ref(0);
const x = ref(0);
const last = ref<DartsThrowDto | null>(null);
/** 上一镖无效（出手时间对不上）：不显示准星位置，免得看起来像落在某处却是 0 分 */
const invalid = ref(false);
throws.value = props.data.darts.round?.throws ?? null;

let frame = 0;
function tick() {
  if (!aim.value) return;
  x.value = dartX(performance.now() - t0.value, aim.value.period, aim.value.phase);
  frame = requestAnimationFrame(tick);
}
function stopAnim() {
  cancelAnimationFrame(frame);
  frame = 0;
}
onBeforeUnmount(stopAnim);

async function call<T>(fn: () => Promise<T>, fallback: string): Promise<T | null> {
  if (busy.value) return null;
  busy.value = true;
  try {
    return await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    if (roundGone(e)) {
      stopAnim();
      aim.value = null;
      last.value = null;
      throws.value = null;
      emit('reload');
    }
    return null;
  } finally {
    busy.value = false;
  }
}

async function start() {
  const r = await call(() => endpoints.barDartsStart(), t.value.bar.startFailed);
  if (r) {
    last.value = null;
    throws.value = r.throws;
    emit('reload');
  }
}
async function doAim() {
  const r = await call(() => endpoints.barDartsAim(), t.value.bar.darts.aimFailed);
  if (!r) return;
  aim.value = r;
  invalid.value = false;
  t0.value = performance.now();
  x.value = dartX(0, r.period, r.phase);
  stopAnim();
  frame = requestAnimationFrame(tick);
}
async function doThrow() {
  if (!aim.value) return;
  const elapsed = Math.round(performance.now() - t0.value);
  stopAnim();
  const r = await call(() => endpoints.barDartsThrow(elapsed), t.value.bar.darts.throwFailed);
  aim.value = null;
  if (!r) return;
  last.value = r;
  throws.value = r.throws;
  invalid.value = r.x === null;
  if (r.x !== null) x.value = r.x;
  if (r.finished) emit('reload');
}
function again() {
  last.value = null;
  invalid.value = false;
  throws.value = null;
}

const pct = computed(() => `${Math.round(((x.value + 1) / 2) * 1000) / 10}%`);
const limited = computed(() => props.data.darts.played >= props.data.darts.max);
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const resultText = computed(() => {
  const r = last.value;
  if (!r?.finished || !r.boss) return '';
  const d = t.value.bar.darts;
  const head = d.head(sum(r.throws), sum(r.boss));
  if (r.result === 'win') return `${head}${d.win('')}`;
  if (r.result === 'draw') return `${head}${d.draw(r.refund ?? 0)}`;
  return `${head}${d.lose}`;
});
</script>

<template>
  <BarInfo
    game="darts"
    :title="t.bar.darts.title(data.darts.cost)"
    :sub="t.bar.darts.sub(data.darts.played, data.darts.max)"
  />
  <section class="dt-card dt-bar-stage">
    <div class="dt-darts-throws" data-testid="darts-throws">
      <div
        v-for="i in 3"
        :key="i"
        :class="['dt-darts-throw', { 'is-now': !!throws && !last?.finished && throws.length === i - 1 }]"
      >
        <span>{{ t.bar.darts.nth(i) }}</span>
        <b>{{ throws && throws[i - 1] !== undefined ? throws[i - 1] : '?' }}</b>
      </div>
    </div>
    <div class="dt-darts-board" role="img" :aria-label="t.bar.darts.board">
      <div class="dt-darts-zones" aria-hidden="true">
        <span v-for="(z, i) in ZONES" :key="i" :class="`is-${z}`">{{ z }}</span>
      </div>
      <span
        v-if="(aim || last) && !invalid"
        class="dt-darts-marker"
        :style="{ left: pct }"
        data-testid="darts-marker"
      ></span>
    </div>
    <p v-if="invalid && !aim" class="dt-bar-block" aria-live="polite" data-testid="darts-invalid">
      {{ t.bar.darts.invalid }}
    </p>
    <p v-else-if="aim" class="dt-bar-label dt-darts-hint">{{ t.bar.darts.hint }}</p>
  </section>

  <section
    v-if="last?.finished"
    :class="['dt-bar-result', last.result === 'win' ? 'is-ok' : last.result === 'draw' ? '' : 'is-bad']"
    aria-live="polite"
    data-testid="darts-result"
  >
    <b>{{ resultText }}</b>
    <div class="dt-bar-detail">{{ t.bar.darts.bossThrows(last.boss?.join(' / ') ?? '') }}</div>
    <div v-if="last.award" class="dt-award-chips"><AwardChip :award="last.award" /></div>
    <button
      type="button"
      class="btn btn-outline-primary dt-btn-block"
      data-testid="darts-again"
      @click="again"
    >
      {{ t.bar.again }}
    </button>
  </section>
  <template v-else-if="throws">
    <button
      v-if="!aim"
      type="button"
      class="btn btn-outline-primary dt-btn-block dt-bar-go"
      :disabled="busy"
      data-testid="darts-aim"
      @click="doAim"
    >
      {{ t.bar.darts.aim(throws.length + 1) }}
    </button>
    <button
      v-else
      type="button"
      class="btn btn-primary dt-btn-block dt-bar-go is-big"
      :disabled="busy"
      data-testid="darts-throw"
      @click="doThrow"
    >
      {{ t.bar.darts.throw }}
    </button>
  </template>
  <template v-else>
    <button
      type="button"
      class="btn btn-primary dt-btn-block dt-bar-go"
      :disabled="busy || limited || data.tickets < data.darts.cost"
      data-testid="darts-start"
      @click="start"
    >
      {{ t.bar.darts.start }}
    </button>
    <div v-if="limited" class="dt-bar-block">{{ t.bar.noMoreToday }}</div>
    <div v-else-if="data.tickets < data.darts.cost" class="dt-bar-block">
      {{ t.bar.noTicketsEach(data.darts.cost) }}
    </div>
  </template>
</template>
