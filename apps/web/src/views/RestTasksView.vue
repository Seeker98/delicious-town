<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ActivationDto, AwardDto, TaskDto, TasksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const tasks = ref<TasksDto | null>(null);
const act = ref<ActivationDto | null>(null);
const busy = ref(false);

function awardText(a: AwardDto): string {
  const parts: string[] = [];
  if (a.coin) parts.push(`银币 ${formatNum(a.coin)}`);
  if (a.exp) parts.push(`经验 ${formatNum(a.exp)}`);
  if (a.diamond) parts.push(`钻石 ${a.diamond}`);
  if (a.renown) parts.push(`声望 ${a.renown}`);
  for (const g of a.goods ?? []) parts.push(`${catalog.goodsName(g.id)}×${g.num}`);
  for (const f of a.foods ?? []) parts.push(`${catalog.foodName(f.id)}×${f.num}`);
  return parts.join('、');
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

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取任务失败'), 'danger')));
</script>

<template>
  <div v-if="act">
    <div class="d-flex align-items-center mb-2">
      <h6 class="mb-0">今日活跃 {{ act.total }}</h6>
      <button
        class="btn btn-sm btn-primary ms-auto"
        data-testid="signin"
        :disabled="busy || act.signedIn"
        @click="run(() => endpoints.signIn(), '签到失败')"
      >
        {{ act.signedIn ? '今天已签到' : '签到' }}
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
        @click="run(() => endpoints.claimActivation(r.points), '领取失败')"
      >
        <template v-if="r.claimed">✓ 已领 {{ r.points }} 点</template>
        <template v-else-if="act.total >= r.points"
          >领 {{ r.points }} 点奖励{{ r.multiplier > 1 ? ' ×2' : '' }}</template
        >
        <template v-else>{{ r.points }} 点（还差 {{ r.points - act.total }}）</template>
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
          <span v-if="stateOf(i) === 'done'" class="ms-auto text-success text-nowrap">✓ 已满</span>
          <span v-else-if="stateOf(i) === 'locked'" class="ms-auto text-nowrap"
            >🔒 {{ i.needStar }} 星开放</span
          >
          <span v-else class="ms-auto text-nowrap">{{ i.count }}/{{ i.limit }}</span>
        </div>
        <div class="dt-act-bar"><div :style="{ width: `${pct(i.count, i.limit)}%` }"></div></div>
        <div class="dt-act-pts">每次 {{ i.points }} 点</div>
      </div>
    </div>
  </div>
  <div v-if="tasks">
    <h6 class="mt-3">主线</h6>
    <div v-if="!tasks.main" class="small text-muted">主线已全部完成</div>
    <template v-for="(group, gi) in [taskList, tasks.side]" :key="gi">
      <h6 v-if="gi === 1" class="mt-3">支线</h6>
      <div
        v-for="t in group"
        :key="t.id"
        :class="['border rounded p-2 small mb-1', { 'border-success dt-task-done': t.done }]"
        :data-testid="`task-${t.id}`"
      >
        <div class="d-flex align-items-center">
          <b>{{ t.name }}</b>
          <span class="ms-auto">{{ Math.min(t.progress, t.target) }}/{{ t.target }}</span>
        </div>
        <div class="text-muted">奖励：{{ awardText(t.award) }}</div>
        <button
          v-if="t.done"
          class="btn btn-sm btn-success mt-1"
          :data-testid="`claim-task-${t.id}`"
          :disabled="busy"
          @click="run(() => endpoints.claimTask(t.id), '领取失败')"
        >
          领奖
        </button>
        <div v-else class="progress mt-1" style="height: 6px">
          <div class="progress-bar bg-warning" :style="{ width: `${pct(t.progress, t.target)}%` }"></div>
        </div>
      </div>
    </template>
    <div v-if="tasks.side.length === 0" class="small text-muted">暂时没有支线任务</div>
  </div>
</template>
