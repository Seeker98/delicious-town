<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ActivationDto, AwardDto, TasksDto } from '@dt/shared';
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
        class="btn btn-sm btn-outline-success"
        :data-testid="`claim-${r.points}`"
        :disabled="busy || r.claimed || act.total < r.points"
        @click="run(() => endpoints.claimActivation(r.points), '领取失败')"
      >
        {{ r.points }} 点{{ r.claimed ? '（已领）' : '' }}{{ r.multiplier > 1 ? ' ×2' : '' }}
      </button>
    </div>
    <ul class="list-unstyled small">
      <li v-for="i in act.items" :key="i.id" :class="{ 'text-muted': i.count >= i.limit }">
        {{ i.name }}：{{ Math.min(i.count, i.limit) }}/{{ i.limit }}（每次 {{ i.points }} 点）
      </li>
    </ul>
  </div>
  <div v-if="tasks">
    <h6 class="mt-3">主线</h6>
    <div v-if="tasks.main" class="border rounded p-2 small">
      <b>{{ tasks.main.name }}</b
      >（{{ Math.min(tasks.main.progress, tasks.main.target) }}/{{ tasks.main.target }}）
      <div class="text-muted">奖励：{{ awardText(tasks.main.award) }}</div>
      <button
        class="btn btn-sm btn-success mt-1"
        :disabled="busy || !tasks.main.done"
        @click="run(() => endpoints.claimTask(tasks!.main!.id), '领取失败')"
      >
        领奖
      </button>
    </div>
    <div v-else class="small text-muted">主线已全部完成</div>
    <h6 class="mt-3">支线</h6>
    <div v-for="s in tasks.side" :key="s.id" class="border rounded p-2 small mb-1">
      <b>{{ s.name }}</b
      >（{{ Math.min(s.progress, s.target) }}/{{ s.target }}）
      <div class="text-muted">奖励：{{ awardText(s.award) }}</div>
      <button
        class="btn btn-sm btn-success mt-1"
        :disabled="busy || !s.done"
        @click="run(() => endpoints.claimTask(s.id), '领取失败')"
      >
        领奖
      </button>
    </div>
    <div v-if="tasks.side.length === 0" class="small text-muted">暂时没有支线任务</div>
  </div>
</template>
