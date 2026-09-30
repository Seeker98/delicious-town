<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelResultDto, RankDto, RankSlotDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const toast = useToastStore();
const session = useSessionStore();
const data = ref<RankDto | null>(null);
const last = ref<DuelResultDto | null>(null);
const busy = ref(false);
const myId = computed(() => session.me?.restaurantId ?? null);

async function load() {
  try {
    data.value = await endpoints.towerRank();
  } catch (e) {
    toast.push(errorMessage(e, '读取赛厨榜失败'), 'danger');
  }
}
onMounted(load);

/** 在 s 前面（数字更大）或没上榜 */
const behind = (s: RankSlotDto) => data.value!.myRank === null || data.value!.myRank > s.rank;
const canOccupy = (s: RankSlotDto) => s.restId === null && behind(s);
const canChallenge = (s: RankSlotDto) => s.restId !== null && s.restId !== myId.value && behind(s);
function challengeBlock(s: RankSlotDto): string {
  const d = data.value!;
  if (d.left <= 0) return '今天的挑战次数用完了';
  if (s.rank <= d.rankTop && (d.myRank === null || d.myRank - s.rank > d.rankGap))
    return `前 ${d.rankTop} 名要在榜上、名次相差 ${d.rankGap} 以内才能挑战`;
  if (d.strength < d.duelStrength) return `体力不够（要 ${d.duelStrength}）`;
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
    toast.push(`占到了第 ${rank} 名`);
  }, '占位失败');
const challenge = (s: RankSlotDto) => {
  if (challengeBlock(s)) return;
  return act(async () => {
    last.value = await endpoints.rankChallenge(s.rank);
  }, '挑战失败');
};
</script>

<template>
  <div v-if="data" class="small">
    <div class="mb-2">
      我的名次 <b data-testid="my-rank">{{ data.myRank === null ? '未上榜' : `第 ${data.myRank} 名` }}</b> ·
      今日还能挑战 {{ data.left }} 次 · 每次 {{ data.duelStrength }} 体力
      <div class="text-muted">
        每周一 0 点换新榜：第 1~3 名、4~8 名、9~15 名有名次礼包，前三名得厨神、厨圣、厨王
      </div>
    </div>
    <DuelResult v-if="last" :result="last" />
    <div
      v-for="s in data.slots"
      :key="s.rank"
      class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
      :data-testid="`slot-${s.rank}`"
    >
      <span style="width: 4em">第 {{ s.rank }} 名</span>
      <span class="flex-fill">
        <template v-if="s.restId !== null">{{ s.name }}（{{ s.level }} 级）</template>
        <span v-else class="text-muted">空</span>
        <span v-if="s.restId !== null && s.restId === myId" class="badge text-bg-success ms-1">我</span>
      </span>
      <button
        v-if="canOccupy(s)"
        class="btn btn-sm btn-outline-primary"
        :data-testid="`occupy-${s.rank}`"
        :disabled="busy"
        @click="occupy(s.rank)"
      >
        占位
      </button>
      <template v-else-if="canChallenge(s)">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`rc-${s.rank}`"
          :disabled="busy || !!challengeBlock(s)"
          @click="challenge(s)"
        >
          挑战
        </button>
        <span v-if="challengeBlock(s)" class="text-danger">{{ challengeBlock(s) }}</span>
      </template>
    </div>
  </div>
</template>
