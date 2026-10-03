<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ActivityDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import ActivityGoals from '../components/activity/ActivityGoals.vue';
import ActivityBoost from '../components/activity/ActivityBoost.vue';
import ActivityCoop from '../components/activity/ActivityCoop.vue';
import ActivityExchange from '../components/activity/ActivityExchange.vue';
import ActivityGrid from '../components/activity/ActivityGrid.vue';
import ActivityPass from '../components/activity/ActivityPass.vue';
import ActivityStrip from '../components/activity/ActivityStrip.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { defaultSelection, orderActivities, timeLeft } from '../utils/activity';

/** 限时活动（问题记录 148，设计 §7.2） */
const toast = useToastStore();
const t = useT();
const items = ref<ActivityDto[]>([]);
const level = ref(0);
const loaded = ref(false);
const busy = ref(false);
/** 活动条 + 详情（问题记录 226）：只显示选中的那个活动 */
const selected = ref<number | null>(null);
const ordered = computed(() => orderActivities(items.value));
const shown = computed(() => ordered.value.filter((a) => a.id === selected.value));

async function load() {
  try {
    const r = await endpoints.activities();
    items.value = r.items;
    level.value = r.level;
    // 领奖、兑换后重新读取时停在当前活动；它不在列表里了才按默认规则重选
    if (!r.items.some((a) => a.id === selected.value)) selected.value = defaultSelection(ordered.value);
  } catch (e) {
    toast.push(errorMessage(e, t.value.activity.loadFailed), 'danger');
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
    toast.push(errorMessage(e, t.value.activity.opFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
const claim = (a: ActivityDto, key: string) =>
  run(() => endpoints.activityClaim(a.id, key), t.value.activity.claimed);
const claimAll = (a: ActivityDto) => run(() => endpoints.activityClaimAll(a.id), t.value.activity.claimedAll);
function unlock(a: ActivityDto) {
  if (!window.confirm(t.value.activity.unlockConfirm)) return;
  void run(() => endpoints.activityUnlock(a.id), t.value.activity.unlocked);
}
/** 兑换活动：结束后兑换期内还能换（148-2 设计 §7） */
const exchangeOpen = (a: ActivityDto) =>
  a.exchangeUntil !== null && new Date(a.exchangeUntil).getTime() > Date.now();
const exchange = (a: ActivityDto, i: number, n: number) =>
  run(() => endpoints.activityExchange(a.id, i, n), t.value.activity.exchanged);
function endNote(a: ActivityDto): string {
  const x = t.value.activity;
  if (a.kind === 'exchange')
    return exchangeOpen(a) ? x.exchangePeriod(timeLeft(a.exchangeUntil!)) : x.exchangeOver;
  // 全服加成没有奖励，不提邮箱（backlog 148-4）
  if (a.kind === 'boost') return x.endedShort;
  return a.state === 'settling' ? x.settling : x.ended;
}
const isSignin = (a: ActivityDto) => a.kind === 'goals' && a.def.goals.every((g) => g.key === 'signin');
</script>

<template>
  <h5>{{ t.activity.title }}</h5>
  <div v-if="loaded && items.length === 0" class="text-muted">{{ t.activity.none }}</div>
  <ActivityStrip
    v-if="ordered.length > 1"
    :items="ordered"
    :selected="selected"
    @select="selected = $event"
  />
  <div v-for="a in shown" :key="a.id" class="dt-card mb-3" :data-testid="`activity-${a.id}`">
    <div class="d-flex align-items-center gap-2 mb-1">
      <span v-if="isSignin(a)" class="badge text-bg-success">{{ t.activity.kinds.signin }}</span>
      <span class="flex-fill dt-card-title">{{ a.title }}</span>
      <span class="small text-muted">{{
        a.state === 'running' ? timeLeft(a.endsAt) : t.activity.endedShort
      }}</span>
    </div>
    <div class="small dt-announce-body mb-2">{{ a.body }}</div>
    <div v-if="a.state !== 'running'" class="alert alert-secondary py-1 small">
      {{ endNote(a) }}
    </div>
    <div v-else-if="a.kind !== 'boost' && level < a.minLevel" class="alert alert-warning py-1 small">
      {{ t.activity.needLevel(a.minLevel) }}
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
    <ActivityCoop v-else-if="a.kind === 'coop'" :a="a" :busy="busy" @claim="claim(a, $event)" />
    <button
      v-if="a.claimable > 0"
      type="button"
      class="btn btn-sm btn-primary mt-2"
      :disabled="busy"
      :data-testid="`claim-all-${a.id}`"
      @click="claimAll(a)"
    >
      {{ t.activity.claimAll(a.claimable) }}
    </button>
  </div>
</template>
