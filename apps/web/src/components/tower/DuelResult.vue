<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DUEL_JUDGE_ITEMS, type DuelJudgeId, type DuelResultDto } from '@dt/shared';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';
import AwardChip from '../bar/AwardChip.vue';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { useCatalogStore } from '../../stores/catalog';

/**
 * 对决结果（界面改版 P9：放在底部面板里）：比分和声望、双方厨力、五项各两条横条、评委一位一位亮出、奖励。
 * themName：对手的显示名（厨塔楼层用译名；不传用服务器给的名字，视觉第三轮）
 */
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
/** 五项横条的满格：双方各项里最高的那个 */
const maxScore = computed(() => Math.max(1, ...props.result.me.scores, ...props.result.them.scores));
/** 画了头像的评委；其他的写名字的第一个字 */
const JUDGE_ART: Partial<Record<DuelJudgeId, ArtName>> = {
  wenjie: 'npc-wenjie',
  fanDao: 'npc-fandao',
  gary: 'npc-gary',
};
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
      name: items ? d.judges[j.id] : String(j.id),
      initial: [...(items ? d.judges[j.id] : String(j.id))][0] ?? '',
      art: items ? JUDGE_ART[j.id] : undefined,
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
  return `${head}${votes}`;
});
/** 标题下面的小标签：声望、名次 */
const tags = computed(() => {
  const r = props.result;
  const d = t.value.tower.duel;
  return [
    r.renown === 0 ? '' : d.renownTag(r.renown),
    r.win && r.rank !== null ? d.rankTag(r.rank) : '',
  ].filter(Boolean);
});
</script>

<template>
  <div class="dt-duel" data-testid="duel-result">
    <div class="dt-duel-head">
      <b :class="result.win ? 'is-win' : 'is-lose'" data-testid="duel-headline">{{ headline }}</b>
      <span v-if="tags.length > 0" class="dt-duel-tags"
        ><span v-for="(x, i) in tags" :key="i" class="dt-tag dt-tag-ok">{{ x }}</span></span
      >
    </div>
    <div class="dt-duel-vs">
      <div>
        <span>{{ result.me.name }}</span
        ><b>{{ t.tower.duel.powerShort(result.me.power) }}</b>
      </div>
      <span class="dt-duel-vs-mid" aria-hidden="true">VS</span>
      <div>
        <span>{{ themName ?? result.them.name }}</span
        ><b>{{ t.tower.duel.powerShort(result.them.power) }}</b>
      </div>
    </div>
    <div class="dt-duel-items">
      <div v-for="r in rows" :key="r.label" class="dt-duel-item" data-testid="duel-item">
        <b>{{ r.label }}</b>
        <span class="dt-duel-bars" aria-hidden="true"
          ><i class="is-me" :style="{ width: `${(r.me / maxScore) * 100}%` }"></i
          ><i class="is-them" :style="{ width: `${(r.them / maxScore) * 100}%` }"></i
        ></span>
        <!-- 横条不念：两个数字前面给读屏写谁是谁（P9 终审 M8） -->
        <span :class="{ 'is-win': r.me > r.them }"
          ><span class="visually-hidden">{{ t.tower.duel.srMe }}</span
          >{{ formatNum(r.me) }}</span
        >
        <span :class="{ 'is-win': r.them > r.me }"
          ><span class="visually-hidden">{{ t.tower.duel.srThem }}</span
          >{{ formatNum(r.them) }}</span
        >
      </div>
    </div>
    <p v-if="dishes" class="dt-duel-dishes" data-testid="duel-dishes">{{ dishes }}</p>
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.tower.duel.judgesTitle }}</h2>
    </div>
    <!-- 评委一位一位亮出（问题记录 396）；减少动画时直接显示 -->
    <ol :key="round" class="dt-duel-judges">
      <li
        v-for="(j, i) in judges"
        :key="j.id"
        class="dt-duel-judge"
        :style="{ animationDelay: `${i * 0.4}s` }"
        data-testid="duel-judge"
      >
        <span class="dt-duel-ava"
          ><DtArt v-if="j.art" :name="j.art" :size="32" /><b v-else aria-hidden="true">{{
            j.initial
          }}</b></span
        >
        <!-- 点评和这一票接着写，不另起一行（问题记录 431） -->
        <span class="dt-duel-say"
          ><b>{{ j.name }}</b> {{ j.text }}</span
        >
        <span
          :class="[
            'text-nowrap',
            j.vote === 'me' ? 'dt-tag-ok' : j.vote === 'them' ? 'dt-tag-danger' : 'dt-tag-mute',
          ]"
          >{{ t.tower.duel.verdict[j.vote] }}</span
        >
      </li>
    </ol>
    <section
      v-if="result.awards.length > 0 || result.elderDrop"
      class="dt-bar-result is-ok"
      data-testid="duel-awards"
    >
      <b>{{ t.tower.duel.gotTitle }}</b>
      <div v-if="result.awards.length > 0" class="dt-award-chips">
        <AwardChip v-for="(a, i) in result.awards" :key="i" :award="a" />
      </div>
      <!-- 长老掉的厨具单独一行（backlog 408） -->
      <div v-if="result.elderDrop" class="dt-duel-drop" data-testid="duel-elder-drop">
        {{ t.tower.duel.elderDrop(catalog.goodsName(result.elderDrop)) }}
      </div>
    </section>
  </div>
</template>

<style scoped>
.dt-duel-judge {
  animation: dt-judge-in 0.3s var(--dt-ease-out) both;
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
