<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BarDto, DartsAimDto, DartsThrowDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';
import { roundGone } from './gone';

/** 准星位置：三角波，和服务端 dartX 同一个公式；返回 [-1, 1] */
function dartX(elapsedMs: number, period: number, phase: number): number {
  const p = (((elapsedMs / period + phase) % 1) + 1) % 1;
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
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
  if (r.result === 'win') return `${head}${d.win(r.award ? d.got(awardText(r.award, catalog)) : '')}`;
  if (r.result === 'draw') return `${head}${d.draw(r.refund ?? 0)}`;
  return `${head}${d.lose}`;
});
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">
      {{ t.bar.darts.rule }}
    </div>
    <div class="dt-meta mb-2" data-testid="darts-played">
      {{ t.bar.todayPlayed(data.darts.played, data.darts.max, data.darts.cost) }}
    </div>

    <div class="dt-board mb-2" role="img" :aria-label="t.bar.darts.board">
      <div class="dt-board-ring dt-board-r5"></div>
      <div class="dt-board-ring dt-board-r10"></div>
      <div class="dt-board-ring dt-board-r25"></div>
      <div class="dt-board-ring dt-board-r50"></div>
      <div
        v-if="(aim || last) && !invalid"
        class="dt-board-marker"
        :style="{ left: pct }"
        data-testid="darts-marker"
      ></div>
    </div>
    <div v-if="invalid && !aim" class="text-danger mb-2" aria-live="polite" data-testid="darts-invalid">
      {{ t.bar.darts.invalid }}
    </div>

    <div v-if="throws && throws.length > 0" class="mb-2" data-testid="darts-throws">
      <span v-for="(s, i) in throws" :key="i" class="me-2">{{ t.bar.darts.throwLine(i + 1, s) }}</span>
    </div>

    <template v-if="last?.finished">
      <div
        :class="[
          'fw-bold',
          last.result === 'win' ? 'text-success' : last.result === 'draw' ? '' : 'text-danger',
        ]"
        aria-live="polite"
        data-testid="darts-result"
      >
        {{ resultText }}
      </div>
      <div class="dt-meta">{{ t.bar.darts.bossThrows(last.boss?.join(' / ') ?? '') }}</div>
      <button class="btn btn-sm btn-outline-primary mt-2" data-testid="darts-again" @click="again">
        {{ t.bar.again }}
      </button>
    </template>
    <template v-else-if="throws">
      <button
        v-if="!aim"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy"
        data-testid="darts-aim"
        @click="doAim"
      >
        {{ t.bar.darts.aim(throws.length + 1) }}
      </button>
      <button v-else class="btn btn-primary" :disabled="busy" data-testid="darts-throw" @click="doThrow">
        {{ t.bar.darts.throw }}
      </button>
    </template>
    <template v-else>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || limited || data.tickets < data.darts.cost"
        data-testid="darts-start"
        @click="start"
      >
        {{ t.bar.darts.start }}
      </button>
      <span v-if="limited" class="text-danger ms-1">{{ t.bar.noMoreToday }}</span>
    </template>
  </div>
</template>
