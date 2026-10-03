<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ActivationDto, AwardDto, TaskDto, TasksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeMessages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const tasks = ref<TasksDto | null>(null);
const act = ref<ActivationDto | null>(null);
const busy = ref(false);

function awardText(a: AwardDto): string {
  const m = activeMessages();
  const r = m.util.reward;
  const parts: string[] = [];
  if (a.coin) parts.push(r.coin(formatNum(a.coin)));
  if (a.exp) parts.push(r.exp(formatNum(a.exp)));
  if (a.diamond) parts.push(r.diamond(formatNum(a.diamond)));
  if (a.renown) parts.push(r.renown(formatNum(a.renown)));
  for (const g of a.goods ?? []) parts.push(`${catalog.goodsName(g.id)}×${g.num}`);
  for (const f of a.foods ?? []) parts.push(`${catalog.foodName(f.id)}×${f.num}`);
  return parts.join(m.events.sep);
}

async function load() {
  [tasks.value, act.value] = await Promise.all([endpoints.tasks(), endpoints.activation()]);
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
type ActItem = ActivationDto['items'][number];
/** 活跃项的状态：做满 / 星级不够 / 进行中（问题记录：灰色黑色分不清） */
function stateOf(i: ActItem): 'done' | 'locked' | 'open' {
  if (i.count >= i.limit) return 'done';
  if ((act.value?.star ?? 0) < i.needStar) return 'locked';
  return 'open';
}
const ORDER = { open: 0, locked: 1, done: 2 } as const;
const items = computed(() =>
  [...(act.value?.items ?? [])].sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)]),
);
const pct = (count: number, limit: number) => Math.min(100, Math.round((count / Math.max(1, limit)) * 100));
const taskList = computed<TaskDto[]>(() => (tasks.value?.main ? [tasks.value.main] : []));

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger')));
</script>

<template>
  <div v-if="act">
    <div class="d-flex align-items-center mb-2">
      <h6 class="mb-0">{{ t.rest.tasks.today(act.total) }}</h6>
      <button
        class="btn btn-sm btn-primary ms-auto"
        data-testid="signin"
        :disabled="busy || act.signedIn"
        @click="run(() => endpoints.signIn(), t.rest.tasks.signInFailed)"
      >
        {{ act.signedIn ? t.rest.tasks.signedIn : t.rest.tasks.signIn }}
      </button>
    </div>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        v-for="r in act.rewards"
        :key="r.points"
        :class="[
          'btn btn-sm',
          r.claimed
            ? 'btn-light text-muted'
            : act.total >= r.points
              ? 'btn-success'
              : 'btn-outline-secondary',
        ]"
        :data-testid="`claim-${r.points}`"
        :disabled="busy || r.claimed || act.total < r.points"
        @click="run(() => endpoints.claimActivation(r.points), t.rest.tasks.claimFailed)"
      >
        <template v-if="r.claimed">{{ t.rest.tasks.claimed(r.points) }}</template>
        <template v-else-if="act.total >= r.points">{{
          t.rest.tasks.claim(r.points, r.multiplier > 1)
        }}</template>
        <template v-else>{{ t.rest.tasks.need(r.points, r.points - act.total) }}</template>
      </button>
    </div>
    <div class="dt-act-grid small">
      <div
        v-for="i in items"
        :key="i.id"
        :class="[
          'dt-act',
          { 'dt-act-done': stateOf(i) === 'done', 'dt-act-locked': stateOf(i) === 'locked' },
        ]"
        :data-testid="`act-${i.id}`"
      >
        <div class="d-flex align-items-center gap-1">
          <span class="text-truncate">{{ i.name }}</span>
          <span v-if="stateOf(i) === 'done'" class="ms-auto text-success text-nowrap">{{
            t.rest.tasks.full
          }}</span>
          <span v-else-if="stateOf(i) === 'locked'" class="ms-auto text-nowrap">{{
            t.rest.tasks.locked(i.needStar)
          }}</span>
          <span v-else class="ms-auto text-nowrap">{{ i.count }}/{{ i.limit }}</span>
        </div>
        <div class="dt-act-bar"><div :style="{ width: `${pct(i.count, i.limit)}%` }"></div></div>
        <div class="dt-act-pts">{{ t.rest.tasks.per(i.points) }}</div>
      </div>
    </div>
  </div>
  <div v-if="tasks">
    <h6 class="mt-3">{{ t.rest.tasks.main }}</h6>
    <div v-if="!tasks.main" class="small text-muted">{{ t.rest.tasks.mainDone }}</div>
    <template v-for="(group, gi) in [taskList, tasks.side]" :key="gi">
      <h6 v-if="gi === 1" class="mt-3">{{ t.rest.tasks.side }}</h6>
      <div
        v-for="x in group"
        :key="x.id"
        :class="['border rounded p-2 small mb-1', { 'border-success dt-task-done': x.done }]"
        :data-testid="`task-${x.id}`"
      >
        <div class="d-flex align-items-center">
          <b>{{ x.name }}</b>
          <span class="ms-auto">{{ Math.min(x.progress, x.target) }}/{{ x.target }}</span>
        </div>
        <div class="text-muted">{{ t.rest.tasks.award(awardText(x.award)) }}</div>
        <button
          v-if="x.done"
          class="btn btn-sm btn-success mt-1"
          :data-testid="`claim-task-${x.id}`"
          :disabled="busy"
          @click="run(() => endpoints.claimTask(x.id), t.rest.tasks.claimFailed)"
        >
          {{ t.rest.tasks.claimTask }}
        </button>
        <div v-else class="progress mt-1" style="height: 6px">
          <div class="progress-bar bg-warning" :style="{ width: `${pct(x.progress, x.target)}%` }"></div>
        </div>
      </div>
    </template>
    <div v-if="tasks.side.length === 0" class="small text-muted">{{ t.rest.tasks.noSide }}</div>
  </div>
</template>
