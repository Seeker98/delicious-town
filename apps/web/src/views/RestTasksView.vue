<script setup lang="ts">
import { claimableTabs, TASK_TABS, type TaskTab } from '../utils/tasks';
import { computed, onMounted, ref } from 'vue';
import type { AwardDto, QuestDto, QuestsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtTabs from '../components/DtTabs.vue';
import QuestCard from '../components/QuestCard.vue';
import ActivationPanel from '../components/tasks/ActivationPanel.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { timeLeft } from '../utils/activity';
import { awardText as awardTextOf } from '../utils/reward';
import { questTitle } from '../utils/questName';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const tasks = ref<QuestsDto | null>(null);
const busy = ref(false);

function awardText(a: AwardDto): string {
  return awardTextOf(a, catalog);
}

async function load() {
  tasks.value = await endpoints.tasks();
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
/** 本章任务：可领的在前，没完成的其次，已领的最后（问题记录 318） */
const rank = (x: QuestDto) => (x.claimed ? 2 : x.done ? 0 : 1);
const mainList = computed(() => [...(tasks.value?.main ?? [])].sort((a, b) => rank(a) - rank(b)));
const leftoverList = computed(() => [...(tasks.value?.leftover ?? [])].sort((a, b) => rank(a) - rank(b)));
const weeklyList = computed(() => [...(tasks.value?.weekly?.quests ?? [])].sort((a, b) => rank(a) - rank(b)));
const questName = (x: QuestDto) => questTitle(catalog.data('tasks', x.id)?.name ?? x.name, x);
/** 章末、每周全完成按钮：还有没完成的写还差几个；都完成了只差领写先领完上面的任务（backlog 318） */
const leftText = (unfinished: number) =>
  unfinished > 0 ? t.value.rest.tasks.chapterLeft(unfinished) : t.value.rest.tasks.claimFirst;

/**
 * 四个选项卡：今日（签到和活跃）、主线、每周、支线（界面改版 P2b：原来活跃单独一页；用户 2026-10-08 定每周单独一卡）。
 * 当前卡写在地址里（?tab=），从首页、指引直接进到今日、每周
 */
const TABS = ['today', ...TASK_TABS] as const;
const tab = useTabQuery({ tabs: TABS });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.rest.tasks.tabs[k] })));
/** 卡上有能领的时候加一个礼物图标（和首页任务入口同一套判断，问题记录 555） */
const claimable = computed(() => claimableTabs(tasks.value));
const giftOn = (k: string) => k !== 'today' && claimable.value[k as TaskTab];

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger')));
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems">
    <template #extra="{ tab: k }">
      <i v-if="giftOn(k)" class="bi bi-gift text-primary ms-1" :data-testid="`gift-tab-${k}`"></i>
    </template>
  </DtTabs>
  <ActivationPanel v-if="tab === 'today'" />
  <DtSkeleton v-if="!tasks && tab !== 'today'" :rows="5" data-testid="tasks-skeleton" />
  <template v-if="tasks">
    <!-- 主线：当前章 -->
    <section v-if="tab === 'main'" class="dt-card mb-3" data-testid="card-main">
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
    <section v-if="tab === 'weekly' && !tasks.weekly" class="dt-card mb-3">
      <div class="small text-muted" data-testid="no-weekly">{{ t.rest.tasks.noWeekly }}</div>
    </section>
    <section v-if="tab === 'weekly' && tasks.weekly" class="dt-card mb-3" data-testid="card-weekly">
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
    <section v-if="tab === 'side'" class="dt-card mb-3" data-testid="card-lines">
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
