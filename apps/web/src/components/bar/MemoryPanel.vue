<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { BarDto, MemoryAnswerDto, MemoryRoundDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';
import { roundGone } from './gone';

/** 8 种配料，下标就是服务端的配料编号 */
const MIXES = ['朗姆', '伏特加', '金酒', '柠檬', '薄荷', '糖浆', '冰块', '苏打'];

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
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
  const r = await call(() => endpoints.barMemoryStart(), '开局失败');
  if (r) {
    emit('reload');
    show(r);
  }
}
async function next() {
  const r = await call(() => endpoints.barMemoryNext(), '继续失败');
  if (r) show(r);
}
async function stop() {
  if (await call(() => endpoints.barMemoryStop(), '操作失败')) {
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
  const r = await call(() => endpoints.barMemoryAnswer(picks.value), '提交失败');
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
  const recipe = (current.value?.seq ?? []).map((m) => MIXES[m]).join('、');
  if (r.reason === 'late')
    return `超时了，要在 ${(current.value?.answerMs ?? 0) / 1000} 秒内答完。配方是：${recipe}`;
  if (r.reason === 'early') return `配方还没放完就交了。配方是：${recipe}`;
  if (!r.correct) return `记错了。正确的配方是：${recipe}`;
  const award = r.award ? `得到 ${awardText(r.award, catalog)}` : '';
  return r.finished ? `三关全过！${award}` : `答对了！${award}`;
});
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">
      调酒师依次闪出配方里的配料，记住顺序后依次点出来。第 1/2/3 关分别是 3/5/7 种配料，每过一关都有奖励；
      答对后可以继续挑战更长的配方，也可以收手。
    </div>
    <div class="dt-meta mb-2" data-testid="mem-played">
      今天 {{ data.memory.played }}/{{ data.memory.max }} 局，每局 {{ data.memory.cost }} 张神秘礼券
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
        <div class="mb-1">第 {{ resumed.level }} 关已经答对了，要继续吗？</div>
        <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="mem-next" @click="next">
          继续
        </button>
        <button
          class="btn btn-sm btn-outline-secondary ms-1"
          :disabled="busy"
          data-testid="mem-stop"
          @click="stop"
        >
          收手
        </button>
      </template>
      <template v-else-if="resumed && resumed.seq">
        <div class="mb-1">第 {{ resumed.level }} 关还没答完，配方会再放一遍</div>
        <button class="btn btn-sm btn-primary" data-testid="mem-resume" @click="resume">接着这一局</button>
      </template>
      <template v-else-if="resumed">
        <div class="mb-1">上次的配方没看完，这一局只能放弃了</div>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          data-testid="mem-abandon"
          @click="stop"
        >
          放弃这一局
        </button>
      </template>
      <template v-else>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || limited || data.tickets < data.memory.cost"
          data-testid="mem-start"
          @click="start"
        >
          开始调酒
        </button>
        <span v-if="limited" class="text-danger ms-1">今天的局数用完了</span>
      </template>
    </template>

    <div v-else-if="phase === 'showing'" class="text-muted">看好了……</div>

    <div v-else-if="phase === 'input'" class="d-flex align-items-center gap-2">
      <span
        >已选 {{ picks.length }}/{{ current?.seq.length }}：{{ picks.map((m) => MIXES[m]).join('、') }}</span
      >
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="picks.length === 0"
        data-testid="mem-undo"
        @click="picks = picks.slice(0, -1)"
      >
        撤回
      </button>
    </div>

    <template v-else>
      <div :class="['fw-bold', last?.correct ? 'text-success' : 'text-danger']" data-testid="mem-result">
        {{ resultText }}
      </div>
      <div class="mt-2">
        <template v-if="last?.canNext">
          <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="mem-next" @click="next">
            继续第 {{ (current?.level ?? 0) + 1 }} 关
          </button>
          <button
            class="btn btn-sm btn-outline-secondary ms-1"
            :disabled="busy"
            data-testid="mem-stop"
            @click="stop"
          >
            收手
          </button>
        </template>
        <button v-else class="btn btn-sm btn-outline-primary" data-testid="mem-again" @click="phase = 'idle'">
          再来一局
        </button>
      </div>
    </template>
  </div>
</template>
