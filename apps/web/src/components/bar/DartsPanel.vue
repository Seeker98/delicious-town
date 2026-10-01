<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BarDto, DartsAimDto, DartsThrowDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';

/** 准星位置：三角波，和服务端 dartX 同一个公式；返回 [-1, 1] */
function dartX(elapsedMs: number, period: number, phase: number): number {
  const p = (((elapsedMs / period + phase) % 1) + 1) % 1;
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
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
    return null;
  } finally {
    busy.value = false;
  }
}

async function start() {
  const r = await call(() => endpoints.barDartsStart(), '开局失败');
  if (r) {
    last.value = null;
    throws.value = r.throws;
    emit('reload');
  }
}
async function doAim() {
  const r = await call(() => endpoints.barDartsAim(), '瞄准失败');
  if (!r) return;
  aim.value = r;
  t0.value = performance.now();
  x.value = dartX(0, r.period, r.phase);
  stopAnim();
  frame = requestAnimationFrame(tick);
}
async function doThrow() {
  if (!aim.value) return;
  const elapsed = Math.round(performance.now() - t0.value);
  stopAnim();
  const r = await call(() => endpoints.barDartsThrow(elapsed), '投掷失败');
  aim.value = null;
  if (!r) return;
  last.value = r;
  throws.value = r.throws;
  if (r.x !== null) x.value = r.x;
  if (r.finished) emit('reload');
}
function again() {
  last.value = null;
  throws.value = null;
}

const pct = computed(() => `${Math.round(((x.value + 1) / 2) * 1000) / 10}%`);
const limited = computed(() => props.data.darts.played >= props.data.darts.max);
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const resultText = computed(() => {
  const r = last.value;
  if (!r?.finished || !r.boss) return '';
  const head = `你 ${sum(r.throws)} : ${sum(r.boss)} 老板，`;
  if (r.result === 'win') return `${head}赢了！${r.award ? `得到 ${awardText(r.award, catalog)}` : ''}`;
  if (r.result === 'draw') return `${head}平局，退还 ${r.refund} 张神秘礼券`;
  return `${head}输了`;
});
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">
      准星在靶上左右摆动，点"投掷"出手；离靶心越近分越高（50/25/10/5）。三镖总分超过酒吧老板就赢。
    </div>
    <div class="dt-meta mb-2" data-testid="darts-played">
      今天 {{ data.darts.played }}/{{ data.darts.max }} 局，每局 {{ data.darts.cost }} 张神秘礼券
    </div>

    <div class="dt-board mb-2">
      <div class="dt-board-ring dt-board-r10"></div>
      <div class="dt-board-ring dt-board-r25"></div>
      <div class="dt-board-ring dt-board-r50"></div>
      <div v-if="aim || last" class="dt-board-marker" :style="{ left: pct }" data-testid="darts-marker"></div>
    </div>

    <div v-if="throws && throws.length > 0" class="mb-2" data-testid="darts-throws">
      <span v-for="(s, i) in throws" :key="i" class="me-2">第 {{ i + 1 }} 镖：{{ s }} 分</span>
    </div>

    <template v-if="last?.finished">
      <div
        :class="[
          'fw-bold',
          last.result === 'win' ? 'text-success' : last.result === 'draw' ? '' : 'text-danger',
        ]"
        data-testid="darts-result"
      >
        {{ resultText }}
      </div>
      <div class="dt-meta">老板三镖：{{ last.boss?.join(' / ') }}</div>
      <button class="btn btn-sm btn-outline-primary mt-2" data-testid="darts-again" @click="again">
        再来一局
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
        瞄准第 {{ throws.length + 1 }} 镖
      </button>
      <button v-else class="btn btn-primary" :disabled="busy" data-testid="darts-throw" @click="doThrow">
        投掷！
      </button>
    </template>
    <template v-else>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || limited || data.tickets < data.darts.cost"
        data-testid="darts-start"
        @click="start"
      >
        开一局
      </button>
      <span v-if="limited" class="text-danger ms-1">今天的局数用完了</span>
    </template>
  </div>
</template>
