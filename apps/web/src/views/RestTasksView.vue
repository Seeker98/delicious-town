<script setup lang="ts">
import { claimableTabs, TASK_TABS, type TaskTab } from '../utils/tasks';
import { computed, onMounted, ref } from 'vue';
import type { AwardDto, QuestDto, QuestsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtTabPanel from '../components/DtTabPanel.vue';
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
/** 章、支线卡片头的进度条（界面改版 P7） */
const barPct = (n: number, total: number) => `${Math.min(100, (n / Math.max(1, total)) * 100)}%`;
/** 锁着的章：几星或几级解锁（去掉前面的锁符号，标签里另画锁图标） */
const chapterLock = computed(() => {
  const c = tasks.value?.chapter;
  if (!c) return '';
  const x = t.value.rest.tasks;
  return (c.needStar > 0 ? x.lockedStar(c.needStar) : x.lockedLevel(c.needLevel)).replace(/^🔒\s*/u, '');
});

/** 第一次读失败：不再一直显示骨架（backlog P3） */
const failed = ref(false);
onMounted(() =>
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger');
  }),
);
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems">
    <template #extra="{ tab: k }">
      <i v-if="giftOn(k)" class="bi bi-gift text-primary ms-1" :data-testid="`gift-tab-${k}`"></i>
    </template>
  </DtTabs>
  <DtTabPanel :tab="tab">
    <ActivationPanel v-if="tab === 'today'" />
    <DtEmpty
      v-if="!tasks && tab !== 'today' && failed"
      :title="t.rest.tasks.loadFailed"
      data-testid="tasks-failed"
    />
    <DtSkeleton v-else-if="!tasks && tab !== 'today'" :rows="5" data-testid="tasks-skeleton" />
    <template v-if="tasks">
      <!-- 主线：当前章一张卡片（界面改版 P7）——卡片头写第几章、章名、进度条，一行一个任务，卡片底写章末奖励 -->
      <section v-if="tab === 'main'" class="dt-card dt-rows-card dt-quest-card" data-testid="card-main">
        <div v-if="tasks.allMainDone" class="dt-row dt-meta">{{ t.rest.tasks.mainDone }}</div>
        <template v-else-if="tasks.chapter">
          <div class="dt-quest-head" data-testid="chapter">
            <div class="dt-quest-head-line">
              <span class="dt-meta">{{ t.rest.tasks.chapterNo(tasks.chapter.id) }}</span>
              <b class="dt-quest-head-name">{{
                catalog.data('chapters', tasks.chapter.id)?.name ?? tasks.chapter.name
              }}</b>
              <span v-if="tasks.chapter.locked" class="dt-tag dt-tag-mute"
                ><i class="bi bi-lock-fill" aria-hidden="true"></i> {{ chapterLock }}</span
              >
              <span v-else class="dt-quest-head-count"
                >{{ tasks.chapter.claimedCount }} / {{ tasks.chapter.total }}</span
              >
            </div>
            <span v-if="!tasks.chapter.locked" class="dt-quest-bar"
              ><span :style="{ width: barPct(tasks.chapter.claimedCount, tasks.chapter.total) }"></span
            ></span>
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
          <div v-if="!tasks.chapter.locked" class="dt-quest-foot">
            <DtArt name="sec-tasks" :size="22" />
            <span class="dt-row-main"
              ><span class="dt-row-sub">{{ t.rest.tasks.chapterAwardLabel }}</span
              ><span class="dt-row-title">{{ awardText(tasks.chapter.award) }}</span></span
            >
            <!-- 没领完时写还差几个（问题记录 318 试玩反馈）；只差领时写先领完（backlog 318） -->
            <button
              v-if="tasks.chapter.claimable"
              class="btn btn-sm btn-primary"
              data-testid="claim-chapter"
              :disabled="busy"
              @click="run(() => endpoints.claimChapter(tasks!.chapter!.id), t.rest.tasks.claimFailed)"
            >
              {{ t.rest.tasks.claimTask }}
            </button>
            <span v-else class="dt-tag dt-tag-mute" data-testid="claim-chapter">{{
              leftText(tasks.chapter.total - tasks.chapter.doneCount)
            }}</span>
          </div>
        </template>
      </section>
      <!-- 章末领过的章里后来补出来的任务（功能后来才打开）：单独一张卡片，不混进本章（backlog 318） -->
      <section v-if="tab === 'main' && leftoverList.length > 0" class="dt-block" data-testid="main-leftover">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.rest.tasks.leftover }}</h2>
        </div>
        <div class="dt-card dt-rows-card">
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
      <!-- 每周：按当前星级分组，周一 0 点刷新；卡片底写全完成奖励 -->
      <section v-if="tab === 'weekly' && !tasks.weekly" class="dt-card dt-rows-card">
        <div class="dt-row dt-meta" data-testid="no-weekly">{{ t.rest.tasks.noWeekly }}</div>
      </section>
      <section
        v-if="tab === 'weekly' && tasks.weekly"
        class="dt-card dt-rows-card dt-quest-card"
        data-testid="card-weekly"
      >
        <div class="dt-quest-head">
          <div class="dt-quest-head-line">
            <b class="dt-quest-head-name">{{ t.rest.tasks.weekly(tasks.weekly.group) }}</b>
            <span class="dt-quest-head-count">{{ timeLeft(tasks.weekly.endsAt) }}</span>
          </div>
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
        <div class="dt-quest-foot">
          <DtArt name="sec-tasks" :size="22" />
          <span class="dt-row-main"
            ><span class="dt-row-sub">{{ t.rest.tasks.weeklyFullLabel }}</span
            ><span class="dt-row-title">{{ awardText(tasks.weekly.full.award) }}</span></span
          >
          <span v-if="tasks.weekly.full.claimed" class="dt-tag dt-tag-ok" data-testid="claim-weekly-full">{{
            t.rest.tasks.claimedShort
          }}</span>
          <button
            v-else-if="tasks.weekly.full.claimable"
            class="btn btn-sm btn-primary"
            data-testid="claim-weekly-full"
            :disabled="busy"
            @click="run(() => endpoints.claimTask(tasks!.weekly!.full.id), t.rest.tasks.claimFailed)"
          >
            {{ t.rest.tasks.claimTask }}
          </button>
          <span v-else class="dt-tag dt-tag-mute" data-testid="claim-weekly-full">{{
            leftText(tasks.weekly.quests.filter((q) => !q.done && !q.claimed).length)
          }}</span>
        </div>
      </section>
      <!-- 支线：每条线一张卡片，卡片头写线名和进度，下面是当前这一档 -->
      <template v-if="tab === 'side'">
        <section v-if="tasks.lines.length === 0" class="dt-card dt-rows-card" data-testid="card-lines">
          <div class="dt-row dt-meta">{{ t.rest.tasks.noSide }}</div>
        </section>
        <div v-else data-testid="card-lines">
          <section
            v-for="l in tasks.lines"
            :key="l.id"
            class="dt-card dt-rows-card dt-quest-card"
            :data-testid="`line-${l.id}`"
          >
            <div class="dt-quest-head">
              <div class="dt-quest-head-line">
                <b class="dt-quest-head-name">{{ catalog.data('questLines', l.id)?.name ?? l.name }}</b>
                <span class="dt-quest-head-count">{{ l.doneCount }} / {{ l.total }}</span>
              </div>
              <span class="dt-quest-bar"><span :style="{ width: barPct(l.doneCount, l.total) }"></span></span>
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
            <div v-else class="dt-row">
              <span class="dt-tag dt-tag-ok">{{ t.rest.tasks.lineDone }}</span>
            </div>
          </section>
        </div>
      </template>
    </template>
  </DtTabPanel>
</template>
