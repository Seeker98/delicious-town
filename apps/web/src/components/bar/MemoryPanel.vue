<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { BarDto, MemoryAnswerDto, MemoryRoundDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';
import { roundGone } from './gone';

/**
 * 记忆调酒（界面改版 P9）：上面一条关卡进度，中间已选的格子和 8 种配料（配方依次闪亮），
 * 答完结果卡里选继续下一关或收手
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
/** 8 种配料，下标就是服务端的配料编号 */
const MIXES = computed(() => t.value.bar.memory.mixes);
const MIX_ART: readonly ArtName[] = [
  'game-mix-rum',
  'game-mix-vodka',
  'game-mix-gin',
  'game-mix-lemon',
  'game-mix-mint',
  'game-mix-syrup',
  'game-mix-ice',
  'game-mix-soda',
];
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
/** 再来一局：关卡进度回到没开局（P9 终审 M1：原来停在上一局的关） */
function again() {
  phase.value = 'idle';
  current.value = null;
  last.value = null;
}
/** 关卡进度：当前第几关（1 起，没开局为 0）、这一关答对了没有 */
const level = computed(() => current.value?.level ?? resumed.value?.level ?? 0);
const levelPassed = computed(() =>
  phase.value === 'result' ? !!last.value?.correct : phase.value === 'idle' && !!resumed.value?.passed,
);
const recipe = computed(() => (current.value?.seq ?? []).map((x) => MIXES.value[x]).join(t.value.events.sep));
const resultHead = computed(() => {
  const r = last.value;
  if (!r) return '';
  const m = t.value.bar.memory;
  if (r.reason === 'late') return m.lateHead;
  if (r.reason === 'early') return m.earlyHead;
  if (!r.correct) return m.wrongHead;
  return r.finished ? m.allPassedHead : m.passedHead;
});
const resultDetail = computed(() => {
  const r = last.value;
  if (!r || r.correct) return '';
  const m = t.value.bar.memory;
  if (r.reason === 'late') return m.lateDetail((current.value?.answerMs ?? 0) / 1000, recipe.value);
  return m.recipeIs(recipe.value);
});
</script>

<template>
  <BarInfo
    game="memory"
    :title="t.bar.memory.title(data.memory.cost)"
    :sub="t.bar.memory.sub(data.memory.played, data.memory.max)"
  />
  <section class="dt-card dt-bar-stage">
    <ol class="dt-bar-track">
      <li
        v-for="(n, i) in data.memory.lengths"
        :key="i"
        :class="{
          'is-done': i + 1 < level || (i + 1 === level && levelPassed),
          'is-now': i + 1 === level && !levelPassed,
        }"
        :data-testid="`mem-level-${i + 1}`"
      >
        <span class="dt-bar-track-dot" aria-hidden="true">{{
          i + 1 < level || (i + 1 === level && levelPassed) ? '✓' : i + 1
        }}</span
        >{{ t.bar.memory.levelStep(i + 1, n) }}
      </li>
    </ol>
  </section>
  <section class="dt-card dt-bar-stage">
    <div v-if="phase === 'input'" class="dt-bar-label-row">
      <p class="dt-bar-label" data-testid="mem-picked">
        {{ t.bar.memory.pickedShort(picks.length, current?.seq.length ?? 0) }}
      </p>
      <button
        type="button"
        class="dt-link-btn"
        :disabled="picks.length === 0"
        data-testid="mem-undo"
        @click="picks = picks.slice(0, -1)"
      >
        {{ t.bar.memory.undo }}
      </button>
    </div>
    <p v-else-if="phase === 'showing'" class="dt-bar-label" data-testid="mem-watch">
      {{ t.bar.memory.watch }}
    </p>
    <p v-else class="dt-bar-label">{{ t.bar.memory.idleHint }}</p>
    <div
      v-if="current && (phase === 'input' || phase === 'showing')"
      class="dt-mem-slots"
      :style="{ gridTemplateColumns: `repeat(${current.seq.length}, minmax(0, 1fr))` }"
    >
      <span
        v-for="(_, i) in current.seq"
        :key="i"
        :class="['dt-mem-slot', { 'is-full': picks[i] !== undefined }]"
        >{{ picks[i] !== undefined ? MIXES[picks[i]!] : '' }}</span
      >
    </div>
    <div class="dt-mem-mixes">
      <button
        v-for="(m, i) in MIXES"
        :key="m"
        type="button"
        :class="['dt-mem-mix', { 'is-on': on === i }]"
        :disabled="phase !== 'input' || busy"
        :data-testid="`mix-${i}`"
        @click="pick(i)"
      >
        <DtArt :name="MIX_ART[i]!" :size="34" />{{ m }}
      </button>
    </div>
  </section>

  <template v-if="phase === 'idle'">
    <section v-if="resumed && resumed.passed" class="dt-bar-result is-ok">
      <b>{{ t.bar.memory.resumePassed(resumed.level) }}</b>
      <div class="dt-bar-pair">
        <button type="button" class="btn btn-primary" :disabled="busy" data-testid="mem-next" @click="next">
          {{ t.bar.memory.next }}
        </button>
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="busy"
          data-testid="mem-stop"
          @click="stop"
        >
          {{ t.bar.memory.stop }}
        </button>
      </div>
    </section>
    <section v-else-if="resumed && resumed.seq" class="dt-bar-result">
      <b>{{ t.bar.memory.resumeSeq(resumed.level) }}</b>
      <button type="button" class="btn btn-primary dt-btn-block" data-testid="mem-resume" @click="resume">
        {{ t.bar.memory.resume }}
      </button>
    </section>
    <section v-else-if="resumed" class="dt-bar-result is-bad">
      <b>{{ t.bar.memory.resumeLost }}</b>
      <button
        type="button"
        class="btn btn-outline-primary dt-btn-block"
        :disabled="busy"
        data-testid="mem-abandon"
        @click="stop"
      >
        {{ t.bar.memory.abandon }}
      </button>
    </section>
    <template v-else>
      <button
        type="button"
        class="btn btn-primary dt-btn-block dt-bar-go"
        :disabled="busy || limited || data.tickets < data.memory.cost"
        data-testid="mem-start"
        @click="start"
      >
        {{ t.bar.memory.start }}
      </button>
      <div v-if="limited" class="dt-bar-block">{{ t.bar.noMoreToday }}</div>
      <div v-else-if="data.tickets < data.memory.cost" class="dt-bar-block">
        {{ t.bar.noTicketsEach(data.memory.cost) }}
      </div>
    </template>
  </template>

  <section
    v-else-if="phase === 'result' && last"
    :class="['dt-bar-result', last.correct ? 'is-ok' : 'is-bad']"
    aria-live="polite"
    data-testid="mem-result"
  >
    <b>{{ resultHead }}</b>
    <div v-if="resultDetail" class="dt-bar-detail">{{ resultDetail }}</div>
    <div v-if="last.award" class="dt-award-chips"><AwardChip :award="last.award" /></div>
    <div v-if="last.canNext" class="dt-bar-pair">
      <button type="button" class="btn btn-primary" :disabled="busy" data-testid="mem-next" @click="next">
        {{ t.bar.memory.nextLevel((current?.level ?? 0) + 1) }}
      </button>
      <button
        type="button"
        class="btn btn-outline-primary"
        :disabled="busy"
        data-testid="mem-stop"
        @click="stop"
      >
        {{ t.bar.memory.stop }}
      </button>
    </div>
    <button
      v-else
      type="button"
      class="btn btn-outline-primary dt-btn-block"
      data-testid="mem-again"
      @click="again"
    >
      {{ t.bar.again }}
    </button>
  </section>
  <p class="dt-block-note mt-2">{{ t.bar.memory.note }}</p>
</template>
