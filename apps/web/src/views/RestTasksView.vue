<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ActivationDto, AwardDto, QuestDto, QuestsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import QuestCard from '../components/QuestCard.vue';
import { useT } from '../composables/useT';
import { activeMessages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { timeLeft } from '../utils/activity';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const tasks = ref<QuestsDto | null>(null);
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
  for (const g of a.goods ?? []) parts.push(t.value.common.qty(catalog.goodsName(g.id), g.num));
  for (const f of a.foods ?? []) parts.push(t.value.common.qty(catalog.foodName(f.id), f.num));
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
/** 本章任务：可领的在前，没完成的其次，已领的最后（问题记录 318） */
const rank = (x: QuestDto) => (x.claimed ? 2 : x.done ? 0 : 1);
const mainList = computed(() => [...(tasks.value?.main ?? [])].sort((a, b) => rank(a) - rank(b)));
const leftoverList = computed(() => [...(tasks.value?.leftover ?? [])].sort((a, b) => rank(a) - rank(b)));
const weeklyList = computed(() => [...(tasks.value?.weekly?.quests ?? [])].sort((a, b) => rank(a) - rank(b)));
const questName = (x: QuestDto) => catalog.data('tasks', x.id)?.name ?? x.name;
/** 章末、每周全完成按钮：还有没完成的写还差几个；都完成了只差领写先领完上面的任务（backlog 318） */
const leftText = (unfinished: number) =>
  unfinished > 0 ? t.value.rest.tasks.chapterLeft(unfinished) : t.value.rest.tasks.claimFirst;

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger')));
</script>

<template>
  <!-- 四块：今日活跃、主线、每周、支线（问题记录 318 设计 §10；问题记录 325：每天都要做的签到和活跃放最上面） -->
  <section v-if="act" class="dt-card mb-3" data-testid="card-activation">
    <div class="d-flex align-items-center mb-2">
      <span class="dt-card-title flex-fill">{{ t.rest.tasks.today(act.total) }}</span>
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
  <template v-if="tasks">
    <!-- 主线：当前章 -->
    <section class="dt-card mb-3" data-testid="card-main">
      <div class="dt-card-title mb-1">{{ t.rest.tasks.main }}</div>
      <div v-if="tasks.allMainDone" class="small text-muted">{{ t.rest.tasks.mainDone }}</div>
      <template v-else-if="tasks.chapter">
        <div class="d-flex align-items-center small mb-1" data-testid="chapter">
          <b v-if="tasks.chapter.locked">{{
            t.rest.tasks.chapterLocked(
              tasks.chapter.id,
              catalog.data('chapters', tasks.chapter.id)?.name ?? tasks.chapter.name,
            )
          }}</b>
          <b v-else>{{
            t.rest.tasks.chapter(
              tasks.chapter.id,
              catalog.data('chapters', tasks.chapter.id)?.name ?? tasks.chapter.name,
              tasks.chapter.claimedCount,
              tasks.chapter.total,
            )
          }}</b>
          <span v-if="tasks.chapter.locked" class="ms-auto text-nowrap">{{
            tasks.chapter.needStar > 0
              ? t.rest.tasks.lockedStar(tasks.chapter.needStar)
              : t.rest.tasks.lockedLevel(tasks.chapter.needLevel)
          }}</span>
        </div>
        <QuestCard
          v-for="x in mainList"
          :key="x.id"
          :quest="x"
          :name="questName(x)"
          :award="awardText(x.award)"
          :busy="busy"
          @claim="run(() => endpoints.claimTask(x.id), t.rest.tasks.claimFailed)"
        />
        <div v-if="!tasks.chapter.locked" class="d-flex align-items-center gap-2 small mt-1">
          <span class="text-muted flex-fill">{{
            t.rest.tasks.chapterAward(awardText(tasks.chapter.award))
          }}</span>
          <!-- 没领完时灰色并写明还差几个，免得像能点（问题记录 318 试玩反馈）；只差领时写先领完（backlog 318） -->
          <button
            :class="['btn btn-sm', tasks.chapter.claimable ? 'btn-primary' : 'btn-outline-secondary']"
            data-testid="claim-chapter"
            :disabled="busy || !tasks.chapter.claimable"
            @click="run(() => endpoints.claimChapter(tasks!.chapter!.id), t.rest.tasks.claimFailed)"
          >
            {{
              tasks.chapter.claimable
                ? t.rest.tasks.claimChapter
                : leftText(tasks.chapter.total - tasks.chapter.doneCount)
            }}
          </button>
        </div>
      </template>
      <!-- 章末领过的章里后来补出来的任务（功能后来才打开）：单独一块，不混进本章（backlog 318） -->
      <div v-if="leftoverList.length > 0" class="mt-2" data-testid="main-leftover">
        <div class="small text-muted mb-1">{{ t.rest.tasks.leftover }}</div>
        <QuestCard
          v-for="x in leftoverList"
          :key="x.id"
          :quest="x"
          :name="questName(x)"
          :award="awardText(x.award)"
          :busy="busy"
          @claim="run(() => endpoints.claimTask(x.id), t.rest.tasks.claimFailed)"
        />
      </div>
    </section>
    <!-- 每周：按当前星级分组，周一 0 点刷新 -->
    <section v-if="tasks.weekly" class="dt-card mb-3" data-testid="card-weekly">
      <div class="d-flex align-items-center mb-1">
        <span class="dt-card-title flex-fill">{{ t.rest.tasks.weekly(tasks.weekly.group) }}</span>
        <span class="small text-muted text-nowrap">{{ timeLeft(tasks.weekly.endsAt) }}</span>
      </div>
      <QuestCard
        v-for="x in weeklyList"
        :key="x.id"
        :quest="x"
        :name="questName(x)"
        :award="awardText(x.award)"
        :busy="busy"
        @claim="run(() => endpoints.claimTask(x.id), t.rest.tasks.claimFailed)"
      />
      <div class="d-flex align-items-center gap-2 small mt-1">
        <span class="text-muted flex-fill">{{
          t.rest.tasks.weeklyFull(awardText(tasks.weekly.full.award))
        }}</span>
        <button
          :class="[
            'btn btn-sm',
            tasks.weekly.full.claimed
              ? 'btn-light text-muted'
              : tasks.weekly.full.claimable
                ? 'btn-primary'
                : 'btn-outline-secondary',
          ]"
          data-testid="claim-weekly-full"
          :disabled="busy || !tasks.weekly.full.claimable"
          @click="run(() => endpoints.claimTask(tasks!.weekly!.full.id), t.rest.tasks.claimFailed)"
        >
          {{
            tasks.weekly.full.claimed
              ? t.rest.tasks.weeklyFullClaimed
              : tasks.weekly.full.claimable
                ? t.rest.tasks.claimWeeklyFull
                : leftText(tasks.weekly.quests.filter((q) => !q.done && !q.claimed).length)
          }}
        </button>
      </div>
    </section>
    <!-- 支线：每条一次显示一档 -->
    <section class="dt-card mb-3" data-testid="card-lines">
      <div class="dt-card-title mb-1">{{ t.rest.tasks.side }}</div>
      <div v-if="tasks.lines.length === 0" class="small text-muted">{{ t.rest.tasks.noSide }}</div>
      <div v-for="l in tasks.lines" :key="l.id" class="mb-2" :data-testid="`line-${l.id}`">
        <div class="d-flex small text-muted">
          <span>{{ catalog.data('questLines', l.id)?.name ?? l.name }}</span>
          <span class="ms-auto">{{ l.doneCount }}/{{ l.total }}</span>
        </div>
        <QuestCard
          v-if="l.quest"
          :quest="l.quest"
          :name="questName(l.quest)"
          :award="awardText(l.quest.award)"
          :busy="busy"
          :locked="l.lockedStar === null ? null : t.rest.tasks.lockedStar(l.lockedStar)"
          @claim="run(() => endpoints.claimTask(l.quest!.id), t.rest.tasks.claimFailed)"
        />
        <div v-else class="small text-success">{{ t.rest.tasks.lineDone }}</div>
      </div>
    </section>
  </template>
</template>
