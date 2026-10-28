<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { RandomEventDto, RandomQuestionDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { effectChips } from '../utils/effects';
import { formatNum, gameDateTime } from '../utils/format';
import DtSheet from './DtSheet.vue';

/**
 * 随机事件和问答的弹窗（设计稿 2026-10-28 §10）：进游戏、回到首页、页面切回前台时问一次，开着时每 10 分钟问一次。
 * 通知点“知道了”记已看；选择、问答挂着时可以先关掉，下次再弹
 */
const POLL_MS = 10 * 60_000;
const t = useT();
const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const restStore = useRestaurantStore();
/** 花钱的选项：银币不够时置灰（店还没读到时不拦，交给服务端） */
const short = (cost: number | null) => cost !== null && restStore.rest !== null && restStore.rest.coin < cost;
const ev = ref<RandomEventDto | null>(null);
/** 关掉了挂着的那件：同一件不再弹，换了一件才弹 */
const dismissed = ref<string | null>(null);
const busy = ref(false);
/** 问答夜正在看第几道 */
const qIndex = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const r = computed(() => t.value.randomEvent);
const open = computed(() => !!ev.value && dismissed.value !== ev.value.id);
const title = computed(() => ev.value?.title ?? r.value.quizTitle);
const question = computed<RandomQuestionDto | null>(() => ev.value?.questions?.[qIndex.value] ?? null);
const total = computed(() => ev.value?.questions?.length ?? 0);
const result = computed(() => (ev.value?.status === 'done' ? ev.value.result : null));
const chips = computed(() => (result.value?.effects ? effectChips(result.value.effects) : []));
const rewards = computed(() => {
  const w = result.value?.reward;
  if (!w) return [];
  const u = t.value.util.reward;
  return [
    ...(w.coin > 0 ? [u.coin(formatNum(w.coin))] : []),
    ...(w.exp > 0 ? [u.exp(formatNum(w.exp))] : []),
    ...(w.tickets > 0 ? [t.value.common.qty(r.value.ticketName, w.tickets)] : []),
    ...w.foods.map((f) => t.value.common.qty(catalog.foodName(f.id), f.num)),
  ];
});
/** 问答夜：这一道答完、后面还有没答的 */
const hasNext = computed(
  () =>
    ev.value?.kind === 'quizNight' &&
    question.value?.picked !== null &&
    qIndex.value < total.value - 1 &&
    ev.value.status === 'pending',
);

function choiceText(q: RandomQuestionDto, i: number): string {
  return q.grades ? (t.value.labels.grade[q.grades[i]!] ?? q.choices[i]!) : q.choices[i]!;
}

function choiceClass(q: RandomQuestionDto, i: number): string {
  if (q.picked === null) return 'btn-outline-primary';
  if (q.answer === i) return 'btn-success';
  if (q.picked === i) return q.answer === null ? 'btn-primary' : 'btn-danger';
  return 'btn-outline-secondary';
}

/** 问答夜从第一道没答的开始 */
function firstOpen(e: RandomEventDto): number {
  const i = e.questions?.findIndex((q) => q.picked === null) ?? -1;
  return i < 0 ? Math.max(0, (e.questions?.length ?? 1) - 1) : i;
}

async function poll() {
  if (busy.value || open.value) return;
  try {
    const e = (await endpoints.randomEventCurrent(activeLocale())).event;
    ev.value = e;
    if (e) qIndex.value = firstOpen(e);
  } catch {
    // 读取失败就不弹，不影响游戏
  }
}

async function run(fn: () => Promise<RandomEventDto>) {
  if (busy.value) return;
  busy.value = true;
  try {
    ev.value = await fn();
  } catch (e) {
    toast.push(errorMessage(e, r.value.failed), 'danger');
    dismissed.value = ev.value?.id ?? null;
  } finally {
    busy.value = false;
  }
}

function choose(key: string) {
  const e = ev.value!;
  void run(() => endpoints.randomEventChoose(e.id, key, activeLocale()));
}

function answer(i: number) {
  const e = ev.value!;
  const q = e.kind === 'quizNight' ? qIndex.value : undefined;
  void run(() => endpoints.randomEventAnswer(e.id, i, q, activeLocale()));
}

/** 了结的（看过结果）记已看；挂着的只是先关掉 */
async function close() {
  const e = ev.value;
  if (!e) return;
  dismissed.value = e.id;
  if (e.status !== 'done') return;
  ev.value = null;
  try {
    await endpoints.randomEventSeen(e.id);
  } catch {
    // 记已看失败：下次进游戏再弹一次结果
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void poll();
}

onMounted(() => {
  void poll();
  timer = setInterval(() => void poll(), POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
});
watch(
  () => route.path,
  (p) => {
    if (p === '/') void poll();
  },
);
</script>

<template>
  <DtSheet center :open="open" :title="title" @close="close">
    <div v-if="ev" class="dt-rev" data-testid="random-event">
      <p v-if="ev.body" class="dt-rev-body">{{ ev.body }}</p>
      <template v-if="question">
        <div v-if="ev.kind === 'quizNight'" class="dt-rev-progress" data-testid="random-event-progress">
          {{ r.quizNight(qIndex + 1, total) }}
        </div>
        <p class="dt-rev-q">{{ question.q }}</p>
        <div class="dt-rev-choices">
          <button
            v-for="(_, i) in question.choices"
            :key="i"
            type="button"
            :class="['btn', choiceClass(question, i)]"
            :disabled="busy || question.picked !== null"
            data-testid="random-event-choice"
            @click="answer(i)"
          >
            {{ choiceText(question, i) }}
          </button>
        </div>
        <p
          v-if="question.correct !== null"
          :class="['dt-rev-verdict', question.correct ? 'is-good' : 'is-bad']"
        >
          {{ question.correct ? r.correct : r.wrong }}
        </p>
        <p v-if="question.explain" class="dt-rev-explain">{{ question.explain }}</p>
      </template>
      <div v-if="result" class="dt-rev-result" data-testid="random-event-result">
        <p v-if="result.text" class="dt-rev-text">{{ result.text }}</p>
        <div v-if="chips.length > 0" class="dt-rev-chips">
          <span v-for="c in chips" :key="c.text" :class="['dt-rev-chip', c.good ? 'is-good' : 'is-bad']">{{
            c.text
          }}</span>
          <span v-if="result.until" class="dt-rev-until">{{
            r.until(gameDateTime(result.until, { hour: '2-digit', minute: '2-digit' }))
          }}</span>
        </div>
        <ul v-if="rewards.length > 0" class="dt-rev-rewards">
          <li v-for="x in rewards" :key="x">{{ x }}</li>
        </ul>
      </div>
    </div>
    <template #actions>
      <template v-if="ev && ev.status === 'pending' && ev.kind === 'choice'">
        <button
          v-for="o in ev.options ?? []"
          :key="o.key"
          type="button"
          class="btn btn-primary dt-rev-option"
          :disabled="busy || short(o.cost)"
          data-testid="random-event-option"
          @click="choose(o.key)"
        >
          <span>{{ o.label }}</span>
          <small v-if="o.cost !== null" class="d-block">{{ r.cost(formatNum(o.cost)) }}</small>
        </button>
      </template>
      <button v-else-if="hasNext" type="button" class="btn btn-primary" @click="qIndex += 1">
        {{ r.next }}
      </button>
      <button
        v-else-if="ev && ev.status === 'pending'"
        type="button"
        class="btn btn-outline-secondary"
        data-testid="random-event-later"
        @click="close"
      >
        {{ r.later }}
      </button>
      <button v-else type="button" class="btn btn-primary" data-testid="random-event-ok" @click="close">
        {{ r.ok }}
      </button>
    </template>
  </DtSheet>
</template>

<style scoped>
.dt-rev-body,
.dt-rev-q,
.dt-rev-text {
  white-space: pre-wrap;
}
.dt-rev-q {
  font-weight: 600;
}
.dt-rev-progress {
  font-size: 0.8125rem;
  color: var(--bs-secondary-color);
  margin-bottom: 0.25rem;
}
.dt-rev-choices {
  display: grid;
  gap: 0.5rem;
}
.dt-rev-choices .btn {
  text-align: left;
}
.dt-rev-verdict {
  margin: 0.75rem 0 0.25rem;
  font-weight: 600;
}
.dt-rev-explain {
  font-size: 0.875rem;
  color: var(--bs-secondary-color);
}
.dt-rev-result {
  margin-top: 0.75rem;
}
.dt-rev-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}
.dt-rev-chip {
  font-size: 0.8125rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}
.dt-rev-chip.is-bad,
.dt-rev-verdict.is-bad {
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}
.dt-rev-verdict.is-good {
  color: var(--bs-success-text-emphasis);
}
.dt-rev-verdict.is-bad {
  background: none;
}
.dt-rev-until {
  font-size: 0.8125rem;
  color: var(--bs-secondary-color);
}
.dt-rev-rewards {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}
.dt-rev-option {
  flex: 1 1 0;
}
</style>
