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
/** 本章任务：可领的在前，没完成的其次，已领的最后（问题记录 318） */
const rank = (x: QuestDto) => (x.claimed ? 2 : x.done ? 0 : 1);
const mainList = computed(() => [...(tasks.value?.main ?? [])].sort((a, b) => rank(a) - rank(b)));
const weeklyList = computed(() => [...(tasks.value?.weekly?.quests ?? [])].sort((a, b) => rank(a) - rank(b)));
const questName = (x: QuestDto) => catalog.data('tasks', x.id)?.name ?? x.name;

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger')));
</script>

<template>
  <!-- 四块：主线、支线、每周、活跃度（问题记录 318 设计 §10） -->
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
          <!-- 没领完时灰色并写明还差几个，免得像能点（问题记录 318 试玩反馈） -->
          <button
            :class="['btn btn-sm', tasks.chapter.claimable ? 'btn-success' : 'btn-outline-secondary']"
            data-testid="claim-chapter"
            :disabled="busy || !tasks.chapter.claimable"
            @click="run(() => endpoints.claimChapter(tasks!.chapter!.id), t.rest.tasks.claimFailed)"
          >
            {{
              tasks.chapter.claimable
                ? t.rest.tasks.claimChapter
                : t.rest.tasks.chapterLeft(tasks.chapter.total - tasks.chapter.claimedCount)
            }}
          </button>
        </div>
      </template>
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
          :class="['btn btn-sm', tasks.weekly.full.claimable ? 'btn-success' : 'btn-outline-secondary']"
          data-testid="claim-weekly-full"
          :disabled="busy || !tasks.weekly.full.claimable"
          @click="run(() => endpoints.claimTask(tasks!.weekly!.full.id), t.rest.tasks.claimFailed)"
        >
          {{
            tasks.weekly.full.claimed
              ? t.rest.tasks.weeklyFullClaimed
              : tasks.weekly.full.claimable
                ? t.rest.tasks.claimWeeklyFull
                : t.rest.tasks.chapterLeft(tasks.weekly.quests.filter((q) => !q.claimed).length)
          }}
        </button>
      </div>
    </section>
  </template>
  <section v-if="act" class="dt-card mb-3" data-testid="card-activation">
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
          <span class="text-truncate">{{ catalog.data('activation', i.id)?.name ?? i.name }}</span>
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
  </section>
</template>
