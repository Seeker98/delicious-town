<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelResultDto, RankDto, RankSlotDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';
import DuelRules from './DuelRules.vue';

const toast = useToastStore();
const t = useT();
const session = useSessionStore();
const data = ref<RankDto | null>(null);
const last = ref<DuelResultDto | null>(null);
const busy = ref(false);
const myId = computed(() => session.me?.restaurantId ?? null);

async function load() {
  try {
    data.value = await endpoints.towerRank();
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.rank.loadFailed), 'danger');
  }
}
onMounted(load);

/** 在 s 前面（数字更大）或没上榜 */
const behind = (s: RankSlotDto) => data.value!.myRank === null || data.value!.myRank > s.rank;
const canOccupy = (s: RankSlotDto) => s.restId === null && behind(s);
const canChallenge = (s: RankSlotDto) => s.restId !== null && s.restId !== myId.value && behind(s);
function challengeBlock(s: RankSlotDto): string {
  const d = data.value!;
  if (d.left <= 0) return t.value.tower.noMoreToday;
  if (s.rank <= d.rankTop && (d.myRank === null || d.myRank - s.rank > d.rankGap))
    return t.value.tower.rank.top(d.rankTop, d.rankGap);
  if (d.strength < d.duelStrength) return t.value.tower.noStrength(d.duelStrength);
  return '';
}

async function act(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
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
const occupy = (rank: number) =>
  act(async () => {
    await endpoints.rankOccupy(rank);
    toast.push(t.value.tower.rank.occupied(rank));
  }, t.value.tower.rank.occupyFailed);
const challenge = (s: RankSlotDto) => {
  if (challengeBlock(s)) return;
  return act(async () => {
    last.value = await endpoints.rankChallenge(s.rank);
  }, t.value.tower.challengeFailed);
};
</script>

<template>
  <DuelRules v-if="data" :judge-count="data.duelJudges" />
  <div v-if="data" class="small">
    <div class="mb-2">
      {{ t.tower.rank.myRank
      }}<b data-testid="my-rank">{{
        data.myRank === null ? t.tower.rank.unranked : t.tower.rank.rankN(data.myRank)
      }}</b
      >{{ t.tower.rank.head(data.left, data.duelStrength) }}
      <div class="text-muted">
        {{ t.tower.rank.weekly }}
      </div>
    </div>
    <DuelResult v-if="last" :result="last" />
    <div
      v-for="s in data.slots"
      :key="s.rank"
      class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
      :data-testid="`slot-${s.rank}`"
    >
      <span style="width: 4em">{{ t.tower.rank.rankN(s.rank) }}</span>
      <span class="flex-fill">
        <template v-if="s.restId !== null">{{ t.tower.rank.slotName(s.name ?? '', s.level ?? 0) }}</template>
        <span v-else class="text-muted">{{ t.tower.rank.empty }}</span>
        <span v-if="s.restId !== null && s.restId === myId" class="badge text-bg-success ms-1">{{
          t.tower.rank.me
        }}</span>
      </span>
      <button
        v-if="canOccupy(s)"
        class="btn btn-sm btn-outline-primary"
        :data-testid="`occupy-${s.rank}`"
        :disabled="busy"
        @click="occupy(s.rank)"
      >
        {{ t.tower.rank.occupy }}
      </button>
      <template v-else-if="canChallenge(s)">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`rc-${s.rank}`"
          :disabled="busy || !!challengeBlock(s)"
          @click="challenge(s)"
        >
          {{ t.tower.challenge }}
        </button>
        <span v-if="challengeBlock(s)" class="text-danger">{{ challengeBlock(s) }}</span>
      </template>
    </div>
  </div>
</template>
