<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DUEL_JUDGE_ITEMS, type DuelResultDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { awardText } from '../bar/award';

const props = defineProps<{ result: DuelResultDto }>();
const catalog = useCatalogStore();
const t = useT();
/** 每来一局新结果加 1，用作评委列表的 key：父组件复用这个卡片时动画也从头播 */
const round = ref(0);
watch(
  () => props.result,
  () => round.value++,
);
const rows = computed(() =>
  t.value.tower.duel.items.map((label, i) => ({
    label,
    me: props.result.me.scores[i] ?? 0,
    them: props.result.them.scores[i] ?? 0,
  })),
);
/** 上场的评委（问题记录 396）：名字、关注的项目、双方的分、这一票给谁 */
const judges = computed(() => {
  const d = t.value.tower.duel;
  return props.result.judges.map((j) => ({
    ...j,
    // 不认识的评委（服务器加了新评委、网页还是旧的）只写编号（backlog 396）
    who: DUEL_JUDGE_ITEMS.has(j.id)
      ? d.judgeFocus(
          d.judges[j.id],
          DUEL_JUDGE_ITEMS.get(j.id)!
            .map((i) => d.items[i])
            .join(d.itemSep),
        )
      : String(j.id),
    vote: j.me > j.them ? ('me' as const) : j.them > j.me ? ('them' as const) : ('tie' as const),
  }));
});
const headline = computed(() => {
  const r = props.result;
  const d = t.value.tower.duel;
  const head = r.test ? d.test(r.win) : r.win ? d.win : d.lose;
  const votes = d.votes(r.votes[0], r.votes[1]) + (r.votes[0] === r.votes[1] ? d.onTotal : '');
  const renown = r.renown === 0 ? '' : d.renown(r.renown);
  const rank = r.win && r.rank !== null ? d.rank(r.rank) : '';
  return `${head}${votes}${renown}${rank}`;
});
const awards = computed(() => props.result.awards.map((a) => awardText(a, catalog)).join(t.value.events.sep));
</script>

<template>
  <div class="border rounded p-2 small mt-2" data-testid="duel-result">
    <div :class="['fw-bold mb-1', result.win ? 'text-success' : 'text-danger']" data-testid="duel-headline">
      {{ headline }}
    </div>
    <table class="table table-sm mb-1 text-center">
      <thead>
        <tr>
          <th></th>
          <th>{{ t.tower.duel.power(result.me.name, result.me.power) }}</th>
          <th>{{ t.tower.duel.power(result.them.name, result.them.power) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.label">
          <th>{{ r.label }}</th>
          <td :class="{ 'text-success fw-bold': r.me > r.them }">{{ r.me }}</td>
          <td :class="{ 'text-success fw-bold': r.them > r.me }">{{ r.them }}</td>
        </tr>
      </tbody>
    </table>
    <div class="fw-bold mb-1">{{ t.tower.duel.judgesTitle }}</div>
    <!-- 评委一位一位亮出（问题记录 396）；减少动画时直接显示 -->
    <ol :key="round" class="dt-duel-judges list-unstyled mb-1">
      <li
        v-for="(j, i) in judges"
        :key="j.id"
        class="dt-duel-judge d-flex flex-wrap gap-2 py-1 border-top"
        :style="{ animationDelay: `${i * 0.4}s` }"
        data-testid="duel-judge"
      >
        <span class="flex-grow-1">{{ j.who }}</span>
        <span>
          <span :class="{ 'text-success fw-bold': j.vote === 'me' }">{{ j.me }}</span>
          :
          <span :class="{ 'text-success fw-bold': j.vote === 'them' }">{{ j.them }}</span>
        </span>
        <span :class="j.vote === 'me' ? 'text-success' : j.vote === 'them' ? 'text-danger' : 'text-muted'">{{
          t.tower.duel.verdict[j.vote]
        }}</span>
      </li>
    </ol>
    <div v-if="awards" data-testid="duel-awards">{{ t.tower.duel.awards(awards) }}</div>
  </div>
</template>

<style scoped>
.dt-duel-judge {
  animation: dt-judge-in 0.3s ease-out both;
}
@keyframes dt-judge-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dt-duel-judge {
    animation: none;
  }
}
</style>
