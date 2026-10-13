<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ActivationDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtEmpty from '../DtEmpty.vue';
import DtSkeleton from '../DtSkeleton.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from '../../utils/reward';

/** 签到和今日活跃：任务页的“今日”标签（界面改版 P2b，原来单独一页 /rest/activation；问题记录：活跃和任务页太长） */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const act = ref<ActivationDto | null>(null);
const busy = ref(false);
/** 第一次读失败：不再一直显示骨架、读屏一直报“加载中”（backlog P3） */
const failed = ref(false);

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
/** 排序（界面改版 P7）：做了一部分的排最前，再是没做的，没开放的排后；做满的收进折叠行 */
const rank = (i: ActItem) => (stateOf(i) === 'locked' ? 2 : i.count > 0 ? 0 : 1);
const items = computed(() =>
  (act.value?.items ?? []).filter((i) => stateOf(i) !== 'done').sort((a, b) => rank(a) - rank(b)),
);
const done = computed(() => (act.value?.items ?? []).filter((i) => stateOf(i) === 'done'));
const itemName = (i: ActItem) => catalog.data('activation', i.id)?.name ?? i.name;
/** 锁定原因去掉前面的锁符号（行里另画锁图标） */
const lockReason = (i: ActItem) => (lockText(i) ?? '').replace(/^🔒\s*/u, '');
/** 活跃进度条：档位按最高一档的点数排在条上 */
const maxPoints = computed(() => Math.max(1, ...(act.value?.rewards ?? []).map((r) => r.points)));
/** 档位下面一行：另送抽赏券（道具减法 2026-10-13：爱心项链的奖励翻倍删了） */
const tierNote = (r: ActivationDto['rewards'][number]) =>
  act.value?.kujiTicket?.points === r.points ? t.value.rest.tasks.kujiTier(act.value.kujiTicket.num) : '';
const at = (p: number) => `${Math.min(100, (p / maxPoints.value) * 100)}%`;

onMounted(() =>
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger');
  }),
);
</script>

<template>
  <DtEmpty v-if="!act && failed" :title="t.rest.tasks.loadFailed" data-testid="activation-failed" />
  <DtSkeleton v-else-if="!act" :rows="5" data-testid="activation-skeleton" />
  <template v-if="act">
    <!-- 今日活跃（界面改版 P7）：一条进度条，档位节点在条上；下面一档一行，到了的直接领奖 -->
    <section class="dt-card dt-act-card" data-testid="card-activation">
      <div class="dt-act-head" data-testid="activation-head">
        <span class="dt-act-total"
          ><span class="dt-stat-label">{{ t.rest.tasks.actTitle }}</span> <b>{{ act.total }}</b
          ><span class="dt-meta"> / {{ maxPoints }}</span></span
        >
        <span v-if="act.signedIn" class="dt-tag dt-tag-ok" data-testid="signin">{{
          t.rest.tasks.signedIn
        }}</span>
        <button
          v-else
          class="btn btn-sm btn-primary text-nowrap"
          data-testid="signin"
          :disabled="busy"
          @click="run(() => endpoints.signIn(), t.rest.tasks.signInFailed)"
        >
          {{ t.rest.tasks.signIn }}
        </button>
      </div>
      <div
        class="dt-act-track"
        role="progressbar"
        :aria-valuenow="act.total"
        aria-valuemin="0"
        :aria-valuemax="maxPoints"
        :aria-label="t.rest.tasks.actTitle"
      >
        <span class="dt-act-rail"></span>
        <span class="dt-act-fill" :style="{ width: at(act.total) }"></span>
        <template v-for="r in act.rewards" :key="r.points">
          <span
            :class="['dt-act-node', { 'is-on': act.total >= r.points }]"
            :style="{ left: at(r.points) }"
          ></span>
          <span
            :class="['dt-act-mark', { 'is-on': act.total >= r.points }]"
            :style="{ left: at(r.points) }"
            >{{ r.points }}</span
          >
        </template>
      </div>
      <div
        v-for="r in act.rewards"
        :key="r.points"
        :class="['dt-act-tier', { 'is-ready': !r.claimed && act.total >= r.points }]"
        :data-testid="`tier-${r.points}`"
      >
        <span :class="['dt-act-pt', { 'is-on': act.total >= r.points }]">{{ r.points }}</span>
        <span class="dt-row-main">
          <!-- 这一档送什么（backlog B6），领了才知道不方便 -->
          <span class="dt-row-title" :data-testid="`claim-award-${r.points}`">{{
            awardText(r.award, catalog)
          }}</span>
          <span v-if="tierNote(r)" class="dt-row-sub">{{ tierNote(r) }}</span>
        </span>
        <span v-if="r.claimed" class="dt-tag dt-tag-ok" :data-testid="`claim-${r.points}`">{{
          t.rest.tasks.claimedShort
        }}</span>
        <button
          v-else-if="act.total >= r.points"
          class="btn btn-sm btn-primary"
          :data-testid="`claim-${r.points}`"
          :disabled="busy"
          @click="run(() => endpoints.claimActivation(r.points), t.rest.tasks.claimFailed)"
        >
          {{ t.rest.tasks.claimTask }}
        </button>
        <span v-else class="dt-tag dt-tag-mute" :data-testid="`claim-${r.points}`">{{
          t.rest.tasks.needShort(r.points - act.total)
        }}</span>
      </div>
    </section>

    <!-- 做什么能加活跃：一张卡片一行一件；做了一部分的排最前，没开放的灰掉写原因，做满的收起来 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.tasks.doTitle }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <div
          v-for="i in items"
          :key="i.id"
          :class="['dt-row', { 'is-locked': stateOf(i) === 'locked' }]"
          :data-testid="`act-${i.id}`"
        >
          <span class="dt-row-main">
            <span class="dt-row-title">{{ itemName(i) }}</span>
            <span class="dt-row-sub"
              ><template v-if="stateOf(i) === 'locked'"
                ><i class="bi bi-lock-fill" aria-hidden="true"></i> {{ lockReason(i) }} · </template
              >{{ t.rest.tasks.per(i.points) }}</span
            >
          </span>
          <span v-if="stateOf(i) !== 'locked'" :class="['dt-act-count', { 'is-on': i.count > 0 }]"
            >{{ i.count }}/{{ i.limit }}</span
          >
        </div>
        <details v-if="done.length > 0" class="dt-act-done" data-testid="act-done">
          <summary class="dt-effects-sum">
            <span class="dt-effects-sum-text">{{
              t.rest.tasks.doneFold(done.length, done.map(itemName).join(t.events.sep))
            }}</span>
            <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
          </summary>
          <div v-for="i in done" :key="i.id" class="dt-row" :data-testid="`act-${i.id}`">
            <span class="dt-row-main"
              ><span class="dt-row-title">{{ itemName(i) }}</span
              ><span class="dt-row-sub">{{ t.rest.tasks.per(i.points) }}</span></span
            >
            <span class="dt-tag dt-tag-ok">{{ t.rest.tasks.fullShort }}</span>
          </div>
        </details>
      </div>
    </section>
  </template>
</template>
