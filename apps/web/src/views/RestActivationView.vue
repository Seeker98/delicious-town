<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { ActivationDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

/** 签到和今日活跃（问题记录：活跃和任务页太长，活跃单拎出来；从首页“今日活跃”进来） */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const act = ref<ActivationDto | null>(null);
const busy = ref(false);

async function load() {
  act.value = await endpoints.activation();
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
/** 活跃项的状态：做满 / 没开放（区服关了、星级或等级不够，问题记录 360） / 进行中（问题记录：灰色黑色分不清） */
function stateOf(i: ActItem): 'done' | 'locked' | 'open' {
  if (i.count >= i.limit) return 'done';
  return lockText(i) === null ? 'open' : 'locked';
}
/** 锁定时写哪一条：区服没开 → 星级 → 等级 → 注册天数、邮箱、交易所冻结、没有限时活动（backlog 第 ⑥ 批） */
function lockText(i: ActItem): string | null {
  const x = t.value.rest.tasks;
  if (i.off) return x.off;
  if ((act.value?.star ?? 0) < i.needStar) return x.locked(i.needStar);
  if ((act.value?.level ?? 0) < i.needLevel) return x.lockedLevel(i.needLevel);
  if (i.blocked === 'days') return x.lockedDays(i.needDays);
  if (i.blocked === 'email') return x.lockedEmail;
  if (i.blocked === 'frozen') return x.lockedFrozen;
  if (i.blocked === 'noActivity') return x.noActivity;
  return null;
}
const ORDER = { open: 0, locked: 1, done: 2 } as const;
const items = computed(() =>
  [...(act.value?.items ?? [])].sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)]),
);
const pct = (count: number, limit: number) => Math.min(100, Math.round((count / Math.max(1, limit)) * 100));

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger')));
</script>

<template>
  <div v-if="!act" class="text-end small mb-1">
    <RouterLink to="/rest/tasks" class="dt-go" data-testid="to-tasks">{{ t.home.tasksLink }}</RouterLink>
  </div>
  <section v-if="act" class="dt-card mb-3" data-testid="card-activation">
    <!-- 去任务页的入口和签到按钮放在标题这一行，不单独占一行（问题记录 530） -->
    <div class="d-flex align-items-center gap-2 mb-2" data-testid="activation-head">
      <span class="dt-card-title flex-fill">{{ t.rest.tasks.today(act.total) }}</span>
      <RouterLink to="/rest/tasks" class="dt-go small text-nowrap" data-testid="to-tasks">{{
        t.home.tasksLink
      }}</RouterLink>
      <button
        class="btn btn-sm btn-primary text-nowrap"
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
              ? 'btn-primary'
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
    <!-- 哪一档另送一番赏券（backlog 一番赏）：按钮上只写点数，送券写在这里 -->
    <div v-if="act.kujiTicket" class="small text-muted mb-2" data-testid="act-kuji-hint">
      {{ t.rest.tasks.kujiHint(act.kujiTicket.points, act.kujiTicket.num) }}
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
          <span class="dt-clamp2">{{ catalog.data('activation', i.id)?.name ?? i.name }}</span>
          <span v-if="stateOf(i) === 'done'" class="ms-auto text-success text-nowrap">{{
            t.rest.tasks.full
          }}</span>
          <span v-else-if="stateOf(i) !== 'locked'" class="ms-auto text-nowrap"
            >{{ i.count }}/{{ i.limit }}</span
          >
        </div>
        <!-- 锁定原因（注册天数、邮箱、没有活动）英法西文很长：单独一行放在进度条的位置，不挤名字（视觉第三轮） -->
        <div v-if="stateOf(i) === 'locked'" class="dt-act-lock">{{ lockText(i) }}</div>
        <div v-else class="dt-act-bar"><div :style="{ width: `${pct(i.count, i.limit)}%` }"></div></div>
        <div class="dt-act-pts">{{ t.rest.tasks.per(i.points) }}</div>
      </div>
    </div>
  </section>
</template>
