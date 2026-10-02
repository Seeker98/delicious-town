<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ActivityDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ActivityGoals from '../components/activity/ActivityGoals.vue';
import ActivityBoost from '../components/activity/ActivityBoost.vue';
import ActivityExchange from '../components/activity/ActivityExchange.vue';
import ActivityGrid from '../components/activity/ActivityGrid.vue';
import ActivityPass from '../components/activity/ActivityPass.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { timeLeft } from '../utils/activity';

/** 限时活动（问题记录 148，设计 §7.2） */
const toast = useToastStore();
const items = ref<ActivityDto[]>([]);
const level = ref(0);
const loaded = ref(false);
const busy = ref(false);

async function load() {
  try {
    const r = await endpoints.activities();
    items.value = r.items;
    level.value = r.level;
  } catch (e) {
    toast.push(errorMessage(e, '读取活动失败'), 'danger');
  } finally {
    loaded.value = true;
  }
}
onMounted(() => void load());

async function run(fn: () => Promise<unknown>, ok: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
const claim = (a: ActivityDto, key: string) => run(() => endpoints.activityClaim(a.id, key), '已领取');
const claimAll = (a: ActivityDto) => run(() => endpoints.activityClaimAll(a.id), '已全部领取');
function unlock(a: ActivityDto) {
  if (!window.confirm('确定解锁进阶奖励吗？解锁后之前达到的进阶档位也可以领取。')) return;
  void run(() => endpoints.activityUnlock(a.id), '已解锁');
}
/** 兑换活动：结束后兑换期内还能换（148-2 设计 §7） */
const exchangeOpen = (a: ActivityDto) =>
  a.exchangeUntil !== null && new Date(a.exchangeUntil).getTime() > Date.now();
const exchange = (a: ActivityDto, i: number, n: number) =>
  run(() => endpoints.activityExchange(a.id, i, n), '已兑换');
function endNote(a: ActivityDto): string {
  if (a.kind === 'exchange')
    return exchangeOpen(a) ? `兑换期，${timeLeft(a.exchangeUntil!)}` : '已结束，活动货币已作废';
  return a.state === 'settling' ? '结算中，未领的奖励会发到邮箱' : '已结束，未领的奖励已发到邮箱';
}
const isSignin = (a: ActivityDto) => a.kind === 'goals' && a.def.goals.every((g) => g.key === 'signin');
</script>

<template>
  <h5>限时活动</h5>
  <div v-if="loaded && items.length === 0" class="text-muted">现在没有进行中的活动。</div>
  <div v-for="a in items" :key="a.id" class="dt-card mb-3" :data-testid="`activity-${a.id}`">
    <div class="d-flex align-items-center gap-2 mb-1">
      <span v-if="isSignin(a)" class="badge text-bg-success">签到</span>
      <b class="flex-fill">{{ a.title }}</b>
      <span class="small text-muted">{{ a.state === 'running' ? timeLeft(a.endsAt) : '已结束' }}</span>
    </div>
    <div class="small dt-announce-body mb-2">{{ a.body }}</div>
    <div v-if="a.state !== 'running'" class="alert alert-secondary py-1 small">
      {{ endNote(a) }}
    </div>
    <div v-else-if="a.kind !== 'boost' && level < a.minLevel" class="alert alert-warning py-1 small">
      需要 {{ a.minLevel }} 级，达到后才开始计数
    </div>
    <ActivityGoals v-if="a.kind === 'goals'" :a="a" :busy="busy" @claim="claim(a, $event)" />
    <ActivityGrid v-else-if="a.kind === 'grid'" :a="a" :busy="busy" @claim="claim(a, $event)" />
    <ActivityPass
      v-else-if="a.kind === 'pass'"
      :a="a"
      :busy="busy"
      @claim="claim(a, $event)"
      @unlock="unlock(a)"
    />
    <ActivityBoost v-else-if="a.kind === 'boost'" :a="a" />
    <ActivityExchange
      v-else-if="a.kind === 'exchange'"
      :a="a"
      :busy="busy"
      :open="exchangeOpen(a)"
      @exchange="(i, n) => exchange(a, i, n)"
    />
    <button
      v-if="a.claimable > 0"
      type="button"
      class="btn btn-sm btn-primary mt-2"
      :disabled="busy"
      :data-testid="`claim-all-${a.id}`"
      @click="claimAll(a)"
    >
      全部领取（{{ a.claimable }}）
    </button>
  </div>
</template>
