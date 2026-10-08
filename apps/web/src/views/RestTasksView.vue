<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { AwardDto, QuestDto, QuestsDto } from '@dt/shared';
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
const questName = (x: QuestDto) => catalog.data('tasks', x.id)?.name ?? x.name;
/** 章末、每周全完成按钮：还有没完成的写还差几个；都完成了只差领写先领完上面的任务（backlog 318） */
const leftText = (unfinished: number) =>
  unfinished > 0 ? t.value.rest.tasks.chapterLeft(unfinished) : t.value.rest.tasks.claimFirst;

/**
 * 三个选项卡：主线、每周、支线（问题记录：活跃和任务页太长，活跃单拎出来，任务分卡；用户 2026-10-08 定每周单独一卡）。
 * 当前卡写在地址里（?tab=），从首页、指引直接进到每周
 */
const TABS = ['main', 'weekly', 'side'] as const;
type Tab = (typeof TABS)[number];
const route = useRoute();
const router = useRouter();
const tab = computed<Tab>(() => TABS.find((x) => x === route.query.tab) ?? 'main');
const setTab = (x: Tab) => void router.replace({ query: { ...route.query, tab: x } });
const canClaim = (x: QuestDto) => x.done && !x.claimed;
/** 卡上有能领的时候加一个礼物图标 */
const claimable = computed<Record<Tab, boolean>>(() => {
  const q = tasks.value;
  if (!q) return { main: false, weekly: false, side: false };
  return {
    main: q.main.some(canClaim) || (q.leftover ?? []).some(canClaim) || !!q.chapter?.claimable,
    weekly: !!q.weekly && (q.weekly.quests.some(canClaim) || q.weekly.full.claimable),
    side: q.lines.some((l) => !!l.quest && l.lockedStar === null && canClaim(l.quest)),
  };
});

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.rest.tasks.loadFailed), 'danger')));
</script>

<template>
  <div class="text-end small mb-1">
    <RouterLink to="/rest/activation" class="dt-go" data-testid="to-activation">{{
      t.rest.tasks.activationLink
    }}</RouterLink>
  </div>
  <ul class="nav nav-tabs mb-3" role="tablist" data-testid="task-tabs">
    <li v-for="x in TABS" :key="x" class="nav-item">
      <button
        type="button"
        role="tab"
        :class="['nav-link', { active: tab === x }]"
        :aria-selected="tab === x"
        :data-testid="`tab-${x}`"
        @click="setTab(x)"
      >
        {{ t.rest.tasks.tabs[x]
        }}<i v-if="claimable[x]" class="bi bi-gift text-primary ms-1" :data-testid="`gift-tab-${x}`"></i>
      </button>
    </li>
  </ul>
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
