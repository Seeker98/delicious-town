<script setup lang="ts">
import NpcCard from '../components/NpcCard.vue';
import { computed, onMounted, ref } from 'vue';
import type { ActivityDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import { useT } from '../composables/useT';
import { useConfirmStore } from '../stores/confirm';
import ActivityGoals from '../components/activity/ActivityGoals.vue';
import ActivityBoost from '../components/activity/ActivityBoost.vue';
import ActivityCoop from '../components/activity/ActivityCoop.vue';
import ActivityExchange from '../components/activity/ActivityExchange.vue';
import ActivityGrid from '../components/activity/ActivityGrid.vue';
import ActivityPass from '../components/activity/ActivityPass.vue';
import ActivityStrip from '../components/activity/ActivityStrip.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { defaultSelection, kindLabel, orderActivities, timeLeft } from '../utils/activity';
import { serverNowMs } from '../utils/serverNow';

/** 限时活动（问题记录 148，设计 §7.2） */
const toast = useToastStore();
const t = useT();
const items = ref<ActivityDto[]>([]);
const level = ref(0);
const loaded = ref(false);
/** 第一次读失败：写读取失败，不写“没有活动”（backlog P3） */
const failed = ref(false);
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
    if (!loaded.value) failed.value = true;
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
const confirm = useConfirmStore();
async function unlock(a: ActivityDto) {
  if (!(await confirm.ask({ title: t.value.activity.unlockConfirm }))) return;
  void run(() => endpoints.activityUnlock(a.id), t.value.activity.unlocked);
}
/** 兑换活动：结束后兑换期内还能换（148-2 设计 §7） */
const exchangeOpen = (a: ActivityDto) =>
  a.exchangeUntil !== null && new Date(a.exchangeUntil).getTime() > serverNowMs();
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
  <!-- 限时活动的 NPC 是小凯（问题记录 443） -->
  <NpcCard npc="xiaoKai" />
  <!-- 加载时骨架、没有活动时空状态（界面改版 P3） -->
  <DtSkeleton v-if="!loaded" :rows="5" data-testid="activity-skeleton" />
  <DtEmpty v-else-if="failed" :title="t.activity.loadFailed" data-testid="activity-failed" />
  <DtEmpty
    v-else-if="items.length === 0"
    art="empty-activity"
    :title="t.activity.none"
    data-testid="activity-empty"
  />
  <ActivityStrip
    v-if="ordered.length > 1"
    :items="ordered"
    :selected="selected"
    @select="selected = $event"
  />
  <!-- 活动卡片（界面改版 P7）：标题一行，类型、剩余时间是小标签；说明灰字；结束、等级不够写在浅底提示条里 -->
  <div v-for="a in shown" :key="a.id" class="dt-card dt-act-detail mb-3" :data-testid="`activity-${a.id}`">
    <div class="dt-act-detail-head">
      <h2 class="dt-act-detail-title">{{ a.title }}</h2>
      <span :class="['dt-tag', isSignin(a) ? 'dt-tag-ok' : 'dt-tag-primary']">{{ kindLabel(a) }}</span>
      <span :class="['dt-tag', a.state === 'running' ? 'dt-tag-warn' : 'dt-tag-mute']">{{
        a.state === 'running' ? timeLeft(a.endsAt) : t.activity.endedShort
      }}</span>
    </div>
    <div class="dt-announce-body dt-act-detail-body">{{ a.body }}</div>
    <div v-if="a.state !== 'running'" class="dt-act-note">
      {{ endNote(a) }}
    </div>
    <div v-else-if="a.kind !== 'boost' && level < a.minLevel" class="dt-act-note is-warn">
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
      class="btn btn-primary dt-btn-block mt-3"
      :disabled="busy"
      :data-testid="`claim-all-${a.id}`"
      @click="claimAll(a)"
    >
      {{ t.activity.claimAll(a.claimable) }}
    </button>
  </div>
</template>
