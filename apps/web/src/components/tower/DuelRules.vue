<script setup lang="ts">
import { computed } from 'vue';
import { DUEL_JUDGES, type DuelWeightDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { ATTR_NAMES } from '../../utils/labels';

/**
 * 赛厨规则（问题记录 396）：厨塔、赛厨榜、好友切磋共用。
 * judgeCount：每局请几位评委（区服数值 tower.duel.judges，接口给）；没给时按默认 5 位写。
 * weights：五项的评分权重（tower.duel.weights）；没给（旧接口）时用文案里写好的那段
 */
const props = withDefaults(defineProps<{ judgeCount?: number; weights?: DuelWeightDto[] }>(), {
  judgeCount: 5,
  weights: undefined,
});
const t = useT();
const ATTRS = ['cook', 'cutting', 'fire', 'season'] as const;
/** 五项各看哪些属性：权重大的在前（一样大按厨艺、刀工、火候、调味），0 的不写，特色菜放最后 */
const scoreLines = computed(() => {
  const d = t.value.tower.duel;
  const w = props.weights;
  if (!w || w.length !== d.items.length) return d.rules;
  const parts = w.map((x, i) => {
    const attrs = ATTRS.filter((a) => x[a] > 0)
      .sort((a, b) => x[b] - x[a] || ATTRS.indexOf(a) - ATTRS.indexOf(b))
      .map((a) => ATTR_NAMES[a] ?? a);
    if (x.mc > 0) attrs.push(d.rulesMc);
    // 系数全是 0：这一项只有随机分
    return attrs.length > 0 ? d.rulesPart(d.items[i]!, attrs) : d.rulesNone(d.items[i]!);
  });
  return [d.rulesWeights(parts)];
});
/** 有特色菜那一项（没给权重时默认的说明里也有）：写明不算试炼价值 */
const hasMc = computed(() => {
  const w = props.weights;
  return !w || w.length !== t.value.tower.duel.items.length || w.some((x) => x.mc > 0);
});
const vote = computed(() =>
  t.value.tower.duel.rulesVote(DUEL_JUDGES.length, props.judgeCount, Math.floor(props.judgeCount / 2) + 1),
);
const judges = computed(() => {
  const d = t.value.tower.duel;
  return DUEL_JUDGES.map((j) => ({
    id: j.id,
    text: d.judgeFocus(d.judges[j.id], j.items.map((i) => d.items[i]).join(d.itemSep)),
  }));
});
</script>

<template>
  <details class="small text-muted mb-2" data-testid="duel-rules">
    <summary>{{ t.tower.duel.rulesTitle }}</summary>
    <p v-for="(line, i) in scoreLines" :key="i" class="mb-1 mt-1">{{ line }}</p>
    <p v-if="hasMc" class="mb-1" data-testid="duel-rules-mc">{{ t.tower.duel.rulesMcNoTrial }}</p>
    <p class="mb-1">{{ vote }}</p>
    <div>{{ t.tower.duel.rulesJudges }}</div>
    <ul class="list-inline mb-0">
      <li v-for="j in judges" :key="j.id" class="list-inline-item" data-testid="duel-rules-judge">
        {{ j.text }}
      </li>
    </ul>
  </details>
</template>
