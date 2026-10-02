<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { BarDto, MemoryAnswerDto, MemoryRoundDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';
import { roundGone } from './gone';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
/** 8 种配料，下标就是服务端的配料编号 */
const MIXES = computed(() => t.value.bar.memory.mixes);
const busy = ref(false);

type Phase = 'idle' | 'showing' | 'input' | 'result';
const phase = ref<Phase>('idle');
const current = ref<MemoryRoundDto | null>(null);
/** 展示时正在亮的配料；-1 没有 */
const on = ref(-1);
const picks = ref<number[]>([]);
const last = ref<MemoryAnswerDto | null>(null);

const timers: Array<ReturnType<typeof setTimeout>> = [];
onBeforeUnmount(() => timers.forEach((x) => clearTimeout(x)));

/** 依次点亮配方里的配料：每种亮 flashMs，间隔 gapMs */
function show(r: MemoryRoundDto) {
  current.value = r;
  picks.value = [];
  last.value = null;
  phase.value = 'showing';
  r.seq.forEach((mix, i) => {
    const at = i * (r.flashMs + r.gapMs);
    if (at === 0) on.value = mix;
    else timers.push(setTimeout(() => (on.value = mix), at));
    timers.push(setTimeout(() => (on.value = -1), at + r.flashMs));
  });
  const total = r.seq.length * r.flashMs + (r.seq.length - 1) * r.gapMs;
  timers.push(setTimeout(() => (phase.value = 'input'), total));
}

async function call<T>(fn: () => Promise<T>, fallback: string): Promise<T | null> {
  if (busy.value) return null;
  busy.value = true;
  try {
    return await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    if (roundGone(e)) {
      phase.value = 'idle';
      current.value = null;
      last.value = null;
      on.value = -1;
      emit('reload');
    }
    return null;
  } finally {
    busy.value = false;
  }
}

async function start() {
  const r = await call(() => endpoints.barMemoryStart(), t.value.bar.startFailed);
  if (r) {
    emit('reload');
    show(r);
  }
}
async function next() {
  const r = await call(() => endpoints.barMemoryNext(), t.value.bar.memory.nextFailed);
  if (r) show(r);
}
async function stop() {
  if (await call(() => endpoints.barMemoryStop(), t.value.bar.memory.opFailed)) {
    phase.value = 'idle';
    current.value = null;
    last.value = null;
    emit('reload');
  }
}

async function pick(i: number) {
  if (phase.value !== 'input' || !current.value) return;
  picks.value = [...picks.value, i];
  if (picks.value.length < current.value.seq.length) return;
  const r = await call(() => endpoints.barMemoryAnswer(picks.value), t.value.bar.memory.submitFailed);
  // 提交失败：清掉已点的配料重新点，免得下一次以多一个的长度提交（PR28 遗留）
  if (!r) picks.value = [];
  if (r) {
    last.value = r;
    phase.value = 'result';
    emit('reload');
  }
}

/** 刷新页面后接着这一局：重新放一遍配方；作答截止时间仍按服务端最初发出配方的时刻算（终审 I2） */
function resume() {
  const r = props.data.memory.round;
  if (!r?.seq) return;
  show({
    level: r.level,
    seq: r.seq,
    flashMs: props.data.memory.flashMs,
    gapMs: props.data.memory.gapMs,
    answerMs: r.leftMs ?? 0,
  });
}

/** 刷新页面后接着上次：本关答对在等选择；没看完的配方看不到了，只能放弃 */
const resumed = computed(() => (phase.value === 'idle' ? props.data.memory.round : null));
const limited = computed(() => props.data.memory.played >= props.data.memory.max);
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  const m = t.value.bar.memory;
  const recipe = (current.value?.seq ?? []).map((x) => MIXES.value[x]).join(t.value.events.sep);
  if (r.reason === 'late') return m.late((current.value?.answerMs ?? 0) / 1000, recipe);
  if (r.reason === 'early') return m.early(recipe);
  if (!r.correct) return m.wrong(recipe);
  const award = r.award ? m.got(awardText(r.award, catalog)) : '';
  return r.finished ? m.allPassed(award) : m.passed(award);
});
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">
      {{ t.bar.memory.rule }}
    </div>
    <div class="dt-meta mb-2" data-testid="mem-played">
      {{ t.bar.todayPlayed(data.memory.played, data.memory.max, data.memory.cost) }}
    </div>

    <div class="dt-mixes mb-2">
      <button
        v-for="(m, i) in MIXES"
        :key="m"
        :class="['dt-mix', 'dt-tap', { 'dt-mix-on': on === i }]"
        :disabled="phase !== 'input' || busy"
        :data-testid="`mix-${i}`"
        @click="pick(i)"
      >
        {{ m }}
      </button>
    </div>

    <template v-if="phase === 'idle'">
      <template v-if="resumed && resumed.passed">
        <div class="mb-1">{{ t.bar.memory.resumePassed(resumed.level) }}</div>
        <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="mem-next" @click="next">
          {{ t.bar.memory.next }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary ms-1"
          :disabled="busy"
          data-testid="mem-stop"
          @click="stop"
        >
          {{ t.bar.memory.stop }}
        </button>
      </template>
      <template v-else-if="resumed && resumed.seq">
        <div class="mb-1">{{ t.bar.memory.resumeSeq(resumed.level) }}</div>
        <button class="btn btn-sm btn-primary" data-testid="mem-resume" @click="resume">
          {{ t.bar.memory.resume }}
        </button>
      </template>
      <template v-else-if="resumed">
        <div class="mb-1">{{ t.bar.memory.resumeLost }}</div>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          data-testid="mem-abandon"
          @click="stop"
        >
          {{ t.bar.memory.abandon }}
        </button>
      </template>
      <template v-else>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || limited || data.tickets < data.memory.cost"
          data-testid="mem-start"
          @click="start"
        >
          {{ t.bar.memory.start }}
        </button>
        <span v-if="limited" class="text-danger ms-1">{{ t.bar.noMoreToday }}</span>
      </template>
    </template>

    <div v-else-if="phase === 'showing'" class="text-muted">{{ t.bar.memory.watch }}</div>

    <div v-else-if="phase === 'input'" class="d-flex align-items-center gap-2">
      <span>{{
        t.bar.memory.picked(
          picks.length,
          current?.seq.length ?? 0,
          picks.map((x) => MIXES[x]).join(t.events.sep),
        )
      }}</span>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="picks.length === 0"
        data-testid="mem-undo"
        @click="picks = picks.slice(0, -1)"
      >
        {{ t.bar.memory.undo }}
      </button>
    </div>

    <template v-else>
      <div
        :class="['fw-bold', last?.correct ? 'text-success' : 'text-danger']"
        aria-live="polite"
        data-testid="mem-result"
      >
        {{ resultText }}
      </div>
      <div class="mt-2">
        <template v-if="last?.canNext">
          <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="mem-next" @click="next">
            {{ t.bar.memory.nextLevel((current?.level ?? 0) + 1) }}
          </button>
          <button
            class="btn btn-sm btn-outline-secondary ms-1"
            :disabled="busy"
            data-testid="mem-stop"
            @click="stop"
          >
            {{ t.bar.memory.stop }}
          </button>
        </template>
        <button v-else class="btn btn-sm btn-outline-primary" data-testid="mem-again" @click="phase = 'idle'">
          {{ t.bar.again }}
        </button>
      </div>
    </template>
  </div>
</template>
