<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DuelResultDto, RankDto, RankSlotDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import DtRow from '../DtRow.vue';
import DtSheet from '../DtSheet.vue';
import DuelResult from './DuelResult.vue';

/**
 * 赛厨榜（界面改版 P9）：我的名次一张卡、换榜规则一行（点开看名次礼包）；
 * 榜单一名一行，前三名金银铜，我那一行浅紫底；能挑战、能占位的右边一个按钮。对决结果从下面弹出
 */
/** reload：父页面给的重读函数，按钮等新榜读回来再放开（P9 终审 M2：不然能拿旧榜连点）；没给时发 reload 事件 */
const props = defineProps<{ data: RankDto; reload?: () => Promise<unknown> }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const session = useSessionStore();
const last = ref<DuelResultDto | null>(null);
const resultOpen = ref(false);
const weeklyOpen = ref(false);
const busy = ref(false);
const myId = computed(() => session.me?.restaurantId ?? null);

/** 在 s 前面（数字更大）或没上榜 */
const behind = (s: RankSlotDto) => props.data.myRank === null || props.data.myRank > s.rank;
const canOccupy = (s: RankSlotDto) => s.restId === null && behind(s);
const canChallenge = (s: RankSlotDto) => s.restId !== null && s.restId !== myId.value && behind(s);
function challengeBlock(s: RankSlotDto): string {
  const d = props.data;
  if (d.left <= 0) return t.value.tower.noMoreToday;
  if (s.rank <= d.rankTop && (d.myRank === null || d.myRank - s.rank > d.rankGap))
    return t.value.tower.rank.top(d.rankTop, d.rankGap);
  if (d.strength < d.duelStrength) return t.value.tower.noStrength(d.duelStrength);
  return '';
}

/** 行里写的原因：名次差的规则已经写在榜单标题右边，行里不再重复（P9 用户反馈） */
const rowBlock = (s: RankSlotDto) => {
  const why = challengeBlock(s);
  return why === t.value.tower.rank.top(props.data.rankTop, props.data.rankGap) ? '' : why;
};

async function act(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (props.reload) await props.reload();
    else emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const occupy = (rank: number) =>
  act(async () => {
    await endpoints.rankOccupy(rank);
    toast.push(t.value.tower.rank.occupied(rank));
  }, t.value.tower.rank.occupyFailed);
const challenge = (s: RankSlotDto) => {
  if (challengeBlock(s)) return;
  return act(async () => {
    last.value = await endpoints.rankChallenge(s.rank);
    resultOpen.value = true;
  }, t.value.tower.challengeFailed);
};
</script>

<template>
  <section class="dt-card dt-bar-info">
    <span class="dt-medal is-me" aria-hidden="true">{{ data.myRank ?? '—' }}</span>
    <span class="dt-bar-info-main">
      <b
        >{{ t.tower.rank.myRank
        }}<span data-testid="my-rank">{{
          data.myRank === null ? t.tower.rank.unranked : t.tower.rank.rankN(data.myRank)
        }}</span></b
      >
      <span>{{ t.tower.rank.head(data.left, data.duelStrength) }}</span>
    </span>
  </section>
  <div class="dt-card dt-rows-card dt-rank-weekly">
    <button type="button" class="dt-row is-link" data-testid="rank-weekly" @click="weeklyOpen = true">
      <span class="dt-row-main"
        ><span class="dt-row-title is-strong">{{ t.tower.rank.weeklyTitle }}</span
        ><span class="dt-row-sub">{{ t.tower.rank.weekly }}</span></span
      >
    </button>
  </div>
  <div class="dt-block-head">
    <h2 class="dt-block-title">{{ t.tower.rank.listTitle }}</h2>
    <span class="dt-block-more dt-rank-rule" data-testid="rank-rule">{{
      t.tower.rank.top(data.rankTop, data.rankGap)
    }}</span>
  </div>
  <div class="dt-card dt-rows-card">
    <DtRow
      v-for="s in data.slots"
      strong
      :key="s.rank"
      :class="{ 'is-me': s.restId !== null && s.restId === myId }"
      :data-testid="`slot-${s.rank}`"
    >
      <template #icon
        ><span :class="['dt-medal', s.rank <= 3 ? `is-${s.rank}` : '']">{{ s.rank }}</span></template
      >
      <template #title>
        <template v-if="s.restId !== null"
          >{{ s.name }}<span class="dt-row-meta">{{ t.tower.rank.level(s.level ?? 0) }}</span
          ><span v-if="s.restId === myId" class="dt-tag dt-tag-primary">{{ t.tower.rank.me }}</span></template
        >
        <span v-else class="dt-muted fw-normal">{{ t.tower.rank.empty }}</span>
      </template>
      <template v-if="canChallenge(s) && rowBlock(s)" #sub
        ><span class="text-danger">{{ rowBlock(s) }}</span></template
      >
      <template v-if="canOccupy(s) || canChallenge(s)" #end>
        <button
          v-if="canOccupy(s)"
          type="button"
          class="btn btn-sm btn-outline-primary"
          :data-testid="`occupy-${s.rank}`"
          :disabled="busy"
          @click="occupy(s.rank)"
        >
          {{ t.tower.rank.occupy }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-outline-primary"
          :data-testid="`rc-${s.rank}`"
          :disabled="busy || !!challengeBlock(s)"
          :title="challengeBlock(s)"
          @click="challenge(s)"
        >
          {{ t.tower.challenge }}
        </button>
      </template>
    </DtRow>
  </div>

  <DtSheet :open="weeklyOpen" :title="t.tower.rank.weeklyTitle" @close="weeklyOpen = false">
    <div class="dt-help">
      <ul>
        <li v-for="(x, i) in t.tower.rank.weeklyItems" :key="i">{{ x }}</li>
      </ul>
    </div>
  </DtSheet>
  <DtSheet :open="resultOpen && !!last" :title="t.tower.duel.resultTitle" @close="resultOpen = false">
    <DuelResult v-if="last" :result="last" />
    <template #actions>
      <button type="button" class="btn btn-light dt-btn-block" @click="resultOpen = false">
        {{ t.tower.duel.ok }}
      </button>
    </template>
  </DtSheet>
</template>
