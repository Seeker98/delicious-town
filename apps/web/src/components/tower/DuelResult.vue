<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DUEL_JUDGE_ITEMS, type DuelResultDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { useCatalogStore } from '../../stores/catalog';
import { awardText } from '../bar/award';

/** themName：对手的显示名（厨塔楼层用译名；不传用服务器给的名字，视觉第三轮） */
const props = defineProps<{ result: DuelResultDto; themName?: string }>();
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
/** 一项的点评（问题记录 431）：差在高的一方的 10% 以内算不分伯仲，否则按谁高写大获全胜 / 全军覆没 */
const CLOSE = 0.1;
function itemVerdict(me: number, them: number): 'win' | 'close' | 'lose' {
  if (Math.abs(me - them) <= CLOSE * Math.max(me, them)) return 'close';
  return me > them ? 'win' : 'lose';
}
/** 上场的评委（问题记录 396、431）：【评委 点评 我】：以[项]胜负……，比分；这一票给谁 */
const judges = computed(() => {
  const d = t.value.tower.duel;
  const r = props.result;
  return r.judges.map((j) => {
    const items = DUEL_JUDGE_ITEMS.get(j.id);
    const comments = (items ?? []).map((i) =>
      d.itemLine(d.items[i] ?? '', d.itemVerdict[itemVerdict(r.me.scores[i] ?? 0, r.them.scores[i] ?? 0)]),
    );
    return {
      ...j,
      // 不认识的评委（服务器加了新评委、网页还是旧的）只写编号（backlog 396）
      who: d.judgeOn(items ? d.judges[j.id] : String(j.id)),
      text: [...comments, d.judgeScore(formatNum(j.me), formatNum(j.them))].join(d.commentSep),
      vote: j.me > j.them ? ('me' as const) : j.them > j.me ? ('them' as const) : ('tie' as const),
    };
  });
});
/** 双方比拼的特色菜（问题记录 431）；旧服务器的结果没有 dish（undefined）时不写这一行，免得把有菜的写成无米之炊 */
const dishes = computed(() => {
  const d = t.value.tower.duel;
  const { me, them } = props.result;
  if (me.dish === undefined || them.dish === undefined) return null;
  const name = (x: DuelResultDto['me']['dish']) => (x ? d.dish(catalog.mcName(x.id), x.level) : d.noDish);
  return d.dishes(name(me.dish), name(them.dish));
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
          <th>{{ t.tower.duel.power(themName ?? result.them.name, result.them.power) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.label">
          <th>{{ r.label }}</th>
          <td :class="{ 'text-success fw-bold': r.me > r.them }">{{ formatNum(r.me) }}</td>
          <td :class="{ 'text-success fw-bold': r.them > r.me }">{{ formatNum(r.them) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="dishes" class="mb-1" data-testid="duel-dishes">{{ dishes }}</div>
    <div class="fw-bold mb-1">{{ t.tower.duel.judgesTitle }}</div>
    <!-- 评委一位一位亮出（问题记录 396）；减少动画时直接显示 -->
    <ol :key="round" class="dt-duel-judges list-unstyled mb-1">
      <li
        v-for="(j, i) in judges"
        :key="j.id"
        class="dt-duel-judge py-1 border-top"
        :style="{ animationDelay: `${i * 0.4}s` }"
        data-testid="duel-judge"
      >
        <!-- 点评和这一票接着写，不另起一行（问题记录 431） -->
        {{ j.who }}{{ j.text }}
        <span
          class="text-nowrap ms-1"
          :class="j.vote === 'me' ? 'text-success' : j.vote === 'them' ? 'text-danger' : 'text-muted'"
          >{{ t.tower.duel.verdict[j.vote] }}</span
        >
      </li>
    </ol>
    <div v-if="awards" data-testid="duel-awards">{{ t.tower.duel.awards(awards) }}</div>
    <!-- 长老掉的厨具单独一行（backlog 408） -->
    <div v-if="result.elderDrop" class="fw-bold text-success" data-testid="duel-elder-drop">
      {{ t.tower.duel.elderDrop(catalog.goodsName(result.elderDrop)) }}
    </div>
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
